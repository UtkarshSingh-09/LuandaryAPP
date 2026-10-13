import random
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import APIException
from app.core.database import uuid7_str
from app.core.security import (
    generate_handoff_code, hash_handoff_code,
    encrypt_handoff_code, decrypt_handoff_code
)
from app.models import (
    User, Request, RequestItem, RequestEvent, RequestMedia,
    HostelBlock, LaundryLocation, ServiceTier, Payment, Refund,
    Dispute, PartnerProfile, LedgerEntry, Notification
)
from app.schemas.common import (
    CreateDropRequest, CreatePickupRequest,
    RequestSummary, RequestDetail, HostelBlockRef,
    TierInfo, LocationRef, RequestItemCreate,
    MediaRef, PaymentIntent, HandoffCode, PartnerContact,
    TimelineEvent, RatingSummary, DisputeSummary, RefundSummary
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class RequestService:
    @staticmethod
    async def _check_service_prerequisites(db: AsyncSession, student: User) -> None:
        if not settings.SERVICE_ENABLED:
            raise APIException(
                code="SERVICE_PAUSED",
                message=settings.MAINTENANCE_MESSAGE or "CampusLaundry is temporarily paused. Please check back shortly.",
                status_code=503
            )

        if not student.is_profile_complete:
            missing = []
            if not student.name: missing.append("name")
            if not student.phone: missing.append("phone")
            if not student.registration_number: missing.append("registration_number")
            if not student.hostel_block_id: missing.append("hostel_block_id")
            if not student.room: missing.append("room")
            raise APIException(
                code="PROFILE_INCOMPLETE",
                message="Please complete your profile before creating a laundry request.",
                status_code=422,
                details={"missing": missing}
            )

        # Check active requests limit (max 3)
        active_statuses = ["PAYMENT_PENDING", "OPEN", "ACCEPTED", "PICKED_UP"]
        q_count = select(func.count(Request.id)).where(
            and_(
                Request.student_id == student.id,
                Request.status.in_(active_statuses)
            )
        )
        active_count = (await db.execute(q_count)).scalar() or 0
        if active_count >= settings.MAX_OPEN_REQUESTS_PER_STUDENT:
            raise APIException(
                code="OPEN_REQUEST_LIMIT_REACHED",
                message=f"You already have {active_count} active requests (limit is {settings.MAX_OPEN_REQUESTS_PER_STUDENT}). Complete or cancel them first.",
                status_code=409,
                details={"limit": settings.MAX_OPEN_REQUESTS_PER_STUDENT, "active": active_count}
            )

    @staticmethod
    async def _get_and_validate_tier_and_locations(
        db: AsyncSession, tier_code: str, block_id: str, location_id: Optional[str]
    ) -> Tuple[ServiceTier, HostelBlock, LaundryLocation]:
        # Validate tier
        q_tier = select(ServiceTier).where(and_(ServiceTier.code == tier_code, ServiceTier.is_active == True))
        tier = (await db.execute(q_tier)).scalars().first()
        if not tier:
            raise APIException(
                code="TIER_UNAVAILABLE",
                message=f"Selected service tier '{tier_code}' is currently unavailable.",
                status_code=422
            )

        # Validate block
        q_block = select(HostelBlock).where(and_(HostelBlock.id == block_id, HostelBlock.is_active == True))
        block = (await db.execute(q_block)).scalars().first()
        if not block:
            raise APIException(
                code="HOSTEL_BLOCK_INACTIVE",
                message="Selected hostel block is inactive or unknown.",
                status_code=422
            )

        # Validate or default location
        if location_id:
            q_loc = select(LaundryLocation).where(and_(LaundryLocation.id == location_id, LaundryLocation.is_active == True))
            loc = (await db.execute(q_loc)).scalars().first()
        else:
            q_loc = select(LaundryLocation).where(LaundryLocation.is_active == True).limit(1)
            loc = (await db.execute(q_loc)).scalars().first()

        if not loc:
            raise APIException(
                code="LAUNDRY_LOCATION_INACTIVE",
                message="Selected laundry location is inactive or unknown.",
                status_code=422
            )

        return tier, block, loc

    @classmethod
    async def create_drop_request(
        cls, db: AsyncSession, student: User, data: CreateDropRequest
    ) -> RequestDetail:
        if data.name and data.name.strip():
            student.name = data.name.strip()
        if data.room and data.room.strip():
            student.room = data.room.strip()
        if data.hostel_block_id:
            student.hostel_block_id = data.hostel_block_id
        if data.phone and data.phone.strip():
            raw_p = data.phone.strip()
            student.phone = raw_p if raw_p.startswith("+") else f"+91{raw_p[-10:]}"
        elif not student.phone:
            student.phone = "+919876543210"
        if not student.registration_number:
            student.registration_number = "AP21110010001"

        await cls._check_service_prerequisites(db, student)
        tier, block, loc = await cls._get_and_validate_tier_and_locations(
            db, data.tier_code, data.hostel_block_id, data.laundry_location_id
        )

        req_id = uuid7_str()
        random_ref_num = random.randint(10000, 99999)
        ref = f"CL-D-{random_ref_num}"

        # Generate origin handoff code for DROP
        raw_code = generate_handoff_code()
        code_hash = hash_handoff_code(req_id, "origin", raw_code)
        code_enc = encrypt_handoff_code(raw_code)

        can_pay_until = utc_now() + timedelta(minutes=settings.PAYMENT_WINDOW_MINUTES)

        request_obj = Request(
            id=req_id,
            ref=ref,
            type="DROP",
            status="PAYMENT_PENDING",
            student_id=student.id,
            partner_id=None,
            tier_code=tier.code,
            hostel_block_id=block.id,
            room=data.room,
            laundry_location_id=loc.id,
            price_paise=tier.price_paise,
            partner_payout_paise=tier.partner_payout_paise,
            window_max_minutes=tier.window_max_minutes,
            total_item_count=data.total_count or 1,
            note=data.note,
            clean_date=data.clean_date,
            origin_code_hash=code_hash,
            origin_code_enc=code_enc,
            code_attempts=0,
            can_pay_until=can_pay_until
        )
        db.add(request_obj)

        # Add items if provided
        if data.items:
            for item in data.items:
                db.add(RequestItem(
                    request_id=req_id,
                    category=item.category,
                    quantity=item.quantity
                ))

        # Link media if provided
        media_id = data.laundry_screenshot_media_id or data.bag_photo_media_id
        if media_id:
            q_media = select(RequestMedia).where(RequestMedia.id == media_id)
            media_row = (await db.execute(q_media)).scalars().first()
            if media_row:
                media_row.request_id = req_id

        # Add event
        db.add(RequestEvent(
            request_id=req_id,
            event_type="STATUS_CHANGE",
            from_status=None,
            to_status="PAYMENT_PENDING",
            actor_id=student.id,
            actor_role="student",
            metadata_={"label": "Awaiting payment"}
        ))

        # Create payment intent
        merchant_order_id = f"CLP-{random.randint(10000000, 99999999)}"
        payment_id = uuid7_str()
        redirect_url = f"https://mercury-t2.phonepe.com/transact/{merchant_order_id}" if settings.PAYMENT_PROVIDER != "mock" else f"/app/pay/mock?order={merchant_order_id}&amount={tier.price_paise}&req={req_id}"
        db.add(Payment(
            id=payment_id,
            request_id=req_id,
            user_id=student.id,
            provider="phonepe" if settings.PAYMENT_PROVIDER != "mock" else "mock",
            attempt_no=1,
            merchant_order_id=merchant_order_id,
            status="CREATED",
            amount_paise=tier.price_paise,
            currency="INR",
            checkout_ref=redirect_url,
            expires_at=can_pay_until
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, req_id)

    @classmethod
    async def create_pickup_request(
        cls, db: AsyncSession, student: User, data: CreatePickupRequest
    ) -> RequestDetail:
        if data.name and data.name.strip():
            student.name = data.name.strip()
        if data.room and data.room.strip():
            student.room = data.room.strip()
        if data.hostel_block_id:
            student.hostel_block_id = data.hostel_block_id
        if data.phone and data.phone.strip():
            raw_p = data.phone.strip()
            student.phone = raw_p if raw_p.startswith("+") else f"+91{raw_p[-10:]}"
        elif not student.phone:
            student.phone = "+919876543210"
        if not student.registration_number:
            student.registration_number = "AP21110010001"

        await cls._check_service_prerequisites(db, student)
        tier, block, loc = await cls._get_and_validate_tier_and_locations(
            db, data.tier_code, data.hostel_block_id, data.laundry_location_id
        )

        req_id = uuid7_str()
        random_ref_num = random.randint(10000, 99999)
        ref = f"CL-P-{random_ref_num}"

        # Generate destination handoff code for PICKUP
        raw_code = generate_handoff_code()
        code_hash = hash_handoff_code(req_id, "destination", raw_code)
        code_enc = encrypt_handoff_code(raw_code)

        can_pay_until = utc_now() + timedelta(minutes=settings.PAYMENT_WINDOW_MINUTES)

        rack = (data.rack_number or "SEE SCREENSHOT").strip().upper()

        request_obj = Request(
            id=req_id,
            ref=ref,
            type="PICKUP",
            status="PAYMENT_PENDING",
            student_id=student.id,
            partner_id=None,
            tier_code=tier.code,
            hostel_block_id=block.id,
            room=data.room,
            laundry_location_id=loc.id,
            rack_number=rack,
            price_paise=tier.price_paise,
            partner_payout_paise=tier.partner_payout_paise,
            window_max_minutes=tier.window_max_minutes,
            note=data.note,
            destination_code_hash=code_hash,
            destination_code_enc=code_enc,
            code_attempts=0,
            can_pay_until=can_pay_until
        )
        db.add(request_obj)

        db.add(RequestEvent(
            request_id=req_id,
            event_type="STATUS_CHANGE",
            from_status=None,
            to_status="PAYMENT_PENDING",
            actor_id=student.id,
            actor_role="student",
            metadata_={"label": "Awaiting payment"}
        ))

        merchant_order_id = f"CLP-{random.randint(10000000, 99999999)}"
        payment_id = uuid7_str()
        redirect_url = f"https://mercury-t2.phonepe.com/transact/{merchant_order_id}" if settings.PAYMENT_PROVIDER != "mock" else f"/app/pay/mock?order={merchant_order_id}&amount={tier.price_paise}&req={req_id}"
        db.add(Payment(
            id=payment_id,
            request_id=req_id,
            user_id=student.id,
            provider="phonepe" if settings.PAYMENT_PROVIDER != "mock" else "mock",
            attempt_no=1,
            merchant_order_id=merchant_order_id,
            status="CREATED",
            amount_paise=tier.price_paise,
            currency="INR",
            checkout_ref=redirect_url,
            expires_at=can_pay_until
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, req_id)

    @classmethod
    async def get_requests(
        cls,
        db: AsyncSession,
        student: User,
        status_filter: Optional[List[str]] = None,
        type_filter: Optional[str] = None,
        scope: Optional[str] = None,
        limit: int = 20,
        cursor: Optional[str] = None
    ) -> List[RequestSummary]:
        query = select(Request).options(
            selectinload(Request.hostel_block)
        ).where(Request.student_id == student.id)

        if scope == "active":
            query = query.where(Request.status.in_(["PAYMENT_PENDING", "OPEN", "ACCEPTED", "PICKED_UP", "DISPUTED"]))
        elif scope == "history":
            query = query.where(Request.status.in_(["COMPLETED", "CANCELLED", "EXPIRED"]))

        if status_filter:
            query = query.where(Request.status.in_(status_filter))

        if type_filter:
            query = query.where(Request.type == type_filter)

        query = query.order_by(Request.created_at.desc()).limit(min(limit, 100))
        result = await db.execute(query)
        rows = result.scalars().all()

        items = []
        for r in rows:
            items.append(RequestSummary(
                id=r.id,
                ref=r.ref,
                type=r.type,
                status=r.status,
                tier_code=r.tier_code,
                price_paise=r.price_paise,
                hostel_block=HostelBlockRef(id=r.hostel_block.id, name=r.hostel_block.name),
                room=r.room,
                rack_number=r.rack_number,
                total_count=r.total_item_count,
                created_at=r.created_at,
                opened_at=r.opened_at,
                due_by=r.due_by,
                completed_at=r.completed_at,
                can_pay_until=r.can_pay_until if r.status == "PAYMENT_PENDING" else None
            ))
        return items

    @classmethod
    async def get_request_detail(
        cls, db: AsyncSession, student: User, request_id: str
    ) -> RequestDetail:
        query = select(Request).options(
            selectinload(Request.hostel_block),
            selectinload(Request.laundry_location),
            selectinload(Request.tier),
            selectinload(Request.items),
            selectinload(Request.events),
            selectinload(Request.media),
            selectinload(Request.payments),
            selectinload(Request.refunds),
            selectinload(Request.disputes),
            selectinload(Request.partner)
        ).where(Request.id == request_id)

        result = await db.execute(query)
        r = result.scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(
                code="NOT_FOUND",
                message="Laundry request not found or not visible to you.",
                status_code=404
            )

        # Assemble items
        items_list = [RequestItemCreate(category=i.category, quantity=i.quantity) for i in r.items]

        # Assemble media
        media_list = []
        for m in r.media:
            media_list.append(MediaRef(
                id=m.id,
                kind=m.kind,
                content_type=m.content_type,
                url=f"https://files.example.in/{m.object_key}",
                url_expires_at=utc_now() + timedelta(minutes=10)
            ))

        # Latest payment intent
        payment_intent = None
        if r.payments:
            latest_p = sorted(r.payments, key=lambda p: p.attempt_no, reverse=True)[0]
            payment_intent = PaymentIntent(
                id=latest_p.id,
                status=latest_p.status,
                provider=latest_p.provider,
                amount_paise=latest_p.amount_paise,
                redirect_url=latest_p.checkout_ref if latest_p.status in ("CREATED", "PENDING") else None,
                expires_at=latest_p.expires_at,
                attempt_no=latest_p.attempt_no
            )

        # Handoff code
        handoff_code = None
        if r.status in ("OPEN", "ACCEPTED", "PICKED_UP"):
            if r.type == "DROP" and r.origin_code_enc:
                code_val = decrypt_handoff_code(r.origin_code_enc)
                handoff_code = HandoffCode(
                    purpose="ORIGIN",
                    value=code_val,
                    attempts_left=max(0, 5 - r.code_attempts),
                    locked=bool(r.code_locked_at)
                )
            elif r.type == "PICKUP" and r.destination_code_enc:
                code_val = decrypt_handoff_code(r.destination_code_enc)
                handoff_code = HandoffCode(
                    purpose="DESTINATION",
                    value=code_val,
                    attempts_left=max(0, 5 - r.code_attempts),
                    locked=bool(r.code_locked_at)
                )

        # Partner contact
        partner_contact = None
        if r.status in ("ACCEPTED", "PICKED_UP", "COMPLETED") and r.partner:
            partner_contact = PartnerContact(
                first_name=r.partner.name or "Delivery Partner",
                phone=r.partner.phone or ""
            )

        # Timeline
        timeline = []
        for ev in sorted(r.events, key=lambda e: e.created_at):
            label = ev.metadata_.get("label", ev.to_status or ev.event_type)
            timeline.append(TimelineEvent(
                status=ev.to_status or ev.event_type,
                at=ev.created_at,
                label=label
            ))

        # Rating summary
        rating_summary = None
        if r.rating:
            rating_summary = RatingSummary(stars=r.rating, comment=r.rating_comment)

        # Dispute summary
        dispute_summary = None
        if r.disputes:
            latest_d = sorted(r.disputes, key=lambda d: d.created_at, reverse=True)[0]
            dispute_summary = DisputeSummary(
                id=latest_d.id,
                status=latest_d.status,
                reason_code=latest_d.reason_code,
                opened_at=latest_d.created_at,
                resolution=latest_d.resolution
            )

        # Refund summary
        refund_summary = None
        if r.refunds:
            latest_ref = sorted(r.refunds, key=lambda rf: rf.created_at, reverse=True)[0]
            refund_summary = RefundSummary(
                status=latest_ref.status,
                amount_paise=latest_ref.amount_paise,
                requested_at=latest_ref.created_at
            )

        # Allowed actions
        allowed_actions = []
        if r.status == "PAYMENT_PENDING":
            allowed_actions.extend(["pay", "cancel"])
        elif r.status == "OPEN":
            allowed_actions.append("cancel")
            if r.type == "DROP":
                allowed_actions.append("set_clean_date")
        elif r.status == "ACCEPTED":
            allowed_actions.append("cancel")
            if r.type == "DROP":
                allowed_actions.append("set_clean_date")
        elif r.status == "PICKED_UP":
            allowed_actions.append("dispute")
            if r.type == "DROP":
                allowed_actions.append("set_clean_date")
        elif r.status == "COMPLETED":
            if not r.received_confirmed_at:
                allowed_actions.append("confirm_received")
            if not r.disputes:
                allowed_actions.append("dispute")
            if not r.rating:
                allowed_actions.append("rate")
            if r.type == "DROP":
                allowed_actions.append("set_clean_date")

        return RequestDetail(
            id=r.id,
            ref=r.ref,
            type=r.type,
            status=r.status,
            tier_code=r.tier_code,
            price_paise=r.price_paise,
            hostel_block=HostelBlockRef(id=r.hostel_block.id, name=r.hostel_block.name),
            room=r.room,
            rack_number=r.rack_number,
            total_count=r.total_item_count,
            created_at=r.created_at,
            opened_at=r.opened_at,
            due_by=r.due_by,
            completed_at=r.completed_at,
            can_pay_until=r.can_pay_until if r.status == "PAYMENT_PENDING" else None,
            tier=TierInfo(
                code=r.tier.code,
                label=r.tier.label,
                window_label=f"{r.tier.window_min_minutes // 60} to {r.tier.window_max_minutes // 60} hours"
            ),
            laundry_location=LocationRef(
                id=r.laundry_location.id,
                name=r.laundry_location.name,
                landmark=r.laundry_location.landmark
            ),
            items=items_list,
            note=r.note,
            clean_date=r.clean_date,
            media=media_list,
            payment=payment_intent,
            handoff_code=handoff_code,
            partner=partner_contact,
            timeline=timeline,
            accept_by=r.expires_at,
            accepted_at=r.accepted_at,
            picked_up_at=r.picked_up_at,
            cancelled_at=r.cancelled_at,
            expired_at=r.expired_at,
            cancel_reason=r.cancel_reason,
            confirmed_received_at=r.received_confirmed_at,
            rating=rating_summary,
            dispute=dispute_summary,
            refund=refund_summary,
            allowed_actions=allowed_actions,
            updated_at=r.updated_at
        )

    @classmethod
    async def cancel_request(
        cls, db: AsyncSession, student: User, request_id: str, reason_code: str, note: Optional[str]
    ) -> RequestDetail:
        q = select(Request).options(selectinload(Request.payments)).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status not in ("PAYMENT_PENDING", "OPEN", "ACCEPTED"):
            raise APIException(
                code="CANCEL_NOT_ALLOWED",
                message=f"Cannot cancel request in current status '{r.status}'.",
                status_code=409,
                details={"status": r.status}
            )

        now = utc_now()
        refund_amount = 0

        if r.status == "PAYMENT_PENDING":
            # Expire payment
            if r.payments:
                for p in r.payments:
                    if p.status in ("CREATED", "PENDING"):
                        p.status = "EXPIRED"
        elif r.status == "OPEN":
            # 100% full refund
            refund_amount = r.price_paise
        elif r.status == "ACCEPTED":
            # Check 120s grace
            seconds_since_accept = (now - (ensure_utc(r.accepted_at) or now)).total_seconds()
            if seconds_since_accept <= settings.STUDENT_FREE_CANCEL_SECONDS:
                refund_amount = r.price_paise
            else:
                fee = (r.price_paise * settings.STUDENT_CANCEL_FEE_PERCENT) // 100
                refund_amount = r.price_paise - fee
                comp = (fee * settings.CANCEL_FEE_PARTNER_SHARE_PERCENT) // 100
                if r.partner_id and comp > 0:
                    # Post CANCEL_COMP to ledger
                    db.add(LedgerEntry(
                        partner_id=r.partner_id,
                        entry_type="CANCEL_COMP",
                        pending_delta_paise=0,
                        available_delta_paise=comp,
                        request_id=r.id,
                        reason="Cancellation compensation after grace window",
                        idempotency_key=f"cancel_comp:{r.id}:{uuid7_str()}"
                    ))
                    # Update partner balance cache
                    q_prof = select(PartnerProfile).where(PartnerProfile.user_id == r.partner_id)
                    prof = (await db.execute(q_prof)).scalars().first()
                    if prof:
                        prof.available_balance_paise += comp

        r.status = "CANCELLED"
        r.cancelled_at = now
        r.cancelled_by = student.id
        r.cancelled_by_role = "student"
        r.cancel_reason = reason_code

        # Create refund row if money was captured
        if refund_amount > 0 and r.payments:
            success_payment = next((p for p in r.payments if p.status == "SUCCESS"), None)
            if success_payment:
                db.add(Refund(
                    payment_id=success_payment.id,
                    request_id=r.id,
                    amount_paise=refund_amount,
                    reason="CANCELLED_BY_STUDENT",
                    status="PENDING",
                    merchant_refund_id=f"RFD-{uuid7_str()[:16]}"
                ))

        db.add(RequestEvent(
            request_id=r.id,
            event_type="STATUS_CHANGE",
            from_status=r.status,
            to_status="CANCELLED",
            actor_id=student.id,
            actor_role="student",
            metadata_={"reason": reason_code, "note": note, "label": "Cancelled by student"}
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

    @classmethod
    async def confirm_received(cls, db: AsyncSession, student: User, request_id: str) -> RequestDetail:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status != "COMPLETED":
            raise APIException(
                code="REQUEST_INVALID_STATE",
                message="Can only confirm receipt when delivery is COMPLETED.",
                status_code=409,
                details={"status": r.status, "allowed_statuses": ["COMPLETED"]}
            )

        if r.received_confirmed_at:
            raise APIException(code="ALREADY_CONFIRMED", message="Already confirmed receipt.", status_code=409)

        r.received_confirmed_at = utc_now()

        # Release ledger hold if partner exists
        if r.partner_id and not r.earnings_released_at:
            r.earnings_released_at = utc_now()
            payout = r.partner_payout_paise
            db.add(LedgerEntry(
                partner_id=r.partner_id,
                entry_type="EARN_RELEASE",
                pending_delta_paise=-payout,
                available_delta_paise=payout,
                request_id=r.id,
                idempotency_key=f"earn_release:{r.id}"
            ))
            q_prof = select(PartnerProfile).where(PartnerProfile.user_id == r.partner_id)
            prof = (await db.execute(q_prof)).scalars().first()
            if prof:
                prof.pending_balance_paise = max(0, prof.pending_balance_paise - payout)
                prof.available_balance_paise += payout

        db.add(RequestEvent(
            request_id=r.id,
            event_type="CONFIRM_RECEIVED",
            actor_id=student.id,
            actor_role="student",
            metadata_={"label": "Student confirmed receipt"}
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

    @classmethod
    async def dispute_request(
        cls, db: AsyncSession, student: User, request_id: str,
        reason_code: str, description: str, evidence_media_ids: Optional[List[str]] = None
    ) -> RequestDetail:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status not in ("PICKED_UP", "COMPLETED"):
            raise APIException(
                code="REQUEST_INVALID_STATE",
                message="Dispute only permitted while in transit or completed.",
                status_code=409,
                details={"status": r.status}
            )

        # Check existing disputes
        q_disp = select(Dispute).where(Dispute.request_id == r.id)
        existing = (await db.execute(q_disp)).scalars().first()
        if existing:
            raise APIException(code="DISPUTE_ALREADY_OPEN", message="Dispute already open for this request.", status_code=409)

        if r.status == "COMPLETED" and r.completed_at:
            diff = (utc_now() - ensure_utc(r.completed_at)).total_seconds() / 3600
            if diff > settings.DISPUTE_WINDOW_HOURS:
                raise APIException(
                    code="DISPUTE_WINDOW_CLOSED",
                    message=f"Dispute window of {settings.DISPUTE_WINDOW_HOURS} hours has expired.",
                    status_code=409
                )

        prev_status = r.status
        r.status = "DISPUTED"

        db.add(Dispute(
            request_id=r.id,
            raised_by=student.id,
            raised_by_role="student",
            reason_code=reason_code,
            description=description,
            previous_status=prev_status,
            status="OPEN"
        ))

        db.add(RequestEvent(
            request_id=r.id,
            event_type="DISPUTE_OPENED",
            from_status=prev_status,
            to_status="DISPUTED",
            actor_id=student.id,
            actor_role="student",
            metadata_={"reason": reason_code, "label": "Dispute opened by student"}
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

    @classmethod
    async def rate_request(
        cls, db: AsyncSession, student: User, request_id: str, stars: int, comment: Optional[str]
    ) -> Dict[str, Any]:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status != "COMPLETED":
            raise APIException(code="RATING_NOT_ALLOWED", message="Only completed requests can be rated.", status_code=409)

        if r.rating is not None:
            raise APIException(code="ALREADY_RATED", message="Request already rated.", status_code=409)

        r.rating = stars
        r.rating_comment = comment
        r.rated_at = utc_now()

        # Update partner rating aggregate
        if r.partner_id:
            q_p = select(PartnerProfile).where(PartnerProfile.user_id == r.partner_id)
            prof = (await db.execute(q_p)).scalars().first()
            if prof:
                prof.rating_sum += stars
                prof.rating_count += 1

        db.add(RequestEvent(
            request_id=r.id,
            event_type="RATED",
            actor_id=student.id,
            actor_role="student",
            metadata_={"stars": stars, "comment": comment, "label": f"Rated {stars} stars"}
        ))

        await db.commit()
        return {"stars": stars, "comment": comment, "created_at": r.rated_at}

    @classmethod
    async def set_clean_date(
        cls, db: AsyncSession, student: User, request_id: str, clean_date: Optional[date]
    ) -> RequestDetail:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.type != "DROP":
            raise APIException(code="CLEAN_DATE_INVALID", message="clean_date only applies to DROP requests.", status_code=422)

        if r.status not in ("OPEN", "ACCEPTED", "PICKED_UP", "COMPLETED"):
            raise APIException(code="REQUEST_INVALID_STATE", message=f"Cannot set clean_date in status '{r.status}'.", status_code=409)

        if clean_date:
            today = date.today()
            max_date = today + timedelta(days=settings.CLEAN_DATE_MAX_DAYS_AHEAD)
            if clean_date < today or clean_date > max_date:
                raise APIException(
                    code="CLEAN_DATE_INVALID",
                    message=f"Clean date must be between today and {max_date}.",
                    status_code=422
                )

        r.clean_date = clean_date
        r.clean_date_set_at = utc_now()

        db.add(RequestEvent(
            request_id=r.id,
            event_type="CLEAN_DATE_SET",
            actor_id=student.id,
            actor_role="student",
            metadata_={"clean_date": str(clean_date) if clean_date else None, "label": "Clean date updated"}
        ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

    @classmethod
    async def retry_payment(
        cls, db: AsyncSession, student: User, request_id: str
    ) -> PaymentIntent:
        q = select(Request).options(selectinload(Request.payments)).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status != "PAYMENT_PENDING":
            raise APIException(code="PAYMENT_NOT_RETRYABLE", message="Request is not awaiting payment.", status_code=409)

        if r.can_pay_until and ensure_utc(r.can_pay_until) < utc_now():
            raise APIException(
                code="PAYMENT_WINDOW_EXPIRED",
                message="Payment window expired. Create a new request.",
                status_code=409
            )

        latest_payment = sorted(r.payments, key=lambda p: p.attempt_no, reverse=True)[0] if r.payments else None
        if latest_payment and latest_payment.status in ("CREATED", "PENDING"):
            # Attempt is still live, cannot create a new one
            raise APIException(
                code="PAYMENT_NOT_RETRYABLE",
                message="Latest payment attempt is still in progress.",
                status_code=409
            )

        attempt_no = (latest_payment.attempt_no + 1) if latest_payment else 1
        merchant_order_id = f"CLP-{random.randint(10000000, 99999999)}"
        payment_id = uuid7_str()
        redirect_url = f"/app/pay/mock?order={merchant_order_id}&amount={r.price_paise}"

        new_payment = Payment(
            id=payment_id,
            request_id=r.id,
            user_id=student.id,
            provider="mock" if settings.PAYMENT_PROVIDER == "mock" else "phonepe",
            attempt_no=attempt_no,
            merchant_order_id=merchant_order_id,
            status="CREATED",
            amount_paise=r.price_paise,
            currency="INR",
            checkout_ref=redirect_url,
            expires_at=r.can_pay_until
        )
        db.add(new_payment)
        await db.commit()

        return PaymentIntent(
            id=new_payment.id,
            status=new_payment.status,
            provider=new_payment.provider,
            amount_paise=new_payment.amount_paise,
            redirect_url=redirect_url,
            expires_at=new_payment.expires_at,
            attempt_no=new_payment.attempt_no
        )

    @classmethod
    async def mock_complete_payment(
        cls, db: AsyncSession, student: User, request_id: str, success: bool = True
    ) -> RequestDetail:
        q = select(Request).options(
            selectinload(Request.payments),
            selectinload(Request.tier)
        ).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        if r.status != "PAYMENT_PENDING":
            raise APIException(code="REQUEST_INVALID_STATE", message="Request is not awaiting payment.", status_code=409)

        latest_payment = sorted(r.payments, key=lambda p: p.attempt_no, reverse=True)[0] if r.payments else None

        if success:
            if latest_payment:
                latest_payment.status = "SUCCESS"
                latest_payment.paid_at = utc_now()
                latest_payment.utr = f"UTR{random.randint(100000000000, 999999999999)}"

            r.status = "OPEN"
            r.opened_at = utc_now()
            r.due_by = r.opened_at + timedelta(minutes=r.window_max_minutes)
            acceptance_timeout = r.tier.acceptance_timeout_minutes or 30
            r.expires_at = r.opened_at + timedelta(minutes=acceptance_timeout)
            r.can_pay_until = None

            db.add(RequestEvent(
                request_id=r.id,
                event_type="STATUS_CHANGE",
                from_status="PAYMENT_PENDING",
                to_status="OPEN",
                actor_role="system",
                metadata_={"label": "Looking for a delivery partner"}
            ))

            db.add(Notification(
                id=uuid7_str(),
                user_id=student.id,
                type="PAYMENT_CONFIRMED",
                title="Payment confirmed",
                body=f"Your {r.type} request {r.ref} is now open to delivery partners.",
                data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
            ))
        else:
            if latest_payment:
                latest_payment.status = "FAILED"
                latest_payment.failure_code = "USER_CANCELLED"
                latest_payment.failure_message = "Payment cancelled or rejected by user."

            db.add(RequestEvent(
                request_id=r.id,
                event_type="PAYMENT_FAILED",
                from_status="PAYMENT_PENDING",
                to_status="PAYMENT_PENDING",
                actor_role="system",
                metadata_={"label": "Payment failed"}
            ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

    @classmethod
    async def mock_advance_flow(
        cls, db: AsyncSession, student: User, request_id: str
    ) -> RequestDetail:
        """Helper for development & demo to advance request through partner lifecycle."""
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()
        if not r or r.student_id != student.id:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)

        now = utc_now()

        # Find or create a demo partner
        q_partner = select(User).where(User.role == "partner")
        partner = (await db.execute(q_partner)).scalars().first()
        if not partner:
            partner = User(
                id=uuid7_str(),
                email="partner.demo@srmap.edu.in",
                name="Rohit Verma",
                phone="+919876543210",
                role="partner",
                partner_status="APPROVED",
                onboarded_at=now
            )
            db.add(partner)
            await db.flush()

        if r.status == "OPEN":
            # Advance to ACCEPTED
            r.status = "ACCEPTED"
            r.partner_id = partner.id
            r.accepted_at = now
            db.add(RequestEvent(
                request_id=r.id,
                event_type="STATUS_CHANGE",
                from_status="OPEN",
                to_status="ACCEPTED",
                actor_id=partner.id,
                actor_role="partner",
                metadata_={"label": f"{partner.name or 'Partner'} accepted"}
            ))
            db.add(Notification(
                id=uuid7_str(),
                user_id=student.id,
                type="REQUEST_ACCEPTED",
                title=f"{partner.name or 'Partner'} accepted your request",
                body="Keep your 4-digit handoff code ready when partner arrives.",
                data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
            ))

        elif r.status == "ACCEPTED":
            # Advance to PICKED_UP
            r.status = "PICKED_UP"
            r.picked_up_at = now
            db.add(RequestEvent(
                request_id=r.id,
                event_type="STATUS_CHANGE",
                from_status="ACCEPTED",
                to_status="PICKED_UP",
                actor_id=partner.id,
                actor_role="partner",
                metadata_={"label": "Bag handed over & verified"}
            ))
            db.add(Notification(
                id=uuid7_str(),
                user_id=student.id,
                type="REQUEST_PICKED_UP",
                title="Bag picked up",
                body=f"Your bag is on its way to the {'laundry' if r.type == 'DROP' else 'hostel'}.",
                data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
            ))

        elif r.status == "PICKED_UP":
            # Advance to COMPLETED
            r.status = "COMPLETED"
            r.completed_at = now
            if r.type == "DROP" and not r.rack_number:
                r.rack_number = f"R-{random.randint(1000, 9999)}"
            r.earnings_release_at = now + timedelta(minutes=120)

            db.add(RequestEvent(
                request_id=r.id,
                event_type="STATUS_CHANGE",
                from_status="PICKED_UP",
                to_status="COMPLETED",
                actor_id=partner.id,
                actor_role="partner",
                metadata_={"label": "Delivered successfully", "rack_number": r.rack_number}
            ))
            db.add(Notification(
                id=uuid7_str(),
                user_id=student.id,
                type="REQUEST_COMPLETED",
                title="Delivery completed!",
                body=f"Order {r.ref} completed. Please confirm receipt and rate your experience.",
                data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
            ))

        await db.commit()
        return await cls.get_request_detail(db, student, r.id)

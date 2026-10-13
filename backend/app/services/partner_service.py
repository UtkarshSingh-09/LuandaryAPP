import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import select, and_, or_, func, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import APIException
from app.core.database import uuid7_str
from app.core.security import verify_handoff_code
from app.models import (
    User, Request, RequestEvent, ServiceTier,
    HostelBlock, LaundryLocation, PartnerProfile,
    LedgerEntry, PayoutRequest, Notification
)
from app.schemas.common import (
    PoolItem, PartnerJobDetail, HostelBlockRef, LocationRef,
    StudentContact, TimelineEvent, PartnerEarningsResponse,
    LedgerEntryItem, PayoutItem, MediaRef
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class PartnerService:

    @classmethod
    async def get_or_create_profile(cls, db: AsyncSession, partner: User) -> PartnerProfile:
        q = select(PartnerProfile).where(PartnerProfile.user_id == partner.id)
        profile = (await db.execute(q)).scalars().first()
        if not profile:
            profile = PartnerProfile(
                user_id=partner.id,
                upi_id=partner.email.split("@")[0] + "@okaxis",
                is_online=False
            )
            db.add(profile)
            await db.flush()
        return profile

    @classmethod
    async def toggle_online(cls, db: AsyncSession, partner: User, is_online: bool) -> PartnerProfile:
        if partner.partner_status == "SUSPENDED":
            raise APIException(code="PARTNER_SUSPENDED", message="Your partner account is suspended.", status_code=403)
        if partner.partner_status != "APPROVED":
            raise APIException(code="PARTNER_NOT_APPROVED", message="You are not an approved delivery partner.", status_code=403)

        profile = await cls.get_or_create_profile(db, partner)
        if not profile.upi_id:
            raise APIException(code="PAYOUT_UPI_MISSING", message="Add a payout UPI ID before going online.", status_code=422)

        profile.is_online = is_online
        profile.online_since = utc_now() if is_online else None
        profile.last_seen_at = utc_now()
        await db.commit()
        return profile

    @classmethod
    async def get_pool(cls, db: AsyncSession, partner: User) -> List[PoolItem]:
        profile = await cls.get_or_create_profile(db, partner)
        if not profile.is_online:
            raise APIException(code="PARTNER_OFFLINE", message="You must be online to view the request pool.", status_code=403)

        now = utc_now()
        q = select(Request).options(
            selectinload(Request.hostel_block),
            selectinload(Request.laundry_location)
        ).where(
            and_(
                Request.status == "OPEN",
                Request.partner_id.is_(None),
                Request.student_id != partner.id,
                or_(Request.expires_at.is_(None), Request.expires_at > now)
            )
        ).order_by(Request.opened_at.desc())

        requests = (await db.execute(q)).scalars().all()
        pool_items = []
        for r in requests:
            pool_items.append(PoolItem(
                id=r.id,
                ref=r.ref,
                type=r.type,
                tier_code=r.tier_code,
                price_paise=r.price_paise,
                payout_paise=r.partner_payout_paise,
                hostel_block=HostelBlockRef(id=r.hostel_block.id, name=r.hostel_block.name),
                laundry_location=LocationRef(
                    id=r.laundry_location.id,
                    name=r.laundry_location.name,
                    landmark=r.laundry_location.landmark
                ),
                total_count=r.total_item_count,
                rack_number=r.rack_number,
                opened_at=r.opened_at,
                due_by=r.due_by,
                accept_by=r.expires_at,
                created_at=r.created_at
            ))

        return pool_items

    @classmethod
    async def accept_request(cls, db: AsyncSession, partner: User, request_id: str) -> PartnerJobDetail:
        profile = await cls.get_or_create_profile(db, partner)
        if not profile.is_online:
            raise APIException(code="PARTNER_OFFLINE", message="You must be online to accept requests.", status_code=403)

        if partner.partner_status != "APPROVED":
            raise APIException(code="PARTNER_NOT_APPROVED", message="Partner is not approved.", status_code=403)

        if profile.active_jobs_count >= settings.MAX_ACTIVE_JOBS_PER_PARTNER:
            raise APIException(
                code="PARTNER_JOB_LIMIT_REACHED",
                message=f"You already hold {profile.active_jobs_count} active jobs (limit is {settings.MAX_ACTIVE_JOBS_PER_PARTNER}).",
                status_code=409,
                details={"limit": settings.MAX_ACTIVE_JOBS_PER_PARTNER, "active": profile.active_jobs_count}
            )

        now = utc_now()

        # Check self-accept
        q_check = select(Request).where(Request.id == request_id)
        existing = (await db.execute(q_check)).scalars().first()
        if not existing:
            raise APIException(code="NOT_FOUND", message="Request not found.", status_code=404)
        if existing.student_id == partner.id:
            raise APIException(code="CANNOT_ACCEPT_OWN_REQUEST", message="Cannot accept your own request.", status_code=403)
        if existing.status != "OPEN":
            raise APIException(code="REQUEST_NOT_OPEN", message="Request is no longer open.", status_code=409)

        # Atomic accept UPDATE
        q_update = (
            update(Request)
            .where(
                and_(
                    Request.id == request_id,
                    Request.status == "OPEN",
                    Request.partner_id.is_(None),
                    or_(Request.expires_at.is_(None), Request.expires_at > now)
                )
            )
            .values(
                status="ACCEPTED",
                partner_id=partner.id,
                accepted_at=now
            )
            .execution_options(synchronize_session=False)
        )
        res = await db.execute(q_update)
        if res.rowcount == 0:
            raise APIException(
                code="REQUEST_ALREADY_TAKEN",
                message="Another partner accepted this request a moment ago.",
                status_code=409
            )

        existing.status = "ACCEPTED"
        existing.partner_id = partner.id
        existing.accepted_at = now

        # Increment partner active jobs count
        profile.active_jobs_count += 1

        # Insert RequestEvent
        db.add(RequestEvent(
            request_id=request_id,
            event_type="STATUS_CHANGE",
            from_status="OPEN",
            to_status="ACCEPTED",
            actor_id=partner.id,
            actor_role="partner",
            metadata_={"label": f"{partner.name or 'Partner'} accepted"}
        ))

        # Notify student with partner name and phone
        partner_display_name = partner.name or "Delivery Partner"
        partner_phone_str = partner.phone or "Available in order details"
        db.add(Notification(
            id=uuid7_str(),
            user_id=existing.student_id,
            type="REQUEST_ACCEPTED",
            title=f"{partner_display_name} accepted your laundry request!",
            body=f"{partner_display_name} (Phone: {partner_phone_str}) is on the way. Tap to view order details and 4-digit security code.",
            data={
                "request_id": existing.id,
                "ref": existing.ref,
                "partner_name": partner_display_name,
                "partner_phone": partner_phone_str,
                "deeplink": f"/app/requests/{existing.id}"
            }
        ))

        await db.commit()
        return await cls.get_job_detail(db, partner, request_id)

    @classmethod
    async def get_jobs(cls, db: AsyncSession, partner: User, active_only: bool = True) -> List[PartnerJobDetail]:
        now = utc_now()
        q = select(Request).options(
            selectinload(Request.hostel_block),
            selectinload(Request.laundry_location),
            selectinload(Request.student),
            selectinload(Request.events)
        ).where(Request.partner_id == partner.id)

        if active_only:
            q = q.where(Request.status.in_(["ACCEPTED", "PICKED_UP"]))
        else:
            q = q.where(Request.status.in_(["COMPLETED", "CANCELLED", "DISPUTED"]))

        q = q.order_by(Request.created_at.desc())
        jobs = (await db.execute(q)).scalars().all()

        results = []
        for r in jobs:
            results.append(cls._format_job_detail(r))
        return results

    @classmethod
    async def get_job_detail(cls, db: AsyncSession, partner: User, request_id: str) -> PartnerJobDetail:
        q = select(Request).options(
            selectinload(Request.hostel_block),
            selectinload(Request.laundry_location),
            selectinload(Request.student),
            selectinload(Request.events),
            selectinload(Request.media)
        ).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.partner_id != partner.id:
            raise APIException(code="NOT_FOUND", message="Job not found or not assigned to you.", status_code=404)

        return cls._format_job_detail(r)

    @classmethod
    def _format_job_detail(cls, r: Request) -> PartnerJobDetail:
        timeline = []
        for ev in sorted(r.events, key=lambda e: e.created_at):
            label = (ev.metadata_ or {}).get("label") or ev.event_type.replace("_", " ").title()
            timeline.append(TimelineEvent(
                status=ev.to_status or ev.event_type,
                at=ev.created_at,
                label=label
            ))

        media_list = []
        if getattr(r, "media", None):
            for m in r.media:
                media_list.append(MediaRef(
                    id=m.id,
                    kind=m.kind,
                    content_type=m.content_type,
                    url=f"https://files.example.in/{m.object_key}",
                    url_expires_at=utc_now() + timedelta(minutes=60)
                ))

        allowed_actions = []
        if r.status == "ACCEPTED":
            allowed_actions.extend(["withdraw"])
            if r.type == "DROP":
                allowed_actions.append("verify_origin")
            else:
                allowed_actions.append("pickup_from_laundry")
        elif r.status == "PICKED_UP":
            allowed_actions.append("complete")

        return PartnerJobDetail(
            id=r.id,
            ref=r.ref,
            type=r.type,
            status=r.status,
            tier_code=r.tier_code,
            payout_paise=r.partner_payout_paise,
            hostel_block=HostelBlockRef(id=r.hostel_block.id, name=r.hostel_block.name),
            room=r.room,
            laundry_location=LocationRef(
                id=r.laundry_location.id,
                name=r.laundry_location.name,
                landmark=r.laundry_location.landmark
            ),
            student=StudentContact(
                first_name=r.student.name or "Student",
                phone=r.student.phone or ""
            ),
            note=r.note,
            total_count=r.total_item_count,
            rack_number=r.rack_number,
            clean_date=r.clean_date,
            media=media_list,
            timeline=timeline,
            due_by=r.due_by,
            accepted_at=r.accepted_at,
            picked_up_at=r.picked_up_at,
            completed_at=r.completed_at,
            allowed_actions=allowed_actions
        )

    @classmethod
    async def verify_origin(
        cls, db: AsyncSession, partner: User, request_id: str, code: str, counted_items: Optional[int] = None
    ) -> PartnerJobDetail:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.partner_id != partner.id:
            raise APIException(code="NOT_FOUND", message="Job not found.", status_code=404)

        if r.type != "DROP" or r.status != "ACCEPTED":
            raise APIException(code="REQUEST_INVALID_STATE", message="Origin verification only valid for DROP in ACCEPTED state.", status_code=409)

        if r.code_locked_at:
            raise APIException(code="CODE_LOCKED", message="Security code locked after 5 wrong attempts. Contact admin.", status_code=423)

        # Check HMAC
        if not r.origin_code_hash or not verify_handoff_code(r.id, "origin", code, r.origin_code_hash):
            r.code_attempts += 1
            attempts_left = max(0, settings.CODE_MAX_ATTEMPTS - r.code_attempts)
            if attempts_left <= 0:
                r.code_locked_at = utc_now()
                db.add(RequestEvent(
                    request_id=r.id,
                    event_type="CODE_LOCKED",
                    actor_id=partner.id,
                    actor_role="partner",
                    metadata_={"attempts": r.code_attempts, "label": "Security code locked"}
                ))
                await db.commit()
                raise APIException(code="CODE_LOCKED", message="5 wrong attempts; code locked. Contact admin.", status_code=423)

            await db.commit()
            raise APIException(
                code="CODE_INVALID",
                message="Wrong 4-digit verification code.",
                status_code=422,
                details={"attempts_left": attempts_left}
            )

        # Valid code: transition to PICKED_UP
        now = utc_now()
        r.status = "PICKED_UP"
        r.picked_up_at = now

        meta: Dict[str, Any] = {"label": "Laundry bag collected"}
        if counted_items is not None and counted_items != r.total_item_count:
            meta["count_mismatch"] = {"declared": r.total_item_count, "counted": counted_items}

        db.add(RequestEvent(
            request_id=r.id,
            event_type="STATUS_CHANGE",
            from_status="ACCEPTED",
            to_status="PICKED_UP",
            actor_id=partner.id,
            actor_role="partner",
            metadata_=meta
        ))

        db.add(Notification(
            id=uuid7_str(),
            user_id=r.student_id,
            type="REQUEST_PICKED_UP",
            title="Bag picked up",
            body="Your laundry bag is in transit to the laundry counter.",
            data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
        ))

        await db.commit()
        return await cls.get_job_detail(db, partner, request_id)

    @classmethod
    async def complete_job(
        cls, db: AsyncSession, partner: User, request_id: str,
        rack_number: Optional[str] = None, code: Optional[str] = None, receipt_media_id: Optional[str] = None
    ) -> PartnerJobDetail:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.partner_id != partner.id:
            raise APIException(code="NOT_FOUND", message="Job not found.", status_code=404)

        if r.status != "PICKED_UP":
            raise APIException(code="REQUEST_INVALID_STATE", message="Delivery can only be completed from PICKED_UP status.", status_code=409)

        now = utc_now()

        if r.type == "DROP":
            if not rack_number or not rack_number.strip():
                raise APIException(code="RACK_NUMBER_REQUIRED", message="Laundry rack number is required to complete DROP delivery.", status_code=422)
            r.rack_number = rack_number.strip().upper()
        elif r.type == "PICKUP":
            if not code:
                raise APIException(code="CODE_INVALID", message="Student 4-digit handoff code is required.", status_code=422)
            if r.code_locked_at:
                raise APIException(code="CODE_LOCKED", message="Security code locked. Contact admin.", status_code=423)
            if not r.destination_code_hash or not verify_handoff_code(r.id, "destination", code, r.destination_code_hash):
                r.code_attempts += 1
                attempts_left = max(0, settings.CODE_MAX_ATTEMPTS - r.code_attempts)
                if attempts_left <= 0:
                    r.code_locked_at = now
                    await db.commit()
                    raise APIException(code="CODE_LOCKED", message="5 wrong attempts; code locked.", status_code=423)
                await db.commit()
                raise APIException(code="CODE_INVALID", message="Wrong 4-digit code.", status_code=422, details={"attempts_left": attempts_left})

        # Complete request
        r.status = "COMPLETED"
        r.completed_at = now
        r.earnings_release_at = now + timedelta(minutes=settings.EARNINGS_HOLD_MINUTES)

        # Update partner counters & ledger
        profile = await cls.get_or_create_profile(db, partner)
        profile.active_jobs_count = max(0, profile.active_jobs_count - 1)
        profile.completed_jobs_count += 1
        profile.pending_balance_paise += r.partner_payout_paise
        profile.lifetime_earned_paise += r.partner_payout_paise

        # Ledger Entry (EARN_HOLD)
        ledger_entry = LedgerEntry(
            id=uuid7_str(),
            partner_id=partner.id,
            entry_type="EARN_HOLD",
            pending_delta_paise=r.partner_payout_paise,
            available_delta_paise=0,
            request_id=r.id,
            idempotency_key=f"earn_hold:{r.id}",
            metadata_={"rack_number": r.rack_number, "payout_paise": r.partner_payout_paise}
        )
        db.add(ledger_entry)

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
            user_id=r.student_id,
            type="REQUEST_COMPLETED",
            title="Laundry delivered!",
            body=f"Your {r.type} delivery is complete (Rack {r.rack_number or 'Token'}). Please confirm receipt.",
            data={"request_id": r.id, "ref": r.ref, "deeplink": f"/app/requests/{r.id}"}
        ))

        await db.commit()
        return await cls.get_job_detail(db, partner, request_id)

    @classmethod
    async def withdraw_job(
        cls, db: AsyncSession, partner: User, request_id: str, reason: str, note: Optional[str] = None
    ) -> Dict[str, Any]:
        q = select(Request).where(Request.id == request_id)
        r = (await db.execute(q)).scalars().first()

        if not r or r.partner_id != partner.id:
            raise APIException(code="NOT_FOUND", message="Job not found.", status_code=404)

        if r.status != "ACCEPTED":
            raise APIException(
                code="WITHDRAW_NOT_ALLOWED",
                message="You can only withdraw from ACCEPTED jobs before bag collection.",
                status_code=409
            )

        now = utc_now()
        accepted_at = ensure_utc(r.accepted_at) or now
        duration_minutes = (now - accepted_at).total_seconds() / 60

        # Strike logic per 04 section 6
        strike = 0
        if duration_minutes > settings.PARTNER_FREE_WITHDRAW_MINUTES and reason not in ("LAUNDRY_NOT_READY", "LAUNDRY_CLOSED", "STUDENT_UNREACHABLE"):
            strike = 1

        profile = await cls.get_or_create_profile(db, partner)
        profile.active_jobs_count = max(0, profile.active_jobs_count - 1)
        profile.withdrawn_jobs_count += 1
        if strike > 0:
            profile.strikes += strike

        # Re-open request to pool
        r.status = "OPEN"
        r.partner_id = None
        r.expires_at = now + timedelta(minutes=settings.REOPEN_ACCEPTANCE_MINUTES)

        db.add(RequestEvent(
            request_id=r.id,
            event_type="PARTNER_WITHDRAWN",
            from_status="ACCEPTED",
            to_status="OPEN",
            actor_id=partner.id,
            actor_role="partner",
            metadata_={"reason": reason, "strike_added": strike, "note": note}
        ))

        await db.commit()
        return {
            "status": "OPEN",
            "withdrawn": True,
            "strike_added": strike
        }

    @classmethod
    async def get_earnings(cls, db: AsyncSession, partner: User) -> PartnerEarningsResponse:
        profile = await cls.get_or_create_profile(db, partner)

        q_entries = (
            select(LedgerEntry)
            .where(LedgerEntry.partner_id == partner.id)
            .order_by(LedgerEntry.created_at.desc())
            .limit(20)
        )
        entries = (await db.execute(q_entries)).scalars().all()

        recent = [
            LedgerEntryItem(
                id=e.id,
                entry_type=e.entry_type,
                pending_delta_paise=e.pending_delta_paise,
                available_delta_paise=e.available_delta_paise,
                request_id=e.request_id,
                reason=e.reason,
                created_at=e.created_at
            ) for e in entries
        ]

        return PartnerEarningsResponse(
            pending_balance_paise=profile.pending_balance_paise,
            available_balance_paise=profile.available_balance_paise,
            lifetime_earned_paise=profile.lifetime_earned_paise,
            lifetime_paid_out_paise=profile.lifetime_paid_out_paise,
            active_jobs_count=profile.active_jobs_count,
            completed_jobs_count=profile.completed_jobs_count,
            withdrawn_jobs_count=profile.withdrawn_jobs_count,
            strikes=profile.strikes,
            rating_avg=float(profile.rating_avg) if profile.rating_avg is not None else None,
            rating_count=profile.rating_count,
            upi_id=profile.upi_id,
            is_online=profile.is_online,
            recent_entries=recent
        )

    @classmethod
    async def create_payout(cls, db: AsyncSession, partner: User, amount_paise: int) -> PayoutItem:
        profile = await cls.get_or_create_profile(db, partner)
        if not profile.upi_id:
            raise APIException(code="PAYOUT_UPI_MISSING", message="No payout UPI ID configured.", status_code=422)

        if amount_paise < settings.MIN_PAYOUT_PAISE:
            raise APIException(
                code="PAYOUT_BELOW_MINIMUM",
                message=f"Minimum payout is ₹{settings.MIN_PAYOUT_PAISE // 100}.",
                status_code=422,
                details={"min_paise": settings.MIN_PAYOUT_PAISE}
            )

        if amount_paise > profile.available_balance_paise:
            raise APIException(
                code="PAYOUT_INSUFFICIENT_BALANCE",
                message=f"Insufficient available balance (₹{profile.available_balance_paise // 100} available).",
                status_code=409,
                details={"available_paise": profile.available_balance_paise}
            )

        # Check existing pending payout
        q_pending = select(PayoutRequest).where(
            and_(
                PayoutRequest.partner_id == partner.id,
                PayoutRequest.status == "REQUESTED"
            )
        )
        if (await db.execute(q_pending)).scalars().first():
            raise APIException(
                code="PAYOUT_PENDING_EXISTS",
                message="You already have an open payout request pending processing.",
                status_code=409
            )

        payout_id = uuid7_str()
        payout = PayoutRequest(
            id=payout_id,
            partner_id=partner.id,
            amount_paise=amount_paise,
            upi_id=profile.upi_id,
            status="REQUESTED"
        )
        db.add(payout)

        # Ledger PAYOUT_RESERVE
        profile.available_balance_paise -= amount_paise
        ledger_entry = LedgerEntry(
            id=uuid7_str(),
            partner_id=partner.id,
            entry_type="PAYOUT_RESERVE",
            pending_delta_paise=0,
            available_delta_paise=-amount_paise,
            payout_request_id=payout_id,
            idempotency_key=f"payout_reserve:{payout_id}"
        )
        db.add(ledger_entry)

        await db.commit()
        return PayoutItem(
            id=payout.id,
            amount_paise=payout.amount_paise,
            upi_id=payout.upi_id,
            status=payout.status,
            utr=None,
            requested_at=payout.requested_at,
            processed_at=None
        )

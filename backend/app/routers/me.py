from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.core.config import settings
from app.core.errors import APIException
from app.core.database import get_db
from app.api.deps import get_current_user
from app.routers.auth import serialize_user
from app.models import User, HostelBlock, PartnerProfile
from app.schemas.common import UserResponse, UserPatchRequest, PartnerApplyRequest

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role == "admin":
        raise APIException(
            code="FORBIDDEN",
            message="Admin accounts do not have student profiles.",
            status_code=403
        )

    q = select(User).options(
        selectinload(User.hostel_block),
        selectinload(User.partner_profile),
        selectinload(User.notifications)
    ).where(User.id == current_user.id)
    user = (await db.execute(q)).scalars().first()

    return serialize_user(user or current_user)


@router.patch("", response_model=UserResponse)
async def update_me(
    payload: UserPatchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(User).options(
        selectinload(User.hostel_block),
        selectinload(User.partner_profile),
        selectinload(User.notifications)
    ).where(User.id == current_user.id)
    user = (await db.execute(q)).scalars().first()
    if not user:
        raise APIException(code="NOT_FOUND", message="User not found.", status_code=404)

    if payload.name is not None:
        user.name = payload.name.strip()

    if payload.phone is not None:
        raw_phone = payload.phone.strip()
        if not raw_phone.startswith("+91"):
            raw_phone = f"+91{raw_phone[-10:]}"
        user.phone = raw_phone

    if payload.registration_number is not None:
        user.registration_number = payload.registration_number.strip().upper()

    if payload.hostel_block_id is not None:
        q_b = select(HostelBlock).where(HostelBlock.id == payload.hostel_block_id, HostelBlock.is_active == True)
        block = (await db.execute(q_b)).scalars().first()
        if not block:
            raise APIException(
                code="HOSTEL_BLOCK_INACTIVE",
                message="Selected hostel block is inactive or does not exist.",
                status_code=422
            )
        user.hostel_block_id = block.id

    if payload.room is not None:
        user.room = payload.room.strip()

    if payload.partner_upi_id is not None:
        if user.partner_status != "APPROVED":
            raise APIException(
                code="PARTNER_NOT_APPROVED",
                message="Only approved delivery partners can configure a payout UPI ID.",
                status_code=403
            )
        if user.partner_profile:
            user.partner_profile.upi_id = payload.partner_upi_id.strip()

    if user.is_profile_complete and not user.onboarded_at:
        user.onboarded_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)

    # Re-fetch with relationships
    user_loaded = (await db.execute(q)).scalars().first()
    return serialize_user(user_loaded or user)


@router.post("/partner/apply", status_code=202)
async def apply_as_partner(
    payload: PartnerApplyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user.is_profile_complete:
        raise APIException(
            code="PROFILE_INCOMPLETE",
            message="Please complete your student profile before applying as a delivery partner.",
            status_code=422
        )

    if current_user.partner_status in ("PENDING", "APPROVED"):
        raise APIException(
            code="PARTNER_ALREADY_APPLIED",
            message=f"Partner application already exists with status: {current_user.partner_status}",
            status_code=409
        )

    if current_user.partner_status == "SUSPENDED":
        raise APIException(
            code="PARTNER_SUSPENDED",
            message="Your partner account is currently suspended.",
            status_code=403
        )

    if not payload.accepted_terms or payload.terms_version != settings.PARTNER_TERMS_VERSION:
        raise APIException(
            code="PARTNER_TERMS_NOT_ACCEPTED",
            message="You must accept the current partner terms of service.",
            status_code=422
        )

    # Upsert partner profile
    q_prof = select(PartnerProfile).where(PartnerProfile.user_id == current_user.id)
    prof = (await db.execute(q_prof)).scalars().first()
    now = datetime.now(timezone.utc)

    if not prof:
        prof = PartnerProfile(
            user_id=current_user.id,
            college_id_media_id=payload.id_photo_media_id,
            upi_id=payload.upi_id,
            terms_accepted_at=now,
            applied_at=now
        )
        db.add(prof)
    else:
        prof.college_id_media_id = payload.id_photo_media_id
        prof.upi_id = payload.upi_id
        prof.terms_accepted_at = now
        prof.applied_at = now
        prof.rejection_reason = None

    current_user.partner_status = "PENDING"
    await db.commit()

    return {
        "partner_status": "PENDING",
        "applied_at": now.isoformat()
    }

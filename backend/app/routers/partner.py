from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_idempotency_key
from app.models import User
from app.services.partner_service import PartnerService
from app.schemas.common import (
    PartnerOnlineRequest, PoolItem, PartnerJobDetail,
    VerifyOriginRequest, CompleteJobRequest, WithdrawJobRequest,
    PartnerEarningsResponse, PayoutCreateRequest, PayoutItem
)

router = APIRouter(prefix="/partner", tags=["partner"])


@router.post("/online")
async def toggle_online(
    payload: PartnerOnlineRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    profile = await PartnerService.toggle_online(db, current_user, payload.is_online)
    return {
        "is_online": profile.is_online,
        "online_since": profile.online_since
    }


@router.get("/pool", response_model=List[PoolItem])
async def get_pool(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.get_pool(db, current_user)


@router.post("/requests/{request_id}/accept", response_model=PartnerJobDetail)
async def accept_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.accept_request(db, current_user, request_id)


@router.get("/jobs", response_model=List[PartnerJobDetail])
async def list_jobs(
    active: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.get_jobs(db, current_user, active_only=active)


@router.get("/jobs/{request_id}", response_model=PartnerJobDetail)
async def get_job_detail(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.get_job_detail(db, current_user, request_id)


@router.post("/requests/{request_id}/verify-origin", response_model=PartnerJobDetail)
async def verify_origin_code(
    request_id: str,
    payload: VerifyOriginRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.verify_origin(
        db, current_user, request_id, payload.code, payload.counted_items
    )


@router.post("/requests/{request_id}/complete", response_model=PartnerJobDetail)
async def complete_job(
    request_id: str,
    payload: CompleteJobRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.complete_job(
        db, current_user, request_id,
        rack_number=payload.rack_number,
        code=payload.code,
        receipt_media_id=payload.receipt_media_id
    )


@router.post("/requests/{request_id}/withdraw")
async def withdraw_job(
    request_id: str,
    payload: WithdrawJobRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.withdraw_job(
        db, current_user, request_id, payload.reason, payload.note
    )


@router.get("/earnings", response_model=PartnerEarningsResponse)
async def get_earnings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.get_earnings(db, current_user)


@router.post("/payouts", response_model=PayoutItem, status_code=201)
async def request_payout(
    payload: PayoutCreateRequest,
    idempotency_key: str = Depends(require_idempotency_key),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await PartnerService.create_payout(db, current_user, payload.amount_paise)

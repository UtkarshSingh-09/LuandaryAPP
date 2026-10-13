from typing import Optional, List, Union, Dict, Any
from fastapi import APIRouter, Depends, Query, Request, Response, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user, require_idempotency_key
from app.services.request_service import RequestService
from app.models import User
from app.schemas.common import (
    CreateDropRequest, CreatePickupRequest,
    RequestSummary, RequestDetail, CancelRequest,
    DisputeRequest, RateRequest, CleanDateRequest,
    PaymentIntent
)

router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("", response_model=RequestDetail, status_code=201)
async def create_request(
    payload: Dict[str, Any],
    response: Response,
    idempotency_key: str = Depends(require_idempotency_key),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    req_type = payload.get("type")
    if req_type == "DROP":
        validated_drop = CreateDropRequest(**payload)
        detail = await RequestService.create_drop_request(db, current_user, validated_drop)
    elif req_type == "PICKUP":
        validated_pickup = CreatePickupRequest(**payload)
        detail = await RequestService.create_pickup_request(db, current_user, validated_pickup)
    else:
        from app.core.errors import APIException
        raise APIException(
            code="VALIDATION_ERROR",
            message="Field 'type' must be either 'DROP' or 'PICKUP'.",
            status_code=422
        )

    response.headers["Location"] = f"/api/v1/requests/{detail.id}"
    return detail


@router.get("", response_model=Dict[str, Any])
async def list_requests(
    status: Optional[List[str]] = Query(None),
    type: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    items = await RequestService.get_requests(
        db, current_user, status_filter=status, type_filter=type,
        scope=scope, limit=limit, cursor=cursor
    )
    return {
        "items": items,
        "next_cursor": None
    }


@router.get("/{request_id}", response_model=RequestDetail)
async def get_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.get_request_detail(db, current_user, request_id)


@router.post("/{request_id}/cancel", response_model=RequestDetail)
async def cancel_request(
    request_id: str,
    payload: CancelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.cancel_request(
        db, current_user, request_id, payload.reason_code, payload.note
    )


@router.post("/{request_id}/confirm-received", response_model=RequestDetail)
async def confirm_received(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.confirm_received(db, current_user, request_id)


@router.post("/{request_id}/dispute", response_model=RequestDetail, status_code=201)
async def dispute_request(
    request_id: str,
    payload: DisputeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.dispute_request(
        db, current_user, request_id, payload.reason_code,
        payload.description, payload.evidence_media_ids
    )


@router.post("/{request_id}/rate", status_code=201)
async def rate_request(
    request_id: str,
    payload: RateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.rate_request(
        db, current_user, request_id, payload.stars, payload.comment
    )


@router.patch("/{request_id}/clean-date", response_model=RequestDetail)
async def update_clean_date(
    request_id: str,
    payload: CleanDateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.set_clean_date(
        db, current_user, request_id, payload.clean_date
    )


@router.post("/{request_id}/payment/retry", response_model=Dict[str, Any], status_code=201)
async def retry_payment(
    request_id: str,
    idempotency_key: str = Depends(require_idempotency_key),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    intent = await RequestService.retry_payment(db, current_user, request_id)
    return {"payment": intent}


@router.post("/{request_id}/payment/mock-complete", response_model=RequestDetail)
async def mock_complete_payment(
    request_id: str,
    payload: Optional[Dict[str, Any]] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    success = (payload or {}).get("status", "SUCCESS") == "SUCCESS"
    return await RequestService.mock_complete_payment(db, current_user, request_id, success=success)


@router.post("/{request_id}/mock-advance", response_model=RequestDetail)
async def mock_advance_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await RequestService.mock_advance_flow(db, current_user, request_id)


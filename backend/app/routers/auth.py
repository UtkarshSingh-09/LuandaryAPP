from typing import Optional
from fastapi import APIRouter, Depends, Request, Response, Cookie, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.api.deps import verify_csrf_header
from app.services.auth_service import AuthService
from app.schemas.common import (
    OtpRequest, OtpRequestResponse,
    OtpVerifyRequest, AuthTokenResponse,
    UserResponse, HostelBlockRef, PartnerInfo
)
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: User) -> UserResponse:
    block_ref = None
    if user.hostel_block:
        block_ref = HostelBlockRef(id=user.hostel_block.id, name=user.hostel_block.name)

    partner_info = None
    if user.partner_status != "NONE" and user.partner_profile:
        p = user.partner_profile
        partner_info = PartnerInfo(
            is_online=p.is_online,
            upi_id=p.upi_id,
            rejection_reason=p.rejection_reason,
            suspended_reason=p.suspended_reason,
            applied_at=p.applied_at,
            approved_at=p.approved_at
        )

    unread_count = len([n for n in (user.notifications or []) if n.read_at is None])

    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        phone_verified=False,
        registration_number=user.registration_number,
        hostel_block=block_ref,
        room=user.room,
        role=user.role,
        partner_status=user.partner_status,
        partner=partner_info,
        profile_complete=user.is_profile_complete,
        unread_notifications=unread_count,
        created_at=user.created_at
    )


@router.post("/otp/request", response_model=OtpRequestResponse, status_code=202)
async def request_otp(
    payload: OtpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "127.0.0.1")
    res = await AuthService.request_otp(db, payload.email, client_ip)
    return res


@router.post("/otp/verify", response_model=AuthTokenResponse)
async def verify_otp(
    payload: OtpVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "127.0.0.1")
    ua = request.headers.get("User-Agent")

    access_token, raw_refresh, is_new, user = await AuthService.verify_otp(
        db, payload.email, payload.otp, payload.device_name, client_ip, ua
    )

    # Set httpOnly cookie: cl_rt
    # Max-Age: 30 days = 2592000s
    response.set_cookie(
        key="cl_rt",
        value=raw_refresh,
        max_age=2592000,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/api/v1/auth"
    )

    # Load relationships for serialization
    q = select(User).options(
        selectinload(User.hostel_block),
        selectinload(User.partner_profile),
        selectinload(User.notifications)
    ).where(User.id == user.id)
    user_loaded = (await db.execute(q)).scalars().first()

    return AuthTokenResponse(
        access_token=access_token,
        token_type="Bearer",
        expires_in=settings.ACCESS_TOKEN_TTL_SECONDS,
        is_new_user=is_new,
        user=serialize_user(user_loaded or user)
    )


@router.post("/refresh", response_model=AuthTokenResponse, dependencies=[Depends(verify_csrf_header)])
async def refresh_session(
    request: Request,
    response: Response,
    cl_rt: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db)
):
    if not cl_rt:
        from app.core.errors import APIException
        raise APIException(
            code="REFRESH_TOKEN_INVALID",
            message="Missing refresh session cookie.",
            status_code=401
        )

    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "127.0.0.1")
    ua = request.headers.get("User-Agent")

    access_token, raw_new_refresh, user = await AuthService.refresh_session(
        db, cl_rt, client_ip, ua
    )

    response.set_cookie(
        key="cl_rt",
        value=raw_new_refresh,
        max_age=2592000,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/api/v1/auth"
    )

    q = select(User).options(
        selectinload(User.hostel_block),
        selectinload(User.partner_profile),
        selectinload(User.notifications)
    ).where(User.id == user.id)
    user_loaded = (await db.execute(q)).scalars().first()

    return AuthTokenResponse(
        access_token=access_token,
        token_type="Bearer",
        expires_in=settings.ACCESS_TOKEN_TTL_SECONDS,
        is_new_user=False,
        user=serialize_user(user_loaded or user)
    )


@router.post("/logout", status_code=204, dependencies=[Depends(verify_csrf_header)])
async def logout(
    response: Response,
    cl_rt: Optional[str] = Cookie(None),
    all_devices: bool = False,
    db: AsyncSession = Depends(get_db)
):
    if cl_rt:
        await AuthService.logout(db, cl_rt, all_devices=all_devices)

    response.delete_cookie(
        key="cl_rt",
        path="/api/v1/auth",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax"
    )
    return None

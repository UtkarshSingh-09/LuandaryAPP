import re
from typing import Optional
from fastapi import Header, Request, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import jwt

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import APIException
from app.core.security import decode_access_token
from app.models import User


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise APIException(
            code="UNAUTHENTICATED",
            message="Missing or invalid Authorization header.",
            status_code=401
        )

    token = authorization.split(" ")[1]
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise APIException(
            code="TOKEN_EXPIRED",
            message="Access token expired. Please refresh your session.",
            status_code=401
        )
    except Exception:
        raise APIException(
            code="TOKEN_INVALID",
            message="Invalid authentication credentials.",
            status_code=401
        )

    user_id = payload.get("sub")
    if not user_id:
        raise APIException(code="TOKEN_INVALID", message="Malformed token subject.", status_code=401)

    q = select(User).where(User.id == user_id)
    res = await db.execute(q)
    user = res.scalars().first()

    if not user:
        raise APIException(code="NOT_FOUND", message="User not found.", status_code=404)

    if not user.is_active:
        raise APIException(code="ACCOUNT_DISABLED", message="Account is deactivated.", status_code=403)

    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
    authorization: Optional[str] = Header(None)
) -> User:
    if user.role != "admin":
        raise APIException(code="FORBIDDEN", message="Admin privilege required.", status_code=403)
    
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if payload.get("kind") != "admin" or "totp" not in payload.get("amr", []):
        raise APIException(code="ADMIN_MFA_REQUIRED", message="Admin MFA TOTP required.", status_code=403)

    return user


def verify_csrf_header(
    x_cl_csrf: Optional[str] = Header(None, alias="X-CL-CSRF")
) -> None:
    if x_cl_csrf != "1":
        raise APIException(
            code="FORBIDDEN",
            message="Missing or invalid CSRF protection header (X-CL-CSRF: 1 required).",
            status_code=403
        )


def require_idempotency_key(
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")
) -> str:
    if not idempotency_key:
        raise APIException(
            code="IDEMPOTENCY_KEY_REQUIRED",
            message="Idempotency-Key header is required for this operation.",
            status_code=400
        )
    if not re.match(r"^[A-Za-z0-9_-]{8,64}$", idempotency_key):
        raise APIException(
            code="VALIDATION_ERROR",
            message="Idempotency-Key must be 8-64 alphanumeric characters, underscores, or dashes.",
            status_code=422
        )
    return idempotency_key

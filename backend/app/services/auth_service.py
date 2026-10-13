import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import APIException
from app.core.security import (
    generate_otp, hash_otp, verify_otp_hash,
    generate_refresh_token, hash_refresh_token,
    create_access_token, decode_access_token,
    hash_password, verify_password
)
from app.models import User, PartnerProfile, OtpCode, RefreshToken, AuditLog


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class AuthService:
    @staticmethod
    async def request_otp(db: AsyncSession, email: str, ip: Optional[str] = None) -> Dict[str, Any]:
        email_clean = email.lower().strip()
        domain = email_clean.split("@")[-1] if "@" in email_clean else ""

        if domain not in settings.ALLOWED_EMAIL_DOMAINS and "*" not in settings.ALLOWED_EMAIL_DOMAINS:
            raise APIException(
                code="EMAIL_DOMAIN_NOT_ALLOWED",
                message=f"Email domain @{domain} is not allowed. Use your college email.",
                status_code=422,
                details={"allowed_domains": settings.ALLOWED_EMAIL_DOMAINS}
            )

        # Invalidate earlier active OTPs for this email
        q_earlier = select(OtpCode).where(
            and_(
                OtpCode.email == email_clean,
                OtpCode.consumed_at.is_(None),
                OtpCode.expires_at > utc_now()
            )
        )
        res_earlier = await db.execute(q_earlier)
        earlier_codes = res_earlier.scalars().all()
        for code_row in earlier_codes:
            code_row.consumed_at = utc_now()

        # Generate new 6-digit OTP
        raw_otp = generate_otp()
        hashed = hash_otp(email_clean, raw_otp)
        expires_at = utc_now() + timedelta(minutes=10)

        otp_record = OtpCode(
            email=email_clean,
            code_hash=hashed,
            purpose="LOGIN",
            attempts=0,
            max_attempts=5,
            expires_at=expires_at,
            request_ip=ip
        )
        db.add(otp_record)
        await db.commit()

        # In development / mock mode, log OTP to console for easy testing
        print(f"\n[CAMPUSLAUNDRY DEV AUTH] >>> Generated OTP for {email_clean}: {raw_otp} <<<\n")

        return {
            "sent": True,
            "resend_after_seconds": 60,
            "expires_in_seconds": 600
        }

    @staticmethod
    async def verify_otp(
        db: AsyncSession,
        email: str,
        otp: str,
        device_name: Optional[str] = None,
        ip: Optional[str] = None,
        ua: Optional[str] = None
    ) -> Tuple[str, str, bool, User]:
        email_clean = email.lower().strip()

        # Find live unconsumed OTP
        q = select(OtpCode).where(
            and_(
                OtpCode.email == email_clean,
                OtpCode.consumed_at.is_(None)
            )
        ).order_by(OtpCode.created_at.desc())
        res = await db.execute(q)
        otp_row = res.scalars().first()

        if not otp_row:
            raise APIException(
                code="OTP_EXPIRED",
                message="No live OTP found. Please request a new one.",
                status_code=400
            )

        if ensure_utc(otp_row.expires_at) < utc_now():
            otp_row.consumed_at = utc_now()
            await db.commit()
            raise APIException(
                code="OTP_EXPIRED",
                message="Code expired. Send a new one.",
                status_code=400
            )

        if otp_row.attempts >= otp_row.max_attempts:
            otp_row.consumed_at = utc_now()
            await db.commit()
            raise APIException(
                code="OTP_ATTEMPTS_EXCEEDED",
                message="Maximum wrong attempts exceeded. Please request a new code.",
                status_code=429
            )

        # Verify hash (in dev mode, allow standard sandbox OTPs for smooth testing)
        dev_match = settings.APP_ENV == "dev" and otp in ("123456", "482913")
        if not (dev_match or verify_otp_hash(email_clean, otp, otp_row.code_hash)):
            otp_row.attempts += 1
            attempts_left = otp_row.max_attempts - otp_row.attempts
            await db.commit()
            if attempts_left <= 0:
                raise APIException(
                    code="OTP_ATTEMPTS_EXCEEDED",
                    message="5 wrong tries; code burned. Request a new one.",
                    status_code=429
                )
            raise APIException(
                code="OTP_INVALID",
                message="Wrong verification code.",
                status_code=400,
                details={"attempts_left": attempts_left}
            )

        # Burn OTP atomically
        otp_row.consumed_at = utc_now()

        # Find or create user
        q_user = select(User).where(User.email == email_clean)
        res_user = await db.execute(q_user)
        user = res_user.scalars().first()
        is_new = False

        if not user:
            is_new = True
            user = User(
                email=email_clean,
                email_verified_at=utc_now(),
                role="student",
                partner_status="NONE",
                is_active=True
            )
            db.add(user)
            await db.flush()
        else:
            if not user.is_active:
                raise APIException(
                    code="ACCOUNT_DISABLED",
                    message="Your account has been deactivated. Contact campus support.",
                    status_code=403
                )
            user.last_login_at = utc_now()

        # Issue refresh token row with new family_id
        family_id = secrets.token_hex(16)
        raw_refresh, token_hash = generate_refresh_token()
        refresh_expires = utc_now() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS)

        refresh_row = RefreshToken(
            user_id=user.id,
            family_id=family_id,
            token_hash=token_hash,
            expires_at=refresh_expires,
            user_agent=ua or device_name,
            ip=ip
        )
        db.add(refresh_row)
        await db.commit()
        await db.refresh(user)

        # Issue access JWT
        access_token = create_access_token(
            user_id=user.id,
            role=user.role,
            kind="user",
            amr=["otp"],
            sid=family_id
        )

        return access_token, raw_refresh, is_new, user

    @staticmethod
    async def refresh_session(
        db: AsyncSession,
        raw_cookie_token: str,
        ip: Optional[str] = None,
        ua: Optional[str] = None
    ) -> Tuple[str, str, User]:
        token_hash = hash_refresh_token(raw_cookie_token)
        q = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        res = await db.execute(q)
        row = res.scalars().first()

        if not row:
            raise APIException(
                code="REFRESH_TOKEN_INVALID",
                message="Invalid or missing session cookie.",
                status_code=401
            )

        if row.revoked_at:
            raise APIException(
                code="REFRESH_TOKEN_INVALID",
                message="Session was revoked.",
                status_code=401
            )

        if row.used_at:
            # Token reuse detection outside grace window
            # Revoke entire family
            q_fam = select(RefreshToken).where(RefreshToken.family_id == row.family_id)
            res_fam = await db.execute(q_fam)
            for r in res_fam.scalars().all():
                r.revoked_at = utc_now()
                r.revoked_reason = "REUSE_DETECTED"
            await db.commit()
            raise APIException(
                code="REFRESH_TOKEN_REUSED",
                message="Suspicious session activity detected. Please log in again.",
                status_code=401
            )

        if ensure_utc(row.expires_at) < utc_now():
            raise APIException(
                code="REFRESH_TOKEN_INVALID",
                message="Session expired. Please log in again.",
                status_code=401
            )

        # Fetch user
        q_u = select(User).where(User.id == row.user_id)
        res_u = await db.execute(q_u)
        user = res_u.scalars().first()
        if not user or not user.is_active:
            raise APIException(
                code="ACCOUNT_DISABLED",
                message="Account disabled.",
                status_code=403
            )

        # Rotate token
        raw_new_refresh, new_token_hash = generate_refresh_token()
        new_row = RefreshToken(
            user_id=user.id,
            family_id=row.family_id,
            token_hash=new_token_hash,
            expires_at=utc_now() + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
            user_agent=ua,
            ip=ip
        )
        db.add(new_row)
        await db.flush()

        row.used_at = utc_now()
        row.replaced_by = new_row.id
        await db.commit()

        access_token = create_access_token(
            user_id=user.id,
            role=user.role,
            kind="user" if user.role != "admin" else "admin",
            amr=["otp"],
            sid=row.family_id
        )

        return access_token, raw_new_refresh, user

    @staticmethod
    async def logout(
        db: AsyncSession,
        raw_cookie_token: Optional[str],
        all_devices: bool = False
    ) -> None:
        if not raw_cookie_token:
            return

        token_hash = hash_refresh_token(raw_cookie_token)
        q = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        res = await db.execute(q)
        row = res.scalars().first()
        if not row:
            return

        if all_devices:
            q_all = select(RefreshToken).where(RefreshToken.user_id == row.user_id)
            res_all = await db.execute(q_all)
            for r in res_all.scalars().all():
                r.revoked_at = utc_now()
                r.revoked_reason = "LOGOUT_ALL"
        else:
            q_fam = select(RefreshToken).where(RefreshToken.family_id == row.family_id)
            res_fam = await db.execute(q_fam)
            for r in res_fam.scalars().all():
                r.revoked_at = utc_now()
                r.revoked_reason = "LOGOUT"

        await db.commit()

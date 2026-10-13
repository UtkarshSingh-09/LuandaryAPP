import hmac
import hashlib
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional, List, Tuple
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet

from app.core.config import settings

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, Exception):
        return False


def create_access_token(
    user_id: str,
    role: str,
    kind: str = "user",
    amr: Optional[List[str]] = None,
    sid: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + (expires_delta or timedelta(seconds=settings.ACCESS_TOKEN_TTL_SECONDS))
    claims: Dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "kind": kind,
        "amr": amr or (["totp", "pwd"] if kind == "admin" else ["otp"]),
        "sid": sid or secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(claims, settings.JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])


def generate_refresh_token() -> Tuple[str, str]:
    """Generates an opaque 256-bit refresh token and its SHA-256 hash."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return raw_token, token_hash


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_otp() -> str:
    """Generates a 6-digit OTP."""
    return f"{secrets.randbelow(900000) + 100000:06d}"


def hash_otp(email: str, otp: str) -> str:
    """HMAC-SHA256 with OTP_PEPPER over email || ':' || otp."""
    msg = f"{email.lower().strip()}:{otp}".encode("utf-8")
    return hmac.new(settings.OTP_PEPPER.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def verify_otp_hash(email: str, otp: str, stored_hash: str) -> bool:
    computed = hash_otp(email, otp)
    return hmac.compare_digest(computed, stored_hash)


def generate_handoff_code() -> str:
    """Generates a 4-digit handoff code."""
    return f"{secrets.randbelow(9000) + 1000:04d}"


def hash_handoff_code(request_id: str, kind: str, code: str) -> str:
    """HMAC-SHA256(CODE_PEPPER, request_id || ':' || kind || ':' || code)."""
    msg = f"{request_id}:{kind}:{code}".encode("utf-8")
    return hmac.new(settings.CODE_PEPPER.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def verify_handoff_code(request_id: str, kind: str, code: str, stored_hash: str) -> bool:
    computed = hash_handoff_code(request_id, kind, code)
    return hmac.compare_digest(computed, stored_hash)


_fernet: Optional[Fernet] = None

def get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.CODE_ENC_KEY.encode("utf-8"))
    return _fernet


def encrypt_handoff_code(code: str) -> str:
    return get_fernet().encrypt(code.encode("utf-8")).decode("utf-8")


def decrypt_handoff_code(encrypted_code: str) -> str:
    try:
        return get_fernet().decrypt(encrypted_code.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""

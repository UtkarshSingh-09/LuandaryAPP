import os
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../infra/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "dev"
    DOMAIN: str = "localhost"
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./campuslaundry.db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: Optional[str] = None

    # Security
    JWT_SECRET: str = "super_secret_jwt_key_at_least_48_bytes_long_random_dev_only_key_123456789"
    ACCESS_TOKEN_TTL_SECONDS: int = 900  # 15 minutes
    REFRESH_TOKEN_TTL_DAYS: int = 30
    ADMIN_SESSION_HOURS: int = 12
    COOKIE_DOMAIN: Optional[str] = None
    COOKIE_SECURE: bool = False
    
    # Cryptographic Peppers & Encryption Keys
    OTP_PEPPER: str = "dev_otp_pepper_secret_key_at_least_32_bytes_long"
    CODE_PEPPER: str = "dev_code_pepper_secret_key_at_least_32_bytes"
    CODE_ENC_KEY: str = "7VzZ9H8k_a3xR1_sQ6vT2nK5lM8pY0wX4uC9bE2rF1A="  # Valid 32-byte url-safe base64 Fernet key

    # Allowed domains for student registration
    ALLOWED_EMAIL_DOMAINS: List[str] = Field(default_factory=lambda: ["srmap.edu.in", "campuslaundry.example", "localhost"])

    # Business Rules Defaults
    SERVICE_ENABLED: bool = True
    MAINTENANCE_MESSAGE: Optional[str] = None
    MAX_OPEN_REQUESTS_PER_STUDENT: int = 3
    MAX_ACTIVE_JOBS_PER_PARTNER: int = 3
    MAX_ACTIVE_EXPRESS_PER_PARTNER: int = 1
    MAX_CLOTHES_PER_BAG: int = 60
    MAX_UPLOAD_BYTES: int = 10485760  # 10 MB
    CLEAN_DATE_MAX_DAYS_AHEAD: int = 14
    MIN_PAYOUT_PAISE: int = 10000  # Rs 100
    PAYMENT_WINDOW_MINUTES: int = 15
    DISPUTE_WINDOW_HOURS: int = 24
    STUDENT_FREE_CANCEL_SECONDS: int = 120
    STUDENT_CANCEL_FEE_PERCENT: int = 20
    NOSHOW_FEE_PERCENT: int = 40
    CANCEL_FEE_PARTNER_SHARE_PERCENT: int = 50
    PARTNER_FREE_WITHDRAW_MINUTES: int = 5
    REOPEN_ACCEPTANCE_MINUTES: int = 15
    EARNINGS_HOLD_MINUTES: int = 120
    CODE_MAX_ATTEMPTS: int = 5
    CODE_ATTEMPT_COOLDOWN_SECONDS: int = 30
    PARTNER_TERMS_VERSION: str = "2026-10-01"
    VAPID_PUBLIC_KEY: str = "BEl62iUYgUivxIkv69yViEuiBIa-k7B2mF0o8G1h9J2k3L4m5N6o7P8q9R0s1T2u3V4w5X6y7Z8a9B0c1D2e3F4="

    # Payments
    PAYMENT_PROVIDER: str = "mock"  # mock | phonepe | paytm
    WEBHOOK_BASE_URL: str = "http://localhost:8000/api/v1/webhooks"


settings = Settings()

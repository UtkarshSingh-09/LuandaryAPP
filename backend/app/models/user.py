from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, BigInteger, SmallInteger,
    DateTime, ForeignKey, Text, JSON, Numeric
)
from sqlalchemy.orm import relationship

from app.core.database import Base, uuid7_str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    email = Column(String(255), unique=True, index=True, nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    name = Column(String(60), nullable=True)
    phone = Column(String(20), nullable=True)
    registration_number = Column(String(30), nullable=True)
    hostel_block_id = Column(String(36), ForeignKey("hostel_blocks.id"), nullable=True)
    room = Column(String(20), nullable=True)
    role = Column(String(20), default="student", nullable=False)  # student | partner | admin
    partner_status = Column(String(20), default="NONE", nullable=False)  # NONE | PENDING | APPROVED | SUSPENDED
    password_hash = Column(String(255), nullable=True)
    totp_secret_enc = Column(Text, nullable=True)
    totp_enabled_at = Column(DateTime(timezone=True), nullable=True)
    failed_login_count = Column(SmallInteger, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    onboarded_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    anonymized_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    hostel_block = relationship("HostelBlock", back_populates="users")
    partner_profile = relationship("PartnerProfile", uselist=False, back_populates="user", foreign_keys="PartnerProfile.user_id")
    created_requests = relationship("Request", foreign_keys="Request.student_id", back_populates="student")
    partner_jobs = relationship("Request", foreign_keys="Request.partner_id", back_populates="partner")
    notifications = relationship("Notification", back_populates="user")
    push_subscriptions = relationship("PushSubscription", back_populates="user")
    refresh_tokens = relationship("RefreshToken", back_populates="user")

    @property
    def is_profile_complete(self) -> bool:
        return bool(self.name and self.phone and self.registration_number and self.hostel_block_id and self.room)


class PartnerProfile(Base):
    __tablename__ = "partner_profiles"

    user_id = Column(String(36), ForeignKey("users.id"), primary_key=True)
    college_id_media_id = Column(String(36), nullable=True)
    upi_id = Column(String(100), nullable=True)
    is_online = Column(Boolean, default=False, nullable=False)
    online_since = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    active_jobs_count = Column(Integer, default=0, nullable=False)
    completed_jobs_count = Column(Integer, default=0, nullable=False)
    cancelled_jobs_count = Column(Integer, default=0, nullable=False)
    withdrawn_jobs_count = Column(Integer, default=0, nullable=False)
    rating_sum = Column(Integer, default=0, nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)

    @property
    def rating_avg(self) -> Optional[float]:
        if not self.rating_count or self.rating_count == 0:
            return None
        return round(self.rating_sum / self.rating_count, 2)

    strikes = Column(SmallInteger, default=0, nullable=False)
    pending_balance_paise = Column(BigInteger, default=0, nullable=False)
    available_balance_paise = Column(BigInteger, default=0, nullable=False)
    lifetime_earned_paise = Column(BigInteger, default=0, nullable=False)
    lifetime_paid_out_paise = Column(BigInteger, default=0, nullable=False)
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    applied_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    suspended_at = Column(DateTime(timezone=True), nullable=True)
    suspended_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="partner_profile", foreign_keys=[user_id])


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    family_id = Column(String(36), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    issued_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by = Column(String(36), ForeignKey("refresh_tokens.id"), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_reason = Column(String(64), nullable=True)
    user_agent = Column(String(255), nullable=True)
    ip = Column(String(45), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    email = Column(String(255), index=True, nullable=False)
    code_hash = Column(String(64), nullable=False)
    purpose = Column(String(20), default="LOGIN", nullable=False)
    attempts = Column(SmallInteger, default=0, nullable=False)
    max_attempts = Column(SmallInteger, default=5, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    request_ip = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(120), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(JSON, default=dict, nullable=False)
    dedupe_key = Column(String(100), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    push_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    user = relationship("User", back_populates="notifications")


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(String(1024), unique=True, nullable=False)
    p256dh = Column(String(100), nullable=False)
    auth = Column(String(50), nullable=False)
    user_agent = Column(String(255), nullable=True)
    platform = Column(String(20), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    failure_count = Column(SmallInteger, default=0, nullable=False)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    last_failure_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="push_subscriptions")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    actor_role = Column(String(20), nullable=False)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(100), nullable=True)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    ip = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    correlation_id = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

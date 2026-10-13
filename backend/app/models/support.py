from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, SmallInteger,
    DateTime, ForeignKey, Text, JSON, PrimaryKeyConstraint
)

from app.core.database import Base, uuid7_str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    topic = Column(String(100), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    aggregate_type = Column(String(50), nullable=True)
    aggregate_id = Column(String(36), nullable=True)
    payload = Column(JSON, nullable=False)
    attempts = Column(SmallInteger, default=0, nullable=False)
    next_attempt_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"

    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    scope = Column(String(100), nullable=False)
    key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    status = Column(String(20), default="IN_PROGRESS", nullable=False)
    response_status = Column(SmallInteger, nullable=True)
    response_body = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint("user_id", "scope", "key"),
    )


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    provider = Column(String(20), nullable=False)
    dedupe_key = Column(String(128), unique=True, nullable=False)
    signature_ok = Column(Boolean, nullable=False)
    headers = Column(JSON, default=dict, nullable=False)
    payload = Column(JSON, default=dict, nullable=False)
    received_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    process_error = Column(Text, nullable=True)

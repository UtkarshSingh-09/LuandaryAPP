from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, BigInteger, SmallInteger,
    DateTime, ForeignKey, Text, JSON
)
from sqlalchemy.orm import relationship

from app.core.database import Base, uuid7_str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    provider = Column(String(20), nullable=False)  # PHONEPE | PAYTM
    attempt_no = Column(SmallInteger, default=1, nullable=False)
    merchant_order_id = Column(String(64), unique=True, index=True, nullable=False)
    gateway_txn_id = Column(String(100), nullable=True)
    status = Column(String(20), default="CREATED", nullable=False)
    amount_paise = Column(BigInteger, nullable=False)
    currency = Column(String(3), default="INR", nullable=False)
    utr = Column(String(32), nullable=True)
    payer_vpa_masked = Column(String(64), nullable=True)
    gateway_fee_paise = Column(BigInteger, nullable=True)
    checkout_ref = Column(Text, nullable=True)  # redirect URL or token
    expires_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    failure_code = Column(String(50), nullable=True)
    failure_message = Column(Text, nullable=True)
    last_reconciled_at = Column(DateTime(timezone=True), nullable=True)
    reconcile_attempts = Column(SmallInteger, default=0, nullable=False)
    raw_last_response = Column(JSON, nullable=True)
    idempotency_key = Column(String(128), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    request = relationship("Request", back_populates="payments")
    refunds = relationship("Refund", back_populates="payment")


class Refund(Base):
    __tablename__ = "refunds"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    payment_id = Column(String(36), ForeignKey("payments.id"), nullable=False, index=True)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=False, index=True)
    amount_paise = Column(BigInteger, nullable=False)
    reason = Column(String(50), nullable=False)
    status = Column(String(20), default="PENDING", nullable=False)
    merchant_refund_id = Column(String(64), unique=True, nullable=False)
    gateway_refund_id = Column(String(100), nullable=True)
    initiated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    admin_note = Column(Text, nullable=True)
    failure_message = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    last_polled_at = Column(DateTime(timezone=True), nullable=True)
    poll_attempts = Column(SmallInteger, default=0, nullable=False)
    raw_last_response = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    payment = relationship("Payment", back_populates="refunds")
    request = relationship("Request", back_populates="refunds")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    partner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    entry_type = Column(String(32), nullable=False)
    pending_delta_paise = Column(BigInteger, default=0, nullable=False)
    available_delta_paise = Column(BigInteger, default=0, nullable=False)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=True, index=True)
    payout_request_id = Column(String(36), ForeignKey("payout_requests.id"), nullable=True, index=True)
    dispute_id = Column(String(36), ForeignKey("disputes.id"), nullable=True)
    reason = Column(Text, nullable=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    idempotency_key = Column(String(128), unique=True, nullable=False)
    metadata_ = Column("metadata", JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class PayoutRequest(Base):
    __tablename__ = "payout_requests"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    partner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    amount_paise = Column(BigInteger, nullable=False)
    upi_id = Column(String(100), nullable=False)
    status = Column(String(20), default="REQUESTED", nullable=False)
    partner_note = Column(Text, nullable=True)
    utr = Column(String(32), nullable=True)
    admin_note = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    processed_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

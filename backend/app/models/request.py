from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, BigInteger, SmallInteger,
    DateTime, ForeignKey, Text, JSON, Date
)
from sqlalchemy.orm import relationship

from app.core.database import Base, uuid7_str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Request(Base):
    __tablename__ = "requests"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    ref = Column(String(32), unique=True, index=True, nullable=False)
    type = Column(String(10), nullable=False)  # DROP | PICKUP
    status = Column(String(20), default="PAYMENT_PENDING", nullable=False, index=True)
    student_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    partner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    tier_code = Column(String(32), ForeignKey("service_tiers.code"), nullable=False)
    hostel_block_id = Column(String(36), ForeignKey("hostel_blocks.id"), nullable=False)
    room = Column(String(20), nullable=False)
    laundry_location_id = Column(String(36), ForeignKey("laundry_locations.id"), nullable=False)

    # Snapshots from tier
    price_paise = Column(BigInteger, nullable=False)
    partner_payout_paise = Column(BigInteger, nullable=False)
    gateway_fee_paise = Column(BigInteger, nullable=True)
    window_max_minutes = Column(Integer, nullable=False)

    # Content
    total_item_count = Column(Integer, nullable=True)  # DROP only
    note = Column(String(500), nullable=True)
    rack_number = Column(String(32), nullable=True)  # PICKUP given by student, DROP entered on complete
    clean_date = Column(Date, nullable=True)
    clean_date_set_at = Column(DateTime(timezone=True), nullable=True)
    clean_date_reminded_at = Column(DateTime(timezone=True), nullable=True)

    # Handoff codes
    origin_code_hash = Column(String(64), nullable=True)
    origin_code_enc = Column(Text, nullable=True)
    destination_code_hash = Column(String(64), nullable=True)
    destination_code_enc = Column(Text, nullable=True)
    code_attempts = Column(SmallInteger, default=0, nullable=False)
    code_locked_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps & deadlines
    can_pay_until = Column(DateTime(timezone=True), nullable=True)
    opened_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # acceptance deadline
    due_by = Column(DateTime(timezone=True), nullable=True)      # promise to student
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    picked_up_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    expired_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_by_role = Column(String(20), nullable=True)
    cancel_reason = Column(String(255), nullable=True)

    # Earnings hold & confirmation
    earnings_release_at = Column(DateTime(timezone=True), nullable=True)
    earnings_released_at = Column(DateTime(timezone=True), nullable=True)
    received_confirmed_at = Column(DateTime(timezone=True), nullable=True)

    # Rating
    rating = Column(SmallInteger, nullable=True)
    rating_comment = Column(String(500), nullable=True)
    rated_at = Column(DateTime(timezone=True), nullable=True)

    # Workers
    partner_reminded_at = Column(DateTime(timezone=True), nullable=True)
    stuck_alerted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    student = relationship("User", foreign_keys=[student_id], back_populates="created_requests")
    partner = relationship("User", foreign_keys=[partner_id], back_populates="partner_jobs")
    tier = relationship("ServiceTier", back_populates="requests")
    hostel_block = relationship("HostelBlock", back_populates="requests")
    laundry_location = relationship("LaundryLocation", back_populates="requests")
    items = relationship("RequestItem", back_populates="request", cascade="all, delete-orphan")
    events = relationship("RequestEvent", back_populates="request", cascade="all, delete-orphan")
    media = relationship("RequestMedia", back_populates="request")
    payments = relationship("Payment", back_populates="request")
    refunds = relationship("Refund", back_populates="request")
    disputes = relationship("Dispute", back_populates="request")


class RequestItem(Base):
    __tablename__ = "request_items"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    request_id = Column(String(36), ForeignKey("requests.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(32), nullable=False)
    quantity = Column(SmallInteger, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    request = relationship("Request", back_populates="items")


class RequestEvent(Base):
    __tablename__ = "request_events"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    from_status = Column(String(20), nullable=True)
    to_status = Column(String(20), nullable=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    actor_role = Column(String(20), nullable=False)
    metadata_ = Column("metadata", JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    request = relationship("Request", back_populates="events")


class RequestMedia(Base):
    __tablename__ = "request_media"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=True, index=True)
    uploader_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(32), nullable=False)  # BAG_PHOTO, READY_SCREENSHOT, etc.
    status = Column(String(20), default="PENDING", nullable=False)  # PENDING, READY, REJECTED, PURGED
    object_key = Column(String(255), unique=True, nullable=False)
    content_type = Column(String(50), nullable=False)
    size_bytes = Column(Integer, nullable=True)
    sha256 = Column(String(64), nullable=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    rejected_reason = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=True)
    purge_after = Column(DateTime(timezone=True), nullable=True)
    purged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    request = relationship("Request", back_populates="media")


class Dispute(Base):
    __tablename__ = "disputes"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    request_id = Column(String(36), ForeignKey("requests.id"), nullable=False, index=True)
    raised_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    raised_by_role = Column(String(20), nullable=False)
    reason_code = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    previous_status = Column(String(20), nullable=False)
    status = Column(String(20), default="OPEN", nullable=False)
    resolution = Column(String(50), nullable=True)
    resolution_status = Column(String(20), nullable=True)
    refund_amount_paise = Column(BigInteger, nullable=True)
    partner_penalty_paise = Column(BigInteger, nullable=True)
    resolution_note = Column(Text, nullable=True)
    resolved_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    request = relationship("Request", back_populates="disputes")

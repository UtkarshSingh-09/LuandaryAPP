from datetime import datetime, timezone
import uuid
from sqlalchemy import (
    Column, String, Boolean, Integer, BigInteger, SmallInteger,
    DateTime, ForeignKey, Text, JSON, Numeric, Date, Sequence
)
from sqlalchemy.orm import relationship

from app.core.database import Base, uuid7_str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class HostelBlock(Base):
    __tablename__ = "hostel_blocks"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    delivery_hint = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    users = relationship("User", back_populates="hostel_block")
    requests = relationship("Request", back_populates="hostel_block")


class LaundryLocation(Base):
    __tablename__ = "laundry_locations"

    id = Column(String(36), primary_key=True, default=uuid7_str)
    name = Column(String(120), nullable=False)
    landmark = Column(String(200), nullable=True)
    opening_hours = Column(JSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    requests = relationship("Request", back_populates="laundry_location")


class ServiceTier(Base):
    __tablename__ = "service_tiers"

    code = Column(String(32), primary_key=True)  # STANDARD, FAST, EXPRESS
    label = Column(String(50), nullable=False)
    price_paise = Column(BigInteger, nullable=False)
    partner_payout_paise = Column(BigInteger, nullable=False)
    window_min_minutes = Column(Integer, default=0, nullable=False)
    window_max_minutes = Column(Integer, nullable=False)
    acceptance_timeout_minutes = Column(Integer, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    requests = relationship("Request", back_populates="tier")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(64), primary_key=True)
    value = Column(JSON, nullable=False)
    description = Column(Text, nullable=True)
    is_public = Column(Boolean, default=False, nullable=False)
    updated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

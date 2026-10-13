from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, EmailStr, model_validator


class HostelBlockRef(BaseModel):
    id: str
    name: str


class PartnerInfo(BaseModel):
    is_online: bool
    upi_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    suspended_reason: Optional[str] = None
    applied_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None
    phone_verified: bool = False
    registration_number: Optional[str] = None
    hostel_block: Optional[HostelBlockRef] = None
    room: Optional[str] = None
    role: str  # student | partner | admin
    partner_status: str  # NONE | PENDING | APPROVED | SUSPENDED
    partner: Optional[PartnerInfo] = None
    profile_complete: bool
    unread_notifications: int = 0
    created_at: datetime


class UserPatchRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=60)
    phone: Optional[str] = Field(None, pattern=r"^(\+91)?[6-9]\d{9}$")
    registration_number: Optional[str] = Field(None, min_length=4, max_length=20)
    hostel_block_id: Optional[str] = None
    room: Optional[str] = Field(None, min_length=1, max_length=12)
    partner_upi_id: Optional[str] = None


class PartnerApplyRequest(BaseModel):
    id_photo_media_id: str
    upi_id: str = Field(..., pattern=r"^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$")
    accepted_terms: bool
    terms_version: str


# Auth
class OtpRequest(BaseModel):
    email: EmailStr


class OtpRequestResponse(BaseModel):
    sent: bool = True
    resend_after_seconds: int = 60
    expires_in_seconds: int = 600


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., pattern=r"^[0-9]{6}$")
    device_name: Optional[str] = Field(None, max_length=80)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 900
    is_new_user: bool
    user: UserResponse


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)


class AdminLoginResponse(BaseModel):
    mfa_token: str
    mfa_expires_in: int = 300


class AdminTotpRequest(BaseModel):
    mfa_token: str
    code: str = Field(..., pattern=r"^[0-9]{6}$")


class AdminTotpResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 900
    admin: Dict[str, str]


# Request models
class RequestItemCreate(BaseModel):
    category: str
    quantity: int = Field(..., ge=1, le=60)


class CreateDropRequest(BaseModel):
    type: Literal["DROP"] = "DROP"
    tier_code: str
    hostel_block_id: str
    room: str = Field(..., min_length=1, max_length=12)
    laundry_location_id: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    laundry_screenshot_media_id: Optional[str] = None
    laundry_screenshot_url: Optional[str] = None
    items: Optional[List[RequestItemCreate]] = Field(default_factory=list)
    total_count: Optional[int] = 1
    bag_photo_media_id: Optional[str] = None
    note: Optional[str] = Field(None, max_length=300)
    clean_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_drop(self):
        if self.items and len(self.items) > 0:
            sum_items = sum(item.quantity for item in self.items)
            if self.total_count is not None and sum_items != self.total_count:
                raise ValueError(f"total_count ({self.total_count}) must equal sum of items ({sum_items})")
            categories = [item.category for item in self.items]
            if len(categories) != len(set(categories)):
                raise ValueError("Duplicate item categories are not allowed")
        else:
            self.total_count = self.total_count or 1
        return self


class CreatePickupRequest(BaseModel):
    type: Literal["PICKUP"] = "PICKUP"
    tier_code: str
    hostel_block_id: str
    room: str = Field(..., min_length=1, max_length=12)
    laundry_location_id: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    rack_number: Optional[str] = Field("SEE SCREENSHOT", max_length=32)
    ready_screenshot_media_id: Optional[str] = None
    laundry_screenshot_media_id: Optional[str] = None
    laundry_screenshot_url: Optional[str] = None
    note: Optional[str] = Field(None, max_length=300)


class MediaRef(BaseModel):
    id: str
    kind: str
    content_type: str
    url: str
    url_expires_at: datetime


class PaymentIntent(BaseModel):
    id: str
    status: str
    provider: str
    amount_paise: int
    redirect_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    attempt_no: int


class HandoffCode(BaseModel):
    purpose: Literal["ORIGIN", "DESTINATION"]
    value: str
    attempts_left: int = 5
    locked: bool = False


class PartnerContact(BaseModel):
    first_name: str
    phone: str


class TimelineEvent(BaseModel):
    status: str
    at: datetime
    label: str


class TierInfo(BaseModel):
    code: str
    label: str
    window_label: str


class LocationRef(BaseModel):
    id: str
    name: str
    landmark: Optional[str] = None


class DisputeSummary(BaseModel):
    id: str
    status: str
    reason_code: str
    opened_at: datetime
    resolution: Optional[str] = None


class RefundSummary(BaseModel):
    status: str
    amount_paise: int
    requested_at: datetime


class RatingSummary(BaseModel):
    stars: int
    comment: Optional[str] = None


class RequestSummary(BaseModel):
    id: str
    ref: str
    type: str
    status: str
    tier_code: str
    price_paise: int
    hostel_block: HostelBlockRef
    room: str
    rack_number: Optional[str] = None
    total_count: Optional[int] = None
    created_at: datetime
    opened_at: Optional[datetime] = None
    due_by: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    can_pay_until: Optional[datetime] = None


class RequestDetail(RequestSummary):
    tier: TierInfo
    laundry_location: LocationRef
    items: List[RequestItemCreate] = []
    note: Optional[str] = None
    clean_date: Optional[date] = None
    media: List[MediaRef] = []
    payment: Optional[PaymentIntent] = None
    handoff_code: Optional[HandoffCode] = None
    partner: Optional[PartnerContact] = None
    timeline: List[TimelineEvent] = []
    accept_by: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    confirmed_received_at: Optional[datetime] = None
    rating: Optional[RatingSummary] = None
    dispute: Optional[DisputeSummary] = None
    refund: Optional[RefundSummary] = None
    allowed_actions: List[str] = []
    updated_at: datetime


class CancelRequest(BaseModel):
    reason_code: Literal["CHANGED_MIND", "WRONG_DETAILS", "TOO_SLOW", "OTHER"]
    note: Optional[str] = Field(None, max_length=300)


class DisputeRequest(BaseModel):
    reason_code: Literal[
        "BAG_NOT_DELIVERED", "ITEMS_MISSING", "ITEMS_DAMAGED",
        "WRONG_BAG", "PARTNER_BEHAVIOUR", "OTHER"
    ]
    description: str = Field(..., min_length=10, max_length=1000)
    evidence_media_ids: Optional[List[str]] = Field(default_factory=list, max_length=4)


class RateRequest(BaseModel):
    stars: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=500)


class CleanDateRequest(BaseModel):
    clean_date: Optional[date] = None


class NotificationResponse(BaseModel):
    id: str
    type: str
    title: str
    body: str
    data: Dict[str, Any] = Field(default_factory=dict)
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: List[NotificationResponse]
    next_cursor: Optional[str] = None
    unread_count: int = 0


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionRequest(BaseModel):
    endpoint: str = Field(..., max_length=1024)
    keys: PushSubscriptionKeys
    expiration_time: Optional[int] = None
    platform: Optional[str] = None
    user_agent: Optional[str] = None


class PublicConfigResponse(BaseModel):
    server_time: datetime
    service_enabled: bool
    maintenance_message: Optional[str] = None
    allowed_email_domains: List[str]
    tiers: List[Dict[str, Any]]
    hostel_blocks: List[Dict[str, Any]]
    laundry_locations: List[Dict[str, Any]]
    clothes_categories: List[Dict[str, Any]]
    limits: Dict[str, Any]
    payments: Dict[str, str]
    partner_terms_version: str
    push: Dict[str, str]


# Partner Schemas
class PartnerOnlineRequest(BaseModel):
    is_online: bool


class PoolItem(BaseModel):
    id: str
    ref: str
    type: Literal["DROP", "PICKUP"]
    tier_code: str
    price_paise: int
    payout_paise: int
    hostel_block: HostelBlockRef
    laundry_location: LocationRef
    total_count: Optional[int] = None
    rack_number: Optional[str] = None
    opened_at: Optional[datetime] = None
    due_by: Optional[datetime] = None
    accept_by: Optional[datetime] = None
    created_at: datetime


class StudentContact(BaseModel):
    first_name: str
    phone: str


class PartnerJobDetail(BaseModel):
    id: str
    ref: str
    type: Literal["DROP", "PICKUP"]
    status: str
    tier_code: str
    payout_paise: int
    hostel_block: HostelBlockRef
    room: str
    laundry_location: LocationRef
    student: StudentContact
    note: Optional[str] = None
    total_count: Optional[int] = None
    rack_number: Optional[str] = None
    clean_date: Optional[date] = None
    media: List[MediaRef] = Field(default_factory=list)
    timeline: List[TimelineEvent] = Field(default_factory=list)
    due_by: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    allowed_actions: List[str] = Field(default_factory=list)


class VerifyOriginRequest(BaseModel):
    code: str = Field(..., pattern=r"^[0-9]{4}$")
    counted_items: Optional[int] = Field(None, ge=1, le=100)


class CompleteJobRequest(BaseModel):
    rack_number: Optional[str] = Field(None, max_length=32)
    code: Optional[str] = Field(None, pattern=r"^[0-9]{4}$")
    receipt_media_id: Optional[str] = None


class WithdrawJobRequest(BaseModel):
    reason: Literal[
        "CHANGED_MIND", "BUSY", "LAUNDRY_NOT_READY",
        "LAUNDRY_CLOSED", "EMERGENCY", "STUDENT_UNREACHABLE"
    ]
    note: Optional[str] = Field(None, max_length=300)


class LedgerEntryItem(BaseModel):
    id: str
    entry_type: str
    pending_delta_paise: int
    available_delta_paise: int
    request_id: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime


class PartnerEarningsResponse(BaseModel):
    pending_balance_paise: int
    available_balance_paise: int
    lifetime_earned_paise: int
    lifetime_paid_out_paise: int
    active_jobs_count: int
    completed_jobs_count: int
    withdrawn_jobs_count: int
    strikes: int
    rating_avg: Optional[float] = None
    rating_count: int = 0
    upi_id: Optional[str] = None
    is_online: bool = False
    recent_entries: List[LedgerEntryItem] = Field(default_factory=list)


class PayoutCreateRequest(BaseModel):
    amount_paise: int = Field(..., ge=10000)

    @model_validator(mode="after")
    def validate_whole_rupees(self):
        if self.amount_paise % 100 != 0:
            raise ValueError("Payout amount must be a multiple of 100 paise (whole rupees).")
        return self


class PayoutItem(BaseModel):
    id: str
    amount_paise: int
    upi_id: str
    status: str
    utr: Optional[str] = None
    requested_at: datetime
    processed_at: Optional[datetime] = None


# Upload Schemas
class UploadSignRequest(BaseModel):
    kind: Literal[
        "BAG_PHOTO", "READY_SCREENSHOT", "LAUNDRY_RECEIPT",
        "BAG_TAG_PHOTO", "COLLEGE_ID", "DISPUTE_EVIDENCE"
    ]
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(..., gt=0, le=10485760)


class UploadSignResponse(BaseModel):
    id: str
    kind: str
    upload_url: str
    object_key: str
    expires_in_seconds: int = 300


class UploadCompleteResponse(BaseModel):
    id: str
    kind: str
    status: str
    url: str
    size_bytes: int


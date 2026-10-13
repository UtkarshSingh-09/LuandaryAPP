import hashlib
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Request, Response, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.models import ServiceTier, HostelBlock, LaundryLocation, AppSetting
from app.schemas.common import PublicConfigResponse

router = APIRouter(prefix="/config", tags=["config"])


DEFAULT_CLOTHING_CATEGORIES = [
    {"code": "TSHIRT", "label": "T-shirt"},
    {"code": "SHIRT", "label": "Shirt"},
    {"code": "JEANS", "label": "Jeans / trousers"},
    {"code": "SHORTS", "label": "Shorts"},
    {"code": "TRACK", "label": "Track pants / pyjamas"},
    {"code": "INNER", "label": "Innerwear"},
    {"code": "SOCKS", "label": "Socks"},
    {"code": "HANKY", "label": "Handkerchief"},
    {"code": "TOWEL", "label": "Towel"},
    {"code": "BEDSHEET", "label": "Bedsheet"},
    {"code": "PILLOW", "label": "Pillow cover"},
    {"code": "HOODIE", "label": "Hoodie / sweatshirt"},
    {"code": "JACKET", "label": "Jacket"},
    {"code": "KURTA", "label": "Kurta / ethnic top"},
    {"code": "SAREE", "label": "Saree"},
    {"code": "DUPATTA", "label": "Dupatta / scarf"},
    {"code": "LABCOAT", "label": "Lab coat / uniform"},
    {"code": "OTHER", "label": "Other (describe)"}
]


@router.get("/public", response_model=PublicConfigResponse)
async def get_public_config(
    request: Request,
    response: Response,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match"),
    db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)

    # Fetch active tiers
    q_tiers = select(ServiceTier).where(ServiceTier.is_active == True).order_by(ServiceTier.sort_order)
    tiers = (await db.execute(q_tiers)).scalars().all()
    tiers_data = [
        {
            "code": t.code,
            "label": t.label,
            "price_paise": t.price_paise,
            "window_label": f"{t.window_min_minutes // 60} to {t.window_max_minutes // 60} hours" if t.window_min_minutes > 0 else f"Under {t.window_max_minutes // 60} hour",
            "window_max_minutes": t.window_max_minutes,
            "acceptance_timeout_minutes": t.acceptance_timeout_minutes or 30
        }
        for t in tiers
    ]

    # Fetch active hostel blocks
    q_blocks = select(HostelBlock).where(HostelBlock.is_active == True).order_by(HostelBlock.sort_order)
    blocks = (await db.execute(q_blocks)).scalars().all()
    blocks_data = [{"id": b.id, "name": b.name} for b in blocks]

    # Fetch active laundry locations
    q_locs = select(LaundryLocation).where(LaundryLocation.is_active == True)
    locs = (await db.execute(q_locs)).scalars().all()
    locs_data = [
        {
            "id": l.id,
            "name": l.name,
            "landmark": l.landmark,
            "hours": l.opening_hours,
            "is_open_now": True
        }
        for l in locs
    ]

    payload = {
        "server_time": now.isoformat(),
        "service_enabled": settings.SERVICE_ENABLED,
        "maintenance_message": settings.MAINTENANCE_MESSAGE,
        "allowed_email_domains": settings.ALLOWED_EMAIL_DOMAINS,
        "tiers": tiers_data,
        "hostel_blocks": blocks_data,
        "laundry_locations": locs_data,
        "clothes_categories": DEFAULT_CLOTHING_CATEGORIES,
        "limits": {
            "max_open_requests_per_student": settings.MAX_OPEN_REQUESTS_PER_STUDENT,
            "max_active_jobs_per_partner": settings.MAX_ACTIVE_JOBS_PER_PARTNER,
            "max_clothes_per_bag": settings.MAX_CLOTHES_PER_BAG,
            "max_upload_bytes": settings.MAX_UPLOAD_BYTES,
            "clean_date_max_days_ahead": settings.CLEAN_DATE_MAX_DAYS_AHEAD,
            "min_payout_paise": settings.MIN_PAYOUT_PAISE,
            "payment_window_minutes": settings.PAYMENT_WINDOW_MINUTES,
            "dispute_window_hours": settings.DISPUTE_WINDOW_HOURS
        },
        "payments": {
            "provider": settings.PAYMENT_PROVIDER,
            "method": "UPI"
        },
        "partner_terms_version": settings.PARTNER_TERMS_VERSION,
        "push": {
            "vapid_public_key": settings.VAPID_PUBLIC_KEY
        }
    }

    # ETag computation (ignoring server_time for caching stability)
    etag_source = {k: v for k, v in payload.items() if k != "server_time"}
    etag = f'"{hashlib.sha256(json.dumps(etag_source, sort_keys=True).encode()).hexdigest()[:16]}"'

    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["ETag"] = etag

    if if_none_match and if_none_match == etag:
        response.status_code = 304
        return response

    return payload

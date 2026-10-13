import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi import APIRouter, Request, Header, HTTPException, Depends
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, uuid7_str
from app.models import WebhookEvent, Payment, Request as RequestModel, RequestEvent, Notification

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/phonepe")
async def phonepe_webhook(
    request: Request,
    x_verify: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    body = await request.body()
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Deduplication key
    body_hash = hashlib.sha256(body).hexdigest()
    dedupe_key = data.get("transactionId") or body_hash

    # Check dedupe in webhook_events
    q_existing = select(WebhookEvent).where(
        and_(WebhookEvent.provider == "PHONEPE", WebhookEvent.dedupe_key == dedupe_key)
    )
    if (await db.execute(q_existing)).scalars().first():
        return {"status": "SUCCESS", "message": "Already processed"}

    webhook_row = WebhookEvent(
        id=uuid7_str(),
        provider="PHONEPE",
        dedupe_key=dedupe_key,
        signature_ok=True,
        headers=dict(request.headers),
        payload=data
    )
    db.add(webhook_row)

    # Process payment status
    merchant_order_id = data.get("data", {}).get("merchantTransactionId") or data.get("merchantTransactionId")
    code = data.get("code")

    if merchant_order_id:
        q_pay = select(Payment).options(
            selectinload(Payment.request).selectinload(RequestModel.tier)
        ).where(Payment.merchant_order_id == merchant_order_id)
        payment = (await db.execute(q_pay)).scalars().first()

        if payment:
            is_success = code in ("PAYMENT_SUCCESS", "SUCCESS")
            payment.status = "SUCCESS" if is_success else "FAILED"
            payment.paid_at = utc_now() if is_success else None
            payment.raw_last_response = data

            req = payment.request
            if is_success and req.status == "PAYMENT_PENDING":
                req.status = "OPEN"
                req.opened_at = utc_now()
                req.due_by = req.opened_at + timedelta(minutes=req.window_max_minutes)
                acceptance_timeout = req.tier.acceptance_timeout_minutes or 30
                req.expires_at = req.opened_at + timedelta(minutes=acceptance_timeout)
                req.can_pay_until = None

                db.add(RequestEvent(
                    request_id=req.id,
                    event_type="STATUS_CHANGE",
                    from_status="PAYMENT_PENDING",
                    to_status="OPEN",
                    actor_role="system",
                    metadata_={"label": "Looking for a delivery partner", "webhook": "phonepe"}
                ))

                db.add(Notification(
                    id=uuid7_str(),
                    user_id=req.student_id,
                    type="PAYMENT_CONFIRMED",
                    title="Payment confirmed",
                    body=f"Your {req.type} request {req.ref} is now open to delivery partners.",
                    data={"request_id": req.id, "ref": req.ref, "deeplink": f"/app/requests/{req.id}"}
                ))

    webhook_row.processed_at = utc_now()
    await db.commit()
    return {"status": "SUCCESS"}


@router.post("/paytm")
async def paytm_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    body = await request.body()
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    dedupe_key = data.get("ORDERID") or hashlib.sha256(body).hexdigest()

    webhook_row = WebhookEvent(
        id=uuid7_str(),
        provider="PAYTM",
        dedupe_key=dedupe_key,
        signature_ok=True,
        headers=dict(request.headers),
        payload=data
    )
    db.add(webhook_row)
    webhook_row.processed_at = utc_now()
    await db.commit()
    return {"status": "SUCCESS"}

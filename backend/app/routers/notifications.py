from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db, uuid7_str
from app.core.errors import APIException
from app.api.deps import get_current_user
from app.models import User, Notification, PushSubscription
from app.schemas.common import (
    NotificationResponse, NotificationListResponse,
    PushSubscriptionRequest
)

router = APIRouter(prefix="/me", tags=["notifications"])


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))

    query = query.order_by(Notification.created_at.desc()).limit(min(limit, 100))
    result = await db.execute(query)
    rows = result.scalars().all()

    # Count total unread
    q_unread = select(Notification).where(
        and_(Notification.user_id == current_user.id, Notification.read_at.is_(None))
    )
    unread_rows = (await db.execute(q_unread)).scalars().all()

    items = [
        NotificationResponse(
            id=n.id,
            type=n.type,
            title=n.title,
            body=n.body,
            data=n.data,
            read_at=n.read_at,
            created_at=n.created_at
        )
        for n in rows
    ]

    return NotificationListResponse(
        items=items,
        next_cursor=None,
        unread_count=len(unread_rows)
    )


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(Notification).where(
        and_(Notification.id == notification_id, Notification.user_id == current_user.id)
    )
    n = (await db.execute(q)).scalars().first()
    if not n:
        raise APIException(code="NOT_FOUND", message="Notification not found.", status_code=404)

    if not n.read_at:
        n.read_at = datetime.now(timezone.utc)
        await db.commit()

    q_unread = select(Notification).where(
        and_(Notification.user_id == current_user.id, Notification.read_at.is_(None))
    )
    unread_count = len((await db.execute(q_unread)).scalars().all())

    return {
        "id": n.id,
        "read_at": n.read_at,
        "unread_count": unread_count
    }


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(Notification).where(
        and_(Notification.user_id == current_user.id, Notification.read_at.is_(None))
    )
    unreads = (await db.execute(q)).scalars().all()
    now = datetime.now(timezone.utc)
    for n in unreads:
        n.read_at = now

    await db.commit()
    return {
        "marked": len(unreads),
        "unread_count": 0
    }


@router.post("/push-subscriptions", status_code=201)
async def create_push_subscription(
    payload: PushSubscriptionRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint)
    existing = (await db.execute(q)).scalars().first()

    now = datetime.now(timezone.utc)
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = payload.user_agent
        existing.platform = payload.platform
        existing.revoked_at = None
        await db.commit()
        response.status_code = 200
        return {"id": existing.id, "created_at": existing.created_at}

    new_sub = PushSubscription(
        id=uuid7_str(),
        user_id=current_user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=payload.user_agent,
        platform=payload.platform,
        created_at=now
    )
    db.add(new_sub)
    await db.commit()
    return {"id": new_sub.id, "created_at": new_sub.created_at}


@router.delete("/push-subscriptions", status_code=204)
async def delete_push_subscription(
    payload: Dict[str, str],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    endpoint = payload.get("endpoint")
    if endpoint:
        q = select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        sub = (await db.execute(q)).scalars().first()
        if sub:
            await db.delete(sub)
            await db.commit()
    return None


@router.get("/push-subscriptions")
async def list_push_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    q = select(PushSubscription).where(PushSubscription.user_id == current_user.id)
    subs = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": s.id,
                "platform": s.platform,
                "user_agent": s.user_agent,
                "created_at": s.created_at,
                "last_success_at": s.last_success_at
            }
            for s in subs
        ]
    }

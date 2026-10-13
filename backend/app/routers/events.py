import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Request, Header
from fastapi.responses import StreamingResponse

from app.core.security import decode_access_token
from app.core.database import async_session_factory
from app.models import User
from app.core.errors import APIException

router = APIRouter(tags=["events"])


async def authenticate_sse_user(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Query(None)
) -> Optional[str]:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif access_token:
        token = access_token

    if not token:
        return None

    try:
        payload = decode_access_token(token)
        return payload.get("sub")
    except Exception:
        return None


@router.get("/events/stream")
async def sse_event_stream(
    request: Request,
    user_id: Optional[str] = Depends(authenticate_sse_user)
):
    """
    Realtime SSE stream per 10-realtime.md.
    Emits initial connection acknowledgment, periodic heartbeat pings (every 15s),
    and user-specific / pool updates.
    """
    async def event_generator():
        # 1. Connected comment
        yield ": connected\n\n"

        heartbeat_interval = 15  # seconds
        counter = 0

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            await asyncio.sleep(heartbeat_interval)
            counter += 1

            # Periodic ping frame
            ts = datetime.now(timezone.utc).isoformat()
            yield f": ping {ts}\n\n"

            # Heartbeat sync event every 60s
            if counter % 4 == 0:
                payload = json.dumps({"type": "heartbeat", "time": ts})
                yield f"event: heartbeat\ndata: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

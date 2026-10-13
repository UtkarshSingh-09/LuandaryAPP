from typing import Dict, Any
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models import User
from app.services.upload_service import UploadService
from app.schemas.common import (
    UploadSignRequest, UploadSignResponse, UploadCompleteResponse
)

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/sign", response_model=UploadSignResponse)
async def sign_upload(
    payload: UploadSignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await UploadService.sign_upload(
        db, current_user, payload.kind, payload.content_type, payload.size_bytes
    )


@router.post("/{media_id}/complete", response_model=UploadCompleteResponse)
async def complete_upload(
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await UploadService.complete_upload(db, current_user, media_id)


@router.get("/{media_id}")
async def get_media_url(
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await UploadService.get_media_url(db, current_user, media_id)


@router.put("/{media_id}/mock-put")
async def mock_upload_sink(media_id: str, request: Request):
    """Local development sink simulating object storage PUT."""
    body = await request.body()
    return {"status": "ok", "bytes_received": len(body)}

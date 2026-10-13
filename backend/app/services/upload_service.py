from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import APIException
from app.core.database import uuid7_str
from app.models import User, RequestMedia
from app.schemas.common import UploadSignResponse, UploadCompleteResponse


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UploadService:

    @classmethod
    async def sign_upload(
        cls, db: AsyncSession, user: User, kind: str, content_type: str, size_bytes: int
    ) -> UploadSignResponse:
        # Permission check per 09a 2.5 MEDIA_KIND_NOT_ALLOWED
        if kind == "LAUNDRY_RECEIPT" and user.role != "partner":
            raise APIException(
                code="MEDIA_KIND_NOT_ALLOWED",
                message="Only delivery partners may upload laundry receipts.",
                status_code=403
            )

        if size_bytes > settings.MAX_UPLOAD_BYTES:
            raise APIException(
                code="MEDIA_TOO_LARGE",
                message="File exceeds maximum size of 10 MB.",
                status_code=413,
                details={"max_bytes": settings.MAX_UPLOAD_BYTES}
            )

        media_id = uuid7_str()
        ext = "jpg" if "jpeg" in content_type else "png" if "png" in content_type else "webp"
        object_key = f"req/{utc_now().year}/{utc_now().month:02d}/{media_id}.{ext}"

        media_row = RequestMedia(
            id=media_id,
            uploader_id=user.id,
            kind=kind,
            status="PENDING",
            object_key=object_key,
            content_type=content_type,
            size_bytes=size_bytes
        )
        db.add(media_row)
        await db.commit()

        # In dev / mock, upload goes to mock endpoint or direct PUT
        upload_url = f"/api/v1/uploads/{media_id}/mock-put" if settings.PAYMENT_PROVIDER == "mock" else f"https://{settings.S3_BUCKET_MEDIA}.s3.{settings.S3_REGION}.amazonaws.com/{object_key}?signed=true"

        return UploadSignResponse(
            id=media_id,
            kind=kind,
            upload_url=upload_url,
            object_key=object_key,
            expires_in_seconds=300
        )

    @classmethod
    async def complete_upload(cls, db: AsyncSession, user: User, media_id: str) -> UploadCompleteResponse:
        q = select(RequestMedia).where(RequestMedia.id == media_id)
        media = (await db.execute(q)).scalars().first()

        if not media or media.uploader_id != user.id:
            raise APIException(code="NOT_FOUND", message="Media upload not found.", status_code=404)

        if media.status == "READY":
            # Already completed
            return UploadCompleteResponse(
                id=media.id,
                kind=media.kind,
                status=media.status,
                url=f"/api/v1/uploads/{media.id}",
                size_bytes=media.size_bytes or 1024
            )

        media.status = "READY"
        media.uploaded_at = utc_now()
        media.sha256 = f"sha256_{media_id[:16]}"
        await db.commit()

        return UploadCompleteResponse(
            id=media.id,
            kind=media.kind,
            status="READY",
            url=f"/api/v1/uploads/{media.id}",
            size_bytes=media.size_bytes or 1024
        )

    @classmethod
    async def get_media_url(cls, db: AsyncSession, user: User, media_id: str) -> Dict[str, Any]:
        q = select(RequestMedia).where(RequestMedia.id == media_id)
        media = (await db.execute(q)).scalars().first()

        if not media:
            raise APIException(code="NOT_FOUND", message="Media not found.", status_code=404)

        return {
            "id": media.id,
            "kind": media.kind,
            "url": f"/api/v1/uploads/{media.id}/content",
            "url_expires_at": (utc_now() + timedelta(minutes=10)).isoformat()
        }

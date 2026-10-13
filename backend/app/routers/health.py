from fastapi import APIRouter, Response, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "service": "CampusLaundry",
        "version": "1.0.0"
    }


@router.get("/readyz")
async def readyz(response: Response, db: AsyncSession = Depends(get_db)):
    # Check DB
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        db_ok = False

    if not db_ok:
        response.status_code = 503
        return {"status": "unhealthy", "failing": ["database"]}

    return {
        "status": "ready",
        "database": "connected"
    }

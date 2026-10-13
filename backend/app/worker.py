import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select, and_

from app.core.config import settings
from app.core.database import async_session_factory
from app.models import Request, LedgerEntry, PartnerProfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def sweep_expired_requests():
    """Sweeps OPEN requests that have exceeded their accept deadline."""
    async with async_session_factory() as session:
        now = utc_now()
        q = select(Request).where(
            and_(
                Request.status == "OPEN",
                Request.expires_at.is_not(None),
                Request.expires_at < now
            )
        )
        expired_reqs = (await session.execute(q)).scalars().all()
        for r in expired_reqs:
            logger.info(f"Expiring request {r.id} ({r.ref}) due to NO_PARTNER")
            r.status = "EXPIRED"
            r.expired_at = now
            r.cancel_reason = "NO_PARTNER"
        if expired_reqs:
            await session.commit()


async def sweep_earnings_hold_releases():
    """Releases earnings hold on completed jobs after hold duration."""
    async with async_session_factory() as session:
        now = utc_now()
        q = select(Request).where(
            and_(
                Request.status == "COMPLETED",
                Request.earnings_released_at.is_(None),
                Request.earnings_release_at.is_not(None),
                Request.earnings_release_at <= now,
                Request.partner_id.is_not(None)
            )
        )
        ready_releases = (await session.execute(q)).scalars().all()
        for r in ready_releases:
            r.earnings_released_at = now
            payout = r.partner_payout_paise
            session.add(LedgerEntry(
                partner_id=r.partner_id,
                entry_type="EARN_RELEASE",
                pending_delta_paise=-payout,
                available_delta_paise=payout,
                request_id=r.id,
                idempotency_key=f"earn_release_auto:{r.id}"
            ))
            q_p = select(PartnerProfile).where(PartnerProfile.user_id == r.partner_id)
            prof = (await session.execute(q_p)).scalars().first()
            if prof:
                prof.pending_balance_paise = max(0, prof.pending_balance_paise - payout)
                prof.available_balance_paise += payout
        if ready_releases:
            await session.commit()


async def main():
    logger.info("CampusLaundry worker started.")
    while True:
        try:
            await sweep_expired_requests()
            await sweep_earnings_hold_releases()
        except Exception as e:
            logger.error(f"Worker iteration error: {e}")
        await asyncio.sleep(15)


if __name__ == "__main__":
    asyncio.run(main())

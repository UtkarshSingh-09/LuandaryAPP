from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import uuid7_str
from app.models import HostelBlock, LaundryLocation, ServiceTier, User, PartnerProfile


async def seed_initial_data(db: AsyncSession) -> None:
    # 1. Seed Service Tiers
    q_tiers = select(ServiceTier)
    existing_tiers = (await db.execute(q_tiers)).scalars().all()
    if not existing_tiers:
        tiers = [
            ServiceTier(
                code="STANDARD",
                label="Standard",
                price_paise=3000,
                partner_payout_paise=1300,
                window_min_minutes=120,
                window_max_minutes=180,
                acceptance_timeout_minutes=30,
                sort_order=1,
                is_active=True
            ),
            ServiceTier(
                code="FAST",
                label="Fast",
                price_paise=4000,
                partner_payout_paise=1800,
                window_min_minutes=90,
                window_max_minutes=120,
                acceptance_timeout_minutes=20,
                sort_order=2,
                is_active=True
            ),
            ServiceTier(
                code="EXPRESS",
                label="Express",
                price_paise=5000,
                partner_payout_paise=2300,
                window_min_minutes=30,
                window_max_minutes=60,
                acceptance_timeout_minutes=12,
                sort_order=3,
                is_active=True
            ),
        ]
        db.add_all(tiers)

    # 2. Seed Hostel Blocks (Ganga A, Ganga B, Vedavathi, Yamuna, Narmada, Saraswati, Kaveri, Krishna, Godavari)
    hostel_blocks_def = [
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc01", "code": "GANGA-A", "name": "Ganga A", "delivery_hint": "Wing A Entrance", "sort_order": 1},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc02", "code": "GANGA-B", "name": "Ganga B", "delivery_hint": "Wing B Entrance", "sort_order": 2},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc03", "code": "VEDAVATHI", "name": "Vedavathi", "delivery_hint": "Main Lobby Entrance", "sort_order": 3},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc04", "code": "YAMUNA", "name": "Yamuna", "delivery_hint": "Ground Floor Security", "sort_order": 4},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc05", "code": "NARMADA", "name": "Narmada", "delivery_hint": "Reception Desk", "sort_order": 5},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc06", "code": "SARASWATI", "name": "Saraswati", "delivery_hint": "East Gate Entrance", "sort_order": 6},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc07", "code": "KAVERI", "name": "Kaveri", "delivery_hint": "Central Quad Entrance", "sort_order": 7},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc08", "code": "KRISHNA", "name": "Krishna", "delivery_hint": "North Wing Entrance", "sort_order": 8},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc09", "code": "GODAVARI", "name": "Godavari", "delivery_hint": "South Wing Entrance", "sort_order": 9},
        {"id": "0192b7a0-0c11-7010-8e22-aa00bb00cc10", "code": "TEESTHA", "name": "Teestha", "delivery_hint": "East Wing Entrance", "sort_order": 10},
    ]

    q_blocks = select(HostelBlock)
    existing_blocks_map = {b.id: b for b in (await db.execute(q_blocks)).scalars().all()}
    for b_def in hostel_blocks_def:
        if b_def["id"] in existing_blocks_map:
            eb = existing_blocks_map[b_def["id"]]
            eb.code = b_def["code"]
            eb.name = b_def["name"]
            eb.delivery_hint = b_def["delivery_hint"]
            eb.sort_order = b_def["sort_order"]
            eb.is_active = True
        else:
            db.add(HostelBlock(
                id=b_def["id"],
                code=b_def["code"],
                name=b_def["name"],
                delivery_hint=b_def["delivery_hint"],
                sort_order=b_def["sort_order"],
                is_active=True
            ))

    # 3. Seed Laundry Location
    q_loc = select(LaundryLocation)
    existing_locs = (await db.execute(q_loc)).scalars().all()
    if not existing_locs:
        hours = {
            "mon": [["08:00", "20:00"]],
            "tue": [["08:00", "20:00"]],
            "wed": [["08:00", "20:00"]],
            "thu": [["08:00", "20:00"]],
            "fri": [["08:00", "20:00"]],
            "sat": [["08:00", "20:00"]],
            "sun": [["08:00", "20:00"]],
        }
        loc = LaundryLocation(
            id="0192b7a1-1d22-7020-8f33-bb11cc11dd02",
            name="Main Campus Laundry",
            landmark="Behind food court",
            opening_hours=hours,
            is_active=True
        )
        db.add(loc)

    # 4. Seed a demo student user for instant testing
    q_user = select(User).where(User.email == "student@srmap.edu.in")
    demo_user = (await db.execute(q_user)).scalars().first()
    now = datetime.now(timezone.utc)
    if not demo_user:
        demo_user = User(
            id="0192b7e4-3a10-7c52-9f1d-5e8a2b4c6d01",
            email="student@srmap.edu.in",
            email_verified_at=now,
            name="Ananya Rao",
            phone="+919876543210",
            registration_number="AP21110011234",
            hostel_block_id="0192b7a0-0c11-7010-8e22-aa00bb00cc04",
            room="B-412",
            role="student",
            partner_status="NONE",
            is_active=True,
            onboarded_at=now
        )
        db.add(demo_user)

    # 5. Seed a demo delivery partner user for instant testing
    q_partner = select(User).where(User.email == "partner@srmap.edu.in")
    demo_partner = (await db.execute(q_partner)).scalars().first()
    if not demo_partner:
        demo_partner = User(
            id="0192b7e4-3a10-7c52-9f1d-5e8a2b4c6d02",
            email="partner@srmap.edu.in",
            email_verified_at=now,
            name="Kiran Kumar",
            phone="+919876543211",
            registration_number="AP21110011235",
            hostel_block_id="0192b7a0-0c11-7010-8e22-aa00bb00cc01",
            room="A-102",
            role="student",
            partner_status="APPROVED",
            is_active=True,
            onboarded_at=now
        )
        db.add(demo_partner)
        db.add(PartnerProfile(
            user_id="0192b7e4-3a10-7c52-9f1d-5e8a2b4c6d02",
            upi_id="kiran@okaxis",
            is_online=True,
            online_since=now,
            terms_accepted_at=now,
            approved_at=now
        ))

    await db.commit()

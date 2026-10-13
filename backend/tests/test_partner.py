import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from app.main import app
from app.core.security import create_access_token, generate_handoff_code, hash_handoff_code, encrypt_handoff_code
from app.core.database import async_session_factory
from app.models import (
    User, HostelBlock, LaundryLocation, ServiceTier, Request,
    RequestItem, RequestEvent, Payment, PartnerProfile, LedgerEntry, PayoutRequest
)


@pytest.mark.asyncio
async def test_partner_lifecycle_and_ledger():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Setup Student and Approved Partner
        async with async_session_factory() as session:
            # Student
            q_student = select(User).where(User.email == "student@srmap.edu.in")
            student = (await session.execute(q_student)).scalars().first()
            assert student is not None
            student_id = student.id
            block_id = student.hostel_block_id

            # Clean previous requests
            q_reqs = select(Request.id).where(Request.student_id == student_id)
            old_ids = (await session.execute(q_reqs)).scalars().all()
            if old_ids:
                await session.execute(delete(Payment).where(Payment.request_id.in_(old_ids)))
                await session.execute(delete(RequestEvent).where(RequestEvent.request_id.in_(old_ids)))
                await session.execute(delete(RequestItem).where(RequestItem.request_id.in_(old_ids)))
                await session.execute(delete(Request).where(Request.id.in_(old_ids)))
                await session.commit()

            # Partner
            q_partner = select(User).where(User.email == "partner.test@srmap.edu.in")
            partner = (await session.execute(q_partner)).scalars().first()
            if not partner:
                partner = User(
                    id=str(uuid.uuid4()),
                    email="partner.test@srmap.edu.in",
                    name="Rohit Verma",
                    phone="+919876543210",
                    role="partner",
                    partner_status="APPROVED",
                    onboarded_at=student.created_at
                )
                session.add(partner)
                await session.flush()

            partner_id = partner.id

            # Partner profile
            q_profile = select(PartnerProfile).where(PartnerProfile.user_id == partner_id)
            profile = (await session.execute(q_profile)).scalars().first()
            if not profile:
                profile = PartnerProfile(
                    user_id=partner_id,
                    upi_id="rohit.v@okaxis",
                    is_online=False,
                    active_jobs_count=0,
                    available_balance_paise=15000,  # ₹150 for payout test
                    pending_balance_paise=0
                )
                session.add(profile)
            else:
                profile.is_online = False
                profile.active_jobs_count = 0
                profile.available_balance_paise = 15000
                profile.pending_balance_paise = 0

            # Clean old payouts and ledger
            await session.execute(delete(PayoutRequest).where(PayoutRequest.partner_id == partner_id))
            await session.execute(delete(LedgerEntry).where(LedgerEntry.partner_id == partner_id))
            await session.commit()

            q_loc = select(LaundryLocation).where(LaundryLocation.is_active == True)
            loc = (await session.execute(q_loc)).scalars().first()
            assert loc is not None
            loc_id = loc.id

        student_token = create_access_token(user_id=student_id, role="student", kind="user")
        partner_token = create_access_token(user_id=partner_id, role="partner", kind="user")
        partner_headers = {"Authorization": f"Bearer {partner_token}"}

        # 2. Check offline partner cannot access pool
        pool_res = await client.get("/api/v1/partner/pool", headers=partner_headers)
        assert pool_res.status_code == 403
        assert pool_res.json()["error"]["code"] == "PARTNER_OFFLINE"

        # 3. Toggle online
        online_res = await client.post(
            "/api/v1/partner/online",
            json={"is_online": True},
            headers=partner_headers
        )
        assert online_res.status_code == 200
        assert online_res.json()["is_online"] is True

        # 4. Student creates DROP request and completes payment
        drop_res = await client.post(
            "/api/v1/requests",
            json={
                "type": "DROP",
                "tier_code": "FAST",
                "hostel_block_id": block_id,
                "room": "B-412",
                "laundry_location_id": loc_id,
                "items": [{"category": "SHIRT", "quantity": 4}],
                "total_count": 4,
                "note": "Secret note"
            },
            headers={"Authorization": f"Bearer {student_token}", "Idempotency-Key": f"part-drop-{uuid.uuid4()}"}
        )
        assert drop_res.status_code == 201
        drop_id = drop_res.json()["id"]

        # Pay to move to OPEN
        await client.post(
            f"/api/v1/requests/{drop_id}/payment/mock-complete",
            json={"status": "SUCCESS"},
            headers={"Authorization": f"Bearer {student_token}"}
        )

        # 5. Partner views pool
        pool_res2 = await client.get("/api/v1/partner/pool", headers=partner_headers)
        assert pool_res2.status_code == 200
        items = pool_res2.json()
        assert len(items) >= 1
        target_item = next(it for it in items if it["id"] == drop_id)
        assert target_item["ref"].startswith("CL-D-")
        assert target_item["tier_code"] == "FAST"
        assert target_item["payout_paise"] == 1800  # fast tier partner payout
        # Verify privacy: room, student name/phone, and note are NOT in pool item
        assert "room" not in target_item
        assert "student" not in target_item
        assert "note" not in target_item

        # 6. Partner accepts request
        accept_res = await client.post(f"/api/v1/partner/requests/{drop_id}/accept", headers=partner_headers)
        assert accept_res.status_code == 200
        job = accept_res.json()
        assert job["status"] == "ACCEPTED"
        # Room, student name, and note are now revealed!
        assert job["room"] == "B-412"
        assert job["student"]["first_name"] is not None
        assert job["note"] == "Secret note"

        # 7. Another partner cannot accept same request (REQUEST_NOT_OPEN or REQUEST_ALREADY_TAKEN)
        dup_accept = await client.post(f"/api/v1/partner/requests/{drop_id}/accept", headers=partner_headers)
        assert dup_accept.status_code == 409

        # 8. Get student request detail to inspect origin code
        req_detail = await client.get(f"/api/v1/requests/{drop_id}", headers={"Authorization": f"Bearer {student_token}"})
        code_val = req_detail.json()["handoff_code"]["value"]
        assert len(code_val) == 4

        # 9. Test wrong code -> 422 CODE_INVALID with attempts_left
        wrong_code_res = await client.post(
            f"/api/v1/partner/requests/{drop_id}/verify-origin",
            json={"code": "0000" if code_val != "0000" else "9999"},
            headers=partner_headers
        )
        assert wrong_code_res.status_code == 422
        assert wrong_code_res.json()["error"]["code"] == "CODE_INVALID"
        assert wrong_code_res.json()["error"]["details"]["attempts_left"] == 4

        # 10. Test correct code -> moves to PICKED_UP
        correct_res = await client.post(
            f"/api/v1/partner/requests/{drop_id}/verify-origin",
            json={"code": code_val, "counted_items": 4},
            headers=partner_headers
        )
        assert correct_res.status_code == 200
        assert correct_res.json()["status"] == "PICKED_UP"

        # 11. Complete DROP without rack number -> 422 RACK_NUMBER_REQUIRED
        no_rack = await client.post(
            f"/api/v1/partner/requests/{drop_id}/complete",
            json={},
            headers=partner_headers
        )
        assert no_rack.status_code == 422
        assert no_rack.json()["error"]["code"] == "RACK_NUMBER_REQUIRED"

        # 12. Complete DROP with rack number -> COMPLETED
        complete_res = await client.post(
            f"/api/v1/partner/requests/{drop_id}/complete",
            json={"rack_number": "R-5821"},
            headers=partner_headers
        )
        assert complete_res.status_code == 200
        assert complete_res.json()["status"] == "COMPLETED"
        assert complete_res.json()["rack_number"] == "R-5821"

        # 13. Partner checks earnings -> EARN_HOLD 1800 paise in pending_balance
        earnings_res = await client.get("/api/v1/partner/earnings", headers=partner_headers)
        assert earnings_res.status_code == 200
        earnings = earnings_res.json()
        assert earnings["pending_balance_paise"] >= 1800
        assert earnings["completed_jobs_count"] >= 1

        # 14. Partner requests payout of available balance
        payout_res = await client.post(
            "/api/v1/partner/payouts",
            json={"amount_paise": 10000},  # ₹100
            headers={**partner_headers, "Idempotency-Key": f"payout-{uuid.uuid4()}"}
        )
        assert payout_res.status_code == 201
        payout_data = payout_res.json()
        assert payout_data["status"] == "REQUESTED"
        assert payout_data["amount_paise"] == 10000

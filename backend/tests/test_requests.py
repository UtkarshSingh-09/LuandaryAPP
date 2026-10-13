import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from app.main import app
from app.core.security import create_access_token
from app.core.database import async_session_factory
from app.models import User, HostelBlock, LaundryLocation, ServiceTier, Request, RequestItem, RequestEvent, Payment


@pytest.mark.asyncio
async def test_full_student_requests_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get demo user and clean up active requests for test isolation
        async with async_session_factory() as session:
            q_user = select(User).where(User.email == "student@srmap.edu.in")
            user = (await session.execute(q_user)).scalars().first()
            assert user is not None
            user_id = user.id
            block_id = user.hostel_block_id

            # Clean any old test requests for this user
            q_old = select(Request.id).where(Request.student_id == user_id)
            old_ids = (await session.execute(q_old)).scalars().all()
            if old_ids:
                await session.execute(delete(Payment).where(Payment.request_id.in_(old_ids)))
                await session.execute(delete(RequestEvent).where(RequestEvent.request_id.in_(old_ids)))
                await session.execute(delete(RequestItem).where(RequestItem.request_id.in_(old_ids)))
                await session.execute(delete(Request).where(Request.id.in_(old_ids)))
                await session.commit()

            q_loc = select(LaundryLocation).where(LaundryLocation.is_active == True)
            loc = (await session.execute(q_loc)).scalars().first()
            assert loc is not None
            loc_id = loc.id

        token = create_access_token(user_id=user_id, role="student", kind="user")
        auth_headers = {
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": f"test-drop-{uuid.uuid4()}"
        }

        # 1. Create DROP request
        drop_payload = {
            "type": "DROP",
            "tier_code": "STANDARD",
            "hostel_block_id": block_id,
            "room": "B-412",
            "laundry_location_id": loc_id,
            "items": [
                {"category": "SHIRT", "quantity": 3},
                {"category": "JEANS", "quantity": 2}
            ],
            "total_count": 5,
            "note": "Blue bag with tag",
            "clean_date": None
        }

        drop_res = await client.post("/api/v1/requests", json=drop_payload, headers=auth_headers)
        assert drop_res.status_code == 201
        drop_data = drop_res.json()
        assert drop_data["type"] == "DROP"
        assert drop_data["status"] == "PAYMENT_PENDING"
        assert drop_data["total_count"] == 5
        assert drop_data["price_paise"] == 3000
        req_id = drop_data["id"]

        # 2. Get request detail
        get_res = await client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {token}"})
        assert get_res.status_code == 200
        detail = get_res.json()
        assert detail["id"] == req_id
        assert detail["ref"].startswith("CL-D-")
        assert "pay" in detail["allowed_actions"]
        assert "cancel" in detail["allowed_actions"]

        # 3. List requests
        list_res = await client.get("/api/v1/requests", headers={"Authorization": f"Bearer {token}"})
        assert list_res.status_code == 200
        items = list_res.json()["items"]
        assert len(items) >= 1
        assert any(it["id"] == req_id for it in items)

        # 4. Cancel request
        cancel_res = await client.post(
            f"/api/v1/requests/{req_id}/cancel",
            json={"reason_code": "CHANGED_MIND", "note": "Decided to do later"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "CANCELLED"
        assert cancel_res.json()["cancel_reason"] == "CHANGED_MIND"

        # 5. Create PICKUP request
        pickup_headers = {
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "test-pickup-key-67890"
        }
        pickup_payload = {
            "type": "PICKUP",
            "tier_code": "FAST",
            "hostel_block_id": block_id,
            "room": "B-412",
            "laundry_location_id": loc_id,
            "rack_number": "R-1044",
            "ready_screenshot_media_id": "0192b8d8-4410-7c9a-8d11-6e5f4a3b2c09",
            "note": "Ring room bell"
        }
        pickup_res = await client.post("/api/v1/requests", json=pickup_payload, headers=pickup_headers)
        assert pickup_res.status_code == 201
        pickup_data = pickup_res.json()
        assert pickup_data["type"] == "PICKUP"
        assert pickup_data["rack_number"] == "R-1044"
        assert pickup_data["price_paise"] == 4000
        pickup_id = pickup_data["id"]

        # 6. Complete mock payment on pickup request
        pay_res = await client.post(
            f"/api/v1/requests/{pickup_id}/payment/mock-complete",
            json={"status": "SUCCESS"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert pay_res.status_code == 200
        paid_data = pay_res.json()
        assert paid_data["status"] == "OPEN"
        assert paid_data["opened_at"] is not None
        assert paid_data["due_by"] is not None

        # 7. Advance demo order flow: OPEN -> ACCEPTED
        adv1 = await client.post(
            f"/api/v1/requests/{pickup_id}/mock-advance",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert adv1.status_code == 200
        accepted_data = adv1.json()
        assert accepted_data["status"] == "ACCEPTED"
        assert accepted_data["handoff_code"] is not None
        assert accepted_data["handoff_code"]["purpose"] == "DESTINATION"
        assert len(accepted_data["handoff_code"]["value"]) == 4

        # 8. Advance demo order flow: ACCEPTED -> PICKED_UP
        adv2 = await client.post(
            f"/api/v1/requests/{pickup_id}/mock-advance",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert adv2.status_code == 200
        picked_up_data = adv2.json()
        assert picked_up_data["status"] == "PICKED_UP"

        # 9. Advance demo order flow: PICKED_UP -> COMPLETED
        adv3 = await client.post(
            f"/api/v1/requests/{pickup_id}/mock-advance",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert adv3.status_code == 200
        completed_data = adv3.json()
        assert completed_data["status"] == "COMPLETED"

        # 10. Student confirms receipt
        confirm_res = await client.post(
            f"/api/v1/requests/{pickup_id}/confirm-received",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert confirm_res.status_code == 200
        assert confirm_res.json()["confirmed_received_at"] is not None

        # 11. Student rates delivery
        rate_res = await client.post(
            f"/api/v1/requests/{pickup_id}/rate",
            json={"stars": 5, "comment": "Fast and courteous delivery!"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert rate_res.status_code == 201
        assert rate_res.json()["stars"] == 5


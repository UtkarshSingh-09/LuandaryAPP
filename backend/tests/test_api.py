import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import engine, Base, async_session_factory
from app.seed import seed_initial_data


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session_factory() as session:
        await seed_initial_data(session)
    yield


@pytest.mark.asyncio
async def test_health_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/healthz")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert res.headers.get("X-API-Version") == "1"
        assert "X-Request-ID" in res.headers


@pytest.mark.asyncio
async def test_public_config():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/config/public")
        assert res.status_code == 200
        data = res.json()
        assert data["service_enabled"] is True
        assert len(data["tiers"]) == 3
        assert len(data["hostel_blocks"]) >= 1
        assert "limits" in data
        assert data["limits"]["max_open_requests_per_student"] == 3


@pytest.mark.asyncio
async def test_otp_flow_and_me():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Request OTP with invalid domain
        bad_req = await client.post("/api/v1/auth/otp/request", json={"email": "hacker@random.com"})
        assert bad_req.status_code == 422
        bad_data = bad_req.json()
        assert bad_data["error"]["code"] == "EMAIL_DOMAIN_NOT_ALLOWED"

        # 2. Request OTP with college email
        otp_req = await client.post("/api/v1/auth/otp/request", json={"email": "student@srmap.edu.in"})
        assert otp_req.status_code == 202
        assert otp_req.json()["sent"] is True

        # 3. Wrong OTP returns contract 400 OTP_INVALID
        wrong_verify = await client.post("/api/v1/auth/otp/verify", json={"email": "student@srmap.edu.in", "otp": "000000"})
        assert wrong_verify.status_code == 400
        assert wrong_verify.json()["error"]["code"] == "OTP_INVALID"

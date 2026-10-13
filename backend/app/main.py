import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.database import engine, Base, async_session_factory
from app.core.errors import (
    APIException, api_exception_handler,
    validation_exception_handler, http_exception_handler,
    unhandled_exception_handler
)
from app.routers import auth, me, config, requests, notifications, health, partner, uploads, webhooks, events
from app.seed import seed_initial_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (safety net for SQLite / dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed initial data
    async with async_session_factory() as session:
        await seed_initial_data(session)

    yield


app = FastAPI(
    title="CampusLaundry API",
    version="1.0.0",
    docs_url="/docs" if settings.APP_ENV == "dev" else None,
    redoc_url=None,
    lifespan=lifespan
)

# Exception handlers
app.add_exception_handler(APIException, api_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# CORS: Enabled for localhost:3000 in dev
if settings.APP_ENV == "dev":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-API-Version", "Location", "Idempotent-Replayed", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"]
    )


@app.middleware("http")
async def global_conventions_middleware(request: Request, call_next):
    # 1. Enforce 64KB body limit for JSON payloads
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > 65536:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            return Response(
                status_code=413,
                content='{"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request payload exceeds 64 KB limit.","details":{}}}',
                media_type="application/json"
            )

    # 2. X-Request-ID handling (echo or generate)
    inbound_req_id = request.headers.get("X-Request-ID")
    req_id = inbound_req_id if inbound_req_id and len(inbound_req_id) >= 16 else str(uuid.uuid4())

    response = await call_next(request)

    response.headers["X-Request-ID"] = req_id
    response.headers["X-API-Version"] = "1"
    return response


# Mount routers
app.include_router(health.router)
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(me.router, prefix=settings.API_V1_PREFIX)
app.include_router(config.router, prefix=settings.API_V1_PREFIX)
app.include_router(requests.router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications.router, prefix=settings.API_V1_PREFIX)
app.include_router(partner.router, prefix=settings.API_V1_PREFIX)
app.include_router(uploads.router, prefix=settings.API_V1_PREFIX)
app.include_router(webhooks.router, prefix=settings.API_V1_PREFIX)
app.include_router(events.router, prefix=settings.API_V1_PREFIX)

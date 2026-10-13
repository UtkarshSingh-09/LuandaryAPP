import os
import time
import uuid
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings


def uuid7() -> uuid.UUID:
    """Generate a UUIDv7 (RFC 9562 standard: 48-bit timestamp + version 7 + variant 2 + random)."""
    ns = time.time_ns()
    timestamp_ms = ns // 1_000_000
    
    # 48 bits timestamp
    time_high_and_mid = timestamp_ms & 0xFFFFFFFFFFFF
    
    # Random bits
    rand_bytes = os.urandom(10)
    rand_a = int.from_bytes(rand_bytes[:2], byteorder="big") & 0x0FFF
    rand_b = int.from_bytes(rand_bytes[2:], byteorder="big") & 0x3FFFFFFFFFFFFFFF
    
    # Version 7 in bits 48..51
    time_and_version = (time_high_and_mid << 16) | (0x7000 | rand_a)
    # Variant 2 (10xx) in bits 64..65
    clock_seq_and_node = 0x8000000000000000 | rand_b
    
    int_val = (time_and_version << 64) | clock_seq_and_node
    return uuid.UUID(int=int_val)


def uuid7_str() -> str:
    return str(uuid7())


engine_kwargs = {"echo": False}
if "sqlite" in settings.DATABASE_URL:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()

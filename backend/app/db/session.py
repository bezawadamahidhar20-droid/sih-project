from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

# Pool sizing only applies to server-style databases (e.g. Postgres);
# SQLite backends use their own connection handling.
engine_kwargs = {"echo": settings.debug}
if settings.database_url.startswith("postgres"):
    engine_kwargs.update(
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_pre_ping=True,
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Lightweight migration for pre-existing databases: create_all never
        # adds columns to tables that already exist, so add the new
        # token_version column explicitly when missing.
        if settings.database_url.startswith("sqlite"):
            from sqlalchemy import inspect, text

            def _ensure_token_version(sync_conn) -> None:
                columns = {c["name"] for c in inspect(sync_conn).get_columns("users")}
                if "token_version" not in columns:
                    sync_conn.execute(
                        text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
                    )

            await conn.run_sync(_ensure_token_version)
        else:
            # Postgres supports ADD COLUMN IF NOT EXISTS natively.
            from sqlalchemy import text

            await conn.execute(
                text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                    "token_version INTEGER NOT NULL DEFAULT 0"
                )
            )


async def close_db() -> None:
    await engine.dispose()
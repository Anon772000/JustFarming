from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import inspect
from .config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def _column_exists(sync_conn, table_name: str, column_name: str) -> bool:
    insp = inspect(sync_conn)
    try:
        cols = insp.get_columns(table_name)
    except Exception:
        return False
    return any(c.get("name") == column_name for c in cols)

async def init_db():
    # Import the models module to ensure ALL model classes are registered on Base.metadata
    # (importing any symbol from the module also registers the rest, but this is explicit).
    from . import models  # noqa: F401
    async with engine.begin() as conn:
        # Create missing tables (safe to call repeatedly)
        await conn.run_sync(Base.metadata.create_all)

    # Run best-effort schema evolution in a separate transaction so a handled
    # ALTER error cannot roll back create_all() work.
    async with engine.begin() as conn:
        if not await conn.run_sync(_column_exists, "paddocks", "crop_type"):
            try:
                await conn.exec_driver_sql("ALTER TABLE paddocks ADD COLUMN crop_type VARCHAR(100)")
            except Exception:
                pass
        if not await conn.run_sync(_column_exists, "paddocks", "crop_color"):
            try:
                await conn.exec_driver_sql("ALTER TABLE paddocks ADD COLUMN crop_color VARCHAR(16)")
            except Exception:
                pass
        if not await conn.run_sync(_column_exists, "observation_records", "images"):
            try:
                await conn.exec_driver_sql("ALTER TABLE observation_records ADD COLUMN images JSON")
            except Exception:
                pass
        if not await conn.run_sync(_column_exists, "mobs", "sheep_class"):
            try:
                await conn.exec_driver_sql("ALTER TABLE mobs ADD COLUMN sheep_class VARCHAR(40)")
            except Exception:
                pass
        if not await conn.run_sync(_column_exists, "mobs", "year_group"):
            try:
                await conn.exec_driver_sql("ALTER TABLE mobs ADD COLUMN year_group INTEGER")
            except Exception:
                pass
        if not await conn.run_sync(_column_exists, "mobs", "sheep_tags"):
            try:
                await conn.exec_driver_sql("ALTER TABLE mobs ADD COLUMN sheep_tags JSON")
            except Exception:
                pass
        try:
            await conn.exec_driver_sql("UPDATE observation_records SET images = '[]' WHERE images IS NULL")
        except Exception:
            pass
        try:
            await conn.exec_driver_sql("UPDATE mobs SET sheep_tags = '[]' WHERE sheep_tags IS NULL")
        except Exception:
            pass
        # Backfill multi-field allocations from legacy single paddock assignment.
        try:
            await conn.exec_driver_sql(
                "INSERT INTO mob_field_allocations (mob_id, paddock_id, assigned_at, notes) "
                "SELECT m.id, m.paddock_id, CURRENT_TIMESTAMP, 'backfill from mobs.paddock_id' "
                "FROM mobs m "
                "LEFT JOIN mob_field_allocations a ON a.mob_id = m.id AND a.paddock_id = m.paddock_id "
                "WHERE m.paddock_id IS NOT NULL AND a.id IS NULL"
            )
        except Exception:
            pass

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    # Lazy import to avoid circulars
    from .models import Paddock, Mob, Movement, Sensor
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Best-effort evolve: add new paddock columns if the DB already existed
        try:
            await conn.exec_driver_sql("ALTER TABLE paddocks ADD COLUMN crop_type VARCHAR(100)")
        except Exception:
            pass
        try:
            await conn.exec_driver_sql("ALTER TABLE paddocks ADD COLUMN crop_color VARCHAR(16)")
        except Exception:
            pass

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

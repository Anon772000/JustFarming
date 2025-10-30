from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.db import SessionLocal

async def _get_session():
    async with SessionLocal() as session:
        yield session

get_session = Annotated[AsyncSession, Depends(_get_session)]

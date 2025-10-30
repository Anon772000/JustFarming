from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Mob
from ...core.schemas import MobCreate, MobOut

router = APIRouter()

@router.get("/", response_model=list[MobOut])
async def list_mobs(session = get_session):
    result = await session.execute(select(Mob))
    return [m for m in result.scalars().all()]

@router.post("/", response_model=MobOut)
async def create_mob(data: MobCreate, session = get_session):
    m = Mob(name=data.name, count=data.count, avg_weight=data.avg_weight, paddock_id=data.paddock_id)
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return m

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Paddock
from ...core.schemas import PaddockCreate, PaddockOut

router = APIRouter()

@router.get("/", response_model=list[PaddockOut])
async def list_paddocks(session: get_session):
    result = await session.execute(select(Paddock))
    return [p for p in result.scalars().all()]

@router.post("/", response_model=PaddockOut)
async def create_paddock(data: PaddockCreate, session: get_session):
    p = Paddock(name=data.name, area_ha=data.area_ha, polygon_geojson=data.polygon_geojson)
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return p

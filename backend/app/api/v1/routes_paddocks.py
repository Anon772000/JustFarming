from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Paddock
from ...core.schemas import PaddockCreate, PaddockOut, PaddockUpdate

router = APIRouter()

@router.get("/", response_model=list[PaddockOut])
async def list_paddocks(session: get_session):
    result = await session.execute(select(Paddock))
    return [p for p in result.scalars().all()]

@router.post("/", response_model=PaddockOut)
async def create_paddock(data: PaddockCreate, session: get_session):
    p = Paddock(
        name=data.name,
        area_ha=data.area_ha,
        polygon_geojson=data.polygon_geojson,
        crop_type=data.crop_type,
        crop_color=data.crop_color,
    )
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return p

@router.patch("/{paddock_id}", response_model=PaddockOut)
async def update_paddock(paddock_id: int, data: PaddockUpdate, session: get_session):
    p = await session.get(Paddock, paddock_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paddock not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(p, field, value)
    await session.commit()
    await session.refresh(p)
    return p

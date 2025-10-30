from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Movement
from ...core.schemas import MovementCreate, MovementOut

router = APIRouter()

@router.get("/", response_model=list[MovementOut])
async def list_movements(session = get_session):
    result = await session.execute(select(Movement))
    return [mv for mv in result.scalars().all()]

@router.post("/", response_model=MovementOut)
async def create_movement(data: MovementCreate, session = get_session):
    mv = Movement(mob_id=data.mob_id, from_paddock_id=data.from_paddock_id, to_paddock_id=data.to_paddock_id)
    session.add(mv)
    await session.commit()
    await session.refresh(mv)
    return mv

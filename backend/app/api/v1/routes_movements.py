from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Movement, Mob, Paddock
from ...core.schemas import MovementCreate, MovementOut

router = APIRouter()

@router.get("/", response_model=list[MovementOut])
async def list_movements(session: get_session):
    result = await session.execute(select(Movement))
    return [mv for mv in result.scalars().all()]

@router.post("/", response_model=MovementOut)
async def create_movement(data: MovementCreate, session: get_session):
    mv = Movement(mob_id=data.mob_id, from_paddock_id=data.from_paddock_id, to_paddock_id=data.to_paddock_id)
    session.add(mv)
    # also update the mob's paddock assignment
    mob = await session.get(Mob, data.mob_id)
    if not mob:
        raise HTTPException(404, "Mob not found")
    # Optionally validate target paddock exists
    if data.to_paddock_id is not None:
        if not await session.get(Paddock, data.to_paddock_id):
            raise HTTPException(404, "Target paddock not found")
    mob.paddock_id = data.to_paddock_id
    await session.commit()
    await session.refresh(mv)
    return mv

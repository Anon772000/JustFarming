from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import Sensor
from ...core.schemas import SensorCreate, SensorUpdateValue, SensorOut
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=list[SensorOut])
async def list_sensors(session: get_session):
    result = await session.execute(select(Sensor))
    return [s for s in result.scalars().all()]

@router.post("/", response_model=SensorOut)
async def create_sensor(data: SensorCreate, session: get_session):
    s = Sensor(name=data.name, type=data.type, paddock_id=data.paddock_id)
    session.add(s)
    await session.commit()
    await session.refresh(s)
    return s

@router.post("/{sensor_id}/value", response_model=SensorOut)
async def update_sensor_value(sensor_id: int, data: SensorUpdateValue, session: get_session):
    s = await session.get(Sensor, sensor_id)
    if not s:
        raise HTTPException(404, "Sensor not found")
    s.last_value = data.last_value
    s.last_seen = data.last_seen or datetime.utcnow()
    await session.commit()
    await session.refresh(s)
    return s

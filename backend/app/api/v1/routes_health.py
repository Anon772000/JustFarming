from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import WormingRecord, FootbathRecord
from ...core.schemas import (
    WormingRecordCreate, WormingRecordOut,
    FootbathRecordCreate, FootbathRecordOut,
)

router = APIRouter()

@router.get("/worming", response_model=list[WormingRecordOut])
async def list_worming(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(WormingRecord)
    if mob_id is not None:
        stmt = stmt.where(WormingRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/worming", response_model=WormingRecordOut)
async def create_worming(data: WormingRecordCreate, session: get_session):
    rec = WormingRecord(mob_id=data.mob_id, date=data.date, drug=data.drug, worm_count=data.worm_count, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.get("/footbath", response_model=list[FootbathRecordOut])
async def list_footbath(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(FootbathRecord)
    if mob_id is not None:
        stmt = stmt.where(FootbathRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/footbath", response_model=FootbathRecordOut)
async def create_footbath(data: FootbathRecordCreate, session: get_session):
    rec = FootbathRecord(mob_id=data.mob_id, date=data.date, solution=data.solution, concentration=data.concentration, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec


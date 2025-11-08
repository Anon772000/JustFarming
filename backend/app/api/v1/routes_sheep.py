from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from datetime import timedelta, datetime
from ..v1_deps import get_session
from ...core.models import (
    Ram, JoiningRecord, MarkingRecord, WeaningRecord, FlyTreatmentRecord, FootParingRecord
)
from ...core.schemas import (
    RamCreate, RamOut,
    JoiningRecordCreate, JoiningRecordOut,
    MarkingRecordCreate, MarkingRecordOut,
    WeaningRecordCreate, WeaningRecordOut,
    FlyTreatmentRecordCreate, FlyTreatmentRecordOut,
    FootParingRecordCreate, FootParingRecordOut,
)

router = APIRouter()

# Rams
@router.get("/rams", response_model=list[RamOut])
async def list_rams(session: get_session):
    result = await session.execute(select(Ram))
    return [r for r in result.scalars().all()]

@router.post("/rams", response_model=RamOut)
async def create_ram(data: RamCreate, session: get_session):
    r = Ram(name=data.name, tag_id=data.tag_id, notes=data.notes)
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return r

# Joining
@router.get("/joining", response_model=list[JoiningRecordOut])
async def list_joining(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(JoiningRecord)
    if mob_id is not None:
        stmt = stmt.where(JoiningRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/joining", response_model=JoiningRecordOut)
async def create_joining(data: JoiningRecordCreate, session: get_session):
    start = data.start_date or datetime.utcnow()
    due = data.due_date
    if not due:
        # Sheep gestation ~147 days
        due = start + timedelta(days=147)
    rec = JoiningRecord(
        mob_id=data.mob_id,
        ram_id=data.ram_id,
        start_date=start,
        end_date=data.end_date,
        due_date=due,
        notes=data.notes,
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

# Marking
@router.get("/marking", response_model=list[MarkingRecordOut])
async def list_marking(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(MarkingRecord)
    if mob_id is not None:
        stmt = stmt.where(MarkingRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/marking", response_model=MarkingRecordOut)
async def create_marking(data: MarkingRecordCreate, session: get_session):
    rec = MarkingRecord(mob_id=data.mob_id, date=data.date, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

# Weaning
@router.get("/weaning", response_model=list[WeaningRecordOut])
async def list_weaning(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(WeaningRecord)
    if mob_id is not None:
        stmt = stmt.where(WeaningRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/weaning", response_model=WeaningRecordOut)
async def create_weaning(data: WeaningRecordCreate, session: get_session):
    rec = WeaningRecord(mob_id=data.mob_id, date=data.date, weaned_count=data.weaned_count, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

# Fly treatment
@router.get("/fly_treatment", response_model=list[FlyTreatmentRecordOut])
async def list_fly_treatment(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(FlyTreatmentRecord)
    if mob_id is not None:
        stmt = stmt.where(FlyTreatmentRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/fly_treatment", response_model=FlyTreatmentRecordOut)
async def create_fly_treatment(data: FlyTreatmentRecordCreate, session: get_session):
    rec = FlyTreatmentRecord(mob_id=data.mob_id, date=data.date, chemical=data.chemical, rate=data.rate, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

# Foot paring
@router.get("/foot_paring", response_model=list[FootParingRecordOut])
async def list_foot_paring(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(FootParingRecord)
    if mob_id is not None:
        stmt = stmt.where(FootParingRecord.mob_id == mob_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/foot_paring", response_model=FootParingRecordOut)
async def create_foot_paring(data: FootParingRecordCreate, session: get_session):
    rec = FootParingRecord(mob_id=data.mob_id, date=data.date, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec


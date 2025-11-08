from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from datetime import timedelta, datetime
from ..v1_deps import get_session
from ...core.models import (
    Ram, JoiningRecord, MarkingRecord, WeaningRecord, FlyTreatmentRecord, FootParingRecord
)
from ...core.schemas import (
    RamCreate, RamOut, RamUpdate,
    JoiningRecordCreate, JoiningRecordOut, JoiningRecordUpdate,
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

@router.patch("/rams/{ram_id}", response_model=RamOut)
async def update_ram(ram_id: int, data: RamUpdate, session: get_session):
    r = await session.get(Ram, ram_id)
    if not r:
        raise HTTPException(status_code=404, detail="Ram not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(r, field, value)
    await session.commit()
    await session.refresh(r)
    return r

@router.delete("/rams/{ram_id}", status_code=204)
async def delete_ram(ram_id: int, session: get_session):
    r = await session.get(Ram, ram_id)
    if not r:
        raise HTTPException(status_code=404, detail="Ram not found")
    await session.delete(r)
    await session.commit()
    return None

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

@router.patch("/joining/{rec_id}", response_model=JoiningRecordOut)
async def update_joining(rec_id: int, data: JoiningRecordUpdate, session: get_session):
    # Reuse create schema but treat all fields as optional for patch
    rec = await session.get(JoiningRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Joining record not found")
    payload = data.dict(exclude_unset=True)
    # handle due date default if start changed and due not provided
    if 'start_date' in payload and 'due_date' not in payload and payload['start_date'] is not None:
        payload['due_date'] = (payload['start_date'] or rec.start_date) + timedelta(days=147)
    for field, value in payload.items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/joining/{rec_id}", status_code=204)
async def delete_joining(rec_id: int, session: get_session):
    rec = await session.get(JoiningRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Joining record not found")
    await session.delete(rec)
    await session.commit()
    return None

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

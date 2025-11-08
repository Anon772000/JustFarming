from fastapi import APIRouter, Query
from sqlalchemy import select
from ..v1_deps import get_session
from ...core.models import (
    SprayRecord, SowingRecord, FertiliserRecord, CutRecord, HarvestRecord
)
from ...core.schemas import (
    SprayRecordCreate, SprayRecordOut,
    SowingRecordCreate, SowingRecordOut,
    FertiliserRecordCreate, FertiliserRecordOut,
    CutRecordCreate, CutRecordOut,
    HarvestRecordCreate, HarvestRecordOut,
)

router = APIRouter()

@router.get("/spraying", response_model=list[SprayRecordOut])
async def list_spraying(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(SprayRecord)
    if paddock_id is not None:
        stmt = stmt.where(SprayRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/spraying", response_model=SprayRecordOut)
async def create_spraying(data: SprayRecordCreate, session: get_session):
    rec = SprayRecord(paddock_id=data.paddock_id, date=data.date, chemical=data.chemical, rate=data.rate, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.get("/sowing", response_model=list[SowingRecordOut])
async def list_sowing(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(SowingRecord)
    if paddock_id is not None:
        stmt = stmt.where(SowingRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/sowing", response_model=SowingRecordOut)
async def create_sowing(data: SowingRecordCreate, session: get_session):
    rec = SowingRecord(paddock_id=data.paddock_id, date=data.date, seed=data.seed, rate=data.rate, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.get("/fertiliser", response_model=list[FertiliserRecordOut])
async def list_fertiliser(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(FertiliserRecord)
    if paddock_id is not None:
        stmt = stmt.where(FertiliserRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/fertiliser", response_model=FertiliserRecordOut)
async def create_fertiliser(data: FertiliserRecordCreate, session: get_session):
    rec = FertiliserRecord(paddock_id=data.paddock_id, date=data.date, product=data.product, rate=data.rate, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.get("/cut", response_model=list[CutRecordOut])
async def list_cut(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(CutRecord)
    if paddock_id is not None:
        stmt = stmt.where(CutRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/cut", response_model=CutRecordOut)
async def create_cut(data: CutRecordCreate, session: get_session):
    rec = CutRecord(paddock_id=data.paddock_id, date=data.date, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.get("/harvest", response_model=list[HarvestRecordOut])
async def list_harvest(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(HarvestRecord)
    if paddock_id is not None:
        stmt = stmt.where(HarvestRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/harvest", response_model=HarvestRecordOut)
async def create_harvest(data: HarvestRecordCreate, session: get_session):
    rec = HarvestRecord(paddock_id=data.paddock_id, date=data.date, kind=data.kind, amount=data.amount, notes=data.notes)
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec


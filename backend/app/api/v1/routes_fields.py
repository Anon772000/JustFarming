from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Query, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from ..v1_deps import get_session
from ...core.models import (
    SprayRecord, SowingRecord, FertiliserRecord, CutRecord, HarvestRecord, ObservationRecord, Paddock
)
from ...core.schemas import (
    SprayRecordCreate, SprayRecordOut, SprayRecordUpdate,
    SowingRecordCreate, SowingRecordOut, SowingRecordUpdate,
    FertiliserRecordCreate, FertiliserRecordOut, FertiliserRecordUpdate,
    CutRecordCreate, CutRecordOut, CutRecordUpdate,
    HarvestRecordCreate, HarvestRecordOut, HarvestRecordUpdate,
    ObservationRecordCreate, ObservationRecordOut, ObservationRecordUpdate,
)

router = APIRouter()
OBSERVATION_UPLOAD_DIR = Path("uploads/observations")
OBSERVATION_MAX_IMAGE_BYTES = 10 * 1024 * 1024
OBSERVATION_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
OBSERVATION_IMAGE_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

def _clean_observation_images(images: list[str] | None) -> list[str]:
    if not images:
        return []
    cleaned: list[str] = []
    for img in images:
        if not isinstance(img, str):
            continue
        value = img.strip()
        if value:
            cleaned.append(value)
    return cleaned

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

@router.patch("/spraying/{rec_id}", response_model=SprayRecordOut)
async def update_spraying(rec_id: int, data: SprayRecordUpdate, session: get_session):
    rec = await session.get(SprayRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/spraying/{rec_id}", status_code=204)
async def delete_spraying(rec_id: int, session: get_session):
    rec = await session.get(SprayRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

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

@router.patch("/sowing/{rec_id}", response_model=SowingRecordOut)
async def update_sowing(rec_id: int, data: SowingRecordUpdate, session: get_session):
    rec = await session.get(SowingRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/sowing/{rec_id}", status_code=204)
async def delete_sowing(rec_id: int, session: get_session):
    rec = await session.get(SowingRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

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

@router.patch("/fertiliser/{rec_id}", response_model=FertiliserRecordOut)
async def update_fertiliser(rec_id: int, data: FertiliserRecordUpdate, session: get_session):
    rec = await session.get(FertiliserRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/fertiliser/{rec_id}", status_code=204)
async def delete_fertiliser(rec_id: int, session: get_session):
    rec = await session.get(FertiliserRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

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

@router.patch("/cut/{rec_id}", response_model=CutRecordOut)
async def update_cut(rec_id: int, data: CutRecordUpdate, session: get_session):
    rec = await session.get(CutRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/cut/{rec_id}", status_code=204)
async def delete_cut(rec_id: int, session: get_session):
    rec = await session.get(CutRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

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

@router.patch("/harvest/{rec_id}", response_model=HarvestRecordOut)
async def update_harvest(rec_id: int, data: HarvestRecordUpdate, session: get_session):
    rec = await session.get(HarvestRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(rec, field, value)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/harvest/{rec_id}", status_code=204)
async def delete_harvest(rec_id: int, session: get_session):
    rec = await session.get(HarvestRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

@router.get("/observation", response_model=list[ObservationRecordOut])
async def list_observation(paddock_id: int | None = Query(None), session: get_session = None):
    stmt = select(ObservationRecord)
    if paddock_id is not None:
        stmt = stmt.where(ObservationRecord.paddock_id == paddock_id)
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/observation", response_model=ObservationRecordOut)
async def create_observation(data: ObservationRecordCreate, session: get_session):
    if not await session.get(Paddock, data.paddock_id):
        raise HTTPException(status_code=404, detail="Paddock not found")
    rec = ObservationRecord(
        paddock_id=data.paddock_id,
        notes=data.notes,
        images=_clean_observation_images(data.images),
    )
    if data.date is not None:
        rec.date = data.date
    session.add(rec)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Invalid observation payload")
    await session.refresh(rec)
    return rec

@router.patch("/observation/{rec_id}", response_model=ObservationRecordOut)
async def update_observation(rec_id: int, data: ObservationRecordUpdate, session: get_session):
    rec = await session.get(ObservationRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    payload = data.dict(exclude_unset=True)
    if payload.get("paddock_id") is not None and not await session.get(Paddock, payload["paddock_id"]):
        raise HTTPException(status_code=404, detail="Paddock not found")
    for field, value in payload.items():
        if field in {"date", "notes"} and value is None:
            continue
        if field == "images":
            if value is None:
                continue
            setattr(rec, field, _clean_observation_images(value))
            continue
        setattr(rec, field, value)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Invalid observation payload")
    await session.refresh(rec)
    return rec

@router.delete("/observation/{rec_id}", status_code=204)
async def delete_observation(rec_id: int, session: get_session):
    rec = await session.get(ObservationRecord, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    await session.delete(rec)
    await session.commit()
    return None

@router.post("/observation/images")
async def upload_observation_image(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    mime = (file.content_type or "").lower()
    ext = OBSERVATION_IMAGE_MIME_TO_EXT.get(mime)
    if ext is None and suffix in OBSERVATION_IMAGE_EXTENSIONS:
        ext = ".jpg" if suffix == ".jpeg" else suffix
    if ext is None:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(payload) > OBSERVATION_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    OBSERVATION_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}{ext}"
    dest = OBSERVATION_UPLOAD_DIR / stored_name
    dest.write_bytes(payload)
    return {"url": f"/api/uploads/observations/{stored_name}"}

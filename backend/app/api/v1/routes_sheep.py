from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from sqlalchemy import select
from datetime import timedelta, datetime
from ..v1_deps import get_session
from ...core.models import (
    Ram,
    JoiningRecord,
    MarkingRecord,
    WeaningRecord,
    FlyTreatmentRecord,
    FootParingRecord,
    SheepDailyLog,
    SheepMobEvent,
    Mob,
    Paddock,
    MobFieldAllocation,
)
from ...core.schemas import (
    RamCreate, RamOut, RamUpdate,
    JoiningRecordCreate, JoiningRecordOut, JoiningRecordUpdate,
    MarkingRecordCreate, MarkingRecordOut,
    WeaningRecordCreate, WeaningRecordOut,
    FlyTreatmentRecordCreate, FlyTreatmentRecordOut,
    FootParingRecordCreate, FootParingRecordOut,
    SheepDailyLogCreate, SheepDailyLogOut, SheepDailyLogUpdate,
    SheepMobEventCreate, SheepMobEventOut, SheepMobEventUpdate,
    SheepJoinFromMobCreate,
)

router = APIRouter()
DAILY_LOG_UPLOAD_DIR = Path("uploads/sheep-daily")
DAILY_LOG_MAX_IMAGE_BYTES = 10 * 1024 * 1024
DAILY_LOG_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
DAILY_LOG_IMAGE_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
MOB_EVENT_UPLOAD_DIR = Path("uploads/sheep-events")
MOB_EVENT_ALLOWED_TYPES = {
    "joining",
    "lambing",
    "lamb_marking",
    "tagging",
    "year_update",
    "misc",
}

def _clean_images(images: list[str] | None) -> list[str]:
    if not images:
        return []
    out: list[str] = []
    for image in images:
        if not isinstance(image, str):
            continue
        value = image.strip()
        if value:
            out.append(value)
    return out

def _clean_paddock_ids(paddock_ids: list[int] | None) -> list[int]:
    if not paddock_ids:
        return []
    out: list[int] = []
    seen: set[int] = set()
    for pid in paddock_ids:
        if not isinstance(pid, int):
            continue
        if pid <= 0:
            continue
        if pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out

async def _validate_paddocks(session, paddock_ids: list[int]):
    if not paddock_ids:
        return
    result = await session.execute(select(Paddock.id).where(Paddock.id.in_(paddock_ids)))
    found = {row[0] for row in result.all()}
    missing = [pid for pid in paddock_ids if pid not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"Paddock not found: {missing[0]}")

def _clean_event_type(value: str) -> str:
    event_type = (value or "").strip().lower()
    if event_type not in MOB_EVENT_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported event type: {value}")
    return event_type

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

# Daily sheep checks / notes
@router.get("/daily_logs", response_model=list[SheepDailyLogOut])
async def list_daily_logs(mob_id: int | None = Query(None), session: get_session = None):
    stmt = select(SheepDailyLog)
    if mob_id is not None:
        stmt = stmt.where(SheepDailyLog.mob_id == mob_id)
    stmt = stmt.order_by(SheepDailyLog.date.desc(), SheepDailyLog.id.desc())
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/daily_logs", response_model=SheepDailyLogOut)
async def create_daily_log(data: SheepDailyLogCreate, session: get_session):
    mob = await session.get(Mob, data.mob_id)
    if not mob:
        raise HTTPException(status_code=404, detail="Mob not found")

    paddock_ids = _clean_paddock_ids(data.paddock_ids)
    if not paddock_ids:
        alloc = await session.execute(
            select(MobFieldAllocation.paddock_id).where(MobFieldAllocation.mob_id == data.mob_id)
        )
        paddock_ids = _clean_paddock_ids([row[0] for row in alloc.all()])
    if not paddock_ids and mob.paddock_id is not None:
        paddock_ids = [mob.paddock_id]
    await _validate_paddocks(session, paddock_ids)

    rec = SheepDailyLog(
        mob_id=data.mob_id,
        date=data.date or datetime.utcnow(),
        paddock_ids=paddock_ids,
        water_checked=bool(data.water_checked),
        feed_checked=bool(data.feed_checked),
        deaths_count=max(0, int(data.deaths_count or 0)),
        death_cause=(data.death_cause.strip() if isinstance(data.death_cause, str) else None) or None,
        notes=(data.notes.strip() if isinstance(data.notes, str) else None) or None,
        images=_clean_images(data.images),
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.patch("/daily_logs/{rec_id}", response_model=SheepDailyLogOut)
async def update_daily_log(rec_id: int, data: SheepDailyLogUpdate, session: get_session):
    rec = await session.get(SheepDailyLog, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Daily log not found")

    payload = data.dict(exclude_unset=True)
    if "date" in payload:
        rec.date = payload["date"]
    if "paddock_ids" in payload:
        cleaned = _clean_paddock_ids(payload["paddock_ids"])
        await _validate_paddocks(session, cleaned)
        rec.paddock_ids = cleaned
    if "water_checked" in payload:
        rec.water_checked = bool(payload["water_checked"])
    if "feed_checked" in payload:
        rec.feed_checked = bool(payload["feed_checked"])
    if "deaths_count" in payload:
        rec.deaths_count = max(0, int(payload["deaths_count"] or 0))
    if "death_cause" in payload:
        rec.death_cause = (payload["death_cause"].strip() if isinstance(payload["death_cause"], str) else None) or None
    if "notes" in payload:
        rec.notes = (payload["notes"].strip() if isinstance(payload["notes"], str) else None) or None
    if "images" in payload:
        rec.images = _clean_images(payload["images"])

    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/daily_logs/{rec_id}", status_code=204)
async def delete_daily_log(rec_id: int, session: get_session):
    rec = await session.get(SheepDailyLog, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Daily log not found")
    await session.delete(rec)
    await session.commit()
    return None

@router.post("/daily_logs/images")
async def upload_daily_log_image(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    mime = (file.content_type or "").lower()
    ext = DAILY_LOG_IMAGE_MIME_TO_EXT.get(mime)
    if ext is None and suffix in DAILY_LOG_IMAGE_EXTENSIONS:
        ext = ".jpg" if suffix == ".jpeg" else suffix
    if ext is None:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(payload) > DAILY_LOG_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    DAILY_LOG_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}{ext}"
    destination = DAILY_LOG_UPLOAD_DIR / stored_name
    destination.write_bytes(payload)
    return {"url": f"/api/uploads/sheep-daily/{stored_name}"}

# Sheep event timeline (joining/lambing/marking/tags/year/misc)
@router.get("/mob_events", response_model=list[SheepMobEventOut])
async def list_mob_events(
    mob_id: int | None = Query(None),
    event_type: str | None = Query(None),
    session: get_session = None,
):
    stmt = select(SheepMobEvent)
    if mob_id is not None:
        stmt = stmt.where(SheepMobEvent.mob_id == mob_id)
    if event_type:
        stmt = stmt.where(SheepMobEvent.event_type == event_type.strip().lower())
    stmt = stmt.order_by(SheepMobEvent.date.desc(), SheepMobEvent.id.desc())
    result = await session.execute(stmt)
    return [r for r in result.scalars().all()]

@router.post("/mob_events", response_model=SheepMobEventOut)
async def create_mob_event(data: SheepMobEventCreate, session: get_session):
    mob = await session.get(Mob, data.mob_id)
    if not mob:
        raise HTTPException(status_code=404, detail="Mob not found")
    if data.related_mob_id is not None and not await session.get(Mob, data.related_mob_id):
        raise HTTPException(status_code=404, detail="Related mob not found")

    event_type = _clean_event_type(data.event_type)
    rec = SheepMobEvent(
        mob_id=data.mob_id,
        event_type=event_type,
        date=data.date or datetime.utcnow(),
        related_mob_id=data.related_mob_id,
        count=(max(0, int(data.count)) if data.count is not None else None),
        value=(data.value.strip() if isinstance(data.value, str) and data.value.strip() else None),
        notes=(data.notes.strip() if isinstance(data.notes, str) and data.notes.strip() else None),
        images=_clean_images(data.images),
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return rec

@router.patch("/mob_events/{rec_id}", response_model=SheepMobEventOut)
async def update_mob_event(rec_id: int, data: SheepMobEventUpdate, session: get_session):
    rec = await session.get(SheepMobEvent, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Sheep event not found")

    payload = data.dict(exclude_unset=True)
    if "date" in payload:
        rec.date = payload["date"]
    if "related_mob_id" in payload:
        related = payload["related_mob_id"]
        if related is not None and not await session.get(Mob, related):
            raise HTTPException(status_code=404, detail="Related mob not found")
        rec.related_mob_id = related
    if "count" in payload:
        rec.count = max(0, int(payload["count"])) if payload["count"] is not None else None
    if "value" in payload:
        rec.value = (payload["value"].strip() if isinstance(payload["value"], str) and payload["value"].strip() else None)
    if "notes" in payload:
        rec.notes = (payload["notes"].strip() if isinstance(payload["notes"], str) and payload["notes"].strip() else None)
    if "images" in payload:
        rec.images = _clean_images(payload["images"])

    await session.commit()
    await session.refresh(rec)
    return rec

@router.delete("/mob_events/{rec_id}", status_code=204)
async def delete_mob_event(rec_id: int, session: get_session):
    rec = await session.get(SheepMobEvent, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Sheep event not found")
    await session.delete(rec)
    await session.commit()
    return None

@router.post("/mob_events/images")
async def upload_mob_event_image(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    mime = (file.content_type or "").lower()
    ext = DAILY_LOG_IMAGE_MIME_TO_EXT.get(mime)
    if ext is None and suffix in DAILY_LOG_IMAGE_EXTENSIONS:
        ext = ".jpg" if suffix == ".jpeg" else suffix
    if ext is None:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(payload) > DAILY_LOG_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 10MB)")

    MOB_EVENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}{ext}"
    destination = MOB_EVENT_UPLOAD_DIR / stored_name
    destination.write_bytes(payload)
    return {"url": f"/api/uploads/sheep-events/{stored_name}"}

@router.post("/joining/from-mob", response_model=list[SheepMobEventOut])
async def create_joining_from_mob(data: SheepJoinFromMobCreate, session: get_session):
    source = await session.get(Mob, data.source_mob_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source mob not found")

    if data.apply_to_all:
        all_mobs = await session.execute(select(Mob.id))
        target_ids = [row[0] for row in all_mobs.all() if row[0] != data.source_mob_id]
    else:
        target_ids = [int(x) for x in data.target_mob_ids if int(x) != data.source_mob_id]

    # preserve order while deduping
    seen: set[int] = set()
    deduped: list[int] = []
    for mob_id in target_ids:
        if mob_id <= 0 or mob_id in seen:
            continue
        seen.add(mob_id)
        deduped.append(mob_id)
    target_ids = deduped

    if not target_ids:
        raise HTTPException(status_code=400, detail="No target mobs selected")

    # validate targets
    result = await session.execute(select(Mob.id).where(Mob.id.in_(target_ids)))
    found = {row[0] for row in result.all()}
    missing = [mob_id for mob_id in target_ids if mob_id not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"Target mob not found: {missing[0]}")

    created: list[SheepMobEvent] = []
    when = data.date or datetime.utcnow()
    for mob_id in target_ids:
        rec = SheepMobEvent(
            mob_id=mob_id,
            event_type="joining",
            date=when,
            related_mob_id=data.source_mob_id,
            notes=(data.notes.strip() if isinstance(data.notes, str) and data.notes.strip() else None),
            images=[],
        )
        session.add(rec)
        created.append(rec)

    await session.commit()
    for rec in created:
        await session.refresh(rec)
    return created

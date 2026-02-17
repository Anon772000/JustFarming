from fastapi import APIRouter, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError

from ..v1_deps import get_session
from ...core.models import Mob, Movement, Paddock, MobFieldAllocation
from ...core.schemas import (
    MobCreate,
    MobOut,
    MobUpdate,
    MobPaddockSet,
    MobPaddocksOut,
    MobCreateFromMobs,
)

router = APIRouter()

def _dedupe_paddock_ids(raw: list[int] | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    seen: set[int] = set()
    for pid in raw:
        if not isinstance(pid, int):
            continue
        if pid <= 0:
            continue
        if pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out

def _clean_tags(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        value = item.strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out

def _mob_to_out(mob: Mob, paddock_ids: list[int]) -> MobOut:
    resolved_ids = _dedupe_paddock_ids(paddock_ids)
    if not resolved_ids and mob.paddock_id is not None:
        resolved_ids = [mob.paddock_id]
    return MobOut(
        id=mob.id,
        name=mob.name,
        count=mob.count,
        avg_weight=mob.avg_weight,
        paddock_id=mob.paddock_id,
        paddock_ids=resolved_ids,
        sheep_class=mob.sheep_class,
        year_group=mob.year_group,
        sheep_tags=_clean_tags(mob.sheep_tags),
    )

async def _validate_paddocks_exist(session, paddock_ids: list[int]):
    if not paddock_ids:
        return
    result = await session.execute(select(Paddock.id).where(Paddock.id.in_(paddock_ids)))
    found = {row[0] for row in result.all()}
    missing = [pid for pid in paddock_ids if pid not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"Paddock not found: {missing[0]}")

async def _fetch_mob_paddock_ids(session, mob_ids: list[int]) -> dict[int, list[int]]:
    if not mob_ids:
        return {}
    result = await session.execute(
        select(MobFieldAllocation.mob_id, MobFieldAllocation.paddock_id).where(
            MobFieldAllocation.mob_id.in_(mob_ids)
        )
    )
    grouped: dict[int, list[int]] = {mid: [] for mid in mob_ids}
    for mob_id, paddock_id in result.all():
        grouped.setdefault(mob_id, [])
        if paddock_id not in grouped[mob_id]:
            grouped[mob_id].append(paddock_id)
    return grouped

@router.get("/", response_model=list[MobOut])
async def list_mobs(session: get_session):
    result = await session.execute(select(Mob))
    mobs = [m for m in result.scalars().all()]
    paddock_map = await _fetch_mob_paddock_ids(session, [m.id for m in mobs])
    return [_mob_to_out(m, paddock_map.get(m.id, [])) for m in mobs]

@router.post("/", response_model=MobOut)
async def create_mob(data: MobCreate, session: get_session):
    if data.paddock_id is not None and not await session.get(Paddock, data.paddock_id):
        raise HTTPException(status_code=404, detail="Paddock not found")

    m = Mob(
        name=data.name,
        count=data.count,
        avg_weight=data.avg_weight,
        paddock_id=data.paddock_id,
        sheep_class=(data.sheep_class.strip().lower() if isinstance(data.sheep_class, str) and data.sheep_class.strip() else None),
        year_group=data.year_group,
        sheep_tags=_clean_tags(data.sheep_tags),
    )
    session.add(m)
    await session.flush()

    paddock_ids: list[int] = []
    if data.paddock_id is not None:
        paddock_ids = [data.paddock_id]
        session.add(MobFieldAllocation(mob_id=m.id, paddock_id=data.paddock_id))
        session.add(Movement(mob_id=m.id, from_paddock_id=None, to_paddock_id=data.paddock_id))

    await session.commit()
    await session.refresh(m)
    return _mob_to_out(m, paddock_ids)

@router.patch("/{mob_id}", response_model=MobOut)
async def update_mob(mob_id: int, data: MobUpdate, session: get_session):
    m = await session.get(Mob, mob_id)
    if not m:
        raise HTTPException(404, "Mob not found")

    payload = data.dict(exclude_unset=True)
    previous_primary = m.paddock_id

    if "name" in payload:
        m.name = payload["name"]
    if "count" in payload:
        m.count = payload["count"]
    if "avg_weight" in payload:
        m.avg_weight = payload["avg_weight"]
    if "sheep_class" in payload:
        m.sheep_class = (payload["sheep_class"].strip().lower() if isinstance(payload["sheep_class"], str) and payload["sheep_class"].strip() else None)
    if "year_group" in payload:
        m.year_group = payload["year_group"]
    if "sheep_tags" in payload:
        m.sheep_tags = _clean_tags(payload["sheep_tags"])

    if "paddock_id" in payload:
        target = payload["paddock_id"]
        if target is not None and not await session.get(Paddock, target):
            raise HTTPException(status_code=404, detail="Paddock not found")
        await session.execute(delete(MobFieldAllocation).where(MobFieldAllocation.mob_id == m.id))
        if target is not None:
            session.add(MobFieldAllocation(mob_id=m.id, paddock_id=target))
            if previous_primary != target:
                session.add(Movement(mob_id=m.id, from_paddock_id=previous_primary, to_paddock_id=target))
        m.paddock_id = target

    await session.commit()
    await session.refresh(m)

    paddock_map = await _fetch_mob_paddock_ids(session, [m.id])
    return _mob_to_out(m, paddock_map.get(m.id, []))

@router.get("/{mob_id}/paddocks", response_model=MobPaddocksOut)
async def get_mob_paddocks(mob_id: int, session: get_session):
    mob = await session.get(Mob, mob_id)
    if not mob:
        raise HTTPException(status_code=404, detail="Mob not found")

    result = await session.execute(
        select(MobFieldAllocation.paddock_id).where(MobFieldAllocation.mob_id == mob_id)
    )
    paddock_ids = _dedupe_paddock_ids([row[0] for row in result.all()])
    if not paddock_ids and mob.paddock_id is not None:
        paddock_ids = [mob.paddock_id]
    return MobPaddocksOut(mob_id=mob_id, paddock_ids=paddock_ids)

@router.put("/{mob_id}/paddocks", response_model=MobOut)
async def set_mob_paddocks(mob_id: int, data: MobPaddockSet, session: get_session):
    mob = await session.get(Mob, mob_id)
    if not mob:
        raise HTTPException(status_code=404, detail="Mob not found")

    paddock_ids = _dedupe_paddock_ids(data.paddock_ids)
    await _validate_paddocks_exist(session, paddock_ids)

    result = await session.execute(
        select(MobFieldAllocation).where(MobFieldAllocation.mob_id == mob_id)
    )
    existing_rows = result.scalars().all()
    existing_ids = {r.paddock_id for r in existing_rows}

    desired_ids = set(paddock_ids)
    remove_ids = existing_ids - desired_ids
    add_ids = [pid for pid in paddock_ids if pid not in existing_ids]

    if remove_ids:
        await session.execute(
            delete(MobFieldAllocation).where(
                MobFieldAllocation.mob_id == mob_id,
                MobFieldAllocation.paddock_id.in_(list(remove_ids)),
            )
        )

    for pid in add_ids:
        session.add(MobFieldAllocation(mob_id=mob_id, paddock_id=pid, notes=data.notes))
        session.add(Movement(mob_id=mob_id, from_paddock_id=mob.paddock_id, to_paddock_id=pid))

    mob.paddock_id = paddock_ids[0] if paddock_ids else None

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Invalid paddock assignment")

    await session.refresh(mob)
    return _mob_to_out(mob, paddock_ids)

@router.post("/from-existing", response_model=MobOut)
async def create_mob_from_existing(data: MobCreateFromMobs, session: get_session):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="New mob name is required")

    if not data.parts:
        raise HTTPException(status_code=400, detail="At least one source mob is required")

    parts: list[tuple[int, int]] = []
    seen: set[int] = set()
    for part in data.parts:
        mob_id = int(part.mob_id)
        count = int(part.count)
        if mob_id in seen:
            raise HTTPException(status_code=400, detail="Duplicate source mob in parts")
        seen.add(mob_id)
        if count <= 0:
            raise HTTPException(status_code=400, detail="Split counts must be greater than zero")
        parts.append((mob_id, count))

    source_mobs: list[Mob] = []
    total_count = 0
    derived_weight_total = 0.0
    paddock_ids: list[int] = []
    for mob_id, count in parts:
        source = await session.get(Mob, mob_id)
        if not source:
            raise HTTPException(status_code=404, detail=f"Source mob not found: {mob_id}")
        if source.count < count:
            raise HTTPException(status_code=400, detail=f"Source mob {source.name} does not have enough head")
        source_mobs.append(source)
        total_count += count
        derived_weight_total += source.avg_weight * count
        if source.paddock_id is not None and source.paddock_id not in paddock_ids:
            paddock_ids.append(source.paddock_id)

    new_avg_weight = data.avg_weight if data.avg_weight is not None else (derived_weight_total / total_count if total_count > 0 else 0.0)
    new_primary_paddock = paddock_ids[0] if len(paddock_ids) == 1 else None

    new_mob = Mob(
        name=name,
        count=total_count,
        avg_weight=new_avg_weight,
        paddock_id=new_primary_paddock,
        sheep_class=(data.sheep_class.strip().lower() if isinstance(data.sheep_class, str) and data.sheep_class.strip() else None),
        year_group=data.year_group,
        sheep_tags=_clean_tags(data.sheep_tags),
    )
    session.add(new_mob)
    await session.flush()

    for source, (_, count) in zip(source_mobs, parts):
        source.count = max(source.count - count, 0)
        session.add(
            Movement(
                mob_id=source.id,
                from_paddock_id=source.paddock_id,
                to_paddock_id=source.paddock_id,
            )
        )

    for pid in paddock_ids:
        session.add(MobFieldAllocation(mob_id=new_mob.id, paddock_id=pid, notes="created from existing mobs"))

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Unable to create mob from existing mobs")

    await session.refresh(new_mob)
    return _mob_to_out(new_mob, paddock_ids)

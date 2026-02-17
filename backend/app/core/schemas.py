from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime

class PaddockCreate(BaseModel):
    name: str
    area_ha: float = 0.0
    polygon_geojson: str  # GeoJSON string
    crop_type: Optional[str] = None
    crop_color: Optional[str] = None

class PaddockOut(BaseModel):
    id: int
    name: str
    area_ha: float
    polygon_geojson: str
    crop_type: Optional[str] = None
    crop_color: Optional[str] = None
    class Config:
        from_attributes = True

class PaddockUpdate(BaseModel):
    name: Optional[str] = None
    area_ha: Optional[float] = None
    polygon_geojson: Optional[str] = None
    crop_type: Optional[str] = None
    crop_color: Optional[str] = None

class MobCreate(BaseModel):
    name: str
    count: int = 0
    avg_weight: float = 0.0
    paddock_id: Optional[int] = None
    sheep_class: Optional[str] = None
    year_group: Optional[int] = None
    sheep_tags: list[str] = Field(default_factory=list)

class MobOut(BaseModel):
    id: int
    name: str
    count: int
    avg_weight: float
    paddock_id: Optional[int] = None
    paddock_ids: list[int] = Field(default_factory=list)
    sheep_class: Optional[str] = None
    year_group: Optional[int] = None
    sheep_tags: list[str] = Field(default_factory=list)
    class Config:
        from_attributes = True

class MobUpdate(BaseModel):
    name: Optional[str] = None
    count: Optional[int] = None
    avg_weight: Optional[float] = None
    paddock_id: Optional[int] = None
    sheep_class: Optional[str] = None
    year_group: Optional[int] = None
    sheep_tags: Optional[list[str]] = None

class MobSplitItem(BaseModel):
    mob_id: int
    count: int

class MobCreateFromMobs(BaseModel):
    name: str
    avg_weight: Optional[float] = None
    sheep_class: Optional[str] = None
    year_group: Optional[int] = None
    sheep_tags: list[str] = Field(default_factory=list)
    parts: list[MobSplitItem] = Field(default_factory=list)

class MobPaddockSet(BaseModel):
    paddock_ids: list[int] = Field(default_factory=list)
    notes: Optional[str] = None

class MobPaddocksOut(BaseModel):
    mob_id: int
    paddock_ids: list[int] = Field(default_factory=list)

class MovementCreate(BaseModel):
    mob_id: int
    from_paddock_id: Optional[int] = None
    to_paddock_id: int

class MovementOut(BaseModel):
    id: int
    mob_id: int
    from_paddock_id: Optional[int] = None
    to_paddock_id: int
    timestamp: datetime
    class Config:
        from_attributes = True

class WormingRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    drug: str
    worm_count: Optional[int] = None
    notes: Optional[str] = None

class WormingRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    drug: str
    worm_count: Optional[int] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class FootbathRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    solution: str
    concentration: Optional[str] = None
    notes: Optional[str] = None

class FootbathRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    solution: str
    concentration: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class SensorCreate(BaseModel):
    name: str
    type: str
    paddock_id: Optional[int] = None

class SensorUpdateValue(BaseModel):
    last_value: Any
    last_seen: Optional[datetime] = None

class SensorOut(BaseModel):
    id: int
    name: str
    type: str
    paddock_id: Optional[int] = None
    last_value: Optional[Any] = None
    last_seen: Optional[datetime] = None
    class Config:
        from_attributes = True

# Sheep-related
class RamCreate(BaseModel):
    name: str
    tag_id: Optional[str] = None
    notes: Optional[str] = None

class RamOut(BaseModel):
    id: int
    name: str
    tag_id: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class RamUpdate(BaseModel):
    name: Optional[str] = None
    tag_id: Optional[str] = None
    notes: Optional[str] = None

class JoiningRecordCreate(BaseModel):
    mob_id: int
    ram_id: int
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class JoiningRecordOut(BaseModel):
    id: int
    mob_id: int
    ram_id: int
    start_date: datetime
    end_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class JoiningRecordUpdate(BaseModel):
    mob_id: Optional[int] = None
    ram_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None

class MarkingRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    notes: Optional[str] = None

class MarkingRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class WeaningRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    weaned_count: Optional[int] = None
    notes: Optional[str] = None

class WeaningRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    weaned_count: Optional[int] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class FlyTreatmentRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    chemical: str
    rate: Optional[str] = None
    notes: Optional[str] = None

class FlyTreatmentRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    chemical: str
    rate: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class FootParingRecordCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    notes: Optional[str] = None

class FootParingRecordOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    notes: Optional[str] = None
    class Config:
        from_attributes = True

# Field / crop operations
class SprayRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    chemical: str
    rate: Optional[str] = None
    notes: Optional[str] = None

class SprayRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    chemical: str
    rate: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class SprayRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    chemical: Optional[str] = None
    rate: Optional[str] = None
    notes: Optional[str] = None

class SowingRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    seed: str
    rate: Optional[str] = None
    notes: Optional[str] = None

class SowingRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    seed: str
    rate: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class SowingRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    seed: Optional[str] = None
    rate: Optional[str] = None
    notes: Optional[str] = None

class FertiliserRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    product: str
    rate: Optional[str] = None
    notes: Optional[str] = None

class FertiliserRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    product: str
    rate: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class FertiliserRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    product: Optional[str] = None
    rate: Optional[str] = None
    notes: Optional[str] = None

class CutRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    notes: Optional[str] = None

class CutRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class CutRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    notes: Optional[str] = None

class HarvestRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    kind: str
    amount: Optional[str] = None
    notes: Optional[str] = None

class HarvestRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    kind: str
    amount: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class HarvestRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    kind: Optional[str] = None
    amount: Optional[str] = None
    notes: Optional[str] = None

class ObservationRecordCreate(BaseModel):
    paddock_id: int
    date: Optional[datetime] = None
    notes: str
    images: list[str] = Field(default_factory=list)

class ObservationRecordOut(BaseModel):
    id: int
    paddock_id: int
    date: datetime
    notes: str
    images: Optional[list[str]] = Field(default_factory=list)
    class Config:
        from_attributes = True

class ObservationRecordUpdate(BaseModel):
    paddock_id: Optional[int] = None
    date: Optional[datetime] = None
    notes: Optional[str] = None
    images: Optional[list[str]] = None

class SheepDailyLogCreate(BaseModel):
    mob_id: int
    date: Optional[datetime] = None
    paddock_ids: list[int] = Field(default_factory=list)
    water_checked: bool = True
    feed_checked: bool = True
    deaths_count: int = 0
    death_cause: Optional[str] = None
    notes: Optional[str] = None
    images: list[str] = Field(default_factory=list)

class SheepDailyLogOut(BaseModel):
    id: int
    mob_id: int
    date: datetime
    paddock_ids: list[int] = Field(default_factory=list)
    water_checked: bool
    feed_checked: bool
    deaths_count: int
    death_cause: Optional[str] = None
    notes: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    class Config:
        from_attributes = True

class SheepDailyLogUpdate(BaseModel):
    date: Optional[datetime] = None
    paddock_ids: Optional[list[int]] = None
    water_checked: Optional[bool] = None
    feed_checked: Optional[bool] = None
    deaths_count: Optional[int] = None
    death_cause: Optional[str] = None
    notes: Optional[str] = None
    images: Optional[list[str]] = None

class SheepMobEventCreate(BaseModel):
    mob_id: int
    event_type: str
    date: Optional[datetime] = None
    related_mob_id: Optional[int] = None
    count: Optional[int] = None
    value: Optional[str] = None
    notes: Optional[str] = None
    images: list[str] = Field(default_factory=list)

class SheepMobEventOut(BaseModel):
    id: int
    mob_id: int
    event_type: str
    date: datetime
    related_mob_id: Optional[int] = None
    count: Optional[int] = None
    value: Optional[str] = None
    notes: Optional[str] = None
    images: list[str] = Field(default_factory=list)
    class Config:
        from_attributes = True

class SheepMobEventUpdate(BaseModel):
    date: Optional[datetime] = None
    related_mob_id: Optional[int] = None
    count: Optional[int] = None
    value: Optional[str] = None
    notes: Optional[str] = None
    images: Optional[list[str]] = None

class SheepJoinFromMobCreate(BaseModel):
    source_mob_id: int
    target_mob_ids: list[int] = Field(default_factory=list)
    apply_to_all: bool = False
    date: Optional[datetime] = None
    notes: Optional[str] = None

from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime

class PaddockCreate(BaseModel):
    name: str
    area_ha: float = 0.0
    polygon_geojson: str  # GeoJSON string

class PaddockOut(BaseModel):
    id: int
    name: str
    area_ha: float
    polygon_geojson: str
    class Config:
        from_attributes = True

class MobCreate(BaseModel):
    name: str
    count: int = 0
    avg_weight: float = 0.0
    paddock_id: Optional[int] = None

class MobOut(BaseModel):
    id: int
    name: str
    count: int
    avg_weight: float
    paddock_id: Optional[int] = None
    class Config:
        from_attributes = True

class MobUpdate(BaseModel):
    name: Optional[str] = None
    count: Optional[int] = None
    avg_weight: Optional[float] = None
    paddock_id: Optional[int] = None

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

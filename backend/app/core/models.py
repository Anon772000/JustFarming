from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, ForeignKey, DateTime, Text, JSON
from .db import Base
from datetime import datetime

class Paddock(Base):
    __tablename__ = "paddocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    area_ha: Mapped[float] = mapped_column(default=0.0)
    polygon_geojson: Mapped[str] = mapped_column(Text)  # store polygon as GeoJSON text
    crop_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    crop_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    mobs: Mapped[list["Mob"]] = relationship(back_populates="paddock", cascade="all,delete")

class Mob(Base):
    __tablename__ = "mobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    avg_weight: Mapped[float] = mapped_column(default=0.0)
    paddock_id: Mapped[int | None] = mapped_column(ForeignKey("paddocks.id"), nullable=True)
    paddock: Mapped[Paddock | None] = relationship(back_populates="mobs")

class Movement(Base):
    __tablename__ = "movements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    from_paddock_id: Mapped[int | None] = mapped_column(ForeignKey("paddocks.id"), nullable=True)
    to_paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Sensor(Base):
    __tablename__ = "sensors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    type: Mapped[str] = mapped_column(String(50))
    paddock_id: Mapped[int | None] = mapped_column(ForeignKey("paddocks.id"), nullable=True)
    last_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class WormingRecord(Base):
    __tablename__ = "worming_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    drug: Mapped[str] = mapped_column(String(100))
    worm_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class FootbathRecord(Base):
    __tablename__ = "footbath_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    solution: Mapped[str] = mapped_column(String(100))
    concentration: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

# Sheep-specific entities
class Ram(Base):
    __tablename__ = "rams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    tag_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class JoiningRecord(Base):
    __tablename__ = "joining_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    ram_id: Mapped[int] = mapped_column(ForeignKey("rams.id"))
    start_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class MarkingRecord(Base):
    __tablename__ = "marking_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class WeaningRecord(Base):
    __tablename__ = "weaning_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    weaned_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class FlyTreatmentRecord(Base):
    __tablename__ = "fly_treatment_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    chemical: Mapped[str] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class FootParingRecord(Base):
    __tablename__ = "foot_paring_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    mob_id: Mapped[int] = mapped_column(ForeignKey("mobs.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

# Field / crop operations
class SprayRecord(Base):
    __tablename__ = "spray_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    chemical: Mapped[str] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class SowingRecord(Base):
    __tablename__ = "sowing_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    seed: Mapped[str] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class FertiliserRecord(Base):
    __tablename__ = "fertiliser_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    product: Mapped[str] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class CutRecord(Base):
    __tablename__ = "cut_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class HarvestRecord(Base):
    __tablename__ = "harvest_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    kind: Mapped[str] = mapped_column(String(50))  # e.g., 'bale' or 'harvest'
    amount: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., '120 bales' or '3.2 t'
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

class ObservationRecord(Base):
    __tablename__ = "observation_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    paddock_id: Mapped[int] = mapped_column(ForeignKey("paddocks.id"))
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str] = mapped_column(Text)

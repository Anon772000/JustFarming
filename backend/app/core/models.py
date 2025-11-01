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

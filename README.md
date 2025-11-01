# JustFarming

A minimal, hackable livestock & paddock management app.

- Backend: FastAPI + SQLAlchemy (SQLite by default; optional Postgres)
- Frontend: React + Vite + TypeScript + React‑Leaflet
- MQTT: Mosquitto broker (optional) with a subscriber stub
- Mapping: Paddock polygons stored as GeoJSON and rendered on a Leaflet map

Goal: move fast on CRUD for paddocks, mobs, movements and sensors, with a simple map UI. Add PostGIS, auth, alerts, and analytics later as you grow.

---

## Development (no Docker)

### 1) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs at http://localhost:8000 (OpenAPI docs at /docs).

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at http://localhost:5173

The frontend expects the API at `http://localhost:8000` by default. To change it, create `frontend/.env` with:

```
VITE_API_BASE=http://your-backend-host:8000
```

Node 18 LTS or 20 is recommended for Vite 5.

---

## Docker (optional)

Requires Docker & Docker Compose.

```bash
docker compose up --build
```

Services:
- `backend`: FastAPI server on port 8000
- `frontend`: Static site served by nginx on port 80
- `db`: Postgres (optional; enable by setting `DATABASE_URL` accordingly)
- `mosquitto`: MQTT broker (optional)

---

## Environment

Already included:
- Root `.env` for Docker Compose (Postgres, MQTT)
- `backend/.env` for local dev (defaults to SQLite)

Key variables (backend):
- `DATABASE_URL` (default SQLite): `sqlite+aiosqlite:///./app.db`
- For Postgres: `postgresql+asyncpg://postgres:postgres@db:5432/justfarming`

---

## What's Included

### Backend
- CRUD: paddocks, mobs, movements, sensors
- GeoJSON polygon storage (plain text field for simplicity)
- MQTT subscriber stub (`app/mqtt/subscriber.py`) you can hook to Mosquitto
- CORS enabled for local dev

### Frontend
- React + TypeScript + Vite
- Map view with:
  - Paddock polygons
  - Mob markers (with basic popups)
- Simple forms to add paddocks & mobs
- KML import (UI: Import KML → choose `.kml` → Upload). After a successful upload, paddocks refresh automatically.

---

## Roadmap Ideas
- Switch to Postgres + PostGIS for true spatial queries
- Auth (JWT), roles, multi-farm tenancy
- Grazing planner + paddock rest analytics
- Alerts (SMS/Email/Discord) for sensor thresholds
- Offline-first PWA for field use
- Integration with LoRa/GPS tags, water/fence sensors

---

## License
MIT (for the scaffold). Replace with your preferred license for your project.

---

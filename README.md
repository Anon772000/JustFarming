# Farmdeck Open (Starter)

A minimal, hackable starter for a **livestock & paddock management** app:
- **Backend**: FastAPI + SQLAlchemy (SQLite by default; optionally Postgres)
- **Frontend**: React + Vite + TypeScript + React-Leaflet
- **MQTT**: Mosquitto broker (optional) with a subscriber stub in the backend
- **Mapping**: Store paddock polygons as GeoJSON; render on a Leaflet map

> Goal: get you moving fast on CRUD for paddocks, mobs, movements and sensors, with a map UI. 
> You can plug in PostGIS, authentication, alerts, analytics, etc., later.

---

## Quickstart (No Docker)

### 1) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # edit if needed
uvicorn app.main:app --reload
```
Back end runs at http://localhost:8000 (docs at /docs).

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
Front end runs at http://localhost:5173

> The frontend expects API at `http://localhost:8000`. Adjust `VITE_API_BASE` in `frontend/.env` if needed.

---

## With Docker (optional)
Requires Docker & Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```
Services:
- `backend`: FastAPI server
- `db`: Postgres (optional; switch BACKEND to use it by setting `DATABASE_URL` in `.env`)
- `mosquitto`: MQTT broker (optional)

---

## Environment

Copy `.env.example` to `.env` (both root and `backend/` have examples) and modify if needed.

Key variables (backend):
- `DATABASE_URL` (default SQLite): `sqlite+aiosqlite:///./app.db`
- For Postgres: `postgresql+asyncpg://postgres:postgres@db:5432/farmdeck`

---

## What’s Included

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

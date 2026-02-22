# AGENT.md

This file is the operating guide for engineers and coding agents working in this repository.

## Project Summary

- Name: `Croxton East`
- Purpose: farm management platform with API-first backend, React frontend, and offline sync support
- Stack:
  - Backend: Node.js + Express + TypeScript + Prisma + Postgres
  - Frontend: React + Vite + TypeScript + React Query
  - Infra: Docker Compose (`db`, `api`, `web`, optional `mosquitto`)

## Repository Layout

- `server/` backend API and Prisma schema
- `client/` web UI
- `docs/` architecture and endpoint docs
- `docker-compose.yml` local deployment

Primary references:
- `README.md`
- `docs/architecture.md`
- `docs/api-endpoints.md`
- `server/prisma/schema.prisma`

## Run and Build

### Docker (recommended)

1. Copy `.env.example` to `.env`.
2. Set required secrets:
   - `POSTGRES_PASSWORD`
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
3. Run:

```bash
docker compose up --build
```

Service URLs:
- API health (local on host): `http://127.0.0.1:4000/api/v1/health`
- API health (external via web): `https://<host>/api/v1/health`
- Web: `http://<host>/` (redirects to HTTPS) and `https://<host>/` (self-signed TLS by default)

Production TLS override (mounted certs, no self-signed fallback):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Local Development

Prerequisite:
- Node.js `20+`

Backend:

```bash
cd server
npm install
npm run dev
```

Frontend:

```bash
cd client
npm install
npm run dev
```

## Backend Rules

- Keep layering explicit:
  - routes: HTTP wiring only
  - controllers: request/response shape and validation handoff
  - services: business logic + DB calls
- Use Prisma models from `server/prisma/schema.prisma` as the source of truth.
- Keep API base path and contracts aligned with docs:
  - base path: `/api/v1`
  - health: `GET /health` -> `{ ok: true, service: "croxton-east-api" }`
- Keep API responses consistent with documented conventions:
  - list: `{ data: T[] }`
  - single: `{ data: T }`
  - delete: `204 No Content`
  - errors: `{ error: string, detail?: string }`
- Scope data by farm where applicable (`farmId`) and preserve auth boundaries.

### Implemented Coverage (Current Baseline)

- Auth: login/refresh/logout + logout-others + session list/revoke
- Users: me + manager user CRUD + audit (admin + auth/session + API mutation events) + per-user session management
- CRUD resources currently implemented end-to-end:
  - `mobs`
  - `paddocks`
  - `crop-seasons`
  - `paddock-plans`
  - `mob-movement-plans`
  - `mob-paddock-allocations`
  - `production-plans`
  - `water-assets`
  - `water-links`
  - `lora-nodes`
  - `sensors`
  - `feeders`
  - `hay-lots`
  - `grain-lots`
  - `feed-events`
  - `issues`
  - `tasks`
  - `contractors`
  - `pest-spottings`
  - `attachments`
  - `activity-events`
- Sensor readings: list/get
- Map: summary + water-network + alerts
- Sync: changes + batch
- LoRa ingest: `POST /lora/ingest`

## Frontend Rules

- Use React Query for server-state data access.
- Keep feature logic in `client/src/features/*` when adding new domains.
- Prefer typed API interactions and shared TypeScript types.
- Keep UI flows resilient for intermittent connectivity (offline queue/sync exists in `client/src/offline/*`).

## Data and Migration Safety

- Do not hand-edit production DB schema directly.
- Update Prisma schema first, then generate/apply migrations.
- Primary keys are UUIDs; preserve UUID-based create/update flows.
- Preserve soft-delete semantics (`deletedAt`) where used.
- Preserve polymorphic attachment linkage (`entityType`, `entityId`).
- Preserve sync safety tables/flows (`SyncChange`, `SyncTombstone`) for offline consistency.

Typical Prisma workflow:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate
npm run prisma:migrate:deploy
```

## Security and Access

- Do not commit secrets.
- Keep JWT and auth behavior aligned with existing auth module.
- Self-registration is disabled; bootstrap manager users via:

```bash
docker exec \
  -e BOOTSTRAP_EMAIL=admin@example.com \
  -e BOOTSTRAP_PASSWORD=password123 \
  -e BOOTSTRAP_DISPLAY_NAME=Admin \
  croxton-east-api npm run bootstrap:admin
```

## Common Tasks

### Import paddocks from KML

```bash
cd server
npm run import:paddocks:kml -- --file ../farm.kml
```

Optional flags:
- `--dry-run`
- `--farm-id <uuid>`

### Backend build

```bash
cd server
npm run build
```

### Frontend build

```bash
cd client
npm run build
```

## Coding Conventions

- Prefer small, focused PRs/patches.
- Keep behavior changes documented in `README.md` or `docs/*` when user-facing.
- Avoid introducing new architectural patterns without updating docs.
- Favor explicit, readable code over implicit magic.

## When Adding New Endpoints

1. Add/adjust Prisma model if needed.
2. Implement service and controller logic.
3. Wire route in module and top-level router.
4. Add endpoint to `docs/api-endpoints.md`.
5. If architecture/flow changes, update `docs/architecture.md`.
6. Update UI consumers if applicable.

## Agent Workflow Expectations

- Read docs before major changes.
- Validate changes with build/run commands.
- Keep compatibility with existing API contracts unless explicitly changing them.
- If making contract changes, update docs in the same change.

## Pre-Merge Verification Checklist

Run before opening or merging a patch:

1. Build backend:

```bash
cd server
npm run build
```

2. Run backend smoke test:

```bash
cd server
npm test
```

3. Build frontend:

```bash
cd client
npm run build
```

4. If API or env/runtime behavior changed, smoke test health endpoint:

```bash
docker compose up -d --build
curl -f http://localhost:4000/api/v1/health
```

5. If Prisma schema changed, ensure migration + docs are included:
- migration generated/applied from `server/prisma/schema.prisma`
- endpoint docs updated in `docs/api-endpoints.md` if contracts changed
- architecture docs updated in `docs/architecture.md` if flows/layout changed

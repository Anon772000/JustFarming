# AGENT.md

This file is the operating guide for engineers and coding agents working in this repository.

## Project Summary

- Name: `Croxton East`
- Purpose: farm management platform with API-first backend and React frontend
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
2. Set at least `POSTGRES_PASSWORD`.
3. Run:

```bash
docker compose up --build
```

Service URLs:
- API health: `http://<host>:4000/api/v1/health`
- Web: `http://<host>/` and `https://<host>/`

### Local Development

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
- Keep API responses consistent with documented conventions:
  - list: `{ data: T[] }`
  - single: `{ data: T }`
  - errors: `{ error: string, detail?: string }`
- Scope data by farm where applicable (`farmId`) and preserve auth boundaries.

## Frontend Rules

- Use React Query for server-state data access.
- Keep feature logic in `client/src/features/*` when adding new domains.
- Prefer typed API interactions and shared TypeScript types.
- Keep UI flows resilient for intermittent connectivity (offline queue/sync exists in `client/src/offline/*`).

## Data and Migration Safety

- Do not hand-edit production DB schema directly.
- Update Prisma schema first, then generate/apply migrations.
- Preserve soft-delete semantics (`deletedAt`) where used.
- Preserve sync safety tables/flows (`SyncChange`, `SyncTombstone`) for offline consistency.

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
5. Update UI consumers if applicable.

## Agent Workflow Expectations

- Read docs before major changes.
- Validate changes with build/run commands.
- Keep compatibility with existing API contracts unless explicitly changing them.
- If making contract changes, update docs in the same change.

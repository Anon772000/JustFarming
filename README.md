# Croxton East

Farm management app (React + Node/Express + Postgres) with API-first design, offline sync, and TypeScript end-to-end.

## Services

- `server/`: Node/Express TypeScript API using Prisma + Postgres
- `client/`: React + Vite + TypeScript UI (React Query + offline queue primitives)
- `docs/`: architecture artifacts (schema, endpoints, migration plan)

## Run With Docker

1. Configure environment
- Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`.

2. Start services
- `docker compose up --build`

API:
- `http://127.0.0.1:4000/api/v1/health` (local on server host)
- `https://<host>/api/v1/health` (external via web reverse-proxy)

Web:
- `http://<host>/` (redirects to HTTPS)
- `https://<host>/` (self-signed TLS by default)

## Bootstrap (First Manager User)

Self-registration is disabled. Create the first manager user server-side:

- `docker exec -e BOOTSTRAP_EMAIL=admin@example.com -e BOOTSTRAP_PASSWORD=password123 -e BOOTSTRAP_DISPLAY_NAME=Admin croxton-east-api npm run bootstrap:admin`

Then log in via the web UI and create additional users under the Users tab.


## Development (Host)

Install Node 20+ and run:
- `cd server && npm install && npm run dev`
- `cd client && npm install && npm run dev -- --host 0.0.0.0`

## Docs

- Domain schema: `server/prisma/schema.prisma`
- Architecture: `docs/architecture.md`
- Endpoint catalog: `docs/api-endpoints.md`

## Import Paddocks From KML

If you have a Google Earth KML file (for example `farm.kml` at repo root), you can import placemark polygons into paddocks:

- `cd server && npm run import:paddocks:kml -- --file ../farm.kml`

Notes:
- Upserts paddocks by name (per farm) and stores geometry as GeoJSON in `Paddock.boundaryGeoJson`.
- Use `--dry-run` to preview changes.
- Use `--farm-id <uuid>` if you have multiple farms.

# Croxton East Architecture and Migration Blueprint

This repo has been reset to a clean baseline for "Croxton east":
- Backend: Node + Express + TypeScript + Prisma + Postgres
- Frontend: React + Vite + TypeScript + React Query
- Infra: Docker Compose (Postgres + API + Web + optional Mosquitto)

This document provides the requested artifacts (A through G).

## A) Postgres Schema Definitions

Schema format: Prisma.

Authoritative schema file:
- `server/prisma/schema.prisma`

Key modeling decisions in the schema:
- UUID primary keys on all entities to support offline creation.
- `farmId` on most entities for future multi-farm tenancy.
- Soft delete (`deletedAt`) on primary entities to make sync and auditing safer.
- Polymorphic attachments using `(entityType, entityId)`.
- Offline sync tables (`SyncChange`, `SyncTombstone`) to support pull-based deltas.

Major tables/models included:
- Mobs, paddocks, crop seasons, paddock plans, mob movement plans, production plans
- Water network (assets + links)
- LoRa nodes, sensors, sensor readings
- Feeders, hay lots, grain lots
- Issues, tasks, contractors, pest spotting
- Attachments (photos/videos)
- Users + refresh tokens

## B) Complete API Endpoint List

Base path: `/api/v1`

Response conventions:
- List: `{ data: T[] }`
- Single: `{ data: T }`
- Errors: `{ error: string, detail?: string }`

### Auth

- `POST /auth/login`
  - Request: `{ email: string, password: string }`
  - Response: `{ accessToken: string, refreshToken: string, user: { id, farmId, email, displayName, role } }`
- `POST /auth/refresh`
  - Request: `{ refreshToken: string }`
  - Response: `{ accessToken: string, refreshToken: string }`
- `POST /auth/logout`
  - Request: `{ refreshToken: string }`
  - Response: `204 No Content`
- `POST /auth/logout-others` (auth)
  - Request: `{ refreshToken: string }`
  - Response: `204 No Content`
- `GET /auth/sessions?deviceId=<optional>` (auth)
  - Response: `{ data: Session[] }`
- `DELETE /auth/sessions/:sessionId` (auth)
  - Response: `204 No Content`

### Users

- `GET /users/me`
  - Response: `{ data: { id, farmId, email, displayName, role, createdAt, updatedAt } }`
- `GET /users` (manager)
  - Response: `{ data: User[] }`
- `GET /users/audit?targetUserId=<uuid>&limit=<n>` (manager)
  - Response: `{ data: UserAuditEvent[] }`
  - Event stream includes:
    - `USER_ADMIN_*` manager user-management events
    - `USER_AUTH_*` login/session/auth lifecycle events
    - `USER_ACTION_API_MUTATION` entries for authenticated mutating API calls
- `POST /users` (manager)
  - Request: `{ email: string, password: string, displayName: string, role?: "manager"|"worker" }`
  - Response: `{ data: User }`
- `GET /users/:userId` (manager)
  - Response: `{ data: User }`
- `PATCH /users/:userId` (manager)
  - Request: `{ displayName?: string, password?: string, role?: "manager"|"worker" }`
  - Response: `{ data: User }`
- `GET /users/:userId/sessions?deviceId=<optional>` (manager)
  - Response: `{ data: Session[] }`
- `DELETE /users/:userId/sessions/:sessionId` (manager)
  - Response: `204 No Content`
- `POST /users/:userId/revoke-sessions` (manager)
  - Response: `204 No Content`

### CRUD Resources (pattern)

For each resource below:
- `GET /<resource>`
- `POST /<resource>`
- `GET /<resource>/:id`
- `PATCH /<resource>/:id`
- `DELETE /<resource>/:id`

Resources:
- `mobs` (implemented: GET/POST/GET/PATCH/DELETE)
- `paddocks` (implemented: GET/POST/GET/PATCH/DELETE)
- `mob-paddock-allocations` (implemented: GET/POST/GET/PATCH/DELETE)
- `crop-seasons`
- `paddock-plans`
- `mob-movement-plans`
- `production-plans`
- `water-assets` (implemented: GET/POST/GET/PATCH/DELETE)
- `water-links` (implemented: GET/POST/GET/PATCH/DELETE)
- `lora-nodes` (implemented: GET/POST/GET/PATCH/DELETE)
- `sensors` (implemented: GET/POST/GET/PATCH/DELETE)
- `sensor-readings` (implemented: GET/GET)
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

### Map Dashboard

- `GET /map/summary`
  - Response: `{ paddocks: Paddock[], mobs: Mob[], waterAssets: WaterAsset[], loraNodes: LoraNode[] }`
- `GET /map/water-network`
  - Response: `{ assets: WaterAsset[], links: WaterLink[] }`

### LoRa Ingestion

- `POST /lora/ingest`
  - Request: `{ devEui: string, ts: ISODate, sensors: [{ key: string, type: string, value: number, unit?: string }] }`
  - Response: `{ accepted: true, received: number }`

### Planning and Actual Events

- `GET /planning/paddock` -> `{ data: PaddockPlan[] }`
- `GET /planning/mob-movements` -> `{ data: MobMovementPlan[] }`
- `GET /planning/production` -> `{ data: ProductionPlan[] }`
- `GET /events/actual?from=<ISODate>&to=<ISODate>` -> `{ data: ActivityEvent[] }`

Mob movement response detail:
- `MobMovementPlan` payloads include optional `mob` summary (`{ id, name }`) for UI display labels.

### Offline Sync

- `GET /sync/changes?since=<ISODate>`
  - Response: `{ serverTime: ISODate, changes: SyncChange[], tombstones: SyncTombstone[] }`
- `POST /sync/batch`
  - Request: `{ actions: [{ clientId: string, ts: ISODate, entity: string, op: "CREATE"|"UPDATE"|"DELETE", data: object }] }`
  - Response: `{ applied: [{ clientId, status, entity, op }], conflicts: [{ clientId, reason }] }`

## C) Backend Folder Structure and Service Layout

Reference implementation:
- `server/src`

```text
server/
  prisma/
    schema.prisma
  src/
    app.ts
    main.ts
    routes.ts
    config/
      env.ts
    modules/
      auth/
      users/
      mobs/
      paddocks/
      water-assets/
      water-links/
      lora/
      lora-nodes/
      sync/
      map/
      ...
    shared/
      auth/
      db/
      http/
```

Rules:
- `routes`: HTTP wiring only
- `controller`: parse/validate requests; serialize responses
- `service`: business logic and database operations

## D) React Folder / Component Structure

Reference implementation:
- `client/src`

```text
client/src/
  App.tsx
  main.tsx
  api/
    http.ts
  features/
    mobs/
      pages/
        MobListPage.tsx
  offline/
    indexedDb.ts
    actionQueue.ts
    syncLoop.ts
  types/
    api.ts
```

Target structure as the app grows:
- Dashboard pages
- Map pages and layers
- Entity list/detail/edit pages per domain
- Offline sync module and conflict UI

## E) Key Code Examples

1) Express controller + service (Mob CRUD)
- `server/src/modules/mobs/mob.controller.ts`
- `server/src/modules/mobs/mob.service.ts`

2) React Query page
- `client/src/features/mobs/pages/MobListPage.tsx`

3) Offline sync primitives
- `client/src/offline/indexedDb.ts`
- `client/src/offline/actionQueue.ts`
- `client/src/offline/syncLoop.ts`

## F) Migration Plan (Incremental, Low-Risk)

1. Run Node/Prisma API in parallel to the existing backend.
2. Implement and validate one resource end-to-end (paddocks or mobs).
3. Add auth and farm scoping everywhere.
4. Add offline queue + `GET /sync/changes` for a single workflow.
5. Expand entity coverage in priority order: paddocks, movements, water, sensors, issues/tasks.
6. Cut over frontend pages one-by-one.
7. Replace ingestion pipelines (LoRa) last.

## G) Assumptions, Edge Cases, Decisions

Assumptions:
- UUIDs are generated server-side (client-side UUID creation can be added for offline CREATE).
- Attachments are stored in object storage; DB stores URLs and metadata.

Edge cases:
- Offline edits conflicting with server updates.
- Deletes racing with queued updates (tombstones required).
- Out-of-order sensor timestamps.

Decisions:
- Soft-delete + sync tombstones.
- REST API-first.
- Polymorphic attachments to avoid per-entity join tables.

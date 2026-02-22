# API Endpoint Catalog (Croxton East)

Base path: `/api/v1`

## Conventions

- List response: `{ data: T[] }`
- Single response: `{ data: T }`
- Delete response: `204 No Content`

## Health

- `GET /health` -> `{ ok: true, service: "croxton-east-api" }`

## Auth

- `POST /auth/login` -> `{ accessToken, refreshToken, user }`
- `POST /auth/refresh` -> `{ accessToken, refreshToken }`
- `POST /auth/logout` -> `204`
- `POST /auth/logout-others` (auth) -> `204`
- `GET /auth/sessions?deviceId=<optional>` (auth) -> `{ data: Session[] }`
- `DELETE /auth/sessions/:sessionId` (auth) -> `204`

## Users

- `GET /users/me` (auth) -> `{ data: user }`
- `GET /users` (manager) -> `{ data: user[] }`
- `GET /users/audit?targetUserId=<uuid>&limit=<n>` (manager) -> `{ data: UserAuditEvent[] }`
  - Includes:
    - manager user-admin events (`USER_ADMIN_*`)
    - user auth/session events (`USER_AUTH_*`)
    - authenticated API mutation events (`USER_ACTION_API_MUTATION`)
- `POST /users` (manager) -> `{ data: user }`
- `GET /users/:userId` (manager) -> `{ data: user }`
- `PATCH /users/:userId` (manager) -> `{ data: user }`
- `GET /users/:userId/sessions?deviceId=<optional>` (manager) -> `{ data: Session[] }`
- `DELETE /users/:userId/sessions/:sessionId` (manager) -> `204`
- `POST /users/:userId/revoke-sessions` (manager) -> `204`

## Sensors

- `GET /sensors?nodeId=<uuid>` -> `{ data: Sensor[] }`
- `GET /sensors/:sensorId` -> `{ data: Sensor }`
- `POST /sensors` -> `{ data: Sensor }`
- `PATCH /sensors/:sensorId` -> `{ data: Sensor }`
- `DELETE /sensors/:sensorId` -> `204`

## Sensor Readings

- `GET /sensor-readings?nodeId=<uuid>&sensorId=<uuid>&from=<ISO>&to=<ISO>&limit=<n>&order=asc|desc` -> `{ data: SensorReading[] }`
- `GET /sensor-readings/:sensorReadingId` -> `{ data: SensorReading }`

## Resources (CRUD)

Each resource follows:
- `GET /<resource>`
- `POST /<resource>`
- `GET /<resource>/:id`
- `PATCH /<resource>/:id`
- `DELETE /<resource>/:id`

Resources:
- `mobs`
- `paddocks`
- `mob-paddock-allocations`
- `crop-seasons`
- `paddock-plans`
- `mob-movement-plans`
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

`mob-movement-plans` response note:
- list/get/create/update responses include `mob?: { id: string, name: string }` to support UI labels.

Special attachment endpoint:
- `POST /attachments/upload` (multipart form-data; file field: `file`) -> `{ data: Attachment }`

## Map

- `GET /map/summary`
- `GET /map/water-network`
- `GET /map/alerts`

## LoRa

- `POST /lora/ingest`

## Offline Sync

- `GET /sync/changes?since=<ISODate>`
- `POST /sync/batch`

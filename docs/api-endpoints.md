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

## Users

- `GET /users/me` -> `{ data: user }`
- `GET /users` (manager) -> `{ data: user[] }`
- `POST /users` (manager) -> `{ data: user }`
- `PATCH /users/:userId` (manager) -> `{ data: user }`

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
- `crop-seasons`
- `paddock-plans`
- `mob-movement-plans`
- `production-plans`
- `water-assets`
- `water-links`
- `lora-nodes`
- `sensors`
- `sensor-readings`
- `feeders`
- `hay-lots`
- `grain-lots`
- `issues`
- `tasks`
- `contractors`
- `pest-spottings`
- `attachments`
- `activity-events`

## Map

- `GET /map/summary`
- `GET /map/water-network`

## LoRa

- `POST /lora/ingest`

## Offline Sync

- `GET /sync/changes?since=<ISODate>`
- `POST /sync/batch`

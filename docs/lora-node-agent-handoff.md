# LoRa Node Integration Handoff (For External AI Agent)

Use this document as the source of truth for sending node telemetry into Croxton East.

## Goal

Push LoRa node sensor data into Croxton East so it appears under Telemetry/Map alerts.

## Important Model Assumption

- `devEui` in ingest payload must be the **end-device DevEUI** (node), not the gateway EUI.
- The node must already exist in Croxton East `lora-nodes` (matched by `devEui`).

If no matching node exists, ingest returns:
- `404 LoRa node not found`

## API Endpoints

- Ingest uplink data:
  - `POST /api/v1/lora/ingest`
- Create node (manager auth required):
  - `POST /api/v1/lora-nodes`
- List readings:
  - `GET /api/v1/sensor-readings?nodeId=<uuid>&limit=50&order=desc`

Base URL example:
- `https://<host>/api/v1`

## Security

If backend env `LORA_INGEST_KEY` is set, every ingest request must include:

- Header: `x-ingest-key: <key>`

If key is not set, header is not required.

## Ingest Payload Contract

### Required JSON body

```json
{
  "devEui": "a84041ffff123456",
  "ts": "2026-02-22T10:15:00Z",
  "sensors": [
    { "key": "water_level", "type": "WATER_LEVEL", "value": 57.2, "unit": "%" },
    { "key": "battery", "type": "BATTERY", "value": 3.91, "unit": "V" }
  ]
}
```

### Field rules

- `devEui`: string, min length 6
- `ts`: ISO-8601 datetime string (`z.string().datetime()` compatible)
- `sensors`: array of objects:
  - `key`: string identifier per sensor on that node (stable over time)
  - `type`: string; normalized internally (`WATER_LEVEL`, `BATTERY`, etc.; unknown -> `CUSTOM`)
  - `value`: number
  - `unit`: optional string

## Expected Response

On success:

- HTTP `202`
- Body:

```json
{ "accepted": true, "received": 2 }
```

## One-Time Provisioning (Create Node)

1. Login as manager and obtain JWT access token.
2. Create node with the exact device DevEUI used in ingest payloads.

Example:

```bash
curl -k -X POST https://<host>/api/v1/lora-nodes \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Tank Node 1",
    "devEui":"a84041ffff123456",
    "locationGeoJson":{"type":"Point","coordinates":[147.123,-36.456]}
  }'
```

## Gateway / Network Server Mapping Notes

Map provider payload into this ingest contract:

- `devEui` -> end-device DevEUI
- `ts` -> uplink timestamp in ISO UTC
- `sensors[]` -> decoded application fields

Recommended mapping strategy:

- Use semantic `key` names (e.g. `water_level`, `temp`, `battery`)
- Keep `key` stable for a sensor channel over device lifetime
- Send numeric values only in `value`

## Minimal Retry Strategy

- Retry on: `5xx`, network timeout, DNS/TLS failure
- Do not retry on: `400`, `401`, `404`
- Exponential backoff with jitter (e.g. 2s, 5s, 10s, 20s, max 60s)

## Validation Checklist

- [ ] Node exists in `/lora-nodes` with matching `devEui`
- [ ] Ingest URL is correct: `/api/v1/lora/ingest`
- [ ] `x-ingest-key` sent when required
- [ ] `ts` is ISO UTC
- [ ] `sensors[].value` is numeric
- [ ] Successful response is `202 accepted`
- [ ] Readings visible in Telemetry and `/sensor-readings`

## Quick Test Command

```bash
curl -k -X POST https://<host>/api/v1/lora/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: <optional_if_enabled>" \
  -d '{
    "devEui":"a84041ffff123456",
    "ts":"2026-02-22T10:15:00Z",
    "sensors":[
      {"key":"water_level","type":"WATER_LEVEL","value":57.2,"unit":"%"},
      {"key":"battery","type":"BATTERY","value":3.91,"unit":"V"}
    ]
  }'
```

## Common Failure Causes

- Sending gateway EUI instead of node DevEUI
- Node not provisioned in Croxton East
- Wrong ingest key
- Invalid timestamp format
- Non-numeric sensor values


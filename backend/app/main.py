from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.db import init_db
from .api.v1.routes_paddocks import router as paddock_router
from .api.v1.routes_mobs import router as mob_router
from .api.v1.routes_movements import router as movement_router
from .api.v1.routes_sensors import router as sensor_router
from .api.v1.routes_kml import router as kml_router
from .api.v1.routes_health import router as health_router
import json

app = FastAPI(title="JustFarming API", version="0.1.0")

def parse_cors(origins_raw: str) -> tuple[list[str], str | None, bool]:
    # returns (allow_origins, allow_origin_regex, allow_credentials)
    raw = (origins_raw or "").strip()
    if not raw:
        return (["http://localhost:5173", "http://127.0.0.1:5173"], None, True)
    # try JSON array first
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            lst = [str(x).rstrip('/') for x in data if str(x).strip()]
            return (lst, None, True)
    except Exception:
        pass
    # comma-separated or wildcard
    parts = [p.strip().rstrip('/') for p in raw.split(',') if p.strip()]
    if any(p == "*" for p in parts):
        # Allow any origin; must disable credentials for wildcard
        return ([], ".*", False)
    return (parts, None, True)

allow_origins, allow_origin_regex, allow_credentials = parse_cors(settings.CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()

app.include_router(paddock_router, prefix="/api/v1/paddocks", tags=["paddocks"])
app.include_router(mob_router, prefix="/api/v1/mobs", tags=["mobs"])
app.include_router(movement_router, prefix="/api/v1/movements", tags=["movements"])
app.include_router(sensor_router, prefix="/api/v1/sensors", tags=["sensors"])
app.include_router(kml_router, prefix="/api/v1")
app.include_router(health_router, prefix="/api/v1/health", tags=["health"])

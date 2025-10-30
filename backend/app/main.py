from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .core.db import init_db
from .api.v1.routes_paddocks import router as paddock_router
from .api.v1.routes_mobs import router as mob_router
from .api.v1.routes_movements import router as movement_router
from .api.v1.routes_sensors import router as sensor_router

app = FastAPI(title="Farmdeck Open API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGINS],
    allow_credentials=True,
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

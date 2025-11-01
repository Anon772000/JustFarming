from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastkml import kml
from shapely.geometry import shape
from app.core.db import SessionLocal
from app.models import Paddock  # adjust import to your model
import io

router = APIRouter(prefix="/kml", tags=["KML"])

@router.post("/import")
async def import_kml(file: UploadFile = File(...)):
    if not file.filename.endswith(".kml"):
        raise HTTPException(status_code=400, detail="Only .kml files allowed")

    data = await file.read()
    doc = kml.KML()
    try:
        doc.from_string(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid KML: {e}")

    # assume first document/layer
    features = list(doc.features())
    all_polygons = []

    for feature in features:
        for placemark in feature.features():
            geom = placemark.geometry
            if geom and geom.geom_type in ("Polygon", "MultiPolygon"):
                # Convert to GeoJSON-compatible dict
                polygon_geojson = shape(geom).simplify(0).wkt
                name = placemark.name or "Unnamed paddock"
                all_polygons.append({"name": name, "geometry": polygon_geojson})

    db = SessionLocal()
    for poly in all_polygons:
        paddock = Paddock(name=poly["name"], polygon=poly["geometry"])
        db.add(paddock)
    db.commit()
    db.close()

    return {"imported": len(all_polygons)}

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastkml import kml
from shapely.geometry import mapping, Polygon, MultiPolygon
from pyproj import Geod
import json

from ..v1_deps import get_session
from ...core.models import Paddock

geod = Geod(ellps="WGS84")

def geodesic_area_m2(geometry) -> float:
    try:
        area, _ = geod.geometry_area_perimeter(geometry)
        return abs(area)
    except Exception:
        # Fallback for older pyproj: compute exterior minus holes for Polygon; sum for MultiPolygon
        if isinstance(geometry, Polygon):
            def ring_area(coords):
                lons, lats = zip(*coords)
                area, _ = geod.polygon_area_perimeter(lons, lats)
                return area
            ext = abs(ring_area(list(geometry.exterior.coords))) if geometry.exterior else 0.0
            holes = sum(abs(ring_area(list(r.coords))) for r in geometry.interiors)
            return max(ext - holes, 0.0)
        if isinstance(geometry, MultiPolygon):
            return sum(geodesic_area_m2(p) for p in geometry.geoms)
        return 0.0

router = APIRouter(prefix="/kml", tags=["KML"])

@router.post("/import")
async def import_kml(file: UploadFile = File(...), session = get_session):
    if not file.filename.lower().endswith(".kml"):
        raise HTTPException(status_code=400, detail="Only .kml files allowed")

    data = await file.read()
    doc = kml.KML()
    try:
        doc.from_string(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid KML: {e}")

    imported = 0

    # iterate documents/folders -> placemarks (simple two-level walk)
    for feature in doc.features():
        for placemark in getattr(feature, "features", lambda: [])():
            geom = getattr(placemark, "geometry", None)
            if not geom:
                continue
            name = placemark.name or "Unnamed paddock"
            if geom.geom_type == "Polygon":
                gj = json.dumps(mapping(geom))
                area_ha = geodesic_area_m2(geom) / 10_000.0
                session.add(Paddock(name=name, area_ha=area_ha, polygon_geojson=gj))
                imported += 1
            elif geom.geom_type == "MultiPolygon":
                # split into multiple paddocks
                for idx, poly in enumerate(list(geom.geoms)):
                    gj = json.dumps(mapping(poly))
                    area_ha = geodesic_area_m2(poly) / 10_000.0
                    session.add(Paddock(name=f"{name} {idx+1}", area_ha=area_ha, polygon_geojson=gj))
                    imported += 1

    await session.commit()
    return {"imported": imported}

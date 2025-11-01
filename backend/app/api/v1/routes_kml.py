from fastapi import APIRouter, UploadFile, File, HTTPException
from fastkml import kml
from shapely.geometry import mapping, Polygon, MultiPolygon
from pyproj import Geod
import json
import logging

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

def iter_features(container) -> list:
    feats = getattr(container, "features", [])
    if callable(feats):
        try:
            return list(feats())
        except Exception:
            return []
    try:
        return list(feats)
    except TypeError:
        return []
    return []

def iter_placemarks(container):
    for f in iter_features(container):
        geom = getattr(f, "geometry", None)
        if geom is not None:
            yield f
        # Recurse into nested containers (Documents/Folders)
        yield from iter_placemarks(f)

def polygonish_geoms(g):
    if isinstance(g, Polygon):
        yield g
    elif isinstance(g, MultiPolygon):
        for p in g.geoms:
            yield from polygonish_geoms(p)
    elif getattr(g, "geoms", None) is not None:
        for sub in g.geoms:
            yield from polygonish_geoms(sub)

router = APIRouter(prefix="/kml", tags=["KML"])

@router.post("/import")
async def import_kml(session: get_session, file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".kml"):
        raise HTTPException(status_code=400, detail="Only .kml files allowed")

    data = await file.read()
    doc = kml.KML()
    try:
        doc.from_string(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid KML: {e}")

    logger = logging.getLogger(__name__)
    imported = 0
    total_placemarks = 0
    polygon_placemarks = 0
    non_polygon_placemarks = 0
    geom_type_counts: dict[str, int] = {}

    # Recursively walk KML: Document/Folder/... -> Placemark (with geometry)
    for placemark in iter_placemarks(doc):
        geom = getattr(placemark, "geometry", None)
        if not geom:
            continue
        total_placemarks += 1
        geom_type = getattr(geom, "geom_type", type(geom).__name__)
        geom_type_counts[geom_type] = geom_type_counts.get(geom_type, 0) + 1
        name = placemark.name or "Unnamed paddock"
        polys = list(polygonish_geoms(geom))
        if not polys:
            non_polygon_placemarks += 1
            continue
        polygon_placemarks += 1
        for idx, poly in enumerate(polys):
            gj = json.dumps(mapping(poly))
            area_ha = geodesic_area_m2(poly) / 10_000.0
            suffix = f" {idx+1}" if len(polys) > 1 else ""
            session.add(Paddock(name=f"{name}{suffix}", area_ha=area_ha, polygon_geojson=gj))
            imported += 1

    await session.commit()
    logger.info(
        "KML import: file=%s imported=%d placemarks=%d polygon_placemarks=%d non_polygon_placemarks=%d geom_types=%s",
        file.filename,
        imported,
        total_placemarks,
        polygon_placemarks,
        non_polygon_placemarks,
        geom_type_counts,
    )
    return {
        "imported": imported,
        "placemarks": total_placemarks,
        "polygon_placemarks": polygon_placemarks,
        "non_polygon_placemarks": non_polygon_placemarks,
        "geom_types": geom_type_counts,
    }

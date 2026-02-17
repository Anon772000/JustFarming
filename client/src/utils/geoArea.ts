const EARTH_RADIUS_M = 6378137; // WGS84 radius used by common spherical geodesic approximations.

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function ringAreaMeters2(coords: Array<[number, number] | number[]>): number {
  // Adapted from Mapbox's geojson-area (spherical excess approximation).
  const len = coords.length;
  if (len < 3) return 0;

  let area = 0;

  for (let i = 0; i < len; i++) {
    const lower = coords[i];
    const middle = coords[(i + 1) % len];
    const upper = coords[(i + 2) % len];

    const lon1 = Number(lower[0]);
    const lat2 = Number(middle[1]);
    const lon3 = Number(upper[0]);

    if (!Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon3)) continue;

    area += (toRadians(lon3) - toRadians(lon1)) * Math.sin(toRadians(lat2));
  }

  return (area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

function toPolygonOrMultiPolygonGeometry(value: unknown): GeoJsonPolygon | GeoJsonMultiPolygon | null {
  if (!value || typeof value !== "object") return null;
  const v = value as any;

  if (v.type === "Feature") {
    return toPolygonOrMultiPolygonGeometry(v.geometry);
  }

  if (v.type === "Polygon" && Array.isArray(v.coordinates)) {
    return v as GeoJsonPolygon;
  }

  if (v.type === "MultiPolygon" && Array.isArray(v.coordinates)) {
    return v as GeoJsonMultiPolygon;
  }

  return null;
}

function polygonAreaMeters2(coordinates: number[][][]): number {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return 0;

  const outer = coordinates[0] ?? [];
  let total = Math.abs(ringAreaMeters2(outer as any));

  for (let i = 1; i < coordinates.length; i++) {
    const hole = coordinates[i] ?? [];
    total -= Math.abs(ringAreaMeters2(hole as any));
  }

  return Math.max(0, total);
}

export function geoJsonAreaMeters2(value: unknown): number | null {
  const geom = toPolygonOrMultiPolygonGeometry(value);
  if (!geom) return null;

  if (geom.type === "Polygon") {
    return polygonAreaMeters2(geom.coordinates);
  }

  let total = 0;
  for (const poly of geom.coordinates) {
    total += polygonAreaMeters2(poly);
  }
  return total;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function areaHaFromGeoJson(value: unknown): number | null {
  const m2 = geoJsonAreaMeters2(value);
  if (m2 === null) return null;
  const ha = m2 / 10_000;
  return Number.isFinite(ha) ? ha : null;
}

export function formatAreaHaAcres(
  areaHa: number | string | null | undefined,
  opts?: { haDp?: number; acDp?: number },
): string {
  const ha = toNumberOrNull(areaHa);
  if (ha === null) return "";

  const haDp = opts?.haDp ?? 2;
  const acDp = opts?.acDp ?? 2;

  const acres = ha * 2.471053814671653;
  return `${ha.toFixed(haDp)} ha (${acres.toFixed(acDp)} ac)`;
}

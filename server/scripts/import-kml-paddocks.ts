import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

type GeoJsonPoint = [number, number];

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: GeoJsonPoint[][];
};

type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: GeoJsonPoint[][][];
};

type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

type ImportedPaddock = {
  name: string;
  areaHa?: number;
  geometry: GeoJsonGeometry;
};

function readArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function decodeXmlEntities(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function stripCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function closeRing(ring: GeoJsonPoint[]): GeoJsonPoint[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function parseCoordinateList(raw: string): GeoJsonPoint[] {
  const tokens = raw
    .trim()
    .replaceAll("\n", " ")
    .replaceAll("\t", " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const points: GeoJsonPoint[] = [];

  for (const token of tokens) {
    const parts = token.split(",");
    if (parts.length < 2) continue;
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    points.push([lon, lat]);
  }

  return points;
}

function parsePolygonBlock(polygonXml: string): GeoJsonPoint[][] | null {
  const outer = polygonXml.match(
    /<outerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>/,
  );

  if (!outer) return null;

  const outerRing = closeRing(parseCoordinateList(outer[1]));
  if (outerRing.length < 4) return null;

  const rings: GeoJsonPoint[][] = [outerRing];

  const innerMatches = polygonXml.matchAll(
    /<innerBoundaryIs[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/innerBoundaryIs>/g,
  );

  for (const m of innerMatches) {
    const ring = closeRing(parseCoordinateList(m[1]));
    if (ring.length >= 4) rings.push(ring);
  }

  return rings;
}

function parsePlacemarks(kml: string): ImportedPaddock[] {
  const placemarkBlocks = Array.from(kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)).map((m) => m[0]);

  const out: ImportedPaddock[] = [];

  for (const block of placemarkBlocks) {
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
    const rawName = nameMatch ? decodeXmlEntities(nameMatch[1].trim()) : "";
    const name = rawName.trim();
    if (!name) continue;

    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/);
    const descRaw = descMatch ? stripCdata(descMatch[1].trim()) : "";
    const areaMatch = descRaw.match(/([0-9]+(?:\.[0-9]+)?)\s*H\s*A/i);
    const areaHa = areaMatch ? Number(areaMatch[1]) : undefined;

    const polygonBlocks = Array.from(block.matchAll(/<Polygon\b[\s\S]*?<\/Polygon>/g)).map((m) => m[0]);

    const polygons: GeoJsonPoint[][][] = [];

    for (const polyXml of polygonBlocks) {
      const rings = parsePolygonBlock(polyXml);
      if (!rings) continue;
      polygons.push(rings);
    }

    if (polygons.length === 0) {
      continue;
    }

    const geometry: GeoJsonGeometry =
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };

    out.push({ name, areaHa: Number.isFinite(areaHa) ? areaHa : undefined, geometry });
  }

  return out;
}

async function main(): Promise<void> {
  // Load repo-root .env for POSTGRES_PASSWORD/JWT secrets (DATABASE_URL is derived below for host-side scripts).
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../.env") });

  if (!process.env.DATABASE_URL) {
    const pw = process.env.POSTGRES_PASSWORD ?? "example";
    const encoded = encodeURIComponent(pw);
    process.env.DATABASE_URL = "postgresql://postgres:" + encoded + "@127.0.0.1:5432/croxton_east";
  }

  const kmlPath = readArg("--file") ?? readArg("--kml") ?? path.resolve(__dirname, "../../farm.kml");
  const dryRun = hasFlag("--dry-run");
  const farmIdArg = readArg("--farm-id");
  const farmNameArg = readArg("--farm-name");

  if (!fs.existsSync(kmlPath)) {
    throw new Error("KML file not found: " + kmlPath);
  }

  const { prisma } = await import("../src/shared/db/prisma");
  const { syncWriter } = await import("../src/shared/sync/sync-writer");

  const ENTITY_TYPE = "paddocks";

  const farm = farmIdArg
    ? await prisma.farm.findUnique({ where: { id: farmIdArg } })
    : farmNameArg
      ? await prisma.farm.findFirst({ where: { name: farmNameArg }, orderBy: { createdAt: "asc" } })
      : await prisma.farm.findFirst({ orderBy: { createdAt: "asc" } });

  if (!farm) {
    throw new Error("No farm found. Create a farm first or pass --farm-id / --farm-name.");
  }

  const kml = fs.readFileSync(kmlPath, "utf8");
  const imported = parsePlacemarks(kml);

  // De-duplicate by name to avoid unique constraint issues.
  const byName = new Map<string, ImportedPaddock>();
  const duplicateNames: string[] = [];
  for (const p of imported) {
    if (byName.has(p.name)) {
      duplicateNames.push(p.name);
      continue;
    }
    byName.set(p.name, p);
  }

  const uniqueImported = Array.from(byName.values());

  const existing = await prisma.paddock.findMany({ where: { farmId: farm.id } });
  const existingByName = new Map(existing.map((p) => [p.name, p]));

  let created = 0;
  let updated = 0;
  let revived = 0;

  for (const p of uniqueImported) {
    const existingRow = existingByName.get(p.name);

    if (!existingRow) {
      if (dryRun) {
        created += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const paddock = await tx.paddock.create({
          data: {
            farmId: farm.id,
            name: p.name,
            areaHa: p.areaHa,
            boundaryGeoJson: p.geometry,
          },
        });

        await syncWriter.recordChange(tx, {
          farmId: farm.id,
          entityType: ENTITY_TYPE,
          entityId: paddock.id,
          operation: "CREATE",
          payload: paddock,
        });
      });

      created += 1;
      continue;
    }

    const needsRevive = existingRow.deletedAt !== null;

    if (dryRun) {
      if (needsRevive) revived += 1;
      else updated += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const paddock = await tx.paddock.update({
        where: { id: existingRow.id },
        data: {
          deletedAt: needsRevive ? null : undefined,
          areaHa: p.areaHa ?? undefined,
          boundaryGeoJson: p.geometry,
        },
      });

      if (needsRevive) {
        await tx.syncTombstone.deleteMany({
          where: {
            farmId: farm.id,
            entityType: ENTITY_TYPE,
            entityId: paddock.id,
          },
        });
      }

      await syncWriter.recordChange(tx, {
        farmId: farm.id,
        entityType: ENTITY_TYPE,
        entityId: paddock.id,
        operation: "UPDATE",
        payload: paddock,
      });
    });

    if (needsRevive) revived += 1;
    else updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        farmId: farm.id,
        farmName: farm.name,
        kmlPath: kmlPath,
        placemarksParsed: imported.length,
        uniqueImported: uniqueImported.length,
        duplicateNames: duplicateNames.length ? duplicateNames : undefined,
        created,
        updated,
        revived,
        dryRun,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

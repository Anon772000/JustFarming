import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { apiFetch } from "../../../api/http";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { enqueueAction } from "../../../offline/actionQueue";
import { listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { areaHaFromGeoJson, formatAreaHaAcres, toNumberOrNull } from "../../../utils/geoArea";
import type {
  ApiListResponse,
  ApiSingleResponse,
  Feeder,
  Issue,
  IssueCategory,
  Mob,
  MobPaddockAllocation,
  Paddock,
  PestSpotting,
  Task,
  TaskStatus,
  WaterAsset,
  WaterLink,
} from "../../../types/api";
import {
  openFeederDetails,
  openIssueDetails,
  openMobDetails,
  openPaddockDetails,
  openPestSpottingDetails,
  openTaskDetails,
  openWaterAssetDetails,
} from "../../../ui/navigation";
import type { MapFocus } from "../../../ui/navigation";

const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ESRI_LABELS_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

const ESRI_IMAGERY_ATTRIBUTION =
  "&copy; Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

const ESRI_LABELS_ATTRIBUTION = "&copy; Esri";

type StoredUser = { id: string; farmId: string; displayName: string; role: string };

function createUuid(): string {
  return createStableUuid();
}

function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function getFarmId(): string {
  return getStoredUser()?.farmId ?? "00000000-0000-0000-0000-000000000000";
}

function getUserId(): string {
  return getStoredUser()?.id ?? "00000000-0000-0000-0000-000000000000";
}

function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
  }

  return false;
}

async function getPaddocks(): Promise<Paddock[]> {
  try {
    const response = await apiFetch<ApiListResponse<Paddock>>("/paddocks");
    await upsertEntities("paddocks", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Paddock>("paddocks");
    if (cached.length) return cached;
    throw err;
  }
}

async function getMobs(): Promise<Mob[]> {
  try {
    const response = await apiFetch<ApiListResponse<Mob>>("/mobs");
    await upsertEntities("mobs", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Mob>("mobs");
    if (cached.length) return cached;
    throw err;
  }
}

async function getActiveMobPaddockAllocations(): Promise<MobPaddockAllocation[]> {
  const qs = new URLSearchParams({ active: "true" });

  try {
    const response = await apiFetch<ApiListResponse<MobPaddockAllocation>>(`/mob-paddock-allocations?${qs.toString()}`);
    await upsertEntities("mob_paddock_allocations", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<MobPaddockAllocation>("mob_paddock_allocations");
    const active = cached.filter((a) => !a.endedAt);
    if (active.length) return active;
    throw err;
  }
}

async function getWaterAssets(): Promise<WaterAsset[]> {
  try {
    const response = await apiFetch<ApiListResponse<WaterAsset>>("/water-assets");
    await upsertEntities("water_assets", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<WaterAsset>("water_assets");
    if (cached.length) return cached;
    throw err;
  }
}

async function getWaterLinks(): Promise<WaterLink[]> {
  try {
    const response = await apiFetch<ApiListResponse<WaterLink>>("/water-links");
    await upsertEntities("water_links", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<WaterLink>("water_links");
    if (cached.length) return cached;
    throw err;
  }
}

async function getFeeders(): Promise<Feeder[]> {
  try {
    const response = await apiFetch<ApiListResponse<Feeder>>("/feeders");
    await upsertEntities("feeders", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Feeder>("feeders");
    if (cached.length) return cached;
    throw err;
  }
}

async function getIssues(): Promise<Issue[]> {
  try {
    const response = await apiFetch<ApiListResponse<Issue>>("/issues");
    await upsertEntities("issues", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Issue>("issues");
    if (cached.length) return cached;
    throw err;
  }
}

async function getTasks(): Promise<Task[]> {
  try {
    const response = await apiFetch<ApiListResponse<Task>>("/tasks");
    await upsertEntities("tasks", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Task>("tasks");
    if (cached.length) return cached;
    throw err;
  }
}

async function getPestSpottings(): Promise<PestSpotting[]> {
  try {
    const response = await apiFetch<ApiListResponse<PestSpotting>>("/pest-spottings");
    await upsertEntities("pest_spottings", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<PestSpotting>("pest_spottings");
    if (cached.length) return cached;
    throw err;
  }
}


type MapAlertType = "LOW_WATER" | "LOW_FEED" | "LOW_BATTERY";

type MapAlert = {
  key: string;
  alertType: MapAlertType;
  title: string;
  observedAt: string;
  value: string;
  threshold: number;
  unit?: string | null;
  nodeId: string;
  nodeName: string;
  sensorId: string;
  sensorKey: string;
  waterAssetId?: string | null;
  waterAssetName?: string | null;
  feederId?: string | null;
  feederName?: string | null;
  locationGeoJson: unknown;
};

async function getMapAlerts(): Promise<MapAlert[]> {
  try {
    const response = await apiFetch<ApiListResponse<MapAlert>>("/map/alerts");
    return response.data;
  } catch {
    return [];
  }
}

type GeoJsonFeature = {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    areaHa?: string | null;
  };
  geometry: unknown;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type ParsedPoint = { lat: number; lon: number };

type FocusMarker = { point: ParsedPoint; label: string; color?: string };


type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

function makePoint(lon: number, lat: number): GeoJsonPoint {
  return { type: "Point", coordinates: [lon, lat] };
}

function toGeometry(value: unknown): unknown | null {
  if (!value || typeof value !== "object") return null;

  const anyValue = value as any;

  if (anyValue.type === "Feature" && anyValue.geometry) {
    return toGeometry(anyValue.geometry);
  }

  if (anyValue.type === "Polygon" || anyValue.type === "MultiPolygon") {
    return anyValue;
  }

  return null;
}

function parsePoint(value: unknown): ParsedPoint | null {
  if (!value || typeof value !== "object") return null;

  const v = value as any;

  if (v.type === "Feature" && v.geometry) {
    return parsePoint(v.geometry);
  }

  if (v.type !== "Point") return null;

  const coords = v.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  return { lat, lon };
}

const ACRES_PER_HECTARE = 2.471053814671653;
const METERS_PER_LATITUDE_DEGREE = 111_320;

function formatStockingRate(headCount: number | null | undefined, areaHa: number | null | undefined): string {
  if (typeof headCount !== "number" || !Number.isFinite(headCount) || headCount <= 0) return "";
  if (typeof areaHa !== "number" || !Number.isFinite(areaHa) || areaHa <= 0) return "";

  const perHa = headCount / areaHa;
  const perAc = headCount / (areaHa * ACRES_PER_HECTARE);

  return `${perHa.toFixed(1)} sheep/ha, ${perAc.toFixed(1)} sheep/ac`;
}

function offsetPointSouth(point: ParsedPoint, metersSouth: number): ParsedPoint {
  const shift = Number.isFinite(metersSouth) ? Math.max(0, metersSouth) : 0;
  if (!shift) return point;

  return {
    lat: point.lat - shift / METERS_PER_LATITUDE_DEGREE,
    lon: point.lon,
  };
}


type BrowserLocation = {
  point: ParsedPoint;
  accuracyM: number | null;
  observedAt: string;
};

function getCurrentBrowserLocation(options?: PositionOptions): Promise<BrowserLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude);
        const lon = Number(pos.coords.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          reject(new Error("Invalid location returned by browser."));
          return;
        }

        const ts = typeof pos.timestamp === "number" && Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
        const accuracyM =
          typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
            ? pos.coords.accuracy
            : null;

        resolve({
          point: { lat, lon },
          accuracyM,
          observedAt: new Date(ts).toISOString(),
        });
      },
      (err) => {
        const msg = err && typeof (err as any).message === "string" ? (err as any).message : "Permission denied or unavailable.";
        reject(new Error(msg));
      },
      options ?? { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('\"', "&quot;")
    .replaceAll("'", "&#39;");
}


type MapBadgeKind = "issue" | "alert";

function issueGlyph(category: IssueCategory): string {
  switch (category) {
    case "DEAD_STOCK":
      return "X";
    case "LOW_WATER":
      return "W";
    case "LOW_FEED":
      return "F";
    case "FENCE":
      return "||";
    case "GENERAL":
      return "G";
    case "OTHER":
    default:
      return "?";
  }
}

function alertGlyph(alertType: MapAlertType): string {
  if (alertType === "LOW_WATER") return "W";
  if (alertType === "LOW_FEED") return "F";
  return "B";
}

function alertColor(alertType: MapAlertType): string {
  if (alertType === "LOW_WATER") return "#1f5b99";
  if (alertType === "LOW_FEED") return "#b45309";
  return "#b42318";
}

function makeMapBadgeIcon(opts: { kind: MapBadgeKind; glyph: string; color: string; active: boolean }): L.DivIcon {
  const baseSize = opts.kind === "alert" ? 32 : 28;
  const size = opts.active ? baseSize + 4 : baseSize;
  const anchor = Math.round(size / 2);

  const kindClass = opts.kind === "alert" ? "mapMarkerChipAlert" : "mapMarkerChipIssue";
  const activeClass = opts.active ? " mapMarkerChipActive" : "";

  const html = `<div class="mapMarkerChip ${kindClass}${activeClass}" style="--marker-color:${opts.color}"><span class="mapMarkerGlyph">${escapeHtml(opts.glyph)}</span></div>`;

  return L.divIcon({
    className: "mapMarkerOuter",
    html,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    tooltipAnchor: [0, -anchor],
  });
}

function FitBounds({ geoJson }: { geoJson: GeoJsonFeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    if (!geoJson || geoJson.features.length === 0) return;

    const layer = L.geoJSON(geoJson as any);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.08), { animate: false });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, geoJson]);

  return null;
}

function ZoomToSelected({ selected }: { selected: GeoJsonFeature | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;

    const layer = L.geoJSON(selected as any);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12), { animate: true, duration: 0.35 } as any);
    }
  }, [map, selected]);

  return null;
}

function FlyToPoint({ point }: { point: ParsedPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;

    const z = Math.max(map.getZoom(), 17);
    map.flyTo([point.lat, point.lon], z, { animate: true, duration: 0.35 });
  }, [map, point]);

  return null;
}

function MapClickPicker(props: { enabled: boolean; onPick: (p: ParsedPoint) => void }) {
  useMapEvents({
    click(e) {
      if (!props.enabled) return;
      props.onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });

  return null;
}

type PaddockLabelSpec = {
  maxWidthPx: number;
  fontSizePx: number;
  opacity: number;
};

function bindPaddockLabel(layer: L.Layer, name: string, spec: PaddockLabelSpec | undefined) {
  const anyLayer = layer as any;
  if (!anyLayer || typeof anyLayer.bindTooltip !== "function") return;

  const safeName = escapeHtml(name);
  const maxWidthPx = Math.round(spec?.maxWidthPx ?? 160);
  const fontSizePx = Math.round(spec?.fontSizePx ?? 12);
  const opacity = spec?.opacity ?? 0.95;

  const html = `<span class="paddockLabelInner" style="max-width:${maxWidthPx}px;font-size:${fontSizePx}px">${safeName}</span>`;

  try {
    if (typeof anyLayer.unbindTooltip === "function") anyLayer.unbindTooltip();
    anyLayer.bindTooltip(html, {
      permanent: true,
      direction: "center",
      className: "paddockLabelTooltip",
      opacity,
      interactive: false,
      sticky: false,
      offset: [0, 0],
    });
    if (typeof anyLayer.openTooltip === "function") anyLayer.openTooltip();
  } catch {
    // ignore tooltip binding failures
  }
}

function PaddockBoundariesLayer(props: {
  features: GeoJsonFeature[];
  boundsById: Map<string, L.LatLngBounds>;
  selectedPaddockId: string | null;
  filter: string;
  onSelectPaddock: (id: string) => void;
}) {
  const map = useMap();
  const [viewTick, setViewTick] = useState(0);
  const layersByIdRef = useRef(new Map<string, L.Layer>());

  useMapEvents({
    zoomend: () => setViewTick((t) => t + 1),
    resize: () => setViewTick((t) => t + 1),
  });

  const q = props.filter.trim().toLowerCase();

  const labelSpecById = useMemo(() => {
    const out = new Map<string, PaddockLabelSpec>();

    for (const f of props.features) {
      const bounds = props.boundsById.get(f.properties.id);
      if (!bounds || !bounds.isValid()) continue;

      const nw = map.latLngToContainerPoint(bounds.getNorthWest());
      const se = map.latLngToContainerPoint(bounds.getSouthEast());
      const pixelWidth = Math.abs(se.x - nw.x);
      const pixelHeight = Math.abs(se.y - nw.y);

      // Allow wider labels on laptop screens so paddock names don't truncate early.
      const maxWidthPx = clamp(pixelWidth * 0.92, 36, 520);

      const nameLen = Math.max(f.properties.name.trim().length, 4);
      const rawSize = (maxWidthPx / nameLen) * 1.62;
      const fontSizePx = clamp(rawSize, 9, 22);

      const matches = !q || f.properties.name.toLowerCase().includes(q);
      const isSelected = props.selectedPaddockId === f.properties.id;
      const tiny = pixelWidth < 40 || pixelHeight < 24;

      out.set(f.properties.id, {
        maxWidthPx,
        fontSizePx: tiny ? 9 : fontSizePx,
        opacity: isSelected || matches ? 0.95 : 0.18,
      });
    }

    return out;
  }, [map, props.boundsById, props.features, props.selectedPaddockId, q, viewTick]);

  useEffect(() => {
    // Keep label sizing in sync with the current zoom/viewport.
    for (const f of props.features) {
      const layer = layersByIdRef.current.get(f.properties.id);
      if (!layer) continue;
      bindPaddockLabel(layer, f.properties.name, labelSpecById.get(f.properties.id));
    }
  }, [labelSpecById, props.features]);

  return (
    <>
      {props.features.map((f) => {
        const active = props.selectedPaddockId === f.properties.id;
        const matches = !q || f.properties.name.toLowerCase().includes(q);

        const style = {
          color: active ? "#15392c" : "#2c6e49",
          weight: active ? 3 : 2,
          opacity: q && !matches && !active ? 0.25 : active ? 0.95 : 0.85,
          fillColor: "#2c6e49",
          fillOpacity: q && !matches && !active ? 0.05 : active ? 0.36 : 0.18,
        };

        return (
          <GeoJSON
            key={f.properties.id + (active ? ":active" : ":idle")}
            data={f as any}
            style={style as any}
            eventHandlers={{
              click: () => props.onSelectPaddock(f.properties.id),
            }}
            onEachFeature={(_feature, layer) => {
              layersByIdRef.current.set(f.properties.id, layer);
              bindPaddockLabel(layer, f.properties.name, labelSpecById.get(f.properties.id));
            }}
          />
        );
      })}
    </>
  );
}

function assetColor(type: WaterAsset["type"]): string {
  switch (type) {
    case "DAM":
      return "#1f5b99";
    case "BORE":
      return "#1f7a6d";
    case "TROUGH":
      return "#b45309";
    case "PIPE":
      return "#334155";
    case "VALVE":
      return "#b42318";
    case "JUNCTION":
      return "#2c6e49";
    default:
      return "#2c6e49";
  }
}

function issueColor(category: IssueCategory): string {
  switch (category) {
    case "DEAD_STOCK":
      return "#b42318";
    case "LOW_WATER":
      return "#1f5b99";
    case "LOW_FEED":
      return "#b45309";
    case "FENCE":
      return "#4338ca";
    case "OTHER":
      return "#334155";
    case "GENERAL":
    default:
      return "#2c6e49";
  }
}

function taskColor(status: TaskStatus): string {
  switch (status) {
    case "OPEN":
      return "#2563eb";
    case "IN_PROGRESS":
      return "#2c6e49";
    case "BLOCKED":
      return "#b45309";
    case "DONE":
      return "#64748b";
    case "CANCELLED":
      return "#475569";
    default:
      return "#2563eb";
  }
}

function pestColor(severity: string | null | undefined): string {
  const s = (severity ?? "").trim().toLowerCase();
  if (!s) return "#6b7280";
  if (s.startsWith("h")) return "#b42318";
  if (s.startsWith("m")) return "#b45309";
  if (s.startsWith("l")) return "#2c6e49";
  return "#6b7280";
}


const CATEGORY_OPTIONS: Array<{ value: IssueCategory; label: string; defaultTitle: string }> = [
  { value: "DEAD_STOCK", label: "Dead sheep", defaultTitle: "Dead sheep" },
  { value: "LOW_WATER", label: "Low water", defaultTitle: "Low water" },
  { value: "LOW_FEED", label: "Low feeder", defaultTitle: "Low feeder" },
  { value: "FENCE", label: "Fence", defaultTitle: "Fence issue" },
  { value: "GENERAL", label: "General", defaultTitle: "General issue" },
  { value: "OTHER", label: "Other", defaultTitle: "Issue" },
];

function isOpenIssueStatus(status: Issue["status"]): boolean {
  return status !== "RESOLVED" && status !== "CLOSED";
}

function mapAlertToCategory(alertType: MapAlertType): IssueCategory {
  if (alertType === "LOW_WATER") return "LOW_WATER";
  if (alertType === "LOW_FEED") return "LOW_FEED";
  return "OTHER";
}

type CreateTaggedIssueInput = {
  category: IssueCategory;
  title: string;
  severity?: string;
  notes?: string;
  paddockId?: string | null;
  mobId?: string | null;
  feederId?: string | null;
  waterAssetId?: string | null;
  locationGeoJson?: unknown | null;
};

async function createTaggedIssue(input: CreateTaggedIssueInput): Promise<Issue> {
  const id = createUuid();

  const body = {
    id,
    category: input.category,
    title: input.title,
    description: input.notes || undefined,
    status: "OPEN" as const,
    severity: input.severity || undefined,
    paddockId: input.paddockId ?? null,
    mobId: input.mobId ?? null,
    feederId: input.feederId ?? null,
    waterAssetId: input.waterAssetId ?? null,
    locationGeoJson: input.locationGeoJson ?? null,
  };

  try {
    const response = await apiFetch<ApiSingleResponse<Issue>>("/issues", {
      method: "POST",
      body: JSON.stringify(body),
    });

    await upsertEntities("issues", [response.data as any]);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: Issue = {
      id,
      farmId: getFarmId(),
      category: input.category,
      title: input.title,
      description: input.notes ? input.notes : null,
      status: "OPEN",
      severity: input.severity ? input.severity : null,
      locationGeoJson: input.locationGeoJson ?? null,
      paddockId: input.paddockId ?? null,
      mobId: input.mobId ?? null,
      feederId: input.feederId ?? null,
      waterAssetId: input.waterAssetId ?? null,
      createdById: getUserId(),
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };

    await upsertEntities("issues", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      category: local.category,
      title: local.title,
      status: local.status,
    };

    if (local.description) actionData.description = local.description;
    if (local.severity) actionData.severity = local.severity;
    if (local.locationGeoJson) actionData.locationGeoJson = local.locationGeoJson;
    if (local.paddockId) actionData.paddockId = local.paddockId;
    if (local.mobId) actionData.mobId = local.mobId;
    if (local.feederId) actionData.feederId = local.feederId;
    if (local.waterAssetId) actionData.waterAssetId = local.waterAssetId;

    await enqueueAction({
      entity: "issues",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

export function MapPage(props: { focus?: MapFocus | null; onFocusConsumed?: () => void }) {
  const qc = useQueryClient();

  const paddocksQuery = useQuery({ queryKey: ["paddocks"], queryFn: getPaddocks, staleTime: 30_000 });
  const mobsQuery = useQuery({ queryKey: ["mobs"], queryFn: getMobs, staleTime: 30_000 });
  const waterAssetsQuery = useQuery({ queryKey: ["water-assets"], queryFn: getWaterAssets, staleTime: 30_000 });
  const waterLinksQuery = useQuery({ queryKey: ["water-links"], queryFn: getWaterLinks, staleTime: 30_000 });
  const feedersQuery = useQuery({ queryKey: ["feeders"], queryFn: getFeeders, staleTime: 30_000 });
  const issuesQuery = useQuery({ queryKey: ["issues"], queryFn: getIssues, staleTime: 20_000 });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: getTasks, staleTime: 20_000 });
  const pestsQuery = useQuery({ queryKey: ["pest-spottings"], queryFn: getPestSpottings, staleTime: 30_000 });
  const allocationsQuery = useQuery({
    queryKey: ["mob-paddock-allocations", { active: true }],
    queryFn: getActiveMobPaddockAllocations,
    staleTime: 30_000,
  });


  const alertsQuery = useQuery({
    queryKey: ["map-alerts"],
    queryFn: getMapAlerts,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  const [selectedPaddockId, setSelectedPaddockId] = useState<string | null>(null);
  const [selectedWaterAssetId, setSelectedWaterAssetId] = useState<string | null>(null);
  const [selectedMobId, setSelectedMobId] = useState<string | null>(null);

  const [selectedFeederId, setSelectedFeederId] = useState<string | null>(null);

  const [focusMarker, setFocusMarker] = useState<FocusMarker | null>(null);

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedAlertKey, setSelectedAlertKey] = useState<string | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPestId, setSelectedPestId] = useState<string | null>(null);

  const [paddockFilter, setPaddockFilter] = useState("");
  const [mobFilter, setMobFilter] = useState("");
  const [waterFilter, setWaterFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [pestSeverityFilter, setPestSeverityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW" | "OTHER">("ALL");
  const [pestDaysFilter, setPestDaysFilter] = useState<"ALL" | "7" | "30" | "90">("30");

  const [showIssuesLayer, setShowIssuesLayer] = useState(true);
  const [showAlertsLayer, setShowAlertsLayer] = useState(true);

  const [showMobsLayer, setShowMobsLayer] = useState(true);
  const [showFeedersLayer, setShowFeedersLayer] = useState(false);

  const [showTasksLayer, setShowTasksLayer] = useState(false);
  const [showPestsLayer, setShowPestsLayer] = useState(false);

  const [tagOpen, setTagOpen] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);

  const [tagCategory, setTagCategory] = useState<IssueCategory>("DEAD_STOCK");
  const [tagTitle, setTagTitle] = useState("");
  const [tagSeverity, setTagSeverity] = useState("");
  const [tagNotes, setTagNotes] = useState("");

  const [tagPaddockId, setTagPaddockId] = useState("");
  const [tagMobId, setTagMobId] = useState("");
  const [tagWaterAssetId, setTagWaterAssetId] = useState("");
  const [tagFeederId, setTagFeederId] = useState("");
  const [tagPoint, setTagPoint] = useState<ParsedPoint | null>(null);
  const [tagFiles, setTagFiles] = useState<File[]>([]);
  const [tagUploading, setTagUploading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  const [legendOpen, setLegendOpen] = useState(false);

  const [locationBusy, setLocationBusy] = useState(false);
  const [myLocation, setMyLocation] = useState<BrowserLocation | null>(null);

  const issueIconCacheRef = useRef(new Map<string, L.DivIcon>());
  const alertIconCacheRef = useRef(new Map<string, L.DivIcon>());

  const taskIconCacheRef = useRef(new Map<string, L.DivIcon>());
  const pestIconCacheRef = useRef(new Map<string, L.DivIcon>());

  const getIssueIcon = (category: IssueCategory, active: boolean): L.DivIcon => {
    const key = `${category}:${active ? "a" : "i"}`;
    const cached = issueIconCacheRef.current.get(key);
    if (cached) return cached;
    const icon = makeMapBadgeIcon({ kind: "issue", glyph: issueGlyph(category), color: issueColor(category), active });
    issueIconCacheRef.current.set(key, icon);
    return icon;
  };

  const getAlertIcon = (alertType: MapAlertType, active: boolean): L.DivIcon => {
    const key = `${alertType}:${active ? "a" : "i"}`;
    const cached = alertIconCacheRef.current.get(key);
    if (cached) return cached;
    const icon = makeMapBadgeIcon({ kind: "alert", glyph: alertGlyph(alertType), color: alertColor(alertType), active });
    alertIconCacheRef.current.set(key, icon);
    return icon;
  };

  const getTaskIcon = (status: TaskStatus, active: boolean): L.DivIcon => {
    const key = `${status}:${active ? "a" : "i"}`;
    const cached = taskIconCacheRef.current.get(key);
    if (cached) return cached;
    const icon = makeMapBadgeIcon({ kind: "issue", glyph: "T", color: taskColor(status), active });
    taskIconCacheRef.current.set(key, icon);
    return icon;
  };

  const getPestIcon = (severity: string | null | undefined, active: boolean): L.DivIcon => {
    const sevKey = (severity ?? "").trim().toLowerCase();
    const key = `${sevKey}:${active ? "a" : "i"}`;
    const cached = pestIconCacheRef.current.get(key);
    if (cached) return cached;
    const icon = makeMapBadgeIcon({ kind: "issue", glyph: "P", color: pestColor(severity), active });
    pestIconCacheRef.current.set(key, icon);
    return icon;
  };

  const paddockFeatures = useMemo(() => {
    const paddocks = paddocksQuery.data ?? [];

    const out: GeoJsonFeature[] = [];

    for (const p of paddocks) {
      const geometry = toGeometry(p.boundaryGeoJson);
      if (!geometry) continue;

      const computedHa = areaHaFromGeoJson(geometry);
      const ha = computedHa ?? toNumberOrNull(p.areaHa);

      out.push({
        type: "Feature",
        properties: {
          id: p.id,
          name: p.name,
          areaHa: ha !== null ? String(ha) : null,
        },
        geometry,
      });
    }

    return out;
  }, [paddocksQuery.data]);

  const paddockBoundsById = useMemo(() => {
    const map = new Map<string, L.LatLngBounds>();

    for (const f of paddockFeatures) {
      try {
        const layer = L.geoJSON(f as any);
        const bounds = layer.getBounds();
        if (!bounds.isValid()) continue;
        map.set(f.properties.id, bounds);
      } catch {
        // ignore geometry errors
      }
    }

    return map;
  }, [paddockFeatures]);

  const paddockCentersById = useMemo(() => {
    const map = new Map<string, ParsedPoint>();

    for (const [id, bounds] of paddockBoundsById) {
      const c = bounds.getCenter();
      map.set(id, { lat: c.lat, lon: c.lng });
    }

    return map;
  }, [paddockBoundsById]);

  const paddockFeatureCollection: GeoJsonFeatureCollection | null = useMemo(() => {
    if (paddockFeatures.length === 0) return null;
    return { type: "FeatureCollection", features: paddockFeatures };
  }, [paddockFeatures]);

  const selectedPaddockFeature = useMemo(() => {
    if (!selectedPaddockId) return null;
    return paddockFeatures.find((f) => f.properties.id === selectedPaddockId) ?? null;
  }, [paddockFeatures, selectedPaddockId]);
  const paddockMatchCount = useMemo(() => {
    const q = paddockFilter.trim().toLowerCase();
    if (!q) return paddockFeatures.length;
    return paddockFeatures.filter((f) => f.properties.name.toLowerCase().includes(q)).length;
  }, [paddockFeatures, paddockFilter]);

  const paddocksById = useMemo(() => new Map((paddocksQuery.data ?? []).map((p) => [p.id, p])), [paddocksQuery.data]);

  const paddockAreaHaById = useMemo(() => {
    const map = new Map<string, number>();

    for (const f of paddockFeatures) {
      const area = toNumberOrNull(f.properties.areaHa);
      if (area !== null && area > 0) {
        map.set(f.properties.id, area);
      }
    }

    for (const p of paddocksQuery.data ?? []) {
      if (map.has(p.id)) continue;
      const area = toNumberOrNull(p.areaHa);
      if (area !== null && area > 0) {
        map.set(p.id, area);
      }
    }

    return map;
  }, [paddockFeatures, paddocksQuery.data]);

  const mobsSorted = useMemo(() => {
    return (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data]);

  const mobById = useMemo(() => new Map(mobsSorted.map((m) => [m.id, m])), [mobsSorted]);

  const activeAllocations = useMemo(() => {
    return (allocationsQuery.data ?? []).filter((a) => !a.endedAt);
  }, [allocationsQuery.data]);

  const allocationsByMobId = useMemo(() => {
    const map = new Map<string, MobPaddockAllocation[]>();
    for (const a of activeAllocations) {
      const list = map.get(a.mobId) ?? [];
      list.push(a);
      map.set(a.mobId, list);
    }
    return map;
  }, [activeAllocations]);

  const mobPaddockIdsByMobId = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const mob of mobsSorted) {
      const ids: string[] = [];
      const seen = new Set<string>();

      const addPaddockId = (paddockId: string | null | undefined) => {
        if (!paddockId || seen.has(paddockId)) return;
        seen.add(paddockId);
        ids.push(paddockId);
      };

      const allocs = allocationsByMobId.get(mob.id) ?? [];
      for (const a of allocs) {
        addPaddockId(a.paddockId);
      }

      addPaddockId(mob.currentPaddockId ?? null);
      map.set(mob.id, ids);
    }

    return map;
  }, [allocationsByMobId, mobsSorted]);

  const mobPaddockNamesByMobId = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const mob of mobsSorted) {
      const ids = mobPaddockIdsByMobId.get(mob.id) ?? [];
      const names = ids.map((id) => paddocksById.get(id)?.name ?? "(unknown paddock)");
      map.set(mob.id, names);
    }

    return map;
  }, [mobPaddockIdsByMobId, mobsSorted, paddocksById]);

  const mobMarkers = useMemo(() => {
    const markers: Array<{
      key: string;
      mob: Mob;
      point: ParsedPoint;
      paddockId: string;
      headCount: number | null;
      source: string;
    }> = [];

    for (const mob of mobsSorted) {
      const allocs = allocationsByMobId.get(mob.id) ?? [];
      const seenPaddockIds = new Set<string>();

      for (const a of allocs) {
        const c = paddockCentersById.get(a.paddockId);
        if (!c) continue;
        const resolvedHeadCount = typeof a.headCount === "number" ? a.headCount : mob.headCount;

        markers.push({
          key: `moballoc:${a.id}`,
          mob,
          point: offsetPointSouth(c, 12),
          paddockId: a.paddockId,
          headCount: typeof resolvedHeadCount === "number" ? resolvedHeadCount : null,
          source: "allocation",
        });
        seenPaddockIds.add(a.paddockId);
      }

      const pid = mob.currentPaddockId ?? null;
      if (!pid) continue;
      if (seenPaddockIds.has(pid)) continue;
      const c = paddockCentersById.get(pid);
      if (!c) continue;

      markers.push({
        key: `mob:${mob.id}`,
        mob,
        point: offsetPointSouth(c, 12),
        paddockId: pid,
        headCount: typeof mob.headCount === "number" ? mob.headCount : null,
        source: "current",
      });
    }

    return markers;
  }, [allocationsByMobId, mobsSorted, paddockCentersById]);

  const mobLinkSegments = useMemo(() => {
    const segments: Array<{
      key: string;
      mobId: string;
      label: string;
      positions: [[number, number], [number, number]];
    }> = [];

    for (const mob of mobsSorted) {
      const paddockIds = mobPaddockIdsByMobId.get(mob.id) ?? [];
      if (paddockIds.length < 2) continue;

      const paddocksWithCenters = paddockIds
        .map((id) => {
          const center = paddockCentersById.get(id);
          if (!center) return null;
          return {
            id,
            name: paddocksById.get(id)?.name ?? "(unknown paddock)",
            center,
          };
        })
        .filter((v): v is NonNullable<typeof v> => !!v);

      if (paddocksWithCenters.length < 2) continue;
      paddocksWithCenters.sort((a, b) => a.name.localeCompare(b.name));

      const anchor = paddocksWithCenters[0];
      for (let i = 1; i < paddocksWithCenters.length; i += 1) {
        const target = paddocksWithCenters[i];
        segments.push({
          key: `moblink:${mob.id}:${anchor.id}:${target.id}`,
          mobId: mob.id,
          label: `${mob.name}: ${anchor.name} -> ${target.name}`,
          positions: [
            [anchor.center.lat, anchor.center.lon],
            [target.center.lat, target.center.lon],
          ],
        });
      }
    }

    return segments;
  }, [mobPaddockIdsByMobId, mobsSorted, paddockCentersById, paddocksById]);

  const selectedMob = useMemo(() => {
    if (!selectedMobId) return null;
    return (mobsQuery.data ?? []).find((m) => m.id === selectedMobId) ?? null;
  }, [mobsQuery.data, selectedMobId]);

  const selectedMobPaddockSummary = useMemo(() => {
    if (!selectedMob) return "";
    const names = mobPaddockNamesByMobId.get(selectedMob.id) ?? [];
    return names.join(", ");
  }, [mobPaddockNamesByMobId, selectedMob]);

  useEffect(() => {
    // Backfill paddock selection when focusing a mob before mobs have loaded.
    if (!selectedMobId) return;
    if (selectedPaddockId) return;

    const paddockIds = mobPaddockIdsByMobId.get(selectedMobId) ?? [];
    if (paddockIds.length) {
      setSelectedPaddockId(paddockIds[0]);
      return;
    }

    const mob = mobById.get(selectedMobId) ?? null;
    if (mob?.currentPaddockId) {
      setSelectedPaddockId(mob.currentPaddockId);
    }
  }, [mobById, mobPaddockIdsByMobId, selectedMobId, selectedPaddockId]);

  const mobListItems = useMemo(() => {
    const q = mobFilter.trim().toLowerCase();
    if (!q) return mobsSorted;
    return mobsSorted.filter((m) => {
      const paddockNames = mobPaddockNamesByMobId.get(m.id) ?? [];
      return (
        m.name.toLowerCase().includes(q) ||
        m.species.toLowerCase().includes(q) ||
        paddockNames.some((name) => name.toLowerCase().includes(q))
      );
    });
  }, [mobFilter, mobPaddockNamesByMobId, mobsSorted]);

  const waterPoints = useMemo(() => {
    const assets = waterAssetsQuery.data ?? [];

    return assets
      .map((a) => {
        const point = parsePoint(a.locationGeoJson);
        if (!point) return null;
        return {
          id: a.id,
          name: a.name,
          type: a.type,
          lat: point.lat,
          lon: point.lon,
          capacityLitres: a.capacityLitres ?? null,
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [waterAssetsQuery.data]);

  const waterPointById = useMemo(() => new Map(waterPoints.map((p) => [p.id, p])), [waterPoints]);

  const selectedWaterPoint = useMemo(() => {
    if (!selectedWaterAssetId) return null;
    return waterPoints.find((p) => p.id === selectedWaterAssetId) ?? null;
  }, [selectedWaterAssetId, waterPoints]);

  const waterListItems = useMemo(() => {
    const q = waterFilter.trim().toLowerCase();
    if (!q) return waterPoints;
    return waterPoints.filter((p) => p.name.toLowerCase().includes(q));
  }, [waterFilter, waterPoints]);

  const feederPoints = useMemo(() => {
    const feeders = feedersQuery.data ?? [];

    return feeders
      .map((f) => {
        const point = parsePoint(f.locationGeoJson);
        if (!point) return null;
        return {
          id: f.id,
          name: f.name,
          feederType: f.feederType,
          lat: point.lat,
          lon: point.lon,
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [feedersQuery.data]);

  const feederPointById = useMemo(() => new Map(feederPoints.map((p) => [p.id, p])), [feederPoints]);

  const selectedFeederPoint = useMemo(() => {
    if (!selectedFeederId) return null;
    return feederPoints.find((p) => p.id === selectedFeederId) ?? null;
  }, [selectedFeederId, feederPoints]);

  const waterLinkSegments = useMemo(() => {
    const links = waterLinksQuery.data ?? [];

    const byId = new Map(waterPoints.map((p) => [p.id, p]));

    return links
      .map((l) => {
        const from = byId.get(l.fromAssetId);
        const to = byId.get(l.toAssetId);
        if (!from || !to) return null;

        return {
          id: l.id,
          connectionType: l.connectionType,
          positions: [
            [from.lat, from.lon] as [number, number],
            [to.lat, to.lon] as [number, number],
          ],
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
  }, [waterLinksQuery.data, waterPoints]);

  const openIssues = useMemo(() => {
    const issues = issuesQuery.data ?? [];
    const q = issueFilter.trim().toLowerCase();

    const filtered = issues.filter((i) => {
      if (!isOpenIssueStatus(i.status)) return false;

      if (!q) return true;
      const hay = `${i.category} ${i.title} ${i.severity ?? ""} ${i.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return filtered;
  }, [issueFilter, issuesQuery.data]);

  const selectedIssue = useMemo(() => {
    if (!selectedIssueId) return null;
    return (issuesQuery.data ?? []).find((i) => i.id === selectedIssueId) ?? null;
  }, [issuesQuery.data, selectedIssueId]);

  const issueMarkers = useMemo(() => {
    const markers: Array<{
      issue: Issue;
      point: ParsedPoint;
      source: string;
    }> = [];

    for (const issue of openIssues) {
      const direct = parsePoint(issue.locationGeoJson);
      if (direct) {
        markers.push({ issue, point: direct, source: "pin" });
        continue;
      }

      if (issue.waterAssetId) {
        const w = waterPointById.get(issue.waterAssetId);
        if (w) {
          markers.push({ issue, point: { lat: w.lat, lon: w.lon }, source: "water" });
          continue;
        }
      }

      if (issue.feederId) {
        const f = feederPointById.get(issue.feederId);
        if (f) {
          markers.push({ issue, point: { lat: f.lat, lon: f.lon }, source: "feeder" });
          continue;
        }
      }

      if (issue.paddockId) {
        const c = paddockCentersById.get(issue.paddockId);
        if (c) {
          markers.push({ issue, point: c, source: "paddock" });
          continue;
        }
      }

      if (issue.mobId) {
        const mob = mobById.get(issue.mobId) ?? null;
        const paddockId = mob?.currentPaddockId ?? null;
        if (paddockId) {
          const c = paddockCentersById.get(paddockId);
          if (c) {
            markers.push({ issue, point: c, source: "mob" });
          }
        }
      }
    }

    return markers;
  }, [feederPointById, mobById, openIssues, paddockCentersById, waterPointById]);

  const alerts = alertsQuery.data ?? [];

  const openTasks = useMemo(() => {
    const tasks = tasksQuery.data ?? [];

    const filtered = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");

    filtered.sort((a, b) => {
      const aDue = a.dueAt ?? "";
      const bDue = b.dueAt ?? "";

      if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return filtered;
  }, [tasksQuery.data]);

  const openTasksFiltered = useMemo(() => {
    if (taskStatusFilter === "ALL") return openTasks;
    return openTasks.filter((t) => t.status === taskStatusFilter);
  }, [openTasks, taskStatusFilter]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return (tasksQuery.data ?? []).find((t) => t.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasksQuery.data]);

  const taskMarkers = useMemo(() => {
    const markers: Array<{
      task: Task;
      point: ParsedPoint;
      paddockId: string | null;
      source: string;
    }> = [];

    for (const task of openTasksFiltered) {
      if (task.paddockId) {
        const c = paddockCentersById.get(task.paddockId);
        if (c) {
          markers.push({ task, point: c, paddockId: task.paddockId, source: "paddock" });
          continue;
        }
      }

      if (task.mobId) {
        const mob = mobById.get(task.mobId) ?? null;
        const pid = mob?.currentPaddockId ?? (allocationsByMobId.get(task.mobId)?.[0]?.paddockId ?? null);
        if (!pid) continue;

        const c = paddockCentersById.get(pid);
        if (c) {
          markers.push({ task, point: c, paddockId: pid, source: "mob" });
        }
      }
    }

    return markers;
  }, [allocationsByMobId, mobById, openTasksFiltered, paddockCentersById]);

  const selectedTaskPoint = useMemo(() => {
    if (!selectedTask) return null;

    if (selectedTask.paddockId) {
      const c = paddockCentersById.get(selectedTask.paddockId);
      if (c) return c;
    }

    if (selectedTask.mobId) {
      const mob = mobById.get(selectedTask.mobId) ?? null;
      const pid = mob?.currentPaddockId ?? (allocationsByMobId.get(selectedTask.mobId)?.[0]?.paddockId ?? null);
      if (pid) {
        const c = paddockCentersById.get(pid);
        if (c) return c;
      }
    }

    return null;
  }, [allocationsByMobId, mobById, paddockCentersById, selectedTask]);

  const pestSpottingsSorted = useMemo(() => {
    const spottings = pestsQuery.data ?? [];
    const sorted = spottings.slice();
    sorted.sort((a, b) => b.spottedAt.localeCompare(a.spottedAt));
    return sorted;
  }, [pestsQuery.data]);

  const pestSpottingsFiltered = useMemo(() => {
    const now = Date.now();

    return pestSpottingsSorted.filter((s) => {
      if (pestSeverityFilter !== "ALL") {
        const sev = (s.severity ?? "").trim().toUpperCase();

        if (pestSeverityFilter === "OTHER") {
          if (sev === "HIGH" || sev === "MEDIUM" || sev === "LOW") return false;
        } else if (sev !== pestSeverityFilter) {
          return false;
        }
      }

      if (pestDaysFilter !== "ALL") {
        const ts = new Date(s.spottedAt).getTime();
        if (!Number.isFinite(ts)) return false;
        const days = Number(pestDaysFilter);
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        if (ts < cutoff) return false;
      }

      return true;
    });
  }, [pestDaysFilter, pestSeverityFilter, pestSpottingsSorted]);

  const pestSpottingsForMap = useMemo(() => pestSpottingsFiltered.slice(0, 200), [pestSpottingsFiltered]);

  const selectedPest = useMemo(() => {
    if (!selectedPestId) return null;
    return (pestsQuery.data ?? []).find((s) => s.id === selectedPestId) ?? null;
  }, [pestsQuery.data, selectedPestId]);

  const pestMarkers = useMemo(() => {
    const markers: Array<{
      spotting: PestSpotting;
      point: ParsedPoint;
      paddockId: string | null;
      source: string;
    }> = [];

    for (const spotting of pestSpottingsForMap) {
      const direct = parsePoint(spotting.locationGeoJson);
      if (direct) {
        markers.push({ spotting, point: direct, paddockId: spotting.paddockId ?? null, source: "pin" });
        continue;
      }

      if (spotting.paddockId) {
        const c = paddockCentersById.get(spotting.paddockId);
        if (c) {
          markers.push({ spotting, point: c, paddockId: spotting.paddockId, source: "paddock" });
        }
      }
    }

    return markers;
  }, [paddockCentersById, pestSpottingsForMap]);

  const selectedPestPoint = useMemo(() => {
    if (!selectedPest) return null;

    const direct = parsePoint(selectedPest.locationGeoJson);
    if (direct) return direct;

    if (selectedPest.paddockId) {
      const c = paddockCentersById.get(selectedPest.paddockId);
      if (c) return c;
    }

    return null;
  }, [paddockCentersById, selectedPest]);


  const alertMarkers = useMemo(() => {
    return alerts
      .map((a) => {
        const point = parsePoint(a.locationGeoJson);
        if (!point) return null;
        return { alert: a, point };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
  }, [alerts]);

  const selectedIssuePoint = useMemo(() => {
    if (!selectedIssueId) return null;
    const issue = (issuesQuery.data ?? []).find((i) => i.id === selectedIssueId) ?? null;
    if (!issue) return null;

    const direct = parsePoint(issue.locationGeoJson);
    if (direct) return direct;

    if (issue.waterAssetId) {
      const w = waterPointById.get(issue.waterAssetId);
      if (w) return { lat: w.lat, lon: w.lon };
    }

    if (issue.feederId) {
      const f = feederPointById.get(issue.feederId);
      if (f) return { lat: f.lat, lon: f.lon };
    }

    if (issue.paddockId) {
      const c = paddockCentersById.get(issue.paddockId);
      if (c) return c;
    }

    if (issue.mobId) {
      const mob = mobById.get(issue.mobId) ?? null;
      const paddockId = mob?.currentPaddockId ?? null;
      if (paddockId) {
        const c = paddockCentersById.get(paddockId);
        if (c) return c;
      }
    }

    return null;
  }, [selectedIssueId, issuesQuery.data, waterPointById, feederPointById, paddockCentersById, mobById]);

  const selectedAlertPoint = useMemo(() => {
    if (!selectedAlertKey) return null;
    const m = alertMarkers.find((x) => x.alert.key === selectedAlertKey) ?? null;
    return m?.point ?? null;
  }, [alertMarkers, selectedAlertKey]);

  const createMutation = useMutation({
    mutationFn: createTaggedIssue,
    onSuccess: async (created) => {
      setPickingLocation(false);
      setTagOpen(false);

      const files = tagFiles.slice();
      if (files.length && typeof navigator !== "undefined" && navigator.onLine) {
        setTagUploading(true);
        try {
          for (const file of files) {
            const form = new FormData();
            form.append("entityType", "ISSUE");
            form.append("entityId", created.id);
            form.append("capturedAt", new Date().toISOString());
            form.append("file", file, file.name);

            await apiFetch<ApiSingleResponse<unknown>>("/attachments/upload", {
              method: "POST",
              body: form as any,
            });
          }

          setNotice(`Tagged issue created (${files.length} attachment${files.length === 1 ? "" : "s"} uploaded).`);
        } catch (e) {
          setNotice(`Tagged issue created, but attachment upload failed: ${(e as Error).message}`);
        } finally {
          setTagUploading(false);
        }
      } else {
        setNotice("Tagged issue created.");
      }

      setTagTitle("");
      setTagSeverity("");
      setTagNotes("");
      setTagPoint(null);
      setTagFiles([]);
      setSelectedIssueId(null);
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const createFromAlertMutation = useMutation({
    mutationFn: async (alert: MapAlert) => {
      const category = mapAlertToCategory(alert.alertType);
      const notes = `Triggered: ${alert.sensorKey} = ${alert.value} ${alert.unit ?? ""} (threshold ${alert.threshold}). Observed: ${new Date(
        alert.observedAt,
      ).toLocaleString()}`;

      return createTaggedIssue({
        category,
        title: alert.title,
        severity: "high",
        notes,
        waterAssetId: alert.waterAssetId ?? null,
        feederId: alert.feederId ?? null,
        locationGeoJson: alert.locationGeoJson,
      });
    },
    onSuccess: async () => {
      setNotice("Issue created from alert.");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const busy = createMutation.isPending || createFromAlertMutation.isPending || tagUploading;

  const initialCenter: [number, number] = [-37.7911, 142.212];

  useEffect(() => {
    const focus = props.focus;
    if (!focus) return;

    setNotice(null);

    if (focus.kind === "PADDOCK") {
      setFocusMarker(null);
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedFeederId(null);
      setSelectedWaterAssetId(null);
      setSelectedPaddockId(focus.paddockId);
    } else if (focus.kind === "MOB") {
      setFocusMarker(null);
      setShowMobsLayer(true);
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedFeederId(null);
      setSelectedWaterAssetId(null);
      setSelectedMobId(focus.mobId);
      const mob = mobById.get(focus.mobId) ?? null;
      setSelectedPaddockId(mob?.currentPaddockId ?? null);
    } else if (focus.kind === "WATER_ASSET") {
      setFocusMarker(null);
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedFeederId(null);
      setSelectedPaddockId(null);
      setSelectedWaterAssetId(focus.waterAssetId);
    } else if (focus.kind === "FEEDER") {
      setFocusMarker(null);
      setShowFeedersLayer(true);
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedWaterAssetId(null);
      setSelectedPaddockId(null);
      setSelectedFeederId(focus.feederId);
    } else if (focus.kind === "ISSUE") {
      setFocusMarker(null);
      setShowIssuesLayer(true);
      setSelectedAlertKey(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedFeederId(null);
      setSelectedWaterAssetId(null);
      setSelectedPaddockId(null);
      setSelectedIssueId(focus.issueId);
    } else if (focus.kind === "POINT") {
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedFeederId(null);
      setSelectedWaterAssetId(null);
      setSelectedPaddockId(null);
      setFocusMarker({ point: focus.point, label: focus.label ?? "Location" });
    } else if (focus.kind === "GEOJSON_POINT") {
      const p = parsePoint(focus.geoJson);
      setSelectedAlertKey(null);
      setSelectedIssueId(null);
      setSelectedTaskId(null);
      setSelectedPestId(null);
      setSelectedMobId(null);
      setSelectedFeederId(null);
      setSelectedWaterAssetId(null);
      setSelectedPaddockId(null);
      if (p) {
        setFocusMarker({ point: p, label: focus.label ?? "Location" });
      } else {
        setFocusMarker(null);
      }
    }

    props.onFocusConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus]);

  const openTagger = () => {
    setNotice(null);
    setTagOpen(true);
    setPickingLocation(false);
    setTagFiles([]);

    // Prefill based on current selection.
    setTagPaddockId(selectedPaddockId ?? "");
    setTagMobId(selectedMobId ?? "");
    setTagWaterAssetId(selectedWaterAssetId ?? "");

    if (!tagTitle.trim()) {
      const def = CATEGORY_OPTIONS.find((c) => c.value === tagCategory)?.defaultTitle ?? "Issue";
      setTagTitle(def);
    }
  };


  const getFreshMyLocation = async (): Promise<BrowserLocation> => {
    const cached = myLocation;
    if (cached) {
      const t = new Date(cached.observedAt).getTime();
      if (Number.isFinite(t) && Date.now() - t < 30_000) return cached;
    }

    if (locationBusy) {
      throw new Error("Location request already in progress");
    }

    setLocationBusy(true);
    try {
      const loc = await getCurrentBrowserLocation();
      setMyLocation(loc);
      return loc;
    } finally {
      setLocationBusy(false);
    }
  };

  const showMyLocation = async (): Promise<void> => {
    setNotice(null);
    try {
      const loc = await getFreshMyLocation();
      const acc = typeof loc.accuracyM === "number" ? ` (+/-${Math.round(loc.accuracyM)}m)` : "";
      setFocusMarker({ point: loc.point, label: `You${acc}`, color: "#2563eb" });
    } catch (e) {
      setNotice(`Location error: ${(e as Error).message}`);
    }
  };

  const openTaggerAtMyLocation = async (): Promise<void> => {
    setNotice(null);
    try {
      const loc = await getFreshMyLocation();
      openTagger();
      setPickingLocation(false);
      setTagPoint(loc.point);
      setNotice(`Pin set to your location: ${loc.point.lat.toFixed(6)}, ${loc.point.lon.toFixed(6)}`);
    } catch (e) {
      setNotice(`Location error: ${(e as Error).message}`);
    }
  };

  const setTagPinToMyLocation = async (): Promise<void> => {
    setNotice(null);
    try {
      const loc = await getFreshMyLocation();
      setPickingLocation(false);
      setTagPoint(loc.point);
      setNotice(`Pin set to your location: ${loc.point.lat.toFixed(6)}, ${loc.point.lon.toFixed(6)}`);
    } catch (e) {
      setNotice(`Location error: ${(e as Error).message}`);
    }
  };

  const refreshAll = () => {
    void paddocksQuery.refetch();
    void mobsQuery.refetch();
    void allocationsQuery.refetch();
    void waterAssetsQuery.refetch();
    void waterLinksQuery.refetch();
    void feedersQuery.refetch();
    void issuesQuery.refetch();
    void tasksQuery.refetch();
    void pestsQuery.refetch();
    void alertsQuery.refetch();
  };

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Map</h3>
          <p className="muted">
            View paddocks, mobs, water points, and tagged issues on the map.
          </p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={refreshAll} disabled={busy}>
            Refresh
          </button>
          <button
            className={showIssuesLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowIssuesLayer((v) => !v)}
            disabled={busy}
          >
            Issues
          </button>
          <button
            className={showAlertsLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowAlertsLayer((v) => !v)}
            disabled={busy}
            title="Triggered tags from telemetry (configure thresholds in Telemetry > sensor metadata)."
          >
            Alerts
          </button>
          <button
            className={showMobsLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowMobsLayer((v) => !v)}
            disabled={busy}
          >
            Mobs
          </button>
          <button
            className={showFeedersLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowFeedersLayer((v) => !v)}
            disabled={busy}
          >
            Feeders
          </button>
          <button
            className={showTasksLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowTasksLayer((v) => !v)}
            disabled={busy}
          >
            Tasks
          </button>
          <button
            className={showPestsLayer ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setShowPestsLayer((v) => !v)}
            disabled={busy}
          >
            Pests
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void showMyLocation()}
            disabled={busy || locationBusy}
            title="Uses your device location (requires permission)."
          >
            {locationBusy ? "Locating..." : "My location"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void openTaggerAtMyLocation()}
            disabled={busy || locationBusy}
            title="Opens a new tag with the pin set to your current location."
          >
            Tag from location
          </button>
          <button className="btn" type="button" onClick={openTagger} disabled={busy}>
            New tag
          </button>
        </div>
      </header>

      {notice ? (
        <div className="pill" style={{ marginTop: 10 }}>
          {notice}
        </div>
      ) : null}

      {pickingLocation ? (
        <div className="pill" style={{ marginTop: 10 }}>
          Click on the map to drop a pin...
        </div>
      ) : null}

      <div className="mapGrid" style={{ marginTop: 12 }}>
        <aside className="mapSide">
          <div className="mapSideHead">
            <div className="pill">
              {paddockFilter.trim()
                ? `${paddockMatchCount} match${paddockMatchCount === 1 ? "" : "es"} / ${paddockFeatures.length} paddocks`
                : `${paddockFeatures.length} paddocks with boundary`}
            </div>
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            Search paddocks
            <input
              className="input"
              value={paddockFilter}
              onChange={(e) => setPaddockFilter(e.target.value)}
              placeholder="Type a paddock name"
            />
          </label>

          <div className="hr" />

          <div className="muted" style={{ fontSize: 13 }}>
            Labels are shown on the map. Search will dim non-matching paddocks.
          </div>

          {paddockFilter.trim() && paddockMatchCount === 0 && !paddocksQuery.isLoading ? (
            <p className="muted" style={{ marginTop: 8 }}>
              No matches.
            </p>
          ) : null}

          <div className="hr" style={{ marginTop: 12 }} />

          <div className="mapSideHead">
            <div className="pill">{mobsSorted.length} mobs</div>
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            Search mobs
            <input className="input" value={mobFilter} onChange={(e) => setMobFilter(e.target.value)} placeholder="Type a mob name" />
          </label>

          <div className="hr" />

          <div className="mapList" role="list">
            {mobListItems.map((m) => {
              const active = selectedMobId === m.id;
              const paddockIds = mobPaddockIdsByMobId.get(m.id) ?? [];
              const paddockNames = mobPaddockNamesByMobId.get(m.id) ?? [];
              const paddockSummary = paddockNames.join(", ");
              const firstPaddockId = paddockIds[0] ?? null;
              let totalAreaHa = 0;
              for (const paddockId of paddockIds) {
                totalAreaHa += paddockAreaHaById.get(paddockId) ?? 0;
              }
              const stockingRate = formatStockingRate(m.headCount, totalAreaHa > 0 ? totalAreaHa : null);

              return (
                <button
                  key={m.id}
                  type="button"
                  className={active ? "mapItem mapItemActive" : "mapItem"}
                  onClick={() => {
                    setFocusMarker(null);
                    setSelectedAlertKey(null);
                    setSelectedIssueId(null);
                    setSelectedTaskId(null);
                    setSelectedPestId(null);
                    setSelectedFeederId(null);
                    setSelectedMobId(m.id);
                    setSelectedWaterAssetId(null);
                    setSelectedPaddockId(firstPaddockId);
                  }}
                >
                  <div className="mapItemName">{m.name}</div>
                  <div className="mapItemMeta">
                    {m.species} | {m.headCount} head{paddockSummary ? " | in " + paddockSummary : ""}
                    {stockingRate ? ` | ${stockingRate}` : ""}
                  </div>
                </button>
              );
            })}

            {mobListItems.length === 0 && !mobsQuery.isLoading ? <p className="muted">No matches.</p> : null}
          </div>

          <div className="hr" style={{ marginTop: 12 }} />

          <div className="mapSideHead">
            <div className="pill">{waterPoints.length} water assets with location</div>
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            Search water
            <input className="input" value={waterFilter} onChange={(e) => setWaterFilter(e.target.value)} placeholder="Type an asset name" />
          </label>

          <div className="hr" />

          <div className="mapList" role="list">
            {waterListItems.map((p) => {
              const active = selectedWaterAssetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={active ? "mapItem mapItemActive" : "mapItem"}
                  onClick={() => {
                    setFocusMarker(null);
                    setSelectedAlertKey(null);
                    setSelectedIssueId(null);
                    setSelectedTaskId(null);
                    setSelectedPestId(null);
                    setSelectedMobId(null);
                    setSelectedFeederId(null);
                    setSelectedWaterAssetId(p.id);
                  }}
                >
                  <div className="mapItemName">{p.name}</div>
                  <div className="mapItemMeta">
                    {p.type}
                    {p.capacityLitres ? " | " + Number(p.capacityLitres).toFixed(0) + " L" : ""}
                  </div>
                </button>
              );
            })}

            {waterListItems.length === 0 ? <p className="muted">No matches.</p> : null}
          </div>

          <div className="hr" style={{ marginTop: 12 }} />

          <div className="mapSideHead">
            <div className="pill">{openIssues.length} open issues</div>
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            Filter issues
            <input
              className="input"
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value)}
              placeholder="Type: dead, water, fence..."
            />
          </label>

          <div className="hr" />

          <div className="mapList" role="list">
            {openIssues.slice(0, 40).map((i) => {
              const active = selectedIssueId === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  className={active ? "mapItem mapItemActive" : "mapItem"}
                  onClick={() => {
                    setFocusMarker(null);
                    setSelectedAlertKey(null);
                    setSelectedTaskId(null);
                    setSelectedPestId(null);
                    setSelectedMobId(null);
                    setSelectedWaterAssetId(null);
                    setSelectedFeederId(null);
                    setSelectedIssueId(i.id);
                  }}
                >
                  <div className="mapItemName">
                    <span className="badge" style={{ borderColor: issueColor(i.category) }}>
                      {i.category}
                    </span>{" "}
                    {i.title}
                  </div>
                  <div className="mapItemMeta">Updated: {new Date(i.updatedAt).toLocaleString()}</div>
                </button>
              );
            })}

            {openIssues.length === 0 && !issuesQuery.isLoading ? (
              <p className="muted">
                No open issues. Use "New tag" to mark something (dead sheep, low water, fence, etc).
              </p>
            ) : null}

            {openIssues.length > 40 ? <p className="muted">Showing 40 of {openIssues.length}.</p> : null}
          </div>

          <div className="hr" style={{ marginTop: 12 }} />

          <div className="mapSideHead">
            <div className="pill">{openTasksFiltered.length} open tasks{taskStatusFilter !== "ALL" ? ` (${taskStatusFilter})` : ""}</div>
          </div>

          <label className="label" style={{ marginTop: 10 }}>
            Task status
            <select className="input" value={taskStatusFilter} onChange={(e) => setTaskStatusFilter(e.target.value as "ALL" | TaskStatus)}>
              <option value="ALL">All open</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </label>

          <div className="hr" />

          <div className="mapList" role="list">
            {openTasksFiltered.slice(0, 40).map((task) => {
              const active = selectedTaskId === task.id;
              const marker = taskMarkers.find((m) => m.task.id === task.id) ?? null;
              const paddockName = marker?.paddockId ? paddocksById.get(marker.paddockId)?.name ?? "" : "";

              return (
                <button
                  key={task.id}
                  type="button"
                  className={active ? "mapItem mapItemActive" : "mapItem"}
                  onClick={() => {
                    setFocusMarker(null);
                    setSelectedAlertKey(null);
                    setSelectedIssueId(null);
                    setSelectedPestId(null);
                    setSelectedMobId(task.mobId ?? null);
                    setSelectedFeederId(null);
                    setSelectedWaterAssetId(null);
                    setSelectedPaddockId(marker?.paddockId ?? task.paddockId ?? null);
                    setSelectedTaskId(task.id);
                  }}
                >
                  <div className="mapItemName">{task.title}</div>
                  <div className="mapItemMeta">
                    {task.status}
                    {task.dueAt ? ` | due ${new Date(task.dueAt).toLocaleString()}` : ""}
                    {paddockName ? ` | ${paddockName}` : ""}
                  </div>
                </button>
              );
            })}

            {openTasksFiltered.length === 0 && !tasksQuery.isLoading ? <p className="muted">No matching open tasks.</p> : null}
            {openTasksFiltered.length > 40 ? <p className="muted">Showing 40 of {openTasksFiltered.length}.</p> : null}
          </div>

          <div className="hr" style={{ marginTop: 12 }} />

          <div className="mapSideHead">
            <div className="pill">{pestSpottingsFiltered.length} pest spottings</div>
          </div>

          <div className="row3" style={{ marginTop: 10 }}>
            <label className="label">
              Severity
              <select
                className="input"
                value={pestSeverityFilter}
                onChange={(e) => setPestSeverityFilter(e.target.value as "ALL" | "HIGH" | "MEDIUM" | "LOW" | "OTHER")}
              >
                <option value="ALL">All severities</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>

            <label className="label">
              Spotted within
              <select
                className="input"
                value={pestDaysFilter}
                onChange={(e) => setPestDaysFilter(e.target.value as "ALL" | "7" | "30" | "90")}
              >
                <option value="30">Last 30 days</option>
                <option value="7">Last 7 days</option>
                <option value="90">Last 90 days</option>
                <option value="ALL">All time</option>
              </select>
            </label>

            <div />
          </div>

          <div className="hr" />

          <div className="mapList" role="list">
            {pestSpottingsFiltered.slice(0, 40).map((spotting) => {
              const active = selectedPestId === spotting.id;
              return (
                <button
                  key={spotting.id}
                  type="button"
                  className={active ? "mapItem mapItemActive" : "mapItem"}
                  onClick={() => {
                    setFocusMarker(null);
                    setSelectedAlertKey(null);
                    setSelectedIssueId(null);
                    setSelectedTaskId(null);
                    setSelectedMobId(null);
                    setSelectedFeederId(null);
                    setSelectedWaterAssetId(null);
                    setSelectedPaddockId(spotting.paddockId ?? null);
                    setSelectedPestId(spotting.id);
                  }}
                >
                  <div className="mapItemName">
                    <span className="badge" style={{ borderColor: pestColor(spotting.severity) }}>
                      Pest
                    </span>{" "}
                    {spotting.pestType}
                  </div>
                  <div className="mapItemMeta">
                    {spotting.spottedAt ? new Date(spotting.spottedAt).toLocaleString() : ""}
                    {spotting.severity ? ` | ${spotting.severity}` : ""}
                    {spotting.paddockId ? ` | ${paddocksById.get(spotting.paddockId)?.name ?? ""}` : ""}
                  </div>
                </button>
              );
            })}

            {pestSpottingsFiltered.length === 0 && !pestsQuery.isLoading ? <p className="muted">No matching pest spottings.</p> : null}
            {pestSpottingsFiltered.length > 40 ? <p className="muted">Showing 40 of {pestSpottingsFiltered.length}.</p> : null}
            {pestSpottingsFiltered.length > pestSpottingsForMap.length ? (
              <p className="muted">Map markers are limited to the latest {pestSpottingsForMap.length} records.</p>
            ) : null}
          </div>

          {selectedIssue ? (
            <>
              <div className="hr" style={{ marginTop: 12 }} />

              <div className="mapSideHead">
                <div className="pill">Selected issue</div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openIssueDetails(selectedIssue.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedIssueId(null)}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="mapItemName">
                  <span className="badge" style={{ borderColor: issueColor(selectedIssue.category) }}>
                    {selectedIssue.category}
                  </span>{" "}
                  {selectedIssue.title}
                </div>

                <div className="mapItemMeta">
                  Status: {selectedIssue.status}
                  {selectedIssue.severity ? ` | Severity: ${selectedIssue.severity}` : ""}
                </div>

                <div className="mapItemMeta">Updated: {new Date(selectedIssue.updatedAt).toLocaleString()}</div>

                {selectedIssue.description ? (
                  <div className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {selectedIssue.description}
                  </div>
                ) : null}
              </div>

              <details style={{ marginTop: 10 }} open>
                <summary className="muted" style={{ cursor: "pointer" }}>
                  Attachments
                </summary>
                <AttachmentsPanel entityType="ISSUE" entityId={selectedIssue.id} showHeader={false} />
              </details>
            </>
          ) : null}

          {selectedTask ? (
            <>
              <div className="hr" style={{ marginTop: 12 }} />

              <div className="mapSideHead">
                <div className="pill">Selected task</div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openTaskDetails(selectedTask.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedTaskId(null)}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="mapItemName">{selectedTask.title}</div>

                <div className="mapItemMeta">
                  Status: {selectedTask.status}
                  {selectedTask.dueAt ? ` | Due: ${new Date(selectedTask.dueAt).toLocaleString()}` : ""}
                </div>

                {selectedTask.paddockId ? (
                  <div className="mapItemMeta">Paddock: {paddocksById.get(selectedTask.paddockId)?.name ?? ""}</div>
                ) : null}

                {selectedTask.mobId ? <div className="mapItemMeta">Mob: {mobById.get(selectedTask.mobId)?.name ?? ""}</div> : null}

                {selectedTask.description ? (
                  <div className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {selectedTask.description}
                  </div>
                ) : null}
              </div>

              <details style={{ marginTop: 10 }} open>
                <summary className="muted" style={{ cursor: "pointer" }}>
                  Attachments
                </summary>
                <AttachmentsPanel entityType="TASK" entityId={selectedTask.id} showHeader={false} />
              </details>
            </>
          ) : null}

          {selectedPest ? (
            <>
              <div className="hr" style={{ marginTop: 12 }} />

              <div className="mapSideHead">
                <div className="pill">Selected pest spotting</div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openPestSpottingDetails(selectedPest.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedPestId(null)}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="mapItemName">
                  <span className="badge" style={{ borderColor: pestColor(selectedPest.severity) }}>
                    Pest
                  </span>{" "}
                  {selectedPest.pestType}
                </div>

                <div className="mapItemMeta">
                  Spotted: {new Date(selectedPest.spottedAt).toLocaleString()}
                  {selectedPest.severity ? ` | Severity: ${selectedPest.severity}` : ""}
                </div>

                {selectedPest.paddockId ? (
                  <div className="mapItemMeta">Paddock: {paddocksById.get(selectedPest.paddockId)?.name ?? ""}</div>
                ) : null}

                {selectedPest.notes ? (
                  <div className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {selectedPest.notes}
                  </div>
                ) : null}
              </div>

              <details style={{ marginTop: 10 }} open>
                <summary className="muted" style={{ cursor: "pointer" }}>
                  Attachments
                </summary>
                <AttachmentsPanel entityType="PEST_SPOTTING" entityId={selectedPest.id} showHeader={false} />
              </details>
            </>
          ) : null}

          {alerts.length ? (
            <>
              <div className="hr" style={{ marginTop: 12 }} />

              <div className="mapSideHead">
                <div className="pill">{alerts.length} alerts (triggered)</div>
              </div>

              <div className="hr" />

              <div className="mapList" role="list">
                {alerts.slice(0, 20).map((a) => {
                  const active = selectedAlertKey === a.key;

                  return (
                    <button
                      key={a.key}
                      type="button"
                      className={active ? "mapItem mapItemActive" : "mapItem"}
                      onClick={() => {
                        setFocusMarker(null);
                        setSelectedIssueId(null);
                        setSelectedTaskId(null);
                        setSelectedPestId(null);
                        setSelectedMobId(null);
                        setSelectedFeederId(null);
                        setSelectedWaterAssetId(null);
                        setSelectedPaddockId(null);
                        setSelectedAlertKey(a.key);
                      }}
                    >
                      <div className="mapItemName">{a.title}</div>
                      <div className="mapItemMeta">
                        {a.value} {a.unit ?? ""} | threshold {a.threshold} | {new Date(a.observedAt).toLocaleString()}
                      </div>
                      <div className="actions" style={{ marginTop: 8 }}>
                        <button
                          className="btn"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void createFromAlertMutation.mutateAsync(a);
                          }}
                          disabled={busy}
                        >
                          Create issue
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="hr" style={{ marginTop: 12 }} />
              <p className="muted" style={{ marginTop: 10 }}>
                No alerts configured. To enable triggered tags: go to Telemetry, select a sensor, and set
                `metadataJson.lowThreshold` (and optionally `alertType`, `waterAssetId`, `feederId`).
              </p>
            </>
          )}

          {tagOpen ? (
            <>
              <div className="hr" style={{ marginTop: 12 }} />

              <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>New map tag</h4>

              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();

                  const title = tagTitle.trim();
                  if (!title) return;

                  const severity = tagSeverity.trim();
                  const notes = tagNotes.trim();

                  void createMutation.mutateAsync({
                    category: tagCategory,
                    title,
                    severity: severity || undefined,
                    notes: notes || undefined,
                    paddockId: tagPaddockId ? tagPaddockId : null,
                    mobId: tagMobId ? tagMobId : null,
                    feederId: tagFeederId ? tagFeederId : null,
                    waterAssetId: tagWaterAssetId ? tagWaterAssetId : null,
                    locationGeoJson: tagPoint ? makePoint(tagPoint.lon, tagPoint.lat) : null,
                  });
                }}
              >
                <div className="row3">
                  <label className="label">
                    Type
                    <select
                      className="input"
                      value={tagCategory}
                      onChange={(e) => {
                        const next = e.target.value as IssueCategory;
                        setTagCategory(next);

                        if (!tagTitle.trim()) {
                          const def = CATEGORY_OPTIONS.find((c) => c.value === next)?.defaultTitle ?? "Issue";
                          setTagTitle(def);
                        }
                      }}
                      disabled={busy}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="label">
                    Severity
                    <input
                      className="input"
                      value={tagSeverity}
                      onChange={(e) => setTagSeverity(e.target.value)}
                      placeholder="Optional"
                      disabled={busy}
                    />
                  </label>

                  <label className="label">
                    Title
                    <input className="input" value={tagTitle} onChange={(e) => setTagTitle(e.target.value)} required disabled={busy} />
                  </label>
                </div>

                <div className="row3">
                  <label className="label">
                    Paddock
                    <select className="input" value={tagPaddockId} onChange={(e) => setTagPaddockId(e.target.value)} disabled={busy}>
                      <option value="">(none)</option>
                      {Array.from(paddocksById.values())
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="label">
                    Mob
                    <select className="input" value={tagMobId} onChange={(e) => setTagMobId(e.target.value)} disabled={busy}>
                      <option value="">(none)</option>
                      {mobsSorted.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="label">
                    Water asset
                    <select
                      className="input"
                      value={tagWaterAssetId}
                      onChange={(e) => setTagWaterAssetId(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">(none)</option>
                      {waterPoints.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="row3">
                  <label className="label">
                    Feeder
                    <select className="input" value={tagFeederId} onChange={(e) => setTagFeederId(e.target.value)} disabled={busy}>
                      <option value="">(none)</option>
                      {(feedersQuery.data ?? [])
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="label">
                    Location pin
                    <div className="actions">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setPickingLocation(true);
                          setNotice("Click on the map to set the pin location.");
                        }}
                        disabled={busy}
                      >
                        Pick on map
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => void setTagPinToMyLocation()}
                        disabled={busy || locationBusy}
                        title="Uses your device location (requires permission)."
                      >
                        Use my location
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setPickingLocation(false);
                          setTagPoint(null);
                        }}
                        disabled={busy}
                      >
                        Clear
                      </button>
                      <div className="pill" style={{ padding: "6px 10px" }}>
                        {tagPoint ? `${tagPoint.lat.toFixed(6)}, ${tagPoint.lon.toFixed(6)}` : "(not set)"}
                      </div>
                    </div>
                  </label>

                  <div />
                </div>

                <label className="label">
                  Notes
                  <textarea
                    className="input"
                    value={tagNotes}
                    onChange={(e) => setTagNotes(e.target.value)}
                    placeholder="Optional"
                    rows={3}
                    disabled={busy}
                  />
                </label>

                <label className="label">
                  Attachments
                  <input
                    className="input"
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    disabled={busy || (typeof navigator !== "undefined" && !navigator.onLine)}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      setTagFiles(files);
                    }}
                  />
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {typeof navigator !== "undefined" && !navigator.onLine
                      ? "Offline: uploads disabled"
                      : tagFiles.length
                        ? `${tagFiles.length} file${tagFiles.length === 1 ? "" : "s"} selected`
                        : "No files selected"}
                  </div>
                </label>

                <div className="actions">
                  <button className="btn btnPrimary" type="submit" disabled={busy || !tagTitle.trim()}>
                    {createMutation.isPending ? "Creating..." : "Create tag"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setPickingLocation(false);
                      setTagOpen(false);
                      setTagPoint(null);
                      setTagFiles([]);
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>

                {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
              </form>
            </>
          ) : null}

          {selectedPaddockFeature ? (
            <>
              <div className="hr" />
              <div className="mapSideHead">
                <div className="muted" style={{ fontSize: 13 }}>
                  Selected paddock: <span className="mono">{selectedPaddockFeature.properties.name}</span>
                  {selectedPaddockFeature.properties.areaHa
                    ? ` | ${formatAreaHaAcres(selectedPaddockFeature.properties.areaHa)}`
                    : ""}
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => openPaddockDetails(selectedPaddockFeature.properties.id)}
                  >
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedPaddockId(null)}>
                    Clear
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {selectedWaterPoint ? (
            <>
              <div className="hr" />
              <div className="mapSideHead">
                <div className="muted" style={{ fontSize: 13 }}>
                  Selected water: <span className="mono">{selectedWaterPoint.name}</span> ({selectedWaterPoint.type})
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openWaterAssetDetails(selectedWaterPoint.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedWaterAssetId(null)}>
                    Clear
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {selectedFeederPoint ? (
            <>
              <div className="hr" />
              <div className="mapSideHead">
                <div className="muted" style={{ fontSize: 13 }}>
                  Selected feeder: <span className="mono">{selectedFeederPoint.name}</span> ({selectedFeederPoint.feederType})
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openFeederDetails(selectedFeederPoint.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedFeederId(null)}>
                    Clear
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {selectedMob ? (
            <>
              <div className="hr" />
              <div className="mapSideHead">
                <div className="muted" style={{ fontSize: 13 }}>
                  Selected mob: <span className="mono">{selectedMob.name}</span> ({selectedMob.species}) | {selectedMob.headCount} head
                  {selectedMobPaddockSummary ? " | in " + selectedMobPaddockSummary : ""}
                </div>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => openMobDetails(selectedMob.id)}>
                    Details
                  </button>
                  <button className="btn" type="button" onClick={() => setSelectedMobId(null)}>
                    Clear
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {mobsQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load mobs</div> : null}
          {waterAssetsQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load water assets</div> : null}
          {waterLinksQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load water links</div> : null}
          {issuesQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load issues</div> : null}
          {tasksQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load tasks</div> : null}
          {pestsQuery.isError ? <div className="alert" style={{ marginTop: 10 }}>Failed to load pest spottings</div> : null}
        </aside>

        <div className="mapFrame">
          <div className="mapOverlay mapOverlayTopRight">
            <div className="mapLegend">
              <div className="mapLegendHead">
                <div className="mapLegendTitle">Legend</div>
                <button className="btn btnTiny" type="button" onClick={() => setLegendOpen((v) => !v)}>
                  {legendOpen ? "Hide" : "Show"}
                </button>
              </div>

              {legendOpen ? (
                <div className="mapLegendBody">
                  <div className="mapLegendGroupLabel">Issue tags</div>
                  <div className="mapLegendItems">
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("DEAD_STOCK") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("DEAD_STOCK")}</span>
                      </span>
                      <span>Dead stock</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("LOW_WATER") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("LOW_WATER")}</span>
                      </span>
                      <span>Low water</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("LOW_FEED") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("LOW_FEED")}</span>
                      </span>
                      <span>Low feed</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("FENCE") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("FENCE")}</span>
                      </span>
                      <span>Fence</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("GENERAL") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("GENERAL")}</span>
                      </span>
                      <span>General</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: issueColor("OTHER") }}>
                        <span className="mapMarkerGlyph">{issueGlyph("OTHER")}</span>
                      </span>
                      <span>Other</span>
                    </div>
                  </div>

                  <div className="mapLegendGroupLabel">Alerts (telemetry)</div>
                  <div className="mapLegendItems">
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipAlert" style={{ ["--marker-color" as any]: alertColor("LOW_WATER") }}>
                        <span className="mapMarkerGlyph">{alertGlyph("LOW_WATER")}</span>
                      </span>
                      <span>Low water</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipAlert" style={{ ["--marker-color" as any]: alertColor("LOW_FEED") }}>
                        <span className="mapMarkerGlyph">{alertGlyph("LOW_FEED")}</span>
                      </span>
                      <span>Low feed</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipAlert" style={{ ["--marker-color" as any]: alertColor("LOW_BATTERY") }}>
                        <span className="mapMarkerGlyph">{alertGlyph("LOW_BATTERY")}</span>
                      </span>
                      <span>Low battery</span>
                    </div>
                  </div>

                  <div className="mapLegendGroupLabel">Work and observations</div>
                  <div className="mapLegendItems">
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: taskColor("OPEN") }}>
                        <span className="mapMarkerGlyph">T</span>
                      </span>
                      <span>Task</span>
                    </div>
                    <div className="mapLegendItem">
                      <span className="mapLegendChip mapMarkerChip mapMarkerChipIssue" style={{ ["--marker-color" as any]: pestColor("high") }}>
                        <span className="mapMarkerGlyph">P</span>
                      </span>
                      <span>Pest spotting</span>
                    </div>
                  </div>

                  <div className="muted" style={{ fontSize: 12 }}>
                    Click markers to select. Use "New tag" to create manual tags.
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <MapContainer center={initialCenter} zoom={14} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer url={ESRI_IMAGERY_URL} attribution={ESRI_IMAGERY_ATTRIBUTION} maxZoom={19} />
            <TileLayer url={ESRI_LABELS_URL} attribution={ESRI_LABELS_ATTRIBUTION} maxZoom={19} opacity={0.9} />

            <MapClickPicker
              enabled={pickingLocation}
              onPick={(p) => {
                setTagPoint(p);
                setPickingLocation(false);
                setNotice(`Pin set: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`);
              }}
            />

            <PaddockBoundariesLayer
              features={paddockFeatures}
              boundsById={paddockBoundsById}
              selectedPaddockId={selectedPaddockId}
              filter={paddockFilter}
              onSelectPaddock={(id) => {
                setFocusMarker(null);
                setSelectedAlertKey(null);
                setSelectedIssueId(null);
                setSelectedTaskId(null);
                setSelectedPestId(null);
                setSelectedMobId(null);
                setSelectedFeederId(null);
                setSelectedWaterAssetId(null);
                setSelectedPaddockId(id);
              }}
            />

            {waterLinkSegments.map((seg) => (
              <Polyline key={seg.id} positions={seg.positions} pathOptions={{ color: "#334155", weight: 3, opacity: 0.7 }}>
                <Tooltip sticky>{seg.connectionType}</Tooltip>
              </Polyline>
            ))}

            {showMobsLayer
              ? mobLinkSegments.map((seg) => {
                  const active = selectedMobId === seg.mobId;
                  return (
                    <Polyline
                      key={seg.key}
                      positions={seg.positions}
                      pathOptions={{
                        color: active ? "#5a3f24" : "#8b6b42",
                        weight: active ? 3 : 2,
                        opacity: active ? 0.9 : 0.65,
                        dashArray: "8 6",
                      }}
                    >
                      <Tooltip sticky>{seg.label}</Tooltip>
                    </Polyline>
                  );
                })
              : null}

            {showMobsLayer
              ? mobMarkers.map((m) => {
                  const active = selectedMobId === m.mob.id;
                  const markerLabel = m.mob.name;

                  return (
                    <CircleMarker
                      key={m.key}
                      center={[m.point.lat, m.point.lon]}
                      radius={active ? 9 : 7}
                      pathOptions={{
                        color: active ? "#0f2f23" : "#5a3f24",
                        weight: active ? 4 : 2,
                        fillColor: "#deb771",
                        fillOpacity: active ? 0.95 : 0.8,
                      }}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedAlertKey(null);
                          setSelectedIssueId(null);
                          setSelectedTaskId(null);
                          setSelectedPestId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedFeederId(null);
                          setSelectedMobId(m.mob.id);
                          setSelectedPaddockId(m.paddockId);
                        },
                      }}
                    >
                      <Tooltip
                        permanent
                        direction="bottom"
                        offset={[0, 14]}
                        className={active ? "mobLabelTooltip mobLabelTooltipActive" : "mobLabelTooltip"}
                        opacity={0.98}
                      >
                        <span className="mobLabelInner">{markerLabel}</span>
                      </Tooltip>
                    </CircleMarker>
                  );
                })
              : null}

            {showFeedersLayer
              ? feederPoints.map((p) => {
                  const active = selectedFeederId === p.id;
                  return (
                    <CircleMarker
                      key={p.id}
                      center={[p.lat, p.lon]}
                      radius={active ? 9 : 7}
                      pathOptions={{
                        color: active ? "#0f2f23" : "#92400e",
                        weight: active ? 4 : 2,
                        fillColor: "#f59e0b",
                        fillOpacity: active ? 0.95 : 0.75,
                      }}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedAlertKey(null);
                          setSelectedIssueId(null);
                          setSelectedTaskId(null);
                          setSelectedPestId(null);
                          setSelectedMobId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedPaddockId(null);
                          setSelectedFeederId(p.id);
                        },
                      }}
                    >
                      <Tooltip sticky>
                        {p.name} (Feeder)
                      </Tooltip>
                    </CircleMarker>
                  );
                })
              : null}

            {selectedFeederPoint && !showFeedersLayer ? (
              <CircleMarker
                key={`feederfocus:${selectedFeederPoint.id}`}
                center={[selectedFeederPoint.lat, selectedFeederPoint.lon]}
                radius={10}
                pathOptions={{ color: "#0f2f23", weight: 4, fillColor: "#f59e0b", fillOpacity: 0.35 }}
              >
                <Tooltip sticky>{selectedFeederPoint.name} (Feeder)</Tooltip>
              </CircleMarker>
            ) : null}

            {selectedIssue && selectedIssuePoint && (!showIssuesLayer || !issueMarkers.some((m) => m.issue.id === selectedIssue.id)) ? (
              <CircleMarker
                key={`issuefocus:${selectedIssue.id}`}
                center={[selectedIssuePoint.lat, selectedIssuePoint.lon]}
                radius={11}
                pathOptions={{ color: "#0f2f23", weight: 4, fillColor: issueColor(selectedIssue.category), fillOpacity: 0.25 }}
              >
                <Tooltip sticky>
                  {selectedIssue.title} ({selectedIssue.status})
                </Tooltip>
              </CircleMarker>
            ) : null}

            {focusMarker ? (
              <CircleMarker
                key={`focus:${focusMarker.point.lat.toFixed(6)}:${focusMarker.point.lon.toFixed(6)}`}
                center={[focusMarker.point.lat, focusMarker.point.lon]}
                radius={12}
                pathOptions={{
                  color: focusMarker.color ?? "#4338ca",
                  weight: 4,
                  fillColor: focusMarker.color ?? "#4338ca",
                  fillOpacity: 0.18,
                }}
              >
                <Tooltip sticky>{focusMarker.label}</Tooltip>
              </CircleMarker>
            ) : null}

            {waterPoints.map((p) => {
              const active = selectedWaterAssetId === p.id;
              const color = assetColor(p.type);

              return (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lon]}
                  radius={active ? 9 : 7}
                  pathOptions={{
                    color: active ? "#0f2f23" : color,
                    weight: active ? 3 : 2,
                    fillColor: color,
                    fillOpacity: active ? 0.95 : 0.85,
                  }}
                  eventHandlers={{
                    click: () => {
                      setFocusMarker(null);
                      setSelectedAlertKey(null);
                      setSelectedIssueId(null);
                      setSelectedTaskId(null);
                      setSelectedPestId(null);
                      setSelectedMobId(null);
                      setSelectedFeederId(null);
                      setSelectedWaterAssetId(p.id);
                    },
                  }}
                >
                  <Tooltip sticky>
                    {p.name} ({p.type})
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {showIssuesLayer
              ? issueMarkers.map((m) => {
                  const active = selectedIssueId === m.issue.id;
                  const icon = getIssueIcon(m.issue.category, active);

                  return (
                    <Marker
                      key={m.issue.id + (active ? ":active" : ":idle")}
                      position={[m.point.lat, m.point.lon]}
                      icon={icon}
                      zIndexOffset={active ? 480 : 420}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedAlertKey(null);
                          setSelectedTaskId(null);
                          setSelectedPestId(null);
                          setSelectedMobId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedFeederId(null);
                          setSelectedPaddockId(m.issue.paddockId ?? null);
                          setSelectedIssueId(m.issue.id);
                        },
                      }}
                    >
                      <Tooltip sticky>
                        {m.issue.title} ({m.issue.category})
                      </Tooltip>
                    </Marker>
                  );
                })
              : null}

            {showAlertsLayer
              ? alertMarkers.map((m) => {
                  const active = selectedAlertKey === m.alert.key;
                  const icon = getAlertIcon(m.alert.alertType, active);

                  return (
                    <Marker
                      key={m.alert.key + (active ? ":active" : ":idle")}
                      position={[m.point.lat, m.point.lon]}
                      icon={icon}
                      zIndexOffset={active ? 520 : 460}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedIssueId(null);
                          setSelectedTaskId(null);
                          setSelectedPestId(null);
                          setSelectedMobId(null);
                          setSelectedFeederId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedPaddockId(null);
                          setSelectedAlertKey(m.alert.key);
                        },
                      }}
                    >
                      <Tooltip sticky>
                        {m.alert.title} ({m.alert.value} {m.alert.unit ?? ""})
                      </Tooltip>
                    </Marker>
                  );
                })
              : null}


            {showTasksLayer
              ? taskMarkers.map((m) => {
                  const active = selectedTaskId === m.task.id;
                  const icon = getTaskIcon(m.task.status, active);
                  const paddockName = m.paddockId ? paddocksById.get(m.paddockId)?.name ?? "" : "";

                  return (
                    <Marker
                      key={m.task.id + (active ? ":active" : ":idle")}
                      position={[m.point.lat, m.point.lon]}
                      icon={icon}
                      zIndexOffset={active ? 500 : 430}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedAlertKey(null);
                          setSelectedIssueId(null);
                          setSelectedPestId(null);
                          setSelectedMobId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedFeederId(null);
                          setSelectedPaddockId(m.paddockId);
                          setSelectedTaskId(m.task.id);
                        },
                      }}
                    >
                      <Tooltip sticky>
                        {m.task.title} ({m.task.status}){paddockName ? ` | ${paddockName}` : ""}
                      </Tooltip>
                    </Marker>
                  );
                })
              : null}

            {showPestsLayer
              ? pestMarkers.map((m) => {
                  const active = selectedPestId === m.spotting.id;
                  const icon = getPestIcon(m.spotting.severity, active);
                  const paddockName = m.paddockId ? paddocksById.get(m.paddockId)?.name ?? "" : "";

                  return (
                    <Marker
                      key={m.spotting.id + (active ? ":active" : ":idle")}
                      position={[m.point.lat, m.point.lon]}
                      icon={icon}
                      zIndexOffset={active ? 500 : 430}
                      eventHandlers={{
                        click: () => {
                          setFocusMarker(null);
                          setSelectedAlertKey(null);
                          setSelectedIssueId(null);
                          setSelectedTaskId(null);
                          setSelectedMobId(null);
                          setSelectedWaterAssetId(null);
                          setSelectedFeederId(null);
                          setSelectedPaddockId(m.paddockId);
                          setSelectedPestId(m.spotting.id);
                        },
                      }}
                    >
                      <Tooltip sticky>
                        {m.spotting.pestType}{m.spotting.severity ? ` (${m.spotting.severity})` : ""}
                        {paddockName ? ` | ${paddockName}` : ""}
                      </Tooltip>
                    </Marker>
                  );
                })
              : null}

            {selectedTask && selectedTaskPoint && (!showTasksLayer || !taskMarkers.some((m) => m.task.id === selectedTask.id)) ? (
              <CircleMarker
                key={`taskfocus:${selectedTask.id}`}
                center={[selectedTaskPoint.lat, selectedTaskPoint.lon]}
                radius={11}
                pathOptions={{ color: "#0f2f23", weight: 4, fillColor: taskColor(selectedTask.status), fillOpacity: 0.25 }}
              >
                <Tooltip sticky>
                  {selectedTask.title} ({selectedTask.status})
                </Tooltip>
              </CircleMarker>
            ) : null}

            {selectedPest && selectedPestPoint && (!showPestsLayer || !pestMarkers.some((m) => m.spotting.id === selectedPest.id)) ? (
              <CircleMarker
                key={`pestfocus:${selectedPest.id}`}
                center={[selectedPestPoint.lat, selectedPestPoint.lon]}
                radius={11}
                pathOptions={{ color: "#0f2f23", weight: 4, fillColor: pestColor(selectedPest.severity), fillOpacity: 0.25 }}
              >
                <Tooltip sticky>
                  {selectedPest.pestType}
                </Tooltip>
              </CircleMarker>
            ) : null}


            {myLocation ? (
              <>
                {typeof myLocation.accuracyM === "number" ? (
                  <Circle
                    center={[myLocation.point.lat, myLocation.point.lon]}
                    radius={myLocation.accuracyM}
                    pathOptions={{ color: "#2563eb", weight: 2, fillColor: "#2563eb", fillOpacity: 0.08 }}
                  />
                ) : null}
                <CircleMarker
                  key={`mylocation:${myLocation.point.lat.toFixed(6)}:${myLocation.point.lon.toFixed(6)}`}
                  center={[myLocation.point.lat, myLocation.point.lon]}
                  radius={7}
                  pathOptions={{ color: "#1d4ed8", weight: 3, fillColor: "#60a5fa", fillOpacity: 0.95 }}
                >
                  <Tooltip sticky>
                    You{typeof myLocation.accuracyM === "number" ? ` (+/-${Math.round(myLocation.accuracyM)}m)` : ""}
                  </Tooltip>
                </CircleMarker>
              </>
            ) : null}

            {tagPoint ? (
              <CircleMarker
                key={`tagpin:${tagPoint.lat.toFixed(6)}:${tagPoint.lon.toFixed(6)}`}
                center={[tagPoint.lat, tagPoint.lon]}
                radius={6}
                pathOptions={{ color: "#0f2f23", weight: 3, fillColor: "#deb771", fillOpacity: 0.9 }}
              >
                <Tooltip sticky>New tag pin</Tooltip>
              </CircleMarker>
            ) : null}

            <FitBounds geoJson={paddockFeatureCollection} />
            <ZoomToSelected selected={selectedPaddockFeature} />
            <FlyToPoint
              point={
                focusMarker?.point ??
                selectedIssuePoint ??
                selectedTaskPoint ??
                selectedPestPoint ??
                selectedAlertPoint ??
                (selectedFeederPoint ? { lat: selectedFeederPoint.lat, lon: selectedFeederPoint.lon } : null) ??
                (selectedWaterPoint ? { lat: selectedWaterPoint.lat, lon: selectedWaterPoint.lon } : null)
              }
            />
          </MapContainer>
        </div>
      </div>

      {paddockFeatures.length === 0 && !paddocksQuery.isLoading ? (
        <div className="alert" style={{ marginTop: 12 }}>
          No paddock boundaries found yet.
        </div>
      ) : null}
    </section>
  );
}

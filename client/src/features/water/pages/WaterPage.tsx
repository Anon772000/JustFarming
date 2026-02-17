import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type {
  ApiListResponse,
  ApiSingleResponse,
  WaterAsset,
  WaterAssetType,
  WaterLink,
} from "../../../types/api";
import { PREFILL_SELECTED_WATER_ASSET_ID_KEY, seeOnMap } from "../../../ui/navigation";

type CreateWaterAssetInput = {
  id: string;
  type: WaterAssetType;
  name: string;
  capacityLitres?: number;
  locationGeoJson?: unknown;
};

type UpdateWaterAssetInput = {
  type?: WaterAssetType;
  name?: string;
  capacityLitres?: number;
  locationGeoJson?: unknown;
};

type CreateWaterLinkInput = {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  connectionType: string;
  diameterMm?: number;
};

type UpdateWaterLinkInput = {
  fromAssetId?: string;
  toAssetId?: string;
  connectionType?: string;
  diameterMm?: number;
};

type ParsedPoint = { lat: number; lon: number };

type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number];
};

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

function toNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function makePoint(lon: number, lat: number): GeoJsonPoint {
  return { type: "Point", coordinates: [lon, lat] };
}


function createUuid(_prefix: string): string {
  return createStableUuid();
}

function getFarmId(): string {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "00000000-0000-0000-0000-000000000000";
    const u = JSON.parse(raw) as { farmId?: string };
    return typeof u.farmId === "string" ? u.farmId : "00000000-0000-0000-0000-000000000000";
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
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

async function getAssets(): Promise<WaterAsset[]> {
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

async function createAsset(input: CreateWaterAssetInput): Promise<WaterAsset> {
  try {
    const response = await apiFetch<ApiSingleResponse<WaterAsset>>("/water-assets", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: WaterAsset = {
      id: input.id,
      farmId: getFarmId(),
      type: input.type,
      name: input.name,
      locationGeoJson: input.locationGeoJson ?? null,
      capacityLitres: input.capacityLitres !== undefined ? String(input.capacityLitres) : null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("water_assets", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      type: local.type,
      name: local.name,
    };

    if (input.capacityLitres !== undefined) actionData.capacityLitres = input.capacityLitres;
    if (input.locationGeoJson !== undefined) actionData.locationGeoJson = input.locationGeoJson;

    await enqueueAction({ entity: "water_assets", op: "CREATE", data: actionData });
    return local;
  }
}

async function updateAsset(args: { waterAssetId: string; input: UpdateWaterAssetInput }): Promise<WaterAsset> {
  try {
    const response = await apiFetch<ApiSingleResponse<WaterAsset>>(`/water-assets/${args.waterAssetId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<WaterAsset>("water_assets");
    const existing = cached.find((a) => a.id === args.waterAssetId) ?? null;

    const local: WaterAsset = {
      id: args.waterAssetId,
      farmId: existing?.farmId ?? getFarmId(),
      type: args.input.type ?? existing?.type ?? "TROUGH",
      name: args.input.name ?? existing?.name ?? "Asset",
      locationGeoJson:
        args.input.locationGeoJson !== undefined
          ? args.input.locationGeoJson
          : (existing?.locationGeoJson ?? null),
      capacityLitres:
        args.input.capacityLitres !== undefined
          ? String(args.input.capacityLitres)
          : (existing?.capacityLitres ?? null),
      metadataJson: existing?.metadataJson ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("water_assets", [local as any]);

    await enqueueAction({
      entity: "water_assets",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteAsset(waterAssetId: string): Promise<void> {
  try {
    await apiFetch<void>(`/water-assets/${waterAssetId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("water_assets", waterAssetId);
    await enqueueAction({ entity: "water_assets", op: "DELETE", data: { id: waterAssetId } });
  }
}

async function getLinks(): Promise<WaterLink[]> {
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

async function createLink(input: CreateWaterLinkInput): Promise<WaterLink> {
  try {
    const response = await apiFetch<ApiSingleResponse<WaterLink>>("/water-links", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: WaterLink = {
      id: input.id,
      farmId: getFarmId(),
      fromAssetId: input.fromAssetId,
      toAssetId: input.toAssetId,
      connectionType: input.connectionType,
      diameterMm: input.diameterMm !== undefined ? String(input.diameterMm) : null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("water_links", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      fromAssetId: local.fromAssetId,
      toAssetId: local.toAssetId,
      connectionType: local.connectionType,
    };

    if (input.diameterMm !== undefined) actionData.diameterMm = input.diameterMm;

    await enqueueAction({ entity: "water_links", op: "CREATE", data: actionData });
    return local;
  }
}

async function updateLink(args: { waterLinkId: string; input: UpdateWaterLinkInput }): Promise<WaterLink> {
  try {
    const response = await apiFetch<ApiSingleResponse<WaterLink>>(`/water-links/${args.waterLinkId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<WaterLink>("water_links");
    const existing = cached.find((l) => l.id === args.waterLinkId) ?? null;

    const local: WaterLink = {
      id: args.waterLinkId,
      farmId: existing?.farmId ?? getFarmId(),
      fromAssetId: args.input.fromAssetId ?? existing?.fromAssetId ?? "",
      toAssetId: args.input.toAssetId ?? existing?.toAssetId ?? "",
      connectionType: args.input.connectionType ?? existing?.connectionType ?? "PIPE",
      diameterMm:
        args.input.diameterMm !== undefined
          ? String(args.input.diameterMm)
          : (existing?.diameterMm ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("water_links", [local as any]);

    await enqueueAction({
      entity: "water_links",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteLink(waterLinkId: string): Promise<void> {
  try {
    await apiFetch<void>(`/water-links/${waterLinkId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("water_links", waterLinkId);
    await enqueueAction({ entity: "water_links", op: "DELETE", data: { id: waterLinkId } });
  }
}

const ASSET_TYPES: WaterAssetType[] = ["DAM", "BORE", "TROUGH", "PIPE", "VALVE", "JUNCTION"];

export function WaterPage() {
  const qc = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ["water-assets"],
    queryFn: getAssets,
    staleTime: 30_000,
  });

  const linksQuery = useQuery({
    queryKey: ["water-links"],
    queryFn: getLinks,
    staleTime: 30_000,
  });

  const [prefillAssetId, setPrefillAssetId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_WATER_ASSET_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_WATER_ASSET_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const assets = useMemo(() => (assetsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [
    assetsQuery.data,
  ]);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const links = useMemo(
    () => (linksQuery.data ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [linksQuery.data],
  );

  const [editingAsset, setEditingAsset] = useState<WaterAsset | null>(null);
  const [assetType, setAssetType] = useState<WaterAssetType>("TROUGH");
  const [assetName, setAssetName] = useState("");
  const [capacityLitres, setCapacityLitres] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  useEffect(() => {
    if (!prefillAssetId) return;

    const asset = (assetsQuery.data ?? []).find((a) => a.id === prefillAssetId) ?? null;

    // Wait for initial load before giving up, otherwise we'd drop the deep link while data is still loading.
    if (!asset) {
      if (assetsQuery.isLoading) return;
      setPrefillAssetId("");
      return;
    }

    setEditingAsset(asset);
    setAssetType(asset.type);
    setAssetName(asset.name);
    setCapacityLitres(asset.capacityLitres ? String(asset.capacityLitres) : "");

    const p = parsePoint(asset.locationGeoJson);
    setLat(p ? String(p.lat) : "");
    setLon(p ? String(p.lon) : "");

    setPrefillAssetId("");
  }, [prefillAssetId, assetsQuery.data, assetsQuery.isLoading]);

  const createAssetMutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      setAssetName("");
      setCapacityLitres("");
      setLat("");
      setLon("");
      await qc.invalidateQueries({ queryKey: ["water-assets"] });
    },
  });

  const updateAssetMutation = useMutation({
    mutationFn: updateAsset,
    onSuccess: async () => {
      setEditingAsset(null);
      setAssetName("");
      setCapacityLitres("");
      setLat("");
      setLon("");
      await qc.invalidateQueries({ queryKey: ["water-assets"] });
      await qc.invalidateQueries({ queryKey: ["water-links"] });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["water-assets"] });
      await qc.invalidateQueries({ queryKey: ["water-links"] });
    },
  });

  const [editingLink, setEditingLink] = useState<WaterLink | null>(null);
  const [fromAssetId, setFromAssetId] = useState("");
  const [toAssetId, setToAssetId] = useState("");
  const [connectionType, setConnectionType] = useState("PIPE");
  const [diameterMm, setDiameterMm] = useState("");

  const createLinkMutation = useMutation({
    mutationFn: createLink,
    onSuccess: async () => {
      setEditingLink(null);
      setFromAssetId("");
      setToAssetId("");
      setConnectionType("PIPE");
      setDiameterMm("");
      await qc.invalidateQueries({ queryKey: ["water-links"] });
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: updateLink,
    onSuccess: async () => {
      setEditingLink(null);
      setFromAssetId("");
      setToAssetId("");
      setConnectionType("PIPE");
      setDiameterMm("");
      await qc.invalidateQueries({ queryKey: ["water-links"] });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: deleteLink,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["water-links"] });
    },
  });

  const assetsBusy = createAssetMutation.isPending || updateAssetMutation.isPending || deleteAssetMutation.isPending;

  const linksBusy = createLinkMutation.isPending || updateLinkMutation.isPending || deleteLinkMutation.isPending;

  const linkFromOk = !!fromAssetId && assetsById.has(fromAssetId);
  const linkToOk = !!toAssetId && assetsById.has(toAssetId);
  const linkEndpointsOk = linkFromOk && linkToOk && fromAssetId !== toAssetId;

  return (
    <div>
      <header className="sectionHead">
        <div>
          <h3>Water Network</h3>
          <p className="muted">Assets (dams, bores, troughs) and links (pipes/valves). Add GPS points to show them on the Map.</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void assetsQuery.refetch()} disabled={assetsQuery.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {assetsQuery.isError ? <div className="alert">Failed to load water assets</div> : null}

      <section style={{ marginTop: 10 }}>
        <h3 style={{ marginTop: 0 }}>Assets</h3>

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();

            const name = assetName.trim();
            if (!name) return;

            const cap = toNumberOrUndefined(capacityLitres);
            const latN = toNumberOrUndefined(lat);
            const lonN = toNumberOrUndefined(lon);

            const locationGeoJson =
              latN !== undefined && lonN !== undefined ? makePoint(lonN, latN) : undefined;

            if (editingAsset) {
              void updateAssetMutation.mutateAsync({
                waterAssetId: editingAsset.id,
                input: {
                  type: assetType,
                  name,
                  capacityLitres: cap,
                  locationGeoJson,
                },
              });
              return;
            }

            void createAssetMutation.mutateAsync({
              id: createUuid("water-asset"),
              type: assetType,
              name,
              capacityLitres: cap,
              locationGeoJson,
            });
          }}
        >
          <div className="row3">
            <label className="label">
              Type
              <select className="input" value={assetType} onChange={(e) => setAssetType(e.target.value as WaterAssetType)}>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            <label className="label">
              Name
              <input className="input" value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="e.g. Dam 1" required />
            </label>

            <label className="label">
              Capacity (L)
              <input
                className="input"
                value={capacityLitres}
                onChange={(e) => setCapacityLitres(e.target.value)}
                inputMode="decimal"
                placeholder="optional"
              />
            </label>
          </div>

          <div className="row3" style={{ marginTop: 10 }}>
            <label className="label">
              Latitude
              <input className="input" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="optional" />
            </label>
            <label className="label">
              Longitude
              <input className="input" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" placeholder="optional" />
            </label>
            <div />
          </div>

          <div className="actions">
            <button className="btn btnPrimary" type="submit" disabled={assetsBusy || !assetName.trim()}>
              {editingAsset
                ? updateAssetMutation.isPending
                  ? "Saving..."
                  : "Save Asset"
                : createAssetMutation.isPending
                  ? "Creating..."
                  : "Create Asset"}
            </button>

            {editingAsset ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditingAsset(null);
                  setAssetType("TROUGH");
                  setAssetName("");
                  setCapacityLitres("");
                  setLat("");
                  setLon("");
                }}
                disabled={assetsBusy}
              >
                Cancel
              </button>
            ) : null}
          </div>

          {createAssetMutation.isError ? <div className="alert">{(createAssetMutation.error as Error).message}</div> : null}
          {updateAssetMutation.isError ? <div className="alert">{(updateAssetMutation.error as Error).message}</div> : null}
        </form>

        <div className="tableWrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Capacity (L)</th>
                <th>Location</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const point = parsePoint(a.locationGeoJson);
                const locationLabel = point ? `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` : "";

                return (
                  <tr key={a.id}>
                    <td className="mono">{a.name}</td>
                    <td>{a.type}</td>
                    <td className="mono">{a.capacityLitres ? Number(a.capacityLitres).toFixed(0) : ""}</td>
                    <td className="muted mono">{locationLabel}</td>
                    <td className="muted">{new Date(a.updatedAt).toLocaleString()}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div className="actions" style={{ justifyContent: "flex-end" }}>
                        {point ? (
                          <button
                            className="btn"
                            type="button"
                            onClick={() => seeOnMap({ kind: "WATER_ASSET", waterAssetId: a.id })}
                            disabled={assetsBusy}
                          >
                            See on map
                          </button>
                        ) : null}
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setEditingAsset(a);
                            setAssetType(a.type);
                            setAssetName(a.name);
                            setCapacityLitres(a.capacityLitres ? String(a.capacityLitres) : "");

                            const p = parsePoint(a.locationGeoJson);
                            setLat(p ? String(p.lat) : "");
                            setLon(p ? String(p.lon) : "");
                          }}
                          disabled={assetsBusy}
                        >
                          Edit
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm(`Delete water asset "${a.name}"?`)) return;
                            void deleteAssetMutation.mutateAsync(a.id);
                          }}
                          disabled={assetsBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No water assets yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="hr" style={{ marginTop: 16 }} />

      <section>
        <h3 style={{ marginTop: 0 }}>Links</h3>
        <p className="muted">Links connect two assets. Create assets first, then connect them.</p>

        {linksQuery.isError ? <div className="alert">Failed to load water links</div> : null}

        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();

            const from = fromAssetId;
            const to = toAssetId;
            const ct = connectionType.trim();
            if (!linkEndpointsOk || !ct) return;

            const d = toNumberOrUndefined(diameterMm);

            if (editingLink) {
              void updateLinkMutation.mutateAsync({
                waterLinkId: editingLink.id,
                input: {
                  fromAssetId: from,
                  toAssetId: to,
                  connectionType: ct,
                  diameterMm: d,
                },
              });
              return;
            }

            void createLinkMutation.mutateAsync({
              id: createUuid("water-link"),
              fromAssetId: from,
              toAssetId: to,
              connectionType: ct,
              diameterMm: d,
            });
          }}
        >
          <div className="row3">
            <label className="label">
              From
              <select className="input" value={fromAssetId} onChange={(e) => setFromAssetId(e.target.value)}>
                <option value="">Select...</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="label">
              To
              <select className="input" value={toAssetId} onChange={(e) => setToAssetId(e.target.value)}>
                <option value="">Select...</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="label">
              Type
              <input className="input" value={connectionType} onChange={(e) => setConnectionType(e.target.value)} placeholder="PIPE" />
            </label>
          </div>

          <div className="row3" style={{ marginTop: 10 }}>
            <label className="label">
              Diameter (mm)
              <input className="input" value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} inputMode="decimal" placeholder="optional" />
            </label>
            <div />
            <div />
          </div>

          <div className="actions">
            <button className="btn btnPrimary" type="submit" disabled={linksBusy || !linkEndpointsOk || !connectionType.trim()}>
              {editingLink
                ? updateLinkMutation.isPending
                  ? "Saving..."
                  : "Save Link"
                : createLinkMutation.isPending
                  ? "Creating..."
                  : "Create Link"}
            </button>

            {editingLink ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditingLink(null);
                  setFromAssetId("");
                  setToAssetId("");
                  setConnectionType("PIPE");
                  setDiameterMm("");
                }}
                disabled={linksBusy}
              >
                Cancel
              </button>
            ) : null}

            {!linkEndpointsOk && (fromAssetId || toAssetId) ? (
              <div className="pill">Pick two different assets</div>
            ) : null}
          </div>

          {createLinkMutation.isError ? <div className="alert">{(createLinkMutation.error as Error).message}</div> : null}
          {updateLinkMutation.isError ? <div className="alert">{(updateLinkMutation.error as Error).message}</div> : null}
        </form>

        <div className="tableWrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
                <th>Diameter</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const from = assetsById.get(l.fromAssetId);
                const to = assetsById.get(l.toAssetId);

                return (
                  <tr key={l.id}>
                    <td className="mono">{from ? from.name : l.fromAssetId}</td>
                    <td className="mono">{to ? to.name : l.toAssetId}</td>
                    <td className="mono">{l.connectionType}</td>
                    <td className="mono">{l.diameterMm ? Number(l.diameterMm).toFixed(1) + " mm" : ""}</td>
                    <td className="muted">{new Date(l.updatedAt).toLocaleString()}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div className="actions" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            setEditingLink(l);
                            setFromAssetId(l.fromAssetId);
                            setToAssetId(l.toAssetId);
                            setConnectionType(l.connectionType);
                            setDiameterMm(l.diameterMm ? String(l.diameterMm) : "");
                          }}
                          disabled={linksBusy}
                        >
                          Edit
                        </button>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm("Delete this water link?")) return;
                            void deleteLinkMutation.mutateAsync(l.id);
                          }}
                          disabled={linksBusy}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {links.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No links yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { listEntities, upsertEntities } from "../../../offline/indexedDb";
import type { ApiListResponse, ApiSingleResponse, LoraNode, Sensor, SensorReading } from "../../../types/api";
import { seeOnMap } from "../../../ui/navigation";

function parseNumber(value: string | number): number {
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toFiniteNumberOrNull(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readMetadataJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const width = 560;
  const height = 160;
  const pad = 10;

  const points = values.map((v, idx) => {
    const x = pad + (idx / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="spark">
      <path d={d} fill="none" stroke="rgba(44, 110, 73, 0.95)" strokeWidth={3} />
      <path d={d} fill="none" stroke="rgba(222, 183, 113, 0.7)" strokeWidth={7} opacity={0.25} />
    </svg>
  );
}

export function TelemetryPage() {
  const qc = useQueryClient();

  const [nodeId, setNodeId] = useState<string | null>(null);
  const [sensorId, setSensorId] = useState<string | null>(null);

  const nodesQuery = useQuery({
    queryKey: ["lora-nodes"],
    queryFn: async () => {
      try {
        const res = await apiFetch<ApiListResponse<LoraNode>>("/lora-nodes");
        await upsertEntities("lora_nodes", res.data as any);
        return res;
      } catch (err) {
        const cached = await listEntities<LoraNode>("lora_nodes");
        if (cached.length) return { data: cached };
        throw err;
      }
    },
    staleTime: 30_000,
  });

  const nodes = useMemo(() => nodesQuery.data?.data ?? [], [nodesQuery.data]);

  useEffect(() => {
    if (nodeId) return;
    if (nodes.length === 0) return;
    setNodeId(nodes[0].id);
  }, [nodeId, nodes]);

  const sensorsQuery = useQuery({
    queryKey: ["sensors", nodeId],
    enabled: !!nodeId,
    queryFn: async () => {
      try {
        const res = await apiFetch<ApiListResponse<Sensor>>(`/sensors?nodeId=${encodeURIComponent(nodeId!)}`);
        await upsertEntities("sensors", res.data as any);
        return res;
      } catch (err) {
        const cached = await listEntities<Sensor>("sensors");
        const filtered = typeof nodeId === "string" ? cached.filter((s) => s.nodeId === nodeId) : [];
        if (cached.length) return { data: filtered };
        throw err;
      }
    },
    staleTime: 30_000,
  });

  const sensors = useMemo(() => sensorsQuery.data?.data ?? [], [sensorsQuery.data]);

  useEffect(() => {
    if (sensorId) return;
    if (sensors.length === 0) return;
    setSensorId(sensors[0].id);
  }, [sensorId, sensors]);

  const readingsQuery = useQuery({
    queryKey: ["sensor-readings", nodeId],
    enabled: !!nodeId,
    queryFn: async () =>
      apiFetch<ApiListResponse<SensorReading>>(
        `/sensor-readings?nodeId=${encodeURIComponent(nodeId!)}&limit=400&order=desc`,
      ),
    staleTime: 10_000,
  });

  const recentReadings = useMemo(() => readingsQuery.data?.data ?? [], [readingsQuery.data]);

  const latestBySensorId = useMemo(() => {
    const map = new Map<string, SensorReading>();
    for (const r of recentReadings) {
      if (!map.has(r.sensorId)) map.set(r.sensorId, r);
    }
    return map;
  }, [recentReadings]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === nodeId) ?? null, [nodes, nodeId]);
  const selectedSensor = useMemo(() => sensors.find((s) => s.id === sensorId) ?? null, [sensors, sensorId]);

  const seriesQuery = useQuery({
    queryKey: ["sensor-series", sensorId],
    enabled: !!sensorId,
    queryFn: async () =>
      apiFetch<ApiListResponse<SensorReading>>(
        `/sensor-readings?sensorId=${encodeURIComponent(sensorId!)}&limit=120&order=asc`,
      ),
    staleTime: 10_000,
  });

  const series = useMemo(() => seriesQuery.data?.data ?? [], [seriesQuery.data]);

  const values = useMemo(() => series.map((r) => parseNumber(r.numericValue)), [series]);

  const [alertType, setAlertType] = useState<string>("");
  const [lowThreshold, setLowThreshold] = useState<string>("");
  const [metaNotice, setMetaNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSensor) return;

    const meta = readMetadataJson(selectedSensor.metadataJson);

    const rawAlertType = typeof meta.alertType === "string" ? meta.alertType : "";
    const rawLowThreshold = meta.lowThreshold;

    // Sensible defaults based on known sensor types.
    const defaultAlertType =
      selectedSensor.type === "WATER_LEVEL"
        ? "LOW_WATER"
        : selectedSensor.type === "BATTERY"
          ? "LOW_BATTERY"
          : "";

    setAlertType(rawAlertType || defaultAlertType);

    if (typeof rawLowThreshold === "number" || typeof rawLowThreshold === "string") {
      setLowThreshold(String(rawLowThreshold));
    } else {
      setLowThreshold("");
    }

    setMetaNotice(null);
  }, [selectedSensor?.id]);

  const saveMetaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSensor) throw new Error("Select a sensor first");

      const baseMeta = readMetadataJson(selectedSensor.metadataJson);
      const nextMeta: Record<string, unknown> = { ...baseMeta };

      const nextAlertType = alertType.trim().toUpperCase();
      if (nextAlertType) {
        nextMeta.alertType = nextAlertType;
      } else {
        delete nextMeta.alertType;
      }

      const n = toFiniteNumberOrNull(lowThreshold);
      if (lowThreshold.trim() && n === null) {
        throw new Error("Low threshold must be a number");
      }

      if (n !== null) {
        nextMeta.lowThreshold = n;
      } else {
        delete nextMeta.lowThreshold;
      }

      const res = await apiFetch<ApiSingleResponse<Sensor>>(`/sensors/${selectedSensor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ metadataJson: nextMeta }),
      });

      await upsertEntities("sensors", [res.data as any]);
      return res.data;
    },
    onSuccess: async () => {
      setMetaNotice("Saved. Map > Alerts will update automatically.");
      await qc.invalidateQueries({ queryKey: ["sensors", nodeId] });
    },
    onError: (err) => setMetaNotice((err as Error).message),
  });

  return (
    <div>
      <div className="telemetryHeader">
        <div>
          <h3>Telemetry</h3>
          <p className="muted">LoRa nodes, sensors, recent readings, and alert thresholds for Map tags.</p>
        </div>

        <div className="telemetryControls">
          <label className="label">
            Node
            <select
              className="input"
              value={nodeId ?? ""}
              onChange={(e) => {
                setNodeId(e.target.value);
                setSensorId(null);
              }}
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.devEui})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {nodesQuery.isLoading ? <p className="muted">Loading nodes...</p> : null}
      {nodesQuery.isError ? <div className="alert">Failed to load nodes</div> : null}

      {selectedNode ? (
        <div className="telemetryGrid">
          <section className="panel">
            <div className="panelTitle">
              <div>
                <div className="mono">{selectedNode.name}</div>
                <div className="muted mono">devEui: {selectedNode.devEui}</div>
              </div>
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                {selectedNode.locationGeoJson ? (
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      seeOnMap({
                        kind: "GEOJSON_POINT",
                        geoJson: selectedNode.locationGeoJson,
                        label: `LoRa node: ${selectedNode.name}`,
                      })
                    }
                  >
                    See on map
                  </button>
                ) : null}
                <div className="pill">{sensors.length} sensors</div>
              </div>
            </div>

            {sensorsQuery.isLoading ? <p className="muted">Loading sensors...</p> : null}
            {sensorsQuery.isError ? <div className="alert">Failed to load sensors</div> : null}

            <div className="tiles">
              {sensors.map((s) => {
                const latest = latestBySensorId.get(s.id) ?? null;
                const active = s.id === sensorId;

                return (
                  <button key={s.id} type="button" className={active ? "tile tileActive" : "tile"} onClick={() => setSensorId(s.id)}>
                    <div className="tileTop">
                      <div className="mono">{s.key}</div>
                      <div className="badge">{s.type}</div>
                    </div>
                    <div className="tileValue">
                      {latest ? (
                        <>
                          <span className="mono">{parseNumber(latest.numericValue).toFixed(2)}</span>
                          <span className="muted">{s.unit ?? ""}</span>
                        </>
                      ) : (
                        <span className="muted">No readings</span>
                      )}
                    </div>
                    <div className="muted">{latest ? new Date(latest.observedAt).toLocaleString() : ""}</div>
                  </button>
                );
              })}

              {sensors.length === 0 ? <div className="muted">No sensors yet. Ingest data to create them.</div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitle">
              <div>
                <div className="mono">{selectedSensor ? `${selectedSensor.key}` : "Select a sensor"}</div>
                <div className="muted mono">{selectedSensor ? `${selectedSensor.type} ${selectedSensor.unit ?? ""}` : ""}</div>
              </div>
              <div className="pill">{series.length} pts</div>
            </div>

            {selectedSensor ? (
              <div style={{ marginTop: 10 }}>
                <div className="row3">
                  <label className="label">
                    Alert type
                    <select className="input" value={alertType} onChange={(e) => setAlertType(e.target.value)} disabled={saveMetaMutation.isPending}>
                      <option value="">(none)</option>
                      <option value="LOW_WATER">Low water</option>
                      <option value="LOW_FEED">Low feed</option>
                      <option value="LOW_BATTERY">Low battery</option>
                    </select>
                  </label>

                  <label className="label">
                    Low threshold
                    <input className="input" value={lowThreshold} onChange={(e) => setLowThreshold(e.target.value)} placeholder="e.g. 20" disabled={saveMetaMutation.isPending} />
                  </label>

                  <div className="actions" style={{ alignSelf: "flex-end" }}>
                    <button className="btn" type="button" onClick={() => void saveMetaMutation.mutateAsync()} disabled={saveMetaMutation.isPending}>
                      {saveMetaMutation.isPending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                <p className="muted" style={{ marginTop: 6 }}>
                  Map alerts trigger when the latest reading is less than or equal to `lowThreshold`.
                </p>

                {metaNotice ? (
                  <div className="pill" style={{ marginTop: 8 }}>
                    {metaNotice}
                  </div>
                ) : null}

                <div className="hr" style={{ marginTop: 12 }} />
              </div>
            ) : null}

            {seriesQuery.isLoading ? <p className="muted">Loading readings...</p> : null}
            {seriesQuery.isError ? <div className="alert">Failed to load readings</div> : null}

            {values.length >= 2 ? (
              <>
                <Sparkline values={values} />
                <div className="kpiRow">
                  <div className="kpi">
                    <div className="muted">Min</div>
                    <div className="mono">{Math.min(...values).toFixed(2)}</div>
                  </div>
                  <div className="kpi">
                    <div className="muted">Max</div>
                    <div className="mono">{Math.max(...values).toFixed(2)}</div>
                  </div>
                  <div className="kpi">
                    <div className="muted">Latest</div>
                    <div className="mono">{values[values.length - 1].toFixed(2)}</div>
                  </div>
                </div>

                <div className="tableWrap" style={{ marginTop: 12 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Observed</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series
                        .slice()
                        .reverse()
                        .slice(0, 20)
                        .map((r) => (
                          <tr key={r.id}>
                            <td className="muted">{new Date(r.observedAt).toLocaleString()}</td>
                            <td className="mono">{parseNumber(r.numericValue).toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted">Not enough data to chart yet.</p>
            )}
          </section>
        </div>
      ) : null}

      {readingsQuery.isError ? <div className="alert">Failed to load recent readings</div> : null}
    </div>
  );
}

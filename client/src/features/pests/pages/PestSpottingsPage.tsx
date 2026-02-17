import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Paddock, PestSpotting } from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { PREFILL_SELECTED_PEST_ID_KEY, seeOnMap } from "../../../ui/navigation";

function createUuid(): string {
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDateTimeToIso(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error("Invalid datetime");
  }
  return d.toISOString();
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

type CreatePestSpottingInput = {
  id: string;
  paddockId?: string | null;
  pestType: string;
  severity?: string;
  spottedAt: string;
  notes?: string;
};

type UpdatePestSpottingInput = {
  paddockId?: string | null;
  pestType?: string;
  severity?: string | null;
  spottedAt?: string;
  notes?: string | null;
};

async function createPestSpotting(input: CreatePestSpottingInput): Promise<PestSpotting> {
  try {
    const response = await apiFetch<ApiSingleResponse<PestSpotting>>("/pest-spottings", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: PestSpotting = {
      id: input.id,
      farmId: getFarmId(),
      paddockId: input.paddockId ?? null,
      pestType: input.pestType,
      severity: input.severity ?? null,
      locationGeoJson: null,
      spottedAt: input.spottedAt,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("pest_spottings", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      pestType: local.pestType,
      spottedAt: local.spottedAt,
    };

    if (input.paddockId) actionData.paddockId = input.paddockId;
    if (input.severity) actionData.severity = input.severity;
    if (input.notes) actionData.notes = input.notes;

    await enqueueAction({
      entity: "pest_spottings",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updatePestSpotting(args: { pestSpottingId: string; input: UpdatePestSpottingInput }): Promise<PestSpotting> {
  try {
    const response = await apiFetch<ApiSingleResponse<PestSpotting>>(`/pest-spottings/${args.pestSpottingId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<PestSpotting>("pest_spottings");
    const existing = cached.find((p) => p.id === args.pestSpottingId) ?? null;

    const local: PestSpotting = {
      id: args.pestSpottingId,
      farmId: existing?.farmId ?? getFarmId(),
      paddockId: args.input.paddockId !== undefined ? args.input.paddockId : existing?.paddockId ?? null,
      pestType: args.input.pestType ?? existing?.pestType ?? "Pest",
      severity: args.input.severity !== undefined ? args.input.severity : existing?.severity ?? null,
      locationGeoJson: existing?.locationGeoJson ?? null,
      spottedAt: args.input.spottedAt ?? existing?.spottedAt ?? now,
      notes: args.input.notes !== undefined ? args.input.notes : existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("pest_spottings", [local as any]);

    await enqueueAction({
      entity: "pest_spottings",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deletePestSpotting(pestSpottingId: string): Promise<void> {
  try {
    await apiFetch<void>(`/pest-spottings/${pestSpottingId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("pest_spottings", pestSpottingId);

    await enqueueAction({
      entity: "pest_spottings",
      op: "DELETE",
      data: { id: pestSpottingId },
    });
  }
}

export function PestSpottingsPage() {
  const qc = useQueryClient();

  const pestsQuery = useQuery({
    queryKey: ["pest-spottings"],
    queryFn: getPestSpottings,
    staleTime: 20_000,
  });

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const paddocks = useMemo(() => {
    return (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddocksQuery.data]);

  const paddockById = useMemo(() => {
    return new Map(paddocks.map((p) => [p.id, p]));
  }, [paddocks]);

  const spottings = useMemo(() => {
    const list = (pestsQuery.data ?? []).slice();
    list.sort((a, b) => (b.spottedAt ?? "").localeCompare(a.spottedAt ?? ""));
    return list;
  }, [pestsQuery.data]);

  const [prefillPestId, setPrefillPestId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_PEST_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_PEST_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const [editing, setEditing] = useState<PestSpotting | null>(null);

  const [pestType, setPestType] = useState("");
  const [severity, setSeverity] = useState("");
  const [paddockId, setPaddockId] = useState("");
  const [spottedAtLocal, setSpottedAtLocal] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!prefillPestId) return;

    const pest = (pestsQuery.data ?? []).find((p) => p.id === prefillPestId) ?? null;

    // Wait for initial load before giving up, otherwise we'd drop the deep link while data is still loading.
    if (!pest) {
      if (pestsQuery.isLoading) return;
      setPrefillPestId("");
      return;
    }

    setEditing(pest);
    setPestType(pest.pestType);
    setSeverity(pest.severity ?? "");
    setPaddockId(pest.paddockId ?? "");
    setSpottedAtLocal(toLocalDateTimeInput(pest.spottedAt));
    setNotes(pest.notes ?? "");
    setPrefillPestId("");
  }, [prefillPestId, pestsQuery.data, pestsQuery.isLoading]);

  useEffect(() => {
    if (prefillPestId) return;
    if (editing) return;
    if (paddockId) return;
    if (paddocks.length === 0) return;
    setPaddockId(paddocks[0].id);
  }, [editing, paddockId, paddocks]);

  const createMutation = useMutation({
    mutationFn: createPestSpotting,
    onSuccess: async () => {
      setEditing(null);
      setPestType("");
      setSeverity("");
      setNotes("");
      setSpottedAtLocal(toLocalDateTimeInput(new Date().toISOString()));
      await qc.invalidateQueries({ queryKey: ["pest-spottings"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePestSpotting,
    onSuccess: async () => {
      setEditing(null);
      setPestType("");
      setSeverity("");
      setNotes("");
      setSpottedAtLocal(toLocalDateTimeInput(new Date().toISOString()));
      await qc.invalidateQueries({ queryKey: ["pest-spottings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePestSpotting,
    onSuccess: async (_data, id) => {
      if (editing?.id === id) setEditing(null);
      await qc.invalidateQueries({ queryKey: ["pest-spottings"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Pest Spotting</h3>
          <p className="muted">Record pest observations linked to paddocks. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => {
              void pestsQuery.refetch();
              void paddocksQuery.refetch();
            }}
            disabled={pestsQuery.isFetching || paddocksQuery.isFetching}
          >
            Refresh
          </button>
        </div>
      </header>

      {pestsQuery.isLoading ? <p className="muted">Loading pest spottings...</p> : null}
      {pestsQuery.isError ? <div className="alert">Failed to load pest spottings: {(pestsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedPest = pestType.trim();
          if (!trimmedPest) return;

          let spottedAt: string;
          try {
            spottedAt = localDateTimeToIso(spottedAtLocal);
          } catch {
            return;
          }

          const trimmedSeverity = severity.trim();
          const trimmedNotes = notes.trim();

          const paddockPayload = paddockId ? paddockId : null;

          if (editing) {
            void updateMutation.mutateAsync({
              pestSpottingId: editing.id,
              input: {
                pestType: trimmedPest,
                paddockId: paddockPayload,
                severity: trimmedSeverity ? trimmedSeverity : null,
                spottedAt,
                notes: trimmedNotes ? trimmedNotes : null,
              },
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            pestType: trimmedPest,
            paddockId: paddockPayload,
            severity: trimmedSeverity || undefined,
            spottedAt,
            notes: trimmedNotes || undefined,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Pest
            <input className="input" value={pestType} onChange={(e) => setPestType(e.target.value)} placeholder="e.g. Aphids" required />
          </label>

          <label className="label">
            Severity
            <input className="input" value={severity} onChange={(e) => setSeverity(e.target.value)} placeholder="Optional" />
          </label>

          <label className="label">
            Paddock
            <select className="input" value={paddockId} onChange={(e) => setPaddockId(e.target.value)}>
              <option value="">(none)</option>
              {paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Spotted at
            <input className="input" value={spottedAtLocal} onChange={(e) => setSpottedAtLocal(e.target.value)} type="datetime-local" required />
          </label>

          <label className="label">
            Notes
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>

          <div />
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !pestType.trim()}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Spotting"}
          </button>

          {editing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setPestType("");
                setSeverity("");
                setNotes("");
                setSpottedAtLocal(toLocalDateTimeInput(new Date().toISOString()));
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          {editing && (editing?.locationGeoJson || editing?.paddockId) ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => {
                if (editing?.locationGeoJson) {
                  seeOnMap({
                    kind: "GEOJSON_POINT",
                    geoJson: editing.locationGeoJson,
                    label: `Pest: ${editing.pestType}`,
                  });
                } else if (editing?.paddockId) {
                  seeOnMap({ kind: "PADDOCK", paddockId: editing.paddockId });
                }
              }}
            >
              See on map
            </button>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      {editing ? <AttachmentsPanel entityType="PEST_SPOTTING" entityId={editing.id} disabled={busy} /> : null}


      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Pest</th>
              <th>Severity</th>
              <th>Paddock</th>
              <th>Notes</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {spottings.map((s) => {
              const paddockName = s.paddockId ? paddockById.get(s.paddockId)?.name ?? "" : "";

              return (
                <tr key={s.id}>
                  <td className="muted">{new Date(s.spottedAt).toLocaleString()}</td>
                  <td className="mono">{s.pestType}</td>
                  <td className="muted">{s.severity ?? ""}</td>
                  <td className="muted">{paddockName}</td>
                  <td className="muted">{s.notes ?? ""}</td>
                  <td className="muted">{new Date(s.updatedAt).toLocaleString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {(s.locationGeoJson || s.paddockId) ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (s.locationGeoJson) {
                              seeOnMap({ kind: "GEOJSON_POINT", geoJson: s.locationGeoJson, label: `Pest: ${s.pestType}` });
                            } else if (s.paddockId) {
                              seeOnMap({ kind: "PADDOCK", paddockId: s.paddockId });
                            }
                          }}
                          disabled={busy}
                        >
                          See on map
                        </button>
                      ) : null}
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditing(s);
                          setPestType(s.pestType);
                          setSeverity(s.severity ?? "");
                          setPaddockId(s.paddockId ?? "");
                          setSpottedAtLocal(toLocalDateTimeInput(s.spottedAt));
                          setNotes(s.notes ?? "");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          if (!confirm("Delete this pest spotting?")) return;
                          void deleteMutation.mutateAsync(s.id);
                        }}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {spottings.length === 0 && !pestsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={7}>
                  No pest spottings yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {(deleteMutation.error as Error).message}
        </div>
      ) : null}
    </section>
  );
}

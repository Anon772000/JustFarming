import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { areaHaFromGeoJson, formatAreaHaAcres, toNumberOrNull } from "../../../utils/geoArea";
import type { ApiListResponse, ApiSingleResponse, Mob, Paddock } from "../../../types/api";
import { PaddockDetailsPanel } from "../components/PaddockDetailsPanel";
import { PREFILL_SELECTED_PADDOCK_ID_KEY } from "../../../ui/navigation";

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

type CreatePaddockInput = {
  id: string;
  name: string;
  areaHa?: number;
  currentStatus?: string;
};

type UpdatePaddockInput = {
  name?: string;
  areaHa?: number;
  currentStatus?: string;
};

async function createPaddock(input: CreatePaddockInput): Promise<Paddock> {
  try {
    const response = await apiFetch<ApiSingleResponse<Paddock>>("/paddocks", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: Paddock = {
      id: input.id,
      farmId: getFarmId(),
      name: input.name,
      areaHa: input.areaHa !== undefined ? String(input.areaHa) : null,
      boundaryGeoJson: null,
      currentStatus: input.currentStatus ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("paddocks", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      name: local.name,
    };

    if (input.areaHa !== undefined) actionData.areaHa = input.areaHa;
    if (input.currentStatus) actionData.currentStatus = input.currentStatus;

    await enqueueAction({
      entity: "paddocks",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updatePaddock(args: { paddockId: string; input: UpdatePaddockInput }): Promise<Paddock> {
  try {
    const response = await apiFetch<ApiSingleResponse<Paddock>>(`/paddocks/${args.paddockId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Paddock>("paddocks");
    const existing = cached.find((p) => p.id === args.paddockId) ?? null;

    const local: Paddock = {
      id: args.paddockId,
      farmId: existing?.farmId ?? getFarmId(),
      name: args.input.name ?? existing?.name ?? "Paddock",
      areaHa: args.input.areaHa !== undefined ? String(args.input.areaHa) : (existing?.areaHa ?? null),
      boundaryGeoJson: existing?.boundaryGeoJson ?? null,
      currentStatus: args.input.currentStatus ?? existing?.currentStatus ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("paddocks", [local as any]);

    await enqueueAction({
      entity: "paddocks",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deletePaddock(paddockId: string): Promise<void> {
  try {
    await apiFetch<void>(`/paddocks/${paddockId}`,
      {
        method: "DELETE",
      },
    );
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("paddocks", paddockId);

    await enqueueAction({
      entity: "paddocks",
      op: "DELETE",
      data: { id: paddockId },
    });
  }
}

function toNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function PaddockListPage() {
  const qc = useQueryClient();

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const mobsQuery = useQuery({
    queryKey: ["mobs"],
    queryFn: getMobs,
    staleTime: 30_000,
  });

  const paddocksSorted = useMemo(() => {
    return (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddocksQuery.data]);

  const paddockById = useMemo(() => {
    return new Map(paddocksSorted.map((p) => [p.id, p]));
  }, [paddocksSorted]);

  const mobs = useMemo(() => {
    return (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data]);

  const [selectedPaddockId, setSelectedPaddockId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_PADDOCK_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_PADDOCK_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });
  const selectedPaddock = useMemo(() => {
    if (!selectedPaddockId) return null;
    return paddocksSorted.find((p) => p.id === selectedPaddockId) ?? null;
  }, [paddocksSorted, selectedPaddockId]);

  const [search, setSearch] = useState("");
  const paddocksFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return paddocksSorted;

    return paddocksSorted.filter((p) => {
      const hay = `${p.name} ${p.currentStatus ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [paddocksSorted, search]);

  const [editing, setEditing] = useState<Paddock | null>(null);

  const [name, setName] = useState("");
  const [areaHa, setAreaHa] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");

  const createMutation = useMutation({
    mutationFn: createPaddock,
    onSuccess: async () => {
      setName("");
      setAreaHa("");
      setCurrentStatus("");
      await qc.invalidateQueries({ queryKey: ["paddocks"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePaddock,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setAreaHa("");
      setCurrentStatus("");
      await qc.invalidateQueries({ queryKey: ["paddocks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaddock,
    onSuccess: async (_data, paddockId) => {
      if (editing?.id === paddockId) {
        setEditing(null);
        setName("");
        setAreaHa("");
        setCurrentStatus("");
      }

      if (selectedPaddockId === paddockId) {
        setSelectedPaddockId("");
      }

      await qc.invalidateQueries({ queryKey: ["paddocks"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  const withBoundary = useMemo(() => paddocksSorted.filter((p) => !!p.boundaryGeoJson).length, [paddocksSorted]);

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Paddocks</h3>
          <p className="muted">Paddock master data plus an ops view (mobs, moves, issues, tasks). Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <div className="pill">
            {paddocksSorted.length} paddocks | {withBoundary} with boundary
          </div>
          <button className="btn" type="button" onClick={() => void paddocksQuery.refetch()} disabled={paddocksQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {paddocksQuery.isLoading ? <p className="muted">Loading paddocks...</p> : null}
      {paddocksQuery.isError ? <div className="alert">Failed to load paddocks: {(paddocksQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = name.trim();
          if (!trimmedName) return;

          const payload = {
            name: trimmedName,
            areaHa: toNumberOrUndefined(areaHa),
            currentStatus: currentStatus.trim() || undefined,
          };

          if (editing) {
            void updateMutation.mutateAsync({ paddockId: editing.id, input: payload });
          } else {
            void createMutation.mutateAsync({ id: createUuid(), ...payload });
          }
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label className="label">
            Area (ha)
            <input
              className="input"
              value={areaHa}
              onChange={(e) => setAreaHa(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 42.5"
            />
          </label>

          <label className="label">
            Current status
            <input
              className="input"
              value={currentStatus}
              onChange={(e) => setCurrentStatus(e.target.value)}
              placeholder="e.g. Grazing, Resting, Sown"
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !name.trim()}>
            {isEditing ? (updateMutation.isPending ? "Saving..." : "Save Changes") : createMutation.isPending ? "Creating..." : "Create Paddock"}
          </button>
          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setAreaHa("");
                setCurrentStatus("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      <div className="hr" />

      <div className="row3" style={{ marginBottom: 10 }}>
        <label className="label">
          Search
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or status" />
        </label>

        <div>
          <div className="muted mono" style={{ fontSize: 12 }}>
            Selected
          </div>
          <div className="pill" style={{ display: "inline-block", marginTop: 6 }}>
            {selectedPaddock ? selectedPaddock.name : "(none)"}
          </div>
        </div>

        <div />
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Area</th>
              <th>Status</th>
              <th>Boundary</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paddocksFiltered.map((p) => {
              const isSelected = selectedPaddockId === p.id;

              return (
                <tr key={p.id} style={isSelected ? { background: "rgba(44, 110, 73, 0.08)" } : undefined}>
                  <td className="mono">{p.name}</td>
                  <td className="mono">{formatAreaHaAcres(areaHaFromGeoJson(p.boundaryGeoJson) ?? toNumberOrNull(p.areaHa))}</td>
                  <td className="muted">{p.currentStatus ?? ""}</td>
                  <td className="muted">{p.boundaryGeoJson ? "yes" : "no"}</td>
                  <td className="muted">{new Date(p.updatedAt).toLocaleString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className={isSelected ? "btn btnPrimary" : "btn"}
                        type="button"
                        onClick={() => setSelectedPaddockId((prev) => (prev === p.id ? "" : p.id))}
                        disabled={busy}
                      >
                        {isSelected ? "Hide" : "Details"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditing(p);
                          setSelectedPaddockId(p.id);
                          setName(p.name);
                          setAreaHa(p.areaHa ? String(p.areaHa) : "");
                          setCurrentStatus(p.currentStatus ?? "");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          if (!confirm(`Delete paddock "${p.name}"?`)) return;
                          void deleteMutation.mutateAsync(p.id);
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

            {paddocksFiltered.length === 0 && !paddocksQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={6}>
                  No paddocks match your filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedPaddock ? (
        <PaddockDetailsPanel paddock={selectedPaddock} paddockById={paddockById} mobs={mobs} onClose={() => setSelectedPaddockId("")} />
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          Select a paddock to see current mobs, recent moves, open issues, open tasks, and recent activity.
        </p>
      )}

      {deleteMutation.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {(deleteMutation.error as Error).message}
        </div>
      ) : null}
    </section>
  );
}

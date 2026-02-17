import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type { ApiListResponse, ApiSingleResponse, Paddock, PaddockPlan, PlanStatus } from "../../../types/api";

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

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDateTimeToIso(value: string): string {
  const v = value.trim();
  if (!v) throw new Error("Missing datetime");
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid datetime");
  return d.toISOString();
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

async function getPaddockPlans(): Promise<PaddockPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<PaddockPlan>>("/paddock-plans");
    await upsertEntities("paddock_plans", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<PaddockPlan>("paddock_plans");
    if (cached.length) return cached;
    throw err;
  }
}

type CreatePaddockPlanInput = {
  id: string;
  paddockId: string;
  name: string;
  status?: PlanStatus;
  plannedStart: string;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  notes?: string;
};

type UpdatePaddockPlanInput = {
  paddockId?: string;
  name?: string;
  status?: PlanStatus;
  plannedStart?: string;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  notes?: string;
};

async function createPaddockPlan(input: CreatePaddockPlanInput): Promise<PaddockPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<PaddockPlan>>("/paddock-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: PaddockPlan = {
      id: input.id,
      farmId: getFarmId(),
      paddockId: input.paddockId,
      name: input.name,
      status: input.status ?? "DRAFT",
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd ?? null,
      actualStart: input.actualStart ?? null,
      actualEnd: input.actualEnd ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("paddock_plans", [local as any]);

    await enqueueAction({
      entity: "paddock_plans",
      op: "CREATE",
      data: {
        id: local.id,
        paddockId: local.paddockId,
        name: local.name,
        status: local.status,
        plannedStart: local.plannedStart,
        ...(local.plannedEnd ? { plannedEnd: local.plannedEnd } : {}),
        ...(local.actualStart ? { actualStart: local.actualStart } : {}),
        ...(local.actualEnd ? { actualEnd: local.actualEnd } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });

    return local;
  }
}

async function updatePaddockPlan(args: { paddockPlanId: string; input: UpdatePaddockPlanInput }): Promise<PaddockPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<PaddockPlan>>(`/paddock-plans/${args.paddockPlanId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const cached = await listEntities<PaddockPlan>("paddock_plans");
    const existing = cached.find((p) => p.id === args.paddockPlanId) ?? null;

    const local: PaddockPlan = {
      id: args.paddockPlanId,
      farmId: existing?.farmId ?? getFarmId(),
      paddockId: args.input.paddockId ?? existing?.paddockId ?? "00000000-0000-0000-0000-000000000000",
      name: args.input.name ?? existing?.name ?? "Plan",
      status: args.input.status ?? existing?.status ?? "DRAFT",
      plannedStart: args.input.plannedStart ?? existing?.plannedStart ?? now,
      plannedEnd:
        args.input.plannedEnd !== undefined
          ? (args.input.plannedEnd ?? null)
          : (existing?.plannedEnd ?? null),
      actualStart:
        args.input.actualStart !== undefined
          ? (args.input.actualStart ?? null)
          : (existing?.actualStart ?? null),
      actualEnd:
        args.input.actualEnd !== undefined
          ? (args.input.actualEnd ?? null)
          : (existing?.actualEnd ?? null),
      notes:
        args.input.notes !== undefined
          ? (args.input.notes ?? null)
          : (existing?.notes ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("paddock_plans", [local as any]);

    await enqueueAction({
      entity: "paddock_plans",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deletePaddockPlan(paddockPlanId: string): Promise<void> {
  try {
    await apiFetch<void>(`/paddock-plans/${paddockPlanId}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("paddock_plans", paddockPlanId);

    await enqueueAction({
      entity: "paddock_plans",
      op: "DELETE",
      data: { id: paddockPlanId },
    });
  }
}

const STATUS_OPTIONS: Array<{ value: PlanStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function PaddockPlansPage() {
  const qc = useQueryClient();

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const plansQuery = useQuery({
    queryKey: ["paddock-plans"],
    queryFn: getPaddockPlans,
    staleTime: 30_000,
  });

  const paddockById = useMemo(() => {
    const m = new Map<string, Paddock>();
    for (const p of paddocksQuery.data ?? []) m.set(p.id, p);
    return m;
  }, [paddocksQuery.data]);

  const [editing, setEditing] = useState<PaddockPlan | null>(null);

  const [paddockId, setPaddockId] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<PlanStatus>("DRAFT");
  const [plannedStartLocal, setPlannedStartLocal] = useState("");
  const [plannedEndLocal, setPlannedEndLocal] = useState("");
  const [actualStartLocal, setActualStartLocal] = useState("");
  const [actualEndLocal, setActualEndLocal] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: createPaddockPlan,
    onSuccess: async () => {
      setEditing(null);
      setPaddockId("");
      setName("");
      setStatus("DRAFT");
      setPlannedStartLocal("");
      setPlannedEndLocal("");
      setActualStartLocal("");
      setActualEndLocal("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["paddock-plans"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePaddockPlan,
    onSuccess: async () => {
      setEditing(null);
      setPaddockId("");
      setName("");
      setStatus("DRAFT");
      setPlannedStartLocal("");
      setPlannedEndLocal("");
      setActualStartLocal("");
      setActualEndLocal("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["paddock-plans"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaddockPlan,
    onSuccess: async (_data, paddockPlanIdArg) => {
      if (editing?.id === paddockPlanIdArg) {
        setEditing(null);
        setPaddockId("");
        setName("");
        setStatus("DRAFT");
        setPlannedStartLocal("");
        setPlannedEndLocal("");
        setActualStartLocal("");
        setActualEndLocal("");
        setNotes("");
      }
      await qc.invalidateQueries({ queryKey: ["paddock-plans"] });
    },
  });

  const sorted = useMemo(() => {
    return (plansQuery.data ?? []).slice().sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
  }, [plansQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const applyQuickUpdate = (plan: PaddockPlan, changes: UpdatePaddockPlanInput) => {
    void updateMutation.mutateAsync({ paddockPlanId: plan.id, input: changes });
  };

  return (
    <div>
      <header className="sectionHead">
        <div>
          <h3>Paddock Plans</h3>
          <p className="muted">Planned and actual paddock activities (sowing, grazing, spraying, etc.).</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void plansQuery.refetch()} disabled={plansQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {plansQuery.isLoading ? <p className="muted">Loading paddock plans...</p> : null}
      {plansQuery.isError ? <div className="alert">Failed to load paddock plans: {(plansQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = name.trim();
          if (!trimmedName || !paddockId) return;

          let plannedStart: string;
          try {
            plannedStart = localDateTimeToIso(plannedStartLocal);
          } catch {
            return;
          }

          let plannedEnd: string | null = null;
          if (plannedEndLocal.trim()) {
            try {
              plannedEnd = localDateTimeToIso(plannedEndLocal);
            } catch {
              return;
            }
          }

          let actualStart: string | null = null;
          if (actualStartLocal.trim()) {
            try {
              actualStart = localDateTimeToIso(actualStartLocal);
            } catch {
              return;
            }
          }

          let actualEnd: string | null = null;
          if (actualEndLocal.trim()) {
            try {
              actualEnd = localDateTimeToIso(actualEndLocal);
            } catch {
              return;
            }
          }

          const payload = {
            paddockId,
            name: trimmedName,
            status,
            plannedStart,
            plannedEnd,
            actualStart,
            actualEnd,
            notes: notes.trim() || undefined,
          } satisfies UpdatePaddockPlanInput;

          if (editing) {
            void updateMutation.mutateAsync({ paddockPlanId: editing.id, input: payload });
          } else {
            void createMutation.mutateAsync({ id: createStableUuid(), ...payload });
          }
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Paddock
            <select className="select" value={paddockId} onChange={(e) => setPaddockId(e.target.value)} required>
              <option value="">Select paddock...</option>
              {(paddocksQuery.data ?? [])
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
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Sow oats" />
          </label>

          <label className="label">
            Status
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Planned start
            <input className="input" type="datetime-local" value={plannedStartLocal} onChange={(e) => setPlannedStartLocal(e.target.value)} required />
          </label>

          <label className="label">
            Planned end
            <input className="input" type="datetime-local" value={plannedEndLocal} onChange={(e) => setPlannedEndLocal(e.target.value)} />
          </label>

          <label className="label">
            Notes
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Actual start
            <input className="input" type="datetime-local" value={actualStartLocal} onChange={(e) => setActualStartLocal(e.target.value)} />
          </label>

          <label className="label">
            Actual end
            <input className="input" type="datetime-local" value={actualEndLocal} onChange={(e) => setActualEndLocal(e.target.value)} />
          </label>

          <div className="actions" style={{ alignSelf: "end" }}>
            <button className="btn btnPrimary" type="submit" disabled={busy || !paddockId || !name.trim() || !plannedStartLocal.trim()}>
              {editing
                ? updateMutation.isPending
                  ? "Saving..."
                  : "Save Changes"
                : createMutation.isPending
                  ? "Creating..."
                  : "Create Plan"}
            </button>
            {editing ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setPaddockId("");
                  setName("");
                  setStatus("DRAFT");
                  setPlannedStartLocal("");
                  setPlannedEndLocal("");
                  setActualStartLocal("");
                  setActualEndLocal("");
                  setNotes("");
                }}
                disabled={busy}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Paddock</th>
              <th>Status</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  {p.notes ? <div className="muted" style={{ marginTop: 4 }}>{p.notes}</div> : null}
                </td>
                <td>{paddockById.get(p.paddockId)?.name ?? p.paddockId}</td>
                <td className="mono">{p.status}</td>
                <td className="mono">
                  {new Date(p.plannedStart).toLocaleString()}
                  {p.plannedEnd ? ` -> ${new Date(p.plannedEnd).toLocaleString()}` : ""}
                </td>
                <td className="mono">
                  {p.actualStart ? new Date(p.actualStart).toLocaleString() : ""}
                  {p.actualEnd ? ` -> ${new Date(p.actualEnd).toLocaleString()}` : ""}
                </td>
                <td className="mono">{new Date(p.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="actions" style={{ marginTop: 0 }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => seeOnMap({ kind: "PADDOCK", paddockId: p.paddockId })}
                    >
                      See on map
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(p);
                        setPaddockId(p.paddockId);
                        setName(p.name);
                        setStatus(p.status);
                        setPlannedStartLocal(toLocalDateTimeInput(p.plannedStart));
                        setPlannedEndLocal(toLocalDateTimeInput(p.plannedEnd ?? null));
                        setActualStartLocal(toLocalDateTimeInput(p.actualStart ?? null));
                        setActualEndLocal(toLocalDateTimeInput(p.actualEnd ?? null));
                        setNotes(p.notes ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const nowIso = new Date().toISOString();
                        applyQuickUpdate(p, {
                          status: "IN_PROGRESS",
                          actualStart: p.actualStart ?? nowIso,
                        });
                      }}
                    >
                      Start
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const nowIso = new Date().toISOString();
                        applyQuickUpdate(p, {
                          status: "COMPLETED",
                          actualStart: p.actualStart ?? nowIso,
                          actualEnd: p.actualEnd ?? nowIso,
                        });
                      }}
                    >
                      Complete
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete paddock plan "${p.name}"?`)) return;
                        void deleteMutation.mutateAsync(p.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">
                  No paddock plans yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

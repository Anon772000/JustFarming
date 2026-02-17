import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type {
  ApiListResponse,
  ApiSingleResponse,
  Mob,
  Paddock,
  PlanStatus,
  ProductionPlan,
} from "../../../types/api";

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

function toNumberOrNull(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

async function getProductionPlans(): Promise<ProductionPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<ProductionPlan>>("/production-plans");
    await upsertEntities("production_plans", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<ProductionPlan>("production_plans");
    if (cached.length) return cached;
    throw err;
  }
}

type CreateProductionPlanInput = {
  id: string;
  paddockId?: string | null;
  mobId?: string | null;
  planName: string;
  status?: PlanStatus;
  targetMetric?: string;
  targetValue?: number | null;
  actualValue?: number | null;
  startDate: string;
  endDate?: string | null;
  notes?: string;
};

type UpdateProductionPlanInput = {
  paddockId?: string | null;
  mobId?: string | null;
  planName?: string;
  status?: PlanStatus;
  targetMetric?: string;
  targetValue?: number | null;
  actualValue?: number | null;
  startDate?: string;
  endDate?: string | null;
  notes?: string;
};

async function createProductionPlan(input: CreateProductionPlanInput): Promise<ProductionPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<ProductionPlan>>("/production-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: ProductionPlan = {
      id: input.id,
      farmId: getFarmId(),
      paddockId: input.paddockId ?? null,
      mobId: input.mobId ?? null,
      planName: input.planName,
      status: input.status ?? "DRAFT",
      targetMetric: input.targetMetric ?? null,
      targetValue: input.targetValue === null || input.targetValue === undefined ? null : String(input.targetValue),
      actualValue: input.actualValue === null || input.actualValue === undefined ? null : String(input.actualValue),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("production_plans", [local as any]);

    await enqueueAction({
      entity: "production_plans",
      op: "CREATE",
      data: {
        id: local.id,
        paddockId: local.paddockId,
        mobId: local.mobId,
        planName: local.planName,
        status: local.status,
        ...(input.targetMetric ? { targetMetric: input.targetMetric } : {}),
        ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
        ...(input.actualValue !== undefined ? { actualValue: input.actualValue } : {}),
        startDate: local.startDate,
        ...(local.endDate ? { endDate: local.endDate } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });

    return local;
  }
}

async function updateProductionPlan(args: { productionPlanId: string; input: UpdateProductionPlanInput }): Promise<ProductionPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<ProductionPlan>>(`/production-plans/${args.productionPlanId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const cached = await listEntities<ProductionPlan>("production_plans");
    const existing = cached.find((p) => p.id === args.productionPlanId) ?? null;

    const local: ProductionPlan = {
      id: args.productionPlanId,
      farmId: existing?.farmId ?? getFarmId(),
      paddockId:
        args.input.paddockId !== undefined
          ? (args.input.paddockId ?? null)
          : (existing?.paddockId ?? null),
      mobId:
        args.input.mobId !== undefined
          ? (args.input.mobId ?? null)
          : (existing?.mobId ?? null),
      planName: args.input.planName ?? existing?.planName ?? "Production",
      status: args.input.status ?? existing?.status ?? "DRAFT",
      targetMetric: args.input.targetMetric ?? existing?.targetMetric ?? null,
      targetValue:
        args.input.targetValue !== undefined
          ? (args.input.targetValue === null ? null : String(args.input.targetValue))
          : (existing?.targetValue ?? null),
      actualValue:
        args.input.actualValue !== undefined
          ? (args.input.actualValue === null ? null : String(args.input.actualValue))
          : (existing?.actualValue ?? null),
      startDate: args.input.startDate ?? existing?.startDate ?? now,
      endDate:
        args.input.endDate !== undefined
          ? (args.input.endDate ?? null)
          : (existing?.endDate ?? null),
      notes:
        args.input.notes !== undefined
          ? (args.input.notes ?? null)
          : (existing?.notes ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("production_plans", [local as any]);

    await enqueueAction({
      entity: "production_plans",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteProductionPlan(productionPlanId: string): Promise<void> {
  try {
    await apiFetch<void>(`/production-plans/${productionPlanId}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("production_plans", productionPlanId);

    await enqueueAction({
      entity: "production_plans",
      op: "DELETE",
      data: { id: productionPlanId },
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

export function ProductionPlansPage() {
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

  const plansQuery = useQuery({
    queryKey: ["production-plans"],
    queryFn: getProductionPlans,
    staleTime: 30_000,
  });

  const paddockById = useMemo(() => {
    const m = new Map<string, Paddock>();
    for (const p of paddocksQuery.data ?? []) m.set(p.id, p);
    return m;
  }, [paddocksQuery.data]);

  const mobById = useMemo(() => {
    const m = new Map<string, Mob>();
    for (const mob of mobsQuery.data ?? []) m.set(mob.id, mob);
    return m;
  }, [mobsQuery.data]);

  const [editing, setEditing] = useState<ProductionPlan | null>(null);

  const [planName, setPlanName] = useState("");
  const [status, setStatus] = useState<PlanStatus>("DRAFT");
  const [paddockId, setPaddockId] = useState("");
  const [mobId, setMobId] = useState("");
  const [targetMetric, setTargetMetric] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: createProductionPlan,
    onSuccess: async () => {
      setEditing(null);
      setPlanName("");
      setStatus("DRAFT");
      setPaddockId("");
      setMobId("");
      setTargetMetric("");
      setTargetValue("");
      setActualValue("");
      setStartLocal("");
      setEndLocal("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateProductionPlan,
    onSuccess: async () => {
      setEditing(null);
      setPlanName("");
      setStatus("DRAFT");
      setPaddockId("");
      setMobId("");
      setTargetMetric("");
      setTargetValue("");
      setActualValue("");
      setStartLocal("");
      setEndLocal("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProductionPlan,
    onSuccess: async (_data, productionPlanIdArg) => {
      if (editing?.id === productionPlanIdArg) {
        setEditing(null);
        setPlanName("");
        setStatus("DRAFT");
        setPaddockId("");
        setMobId("");
        setTargetMetric("");
        setTargetValue("");
        setActualValue("");
        setStartLocal("");
        setEndLocal("");
        setNotes("");
      }
      await qc.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });

  const sorted = useMemo(() => {
    return (plansQuery.data ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [plansQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const quickStatus = (plan: ProductionPlan, next: PlanStatus) => {
    void updateMutation.mutateAsync({ productionPlanId: plan.id, input: { status: next } });
  };

  return (
    <div>
      <header className="sectionHead">
        <div>
          <h3>Production Plans</h3>
          <p className="muted">Farm-level production targets (per paddock, per mob, or overall).</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void plansQuery.refetch()} disabled={plansQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {plansQuery.isLoading ? <p className="muted">Loading production plans...</p> : null}
      {plansQuery.isError ? <div className="alert">Failed to load production plans: {(plansQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = planName.trim();
          if (!trimmedName) return;

          let startDate: string;
          try {
            startDate = localDateTimeToIso(startLocal);
          } catch {
            return;
          }

          let endDate: string | null = null;
          if (endLocal.trim()) {
            try {
              endDate = localDateTimeToIso(endLocal);
            } catch {
              return;
            }
          }

          const payload = {
            planName: trimmedName,
            status,
            paddockId: paddockId ? paddockId : null,
            mobId: mobId ? mobId : null,
            targetMetric: targetMetric.trim() || undefined,
            targetValue: toNumberOrNull(targetValue),
            actualValue: toNumberOrNull(actualValue),
            startDate,
            endDate,
            notes: notes.trim() || undefined,
          } satisfies UpdateProductionPlanInput;

          if (editing) {
            void updateMutation.mutateAsync({ productionPlanId: editing.id, input: payload });
          } else {
            void createMutation.mutateAsync({ id: createStableUuid(), ...payload });
          }
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Plan name
            <input className="input" value={planName} onChange={(e) => setPlanName(e.target.value)} required placeholder="e.g. Beef liveweight gain" />
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

          <label className="label">
            Target metric
            <input className="input" value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)} placeholder="e.g. kg/day" />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Paddock
            <select className="select" value={paddockId} onChange={(e) => setPaddockId(e.target.value)}>
              <option value="">(none)</option>
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
            Mob
            <select className="select" value={mobId} onChange={(e) => setMobId(e.target.value)}>
              <option value="">(none)</option>
              {(mobsQuery.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="label">
            Target value
            <input className="input" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} inputMode="decimal" placeholder="Optional" />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Actual value
            <input className="input" value={actualValue} onChange={(e) => setActualValue(e.target.value)} inputMode="decimal" placeholder="Optional" />
          </label>

          <label className="label">
            Start
            <input className="input" type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} required />
          </label>

          <label className="label">
            End
            <input className="input" type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
          </label>
        </div>

        <label className="label">
          Notes
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 44, resize: "vertical" }} />
        </label>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !planName.trim() || !startLocal.trim()}>
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
                setPlanName("");
                setStatus("DRAFT");
                setPaddockId("");
                setMobId("");
                setTargetMetric("");
                setTargetValue("");
                setActualValue("");
                setStartLocal("");
                setEndLocal("");
                setNotes("");
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

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Status</th>
              <th>Paddock</th>
              <th>Mob</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Start</th>
              <th>End</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{p.planName}</div>
                  {p.notes ? <div className="muted" style={{ marginTop: 4 }}>{p.notes}</div> : null}
                </td>
                <td className="mono">{p.status}</td>
                <td>{p.paddockId ? paddockById.get(p.paddockId)?.name ?? p.paddockId : ""}</td>
                <td>{p.mobId ? mobById.get(p.mobId)?.name ?? p.mobId : ""}</td>
                <td className="mono">{p.targetMetric ? `${p.targetValue ?? ""} ${p.targetMetric}`.trim() : (p.targetValue ?? "")}</td>
                <td className="mono">{p.targetMetric ? `${p.actualValue ?? ""} ${p.targetMetric}`.trim() : (p.actualValue ?? "")}</td>
                <td className="mono">{new Date(p.startDate).toLocaleString()}</td>
                <td className="mono">{p.endDate ? new Date(p.endDate).toLocaleString() : ""}</td>
                <td className="mono">{new Date(p.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="actions" style={{ marginTop: 0 }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !(p.paddockId || p.mobId)}
                      onClick={() => {
                        if (p.paddockId) {
                          seeOnMap({ kind: "PADDOCK", paddockId: p.paddockId });
                          return;
                        }
                        if (p.mobId) {
                          seeOnMap({ kind: "MOB", mobId: p.mobId });
                        }
                      }}
                    >
                      See on map
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(p);
                        setPlanName(p.planName);
                        setStatus(p.status);
                        setPaddockId(p.paddockId ?? "");
                        setMobId(p.mobId ?? "");
                        setTargetMetric(p.targetMetric ?? "");
                        setTargetValue(p.targetValue ?? "");
                        setActualValue(p.actualValue ?? "");
                        setStartLocal(toLocalDateTimeInput(p.startDate));
                        setEndLocal(toLocalDateTimeInput(p.endDate ?? null));
                        setNotes(p.notes ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={() => quickStatus(p, "IN_PROGRESS")}>
                      Start
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={() => quickStatus(p, "COMPLETED")}>
                      Complete
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete production plan "${p.planName}"?`)) return;
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
                <td colSpan={10} className="muted">
                  No production plans yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

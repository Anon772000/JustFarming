import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type {
  ApiListResponse,
  ApiSingleResponse,
  Mob,
  MobMovementPlan,
  Paddock,
  PlanStatus,
} from "../../../types/api";

const PREFILL_MOB_ID_KEY = "prefill.mobId";

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

async function getPlans(): Promise<MobMovementPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<MobMovementPlan>>("/mob-movement-plans");
    await upsertEntities("mob_movement_plans", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<MobMovementPlan>("mob_movement_plans");
    if (cached.length) return cached;
    throw err;
  }
}

type CreatePlanInput = {
  id: string;
  mobId: string;
  fromPaddockId?: string;
  toPaddockId: string;
  status?: PlanStatus;
  plannedAt: string;
  actualAt?: string;
  reason?: string;
};

type UpdatePlanInput = {
  mobId?: string;
  fromPaddockId?: string;
  toPaddockId?: string;
  status?: PlanStatus;
  plannedAt?: string;
  actualAt?: string;
  reason?: string;
};

async function updateLocalMobCurrentPaddock(mobId: string, toPaddockId: string): Promise<void> {
  const mobs = await listEntities<Mob>("mobs");
  const existing = mobs.find((m) => m.id === mobId);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: Mob = {
    ...existing,
    currentPaddockId: toPaddockId,
    updatedAt: now,
  };

  await upsertEntities("mobs", [updated as any]);
}

async function createPlan(input: CreatePlanInput): Promise<MobMovementPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<MobMovementPlan>>("/mob-movement-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: MobMovementPlan = {
      id: input.id,
      farmId: getFarmId(),
      mobId: input.mobId,
      fromPaddockId: input.fromPaddockId ?? null,
      toPaddockId: input.toPaddockId,
      status: (input.status ?? "PLANNED") as PlanStatus,
      plannedAt: input.plannedAt,
      actualAt: input.actualAt ?? null,
      reason: input.reason ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("mob_movement_plans", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      mobId: local.mobId,
      toPaddockId: local.toPaddockId,
      status: local.status,
      plannedAt: local.plannedAt,
    };

    if (local.fromPaddockId) actionData.fromPaddockId = local.fromPaddockId;
    if (local.actualAt) actionData.actualAt = local.actualAt;
    if (local.reason) actionData.reason = local.reason;

    await enqueueAction({
      entity: "mob_movement_plans",
      op: "CREATE",
      data: actionData,
    });

    if (local.status === "COMPLETED") {
      await updateLocalMobCurrentPaddock(local.mobId, local.toPaddockId);
    }

    return local;
  }
}

async function updatePlan(args: { mobMovementPlanId: string; input: UpdatePlanInput }): Promise<MobMovementPlan> {
  try {
    const response = await apiFetch<ApiSingleResponse<MobMovementPlan>>(`/mob-movement-plans/${args.mobMovementPlanId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const cached = await listEntities<MobMovementPlan>("mob_movement_plans");
    const existing = cached.find((p) => p.id === args.mobMovementPlanId) ?? null;

    const local: MobMovementPlan = {
      id: args.mobMovementPlanId,
      farmId: existing?.farmId ?? getFarmId(),
      mobId: (args.input.mobId ?? existing?.mobId ?? "") as string,
      fromPaddockId: args.input.fromPaddockId ?? existing?.fromPaddockId ?? null,
      toPaddockId: (args.input.toPaddockId ?? existing?.toPaddockId ?? "") as string,
      status: (args.input.status ?? existing?.status ?? "PLANNED") as PlanStatus,
      plannedAt: (args.input.plannedAt ?? existing?.plannedAt ?? now) as string,
      actualAt: args.input.actualAt ?? existing?.actualAt ?? null,
      reason: args.input.reason ?? existing?.reason ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("mob_movement_plans", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      ...args.input,
    };

    await enqueueAction({
      entity: "mob_movement_plans",
      op: "UPDATE",
      data: actionData,
    });

    if (local.status === "COMPLETED") {
      await updateLocalMobCurrentPaddock(local.mobId, local.toPaddockId);
    }

    return local;
  }
}

async function deletePlan(mobMovementPlanId: string): Promise<void> {
  try {
    await apiFetch<void>(`/mob-movement-plans/${mobMovementPlanId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("mob_movement_plans", mobMovementPlanId);
    await enqueueAction({
      entity: "mob_movement_plans",
      op: "DELETE",
      data: { id: mobMovementPlanId },
    });
  }
}

const STATUSES: PlanStatus[] = ["PLANNED", "COMPLETED", "CANCELLED"];

export function MobMovementPlansPage() {
  const qc = useQueryClient();

  const mobsQuery = useQuery({
    queryKey: ["mobs"],
    queryFn: getMobs,
    staleTime: 30_000,
  });

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const plansQuery = useQuery({
    queryKey: ["mob-movement-plans"],
    queryFn: getPlans,
    staleTime: 20_000,
  });

  const mobs = useMemo(() => (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [mobsQuery.data]);
  const paddocks = useMemo(
    () => (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [paddocksQuery.data],
  );

  const mobById = useMemo(() => new Map(mobs.map((m) => [m.id, m])), [mobs]);
  const paddockById = useMemo(() => new Map(paddocks.map((p) => [p.id, p])), [paddocks]);

  const plans = useMemo(() => {
    const list = (plansQuery.data ?? []).slice();
    list.sort((a, b) => (b.plannedAt ?? "").localeCompare(a.plannedAt ?? ""));
    return list;
  }, [plansQuery.data]);

  const [editing, setEditing] = useState<MobMovementPlan | null>(null);

  const [mobId, setMobId] = useState(() => {
    try {
      const stored = localStorage.getItem(PREFILL_MOB_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_MOB_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });
  const [toPaddockId, setToPaddockId] = useState("");
  const [plannedAtLocal, setPlannedAtLocal] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  const [status, setStatus] = useState<PlanStatus>("PLANNED");
  const [actualAtLocal, setActualAtLocal] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (mobs.length === 0) return;
    if (mobId && mobById.has(mobId)) return;
    setMobId(mobs[0].id);
  }, [mobId, mobById, mobs]);

  useEffect(() => {
    if (toPaddockId) return;
    if (paddocks.length === 0) return;
    setToPaddockId(paddocks[0].id);
  }, [toPaddockId, paddocks]);

  const selectedMob = useMemo(() => (mobId ? mobById.get(mobId) ?? null : null), [mobById, mobId]);
  const fromPaddockName = useMemo(() => {
    const fromId = selectedMob?.currentPaddockId ?? null;
    if (!fromId) return "";
    return paddockById.get(fromId)?.name ?? "";
  }, [paddockById, selectedMob]);

  const createMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: async () => {
      setEditing(null);
      setStatus("PLANNED");
      setActualAtLocal("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["mob-movement-plans"] });
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updatePlan,
    onSuccess: async () => {
      setEditing(null);
      setStatus("PLANNED");
      setActualAtLocal("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["mob-movement-plans"] });
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePlan,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["mob-movement-plans"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Mob Moves</h3>
          <p className="muted">Plan moves and record actual moves. Completing a move updates the mob's current paddock.</p>
        </div>

        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => {
              void mobsQuery.refetch();
              void paddocksQuery.refetch();
              void plansQuery.refetch();
            }}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </header>

      {plansQuery.isError ? <div className="alert">Failed to load move plans</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          if (!mobId || !toPaddockId || !plannedAtLocal) return;

          const plannedAt = localDateTimeToIso(plannedAtLocal);

          const actualAt =
            status === "COMPLETED"
              ? actualAtLocal
                ? localDateTimeToIso(actualAtLocal)
                : new Date().toISOString()
              : undefined;

          const basePayload = {
            mobId,
            toPaddockId,
            status,
            plannedAt,
            actualAt,
            reason: reason.trim() || undefined,
          };

          if (editing) {
            void updateMutation.mutateAsync({ mobMovementPlanId: editing.id, input: basePayload });
            return;
          }

          const fromPaddockId = selectedMob?.currentPaddockId ?? undefined;

          void createMutation.mutateAsync({
            id: createUuid("move"),
            ...basePayload,
            fromPaddockId,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Mob
            <select className="input" value={mobId} onChange={(e) => setMobId(e.target.value)}>
              {mobs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.species})
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            To paddock
            <select className="input" value={toPaddockId} onChange={(e) => setToPaddockId(e.target.value)}>
              {paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Planned time
            <input
              className="input"
              type="datetime-local"
              value={plannedAtLocal}
              onChange={(e) => setPlannedAtLocal(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Status
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Actual time
            <input
              className="input"
              type="datetime-local"
              value={actualAtLocal}
              onChange={(e) => setActualAtLocal(e.target.value)}
              placeholder="optional"
              disabled={status !== "COMPLETED"}
            />
          </label>

          <label className="label">
            Reason
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !mobId || !toPaddockId || !plannedAtLocal}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Move"
              : createMutation.isPending
                ? "Creating..."
                : "Create Move"}
          </button>

          {editing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setStatus("PLANNED");
                setActualAtLocal("");
                setReason("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}

          {selectedMob ? (
            <div className="pill">
              From: {fromPaddockName || "(unknown)"}
            </div>
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
              <th>Mob</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th>Planned</th>
              <th>Actual</th>
              <th>Reason</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const mobName = p.mob?.name ?? mobById.get(p.mobId)?.name ?? "Unknown mob";
              const fromName = p.fromPaddockId ? paddockById.get(p.fromPaddockId)?.name ?? p.fromPaddockId : "";
              const toName = paddockById.get(p.toPaddockId)?.name ?? p.toPaddockId;

              const canComplete = p.status !== "COMPLETED" && p.status !== "CANCELLED";

              return (
                <tr key={p.id}>
                  <td className="mono">{mobName}</td>
                  <td className="muted">{fromName}</td>
                  <td className="mono">{toName}</td>
                  <td>
                    <span className="badge">{p.status}</span>
                  </td>
                  <td className="muted">{p.plannedAt ? new Date(p.plannedAt).toLocaleString() : ""}</td>
                  <td className="muted">{p.actualAt ? new Date(p.actualAt).toLocaleString() : ""}</td>
                  <td className="muted">{p.reason ?? ""}</td>
                  <td className="muted">{new Date(p.updatedAt).toLocaleString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      {canComplete ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() =>
                            void updateMutation.mutateAsync({
                              mobMovementPlanId: p.id,
                              input: {
                                status: "COMPLETED",
                                actualAt: new Date().toISOString(),
                              },
                            })
                          }
                          disabled={busy}
                        >
                          Complete
                        </button>
                      ) : null}

                      <button
                        className="btn"
                        type="button"
                        onClick={() => seeOnMap({ kind: "PADDOCK", paddockId: p.toPaddockId })}
                        disabled={busy}
                      >
                        See on map
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditing(p);
                          setMobId(p.mobId);
                          setToPaddockId(p.toPaddockId);
                          setPlannedAtLocal(p.plannedAt ? toLocalDateTimeInput(p.plannedAt) : "");
                          setStatus(p.status);
                          setActualAtLocal(p.actualAt ? toLocalDateTimeInput(p.actualAt) : "");
                          setReason(p.reason ?? "");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          const targetName = p.mob?.name ?? mobById.get(p.mobId)?.name ?? "this mob";
                          if (!confirm(`Delete move plan for ${targetName}?`)) return;
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

            {plans.length === 0 && !plansQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={9}>
                  No moves yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError ? <div className="alert" style={{ marginTop: 10 }}>{(deleteMutation.error as Error).message}</div> : null}
    </section>
  );
}

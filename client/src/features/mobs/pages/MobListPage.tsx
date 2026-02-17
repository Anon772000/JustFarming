import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Mob, MobPaddockAllocation, Paddock } from "../../../types/api";
import { MobDetailsPanel } from "../components/MobDetailsPanel";
import { toNumberOrNull } from "../../../utils/geoArea";
import { PREFILL_SELECTED_MOB_ID_KEY } from "../../../ui/navigation";

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

function toPositiveIntOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i > 0 ? i : undefined;
}

function toPositiveNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n > 0 ? n : undefined;
}

const ACRES_PER_HECTARE = 2.471053814671653;

function formatStockingRate(headCount: number | null | undefined, areaHa: number | null | undefined): string {
  if (typeof headCount !== "number" || !Number.isFinite(headCount) || headCount <= 0) return "";
  if (typeof areaHa !== "number" || !Number.isFinite(areaHa) || areaHa <= 0) return "";

  const perHa = headCount / areaHa;
  const perAc = headCount / (areaHa * ACRES_PER_HECTARE);

  return `${perHa.toFixed(1)} sheep/ha (${perAc.toFixed(1)} sheep/ac)`;
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

type CreateMobInput = {
  id: string;
  name: string;
  species: Mob["species"];
  headCount: number;
  avgWeightKg?: number;
  currentPaddockId?: string | null;
};

type UpdateMobInput = {
  name?: string;
  species?: Mob["species"];
  headCount?: number;
  avgWeightKg?: number | null;
  currentPaddockId?: string | null;
};

async function createMob(input: CreateMobInput): Promise<Mob> {
  try {
    const response = await apiFetch<ApiSingleResponse<Mob>>("/mobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const localMob: Mob = {
      id: input.id,
      farmId: getFarmId(),
      name: input.name,
      species: input.species,
      headCount: input.headCount,
      avgWeightKg: input.avgWeightKg === undefined ? null : String(input.avgWeightKg),
      currentPaddockId: input.currentPaddockId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("mobs", [localMob as any]);

    const actionData: Record<string, unknown> = {
      id: localMob.id,
      name: localMob.name,
      species: localMob.species,
      headCount: localMob.headCount,
    };

    if (typeof input.avgWeightKg === "number") {
      actionData.avgWeightKg = input.avgWeightKg;
    }

    if (input.currentPaddockId) {
      actionData.currentPaddockId = input.currentPaddockId;
    }

    await enqueueAction({
      entity: "mobs",
      op: "CREATE",
      data: actionData,
    });

    return localMob;
  }
}

async function updateMob(args: { mobId: string; input: UpdateMobInput }): Promise<Mob> {
  try {
    const response = await apiFetch<ApiSingleResponse<Mob>>(`/mobs/${args.mobId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Mob>("mobs");
    const existing = cached.find((m) => m.id === args.mobId) ?? null;

    const nextCurrentPaddockId =
      args.input.currentPaddockId !== undefined
        ? args.input.currentPaddockId
        : existing?.currentPaddockId ?? null;

    const nextAvgWeightKg =
      args.input.avgWeightKg !== undefined
        ? args.input.avgWeightKg === null
          ? null
          : String(args.input.avgWeightKg)
        : existing?.avgWeightKg ?? null;

    const localMob: Mob = {
      id: args.mobId,
      farmId: existing?.farmId ?? getFarmId(),
      name: args.input.name ?? existing?.name ?? "Mob",
      species: args.input.species ?? existing?.species ?? "SHEEP",
      headCount: args.input.headCount ?? existing?.headCount ?? 1,
      avgWeightKg: nextAvgWeightKg,
      currentPaddockId: nextCurrentPaddockId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("mobs", [localMob as any]);
    await enqueueAction({
      entity: "mobs",
      op: "UPDATE",
      data: {
        id: localMob.id,
        ...args.input,
      },
    });

    return localMob;
  }
}

async function deleteMob(mobId: string): Promise<void> {
  try {
    await apiFetch<void>(`/mobs/${mobId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("mobs", mobId);
    await enqueueAction({
      entity: "mobs",
      op: "DELETE",
      data: { id: mobId },
    });
  }
}

const SPECIES: Array<{ value: Mob["species"]; label: string }> = [
  { value: "SHEEP", label: "Sheep" },
  { value: "CATTLE", label: "Cattle" },
  { value: "GOAT", label: "Goat" },
  { value: "MIXED", label: "Mixed" },
];

export function MobListPage() {
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

  const allocationsQuery = useQuery({
    queryKey: ["mob-paddock-allocations", { active: true }],
    queryFn: getActiveMobPaddockAllocations,
    staleTime: 30_000,
  });

  const mobsSorted = useMemo(() => {
    return (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data]);

  const paddocks = useMemo(() => {
    return (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddocksQuery.data]);

  const paddockById = useMemo(() => {
    return new Map(paddocks.map((p) => [p.id, p]));
  }, [paddocks]);

  const paddockAreaHaById = useMemo(() => {
    const map = new Map<string, number>();

    for (const p of paddocks) {
      const area = toNumberOrNull(p.areaHa);
      if (area !== null && area > 0) {
        map.set(p.id, area);
      }
    }

    return map;
  }, [paddocks]);

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
      map.set(mob.id, ids.map((id) => paddockById.get(id)?.name ?? "(unknown paddock)"));
    }

    return map;
  }, [mobPaddockIdsByMobId, mobsSorted, paddockById]);

  const totalHeadCount = useMemo(() => mobsSorted.reduce((sum, m) => sum + (m.headCount ?? 0), 0), [mobsSorted]);

  const [selectedMobId, setSelectedMobId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_MOB_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_MOB_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });
  const selectedMob = useMemo(() => {
    if (!selectedMobId) return null;
    return (mobsQuery.data ?? []).find((m) => m.id === selectedMobId) ?? null;
  }, [mobsQuery.data, selectedMobId]);

  const [search, setSearch] = useState("");
  const mobsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mobsSorted;

    return mobsSorted.filter((m) => {
      const paddockNames = mobPaddockNamesByMobId.get(m.id) ?? [];
      return (
        m.name.toLowerCase().includes(q) ||
        m.species.toLowerCase().includes(q) ||
        paddockNames.some((name) => name.toLowerCase().includes(q))
      );
    });
  }, [mobPaddockNamesByMobId, mobsSorted, search]);

  const [editing, setEditing] = useState<Mob | null>(null);

  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Mob["species"]>("SHEEP");
  const [headCount, setHeadCount] = useState("100");
  const [avgWeightKg, setAvgWeightKg] = useState("");
  const [currentPaddockId, setCurrentPaddockId] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: createMob,
    onSuccess: async () => {
      setName("");
      setSpecies("SHEEP");
      setHeadCount("100");
      setAvgWeightKg("");
      setCurrentPaddockId("");
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateMob,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setSpecies("SHEEP");
      setHeadCount("100");
      setAvgWeightKg("");
      setCurrentPaddockId("");
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMob,
    onSuccess: async (_data, mobId) => {
      if (editing?.id === mobId) {
        setEditing(null);
        setName("");
        setSpecies("SHEEP");
        setHeadCount("100");
        setAvgWeightKg("");
        setCurrentPaddockId("");
      }
      if (selectedMobId === mobId) {
        setSelectedMobId("");
      }
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  const selectedPaddockName = useMemo(() => {
    if (!currentPaddockId) return "";
    return paddockById.get(currentPaddockId)?.name ?? "";
  }, [currentPaddockId, paddockById]);

  const head = toPositiveIntOrUndefined(headCount);
  const weight = toPositiveNumberOrUndefined(avgWeightKg);
  const weightOk = avgWeightKg.trim() === "" || weight !== undefined;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Mobs</h3>
          <p className="muted">Manage livestock groups. Assign a primary paddock. If the mob is split across multiple paddocks, use Paddocks (multi) in Mob details.</p>
        </div>

        <div className="actions">
          <div className="pill">Mobs: {mobsFiltered.length}/{mobsSorted.length} | Total head: {totalHeadCount}</div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void mobsQuery.refetch();
              void paddocksQuery.refetch();
              void allocationsQuery.refetch();
            }}
            disabled={mobsQuery.isFetching || paddocksQuery.isFetching || allocationsQuery.isFetching}
          >
            Refresh
          </button>
        </div>
      </header>

      {mobsQuery.isLoading ? <p className="muted">Loading mobs...</p> : null}
      {mobsQuery.isError ? <div className="alert">Failed to load mobs: {(mobsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = name.trim();
          if (!trimmedName) return;

          if (!head) return;

          const paddockPayload = currentPaddockId ? currentPaddockId : null;

          const trimmedWeight = avgWeightKg.trim();

          if (editing) {
            // Allow clearing avgWeightKg when editing by submitting null.
            const avgWeightPayload = trimmedWeight ? weight : null;
            if (trimmedWeight && avgWeightPayload === undefined) return;

            void updateMutation.mutateAsync({
              mobId: editing.id,
              input: {
                name: trimmedName,
                species,
                headCount: head,
                avgWeightKg: avgWeightPayload,
                currentPaddockId: paddockPayload,
              },
            });
            return;
          }

          const avgWeightPayload = trimmedWeight ? weight : undefined;
          if (trimmedWeight && avgWeightPayload === undefined) return;

          void createMutation.mutateAsync({
            id: createUuid(),
            name: trimmedName,
            species,
            headCount: head,
            avgWeightKg: avgWeightPayload,
            currentPaddockId: paddockPayload,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ewes" required />
          </label>

          <label className="label">
            Species
            <select className="input" value={species} onChange={(e) => setSpecies(e.target.value as Mob["species"])}>
              {SPECIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Head count
            <input
              className="input"
              value={headCount}
              onChange={(e) => setHeadCount(e.target.value)}
              inputMode="numeric"
              type="number"
              min={1}
            />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Current paddock
            <select className="input" value={currentPaddockId} onChange={(e) => setCurrentPaddockId(e.target.value)}>
              <option value="">(none)</option>
              {paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Avg weight (kg)
            <input
              className="input"
              value={avgWeightKg}
              onChange={(e) => setAvgWeightKg(e.target.value)}
              inputMode="decimal"
              type="number"
              min={0.01}
              step={0.1}
              placeholder="Optional"
            />
          </label>

          <div />
        </div>

        <div className="actions">
          <button
            className="btn btnPrimary"
            type="submit"
            disabled={busy || !name.trim() || !head || !weightOk}
          >
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Mob"}
          </button>

          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setSpecies("SHEEP");
                setHeadCount("100");
                setAvgWeightKg("");
                setCurrentPaddockId("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}

          {selectedPaddockName ? <div className="pill">Selected paddock: {selectedPaddockName}</div> : null}
        </div>

        {!weightOk ? <div className="alert">Avg weight must be a positive number (kg).</div> : null}

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      <div className="hr" />

      <div className="row3" style={{ marginBottom: 10 }}>
        <label className="label">
          Search
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, species, or paddock"
          />
        </label>

        <div>
          <div className="muted mono" style={{ fontSize: 12 }}>
            Selected
          </div>
          <div className="pill" style={{ display: "inline-block", marginTop: 6 }}>
            {selectedMob ? selectedMob.name : "(none)"}
          </div>
        </div>

        <div />
      </div>

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Species</th>
              <th>Head</th>
              <th>Avg kg</th>
              <th>Paddock(s)</th>
              <th>Stocking</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mobsFiltered.map((m) => {
              const paddockIds = mobPaddockIdsByMobId.get(m.id) ?? [];
              const paddockNames = mobPaddockNamesByMobId.get(m.id) ?? [];
              let totalAreaHa = 0;
              for (const paddockId of paddockIds) {
                totalAreaHa += paddockAreaHaById.get(paddockId) ?? 0;
              }
              const stockingRate = formatStockingRate(m.headCount, totalAreaHa > 0 ? totalAreaHa : null);
              const isSelected = selectedMobId === m.id;

              return (
                <tr key={m.id} style={isSelected ? { background: "rgba(44, 110, 73, 0.08)" } : undefined}>
                  <td className="mono">{m.name}</td>
                  <td className="muted">{m.species}</td>
                  <td>{m.headCount}</td>
                  <td className="muted">{m.avgWeightKg ?? ""}</td>
                  <td className="muted">{paddockNames.join(", ")}</td>
                  <td className="muted mono">{stockingRate || ""}</td>
                  <td className="muted">{new Date(m.updatedAt).toLocaleString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className={isSelected ? "btn btnPrimary" : "btn"}
                        type="button"
                        onClick={() => setSelectedMobId((prev) => (prev === m.id ? "" : m.id))}
                        disabled={busy}
                      >
                        {isSelected ? "Hide" : "Details"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditing(m);
                          setSelectedMobId(m.id);
                          setName(m.name);
                          setSpecies(m.species);
                          setHeadCount(String(m.headCount));
                          setAvgWeightKg(m.avgWeightKg ?? "");
                          setCurrentPaddockId(m.currentPaddockId ?? "");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          if (!confirm(`Delete mob "${m.name}"?`)) return;
                          void deleteMutation.mutateAsync(m.id);
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

            {mobsFiltered.length === 0 && !mobsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={8}>
                  No mobs match your filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedMob ? (
        <MobDetailsPanel
          mob={selectedMob}
          paddockById={paddockById}
          onClose={() => setSelectedMobId("")}
          onOpenMob={(mobId) => setSelectedMobId(mobId)}
        />
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          Select a mob to see its recent moves, open issues, open tasks, and linked production plans.
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

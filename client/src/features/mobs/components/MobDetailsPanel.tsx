import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type {
  ActivityEvent,
  ApiListResponse,
  ApiSingleResponse,
  FeedEvent,
  Issue,
  Mob,
  MobMovementPlan,
  MobPaddockAllocation,
  Paddock,
  ProductionPlan,
  Task,
  TaskStatus,
} from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { seeOnMap } from "../../../ui/navigation";

const PREFILL_MOVES_MOB_ID_KEY = "prefill.mobId";
const PREFILL_FEED_MOB_ID_KEY = "prefill.feed.mobId";


const MOB_EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "JOINING_START", label: "Joining start" },
  { value: "JOINING_END", label: "Joining end" },
  { value: "PREG_SCAN", label: "Pregnancy scan" },
  { value: "LAMBING_START", label: "Lambing start" },
  { value: "LAMBING_END", label: "Lambing end" },
  { value: "WEANING", label: "Weaning" },
  { value: "MARKING", label: "Marking" },
  { value: "SHEARING", label: "Shearing" },
  { value: "DRENCH", label: "Drench" },
  { value: "VACCINATION", label: "Vaccination" },
  { value: "WEIGH", label: "Weigh" },
  { value: "MORTALITY", label: "Mortality" },
  { value: "SALE", label: "Sale" },
  { value: "PURCHASE", label: "Purchase" },
  { value: "NOTE", label: "Note" },
];

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

function toLocale(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString();
}


function toPositiveIntOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i > 0 ? i : undefined;
}

function toNonNegativeIntOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i >= 0 ? i : undefined;
}

async function getMobs(): Promise<Mob[]> {
  try {
    const response = await apiFetch<ApiListResponse<Mob>>("/mobs");
    await upsertEntities("mobs", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Mob>("mobs");
    if (cached.length) return cached;
    throw err;
  }
}

async function getMovementPlansForMob(mobId: string): Promise<MobMovementPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<MobMovementPlan>>(
      `/mob-movement-plans?mobId=${encodeURIComponent(mobId)}`,
    );
    await upsertEntities("mob_movement_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<MobMovementPlan>("mob_movement_plans");
    const filtered = cached.filter((p) => p.mobId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getFeedEventsForMob(mobId: string): Promise<FeedEvent[]> {
  try {
    const response = await apiFetch<ApiListResponse<FeedEvent>>(`/feed-events?mobId=${encodeURIComponent(mobId)}`);
    await upsertEntities("feed_events", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<FeedEvent>("feed_events");
    const filtered = cached.filter((e) => e.mobId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getIssuesForMob(mobId: string): Promise<Issue[]> {
  try {
    const response = await apiFetch<ApiListResponse<Issue>>(`/issues?mobId=${encodeURIComponent(mobId)}`);
    await upsertEntities("issues", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Issue>("issues");
    const filtered = cached.filter((i) => i.mobId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getTasksForMob(mobId: string): Promise<Task[]> {
  try {
    const response = await apiFetch<ApiListResponse<Task>>(`/tasks?mobId=${encodeURIComponent(mobId)}`);
    await upsertEntities("tasks", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Task>("tasks");
    const filtered = cached.filter((t) => t.mobId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getProductionPlansForMob(mobId: string): Promise<ProductionPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<ProductionPlan>>(
      `/production-plans?mobId=${encodeURIComponent(mobId)}`,
    );
    await upsertEntities("production_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<ProductionPlan>("production_plans");
    const filtered = cached.filter((p) => p.mobId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getAllocationsForMob(mobId: string): Promise<MobPaddockAllocation[]> {
  const qs = new URLSearchParams({
    mobId,
    active: "true",
  });

  try {
    const response = await apiFetch<ApiListResponse<MobPaddockAllocation>>(`/mob-paddock-allocations?${qs.toString()}`);
    await upsertEntities("mob_paddock_allocations", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const cached = await listEntities<MobPaddockAllocation>("mob_paddock_allocations");
    const filtered = cached.filter((a) => a.mobId === mobId && !a.endedAt);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getActivityEventsForMob(mobId: string): Promise<ActivityEvent[]> {
  const qs = new URLSearchParams({
    entityType: "mobs",
    entityId: mobId,
    when: "any",
    limit: "250",
    order: "desc",
  });

  try {
    const response = await apiFetch<ApiListResponse<ActivityEvent>>(`/activity-events?${qs.toString()}`);
    await upsertEntities("activity_events", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const cached = await listEntities<ActivityEvent>("activity_events");
    const filtered = cached.filter((ev) => ev.entityType === "mobs" && ev.entityId === mobId);
    if (filtered.length) return filtered;
    throw err;
  }
}

function isResolvedIssue(status: Issue["status"]): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

type TimelineKind = "MOVE" | "FEED" | "ISSUE" | "TASK" | "EVENT";

type TimelineItem = {
  key: string;
  kind: TimelineKind;
  ts: string;
  title: string;
  subtitle?: string;
  badge?: string;
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

export function MobDetailsPanel(props: { mob: Mob; paddockById: Map<string, Paddock>; onClose: () => void; onOpenMob?: (mobId: string) => void }) {
  const { mob, paddockById, onClose, onOpenMob } = props;

  const qc = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [quickMode, setQuickMode] = useState<null | "move" | "issue" | "task">(null);

  const paddocksSorted = useMemo(() => {
    return Array.from(paddockById.values()).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddockById]);

  const moveTargets = useMemo(() => {
    return paddocksSorted.filter((p) => p.id !== mob.currentPaddockId);
  }, [mob.currentPaddockId, paddocksSorted]);

  const mobsQuery = useQuery({
    queryKey: ["mobs"],
    queryFn: getMobs,
    staleTime: 30_000,
  });

  const otherMobs = useMemo(() => {
    return (mobsQuery.data ?? [])
      .filter((m) => m.id !== mob.id)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data, mob.id]);

  const mergeCandidates = useMemo(() => {
    return otherMobs.filter((m) => m.species === mob.species);
  }, [otherMobs, mob.species]);

  const plansQuery = useQuery({
    queryKey: ["mob-movement-plans", { mobId: mob.id }],
    queryFn: () => getMovementPlansForMob(mob.id),
    staleTime: 20_000,
  });

  const feedEventsQuery = useQuery({
    queryKey: ["feed-events", { mobId: mob.id }],
    queryFn: () => getFeedEventsForMob(mob.id),
    staleTime: 20_000,
  });

  const issuesQuery = useQuery({
    queryKey: ["issues", { mobId: mob.id }],
    queryFn: () => getIssuesForMob(mob.id),
    staleTime: 20_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks", { mobId: mob.id }],
    queryFn: () => getTasksForMob(mob.id),
    staleTime: 20_000,
  });

  const productionPlansQuery = useQuery({
    queryKey: ["production-plans", { mobId: mob.id }],
    queryFn: () => getProductionPlansForMob(mob.id),
    staleTime: 20_000,
  });

  const allocationsQuery = useQuery({
    queryKey: ["mob-paddock-allocations", { mobId: mob.id }],
    queryFn: () => getAllocationsForMob(mob.id),
    staleTime: 20_000,
  });

  const activityEventsQuery = useQuery({
    queryKey: ["activity-events", { entityType: "mobs", entityId: mob.id }],
    queryFn: () => getActivityEventsForMob(mob.id),
    staleTime: 20_000,
  });

  const activeAllocations = useMemo(() => {
    const list = (allocationsQuery.data ?? []).filter((a) => !a.endedAt);
    list.sort((a, b) => {
      const aName = paddockById.get(a.paddockId)?.name ?? "";
      const bName = paddockById.get(b.paddockId)?.name ?? "";
      return aName.localeCompare(bName);
    });
    return list;
  }, [allocationsQuery.data, paddockById]);

  const locationPaddockNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();

    const addPaddock = (paddockId: string | null | undefined) => {
      if (!paddockId || seen.has(paddockId)) return;
      seen.add(paddockId);
      names.push(paddockById.get(paddockId)?.name ?? "(unknown paddock)");
    };

    for (const a of activeAllocations) {
      addPaddock(a.paddockId);
    }

    addPaddock(mob.currentPaddockId ?? null);
    return names;
  }, [activeAllocations, mob.currentPaddockId, paddockById]);

  const locationSummary = locationPaddockNames.join(", ");

  const allocationTotals = useMemo(() => {
    let known = 0;
    let unknown = 0;

    for (const a of activeAllocations) {
      if (typeof a.headCount === "number") known += a.headCount;
      else unknown += 1;
    }

    const unallocated = Math.max(0, mob.headCount - known);

    return { known, unknown, unallocated };
  }, [activeAllocations, mob.headCount]);

  const breedingStatus = useMemo(() => {
    const events = (activityEventsQuery.data ?? []).slice();

    const pickTs = (ev: ActivityEvent): string => ev.actualAt ?? ev.plannedAt ?? ev.createdAt;

    events.sort((a, b) => pickTs(b).localeCompare(pickTs(a)));

    const latestOf = (eventType: string) => events.find((e) => e.eventType === eventType) ?? null;

    const joiningStart = latestOf("JOINING_START");
    const joiningEnd = latestOf("JOINING_END");
    const lambingStart = latestOf("LAMBING_START");
    const lambingEnd = latestOf("LAMBING_END");

    const joiningActive = !!(joiningStart && (!joiningEnd || pickTs(joiningEnd) < pickTs(joiningStart)));
    const lambingActive = !!(lambingStart && (!lambingEnd || pickTs(lambingEnd) < pickTs(lambingStart)));

    const baseGestationDays = mob.species === "CATTLE" ? 283 : 150;

    let joinDays: number | null = null;
    let gestationDays: number = baseGestationDays;

    if (joiningStart?.payloadJson && typeof joiningStart.payloadJson === "object") {
      const join = joiningStart.payloadJson as any;
      if (typeof join.joinDays === "number" && Number.isFinite(join.joinDays) && join.joinDays > 0) {
        joinDays = Math.trunc(join.joinDays);
      }
      if (typeof join.gestationDays === "number" && Number.isFinite(join.gestationDays) && join.gestationDays > 0) {
        gestationDays = Math.trunc(join.gestationDays);
      }
    }

    const addDays = (iso: string, days: number): string | null => {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return null;
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString();
    };

    const joiningStartTs = joiningStart ? pickTs(joiningStart) : null;
    const expectedLambingStart = joiningStartTs ? addDays(joiningStartTs, gestationDays) : null;
    const expectedLambingEnd = joiningStartTs && joinDays ? addDays(joiningStartTs, gestationDays + joinDays) : null;

    return {
      joiningActive,
      joiningStartTs,
      expectedLambingStart,
      expectedLambingEnd,
      lambingActive,
      lambingStartTs: lambingStart ? pickTs(lambingStart) : null,
    };
  }, [activityEventsQuery.data, mob.species]);

  const recentMobEvents = useMemo(() => {
    const list = (activityEventsQuery.data ?? []).slice();
    const pickTs = (ev: ActivityEvent): string => ev.actualAt ?? ev.plannedAt ?? ev.createdAt;
    list.sort((a, b) => pickTs(b).localeCompare(pickTs(a)));
    return list.slice(0, 12);
  }, [activityEventsQuery.data]);

  const completedMoves = useMemo(() => {
    const list = (plansQuery.data ?? []).filter((p) => p.status === "COMPLETED");
    list.sort((a, b) => (b.actualAt ?? b.plannedAt).localeCompare(a.actualAt ?? a.plannedAt));
    return list;
  }, [plansQuery.data]);

  const lastMovedAt = completedMoves[0]?.actualAt ?? completedMoves[0]?.plannedAt ?? null;
  const daysSinceMove = useMemo(() => {
    if (!lastMovedAt) return null;
    const d = new Date(lastMovedAt);
    if (!Number.isFinite(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    return days >= 0 ? days : 0;
  }, [lastMovedAt]);

  const recentPlans = useMemo(() => {
    const list = (plansQuery.data ?? []).slice();
    list.sort((a, b) => (b.plannedAt ?? "").localeCompare(a.plannedAt ?? ""));
    return list.slice(0, 10);
  }, [plansQuery.data]);

  const recentFeedEvents = useMemo(() => {
    const list = (feedEventsQuery.data ?? []).slice();
    list.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
    return list.slice(0, 10);
  }, [feedEventsQuery.data]);

  const openIssues = useMemo(() => {
    const list = (issuesQuery.data ?? []).slice();
    list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return list.filter((i) => !isResolvedIssue(i.status)).slice(0, 8);
  }, [issuesQuery.data]);

  const openTasks = useMemo(() => {
    const list = (tasksQuery.data ?? []).slice();
    list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return list.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED").slice(0, 8);
  }, [tasksQuery.data]);

  const productionPlans = useMemo(() => {
    const list = (productionPlansQuery.data ?? []).slice();
    list.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    return list.slice(0, 8);
  }, [productionPlansQuery.data]);

  const paddockHistory = useMemo(() => {
    const out: Array<{ ts: string; paddockId: string; fromPaddockId?: string | null }> = [];

    for (const m of completedMoves) {
      const ts = m.actualAt ?? m.plannedAt;
      out.push({ ts, paddockId: m.toPaddockId, fromPaddockId: m.fromPaddockId ?? null });
    }

    return out.slice(0, 12);
  }, [completedMoves]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const p of plansQuery.data ?? []) {
      const ts = p.actualAt ?? p.plannedAt;
      if (!ts) continue;

      const fromName = p.fromPaddockId ? paddockById.get(p.fromPaddockId)?.name ?? "" : "";
      const toName = paddockById.get(p.toPaddockId)?.name ?? "";

      const title =
        p.status === "COMPLETED"
          ? `Move completed: ${toName || "(unknown paddock)"}`
          : p.status === "CANCELLED"
            ? `Move cancelled: ${toName || "(unknown paddock)"}`
            : `Move planned: ${toName || "(unknown paddock)"}`;

      const subtitle = fromName ? `From: ${fromName}` : undefined;

      items.push({
        key: `move:${p.id}`,
        kind: "MOVE",
        ts,
        title,
        subtitle,
        badge: p.status,
      });
    }

    for (const e of feedEventsQuery.data ?? []) {
      const ts = e.occurredAt;
      if (!ts) continue;

      const paddockName = e.paddockId ? paddockById.get(e.paddockId)?.name ?? "" : "";
      const source = e.hayLotId ? "Hay" : e.grainLotId ? "Grain" : "Feed";

      items.push({
        key: `feed:${e.id}`,
        kind: "FEED",
        ts,
        title: `${source}: ${e.quantityKg} kg`,
        subtitle: paddockName ? `Paddock: ${paddockName}` : undefined,
      });
    }

    for (const i of issuesQuery.data ?? []) {
      const ts = i.updatedAt ?? i.createdAt;
      if (!ts) continue;

      const paddockName = i.paddockId ? paddockById.get(i.paddockId)?.name ?? "" : "";
      const subtitleParts: string[] = [];
      if (i.severity) subtitleParts.push(`Severity: ${i.severity}`);
      if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);

      items.push({
        key: `issue:${i.id}`,
        kind: "ISSUE",
        ts,
        title: i.title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badge: i.status,
      });
    }

    for (const t of tasksQuery.data ?? []) {
      const ts = t.updatedAt ?? t.createdAt;
      if (!ts) continue;

      const paddockName = t.paddockId ? paddockById.get(t.paddockId)?.name ?? "" : "";
      const subtitleParts: string[] = [];
      if (t.dueAt) subtitleParts.push(`Due: ${toLocale(t.dueAt)}`);
      if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);

      items.push({
        key: `task:${t.id}`,
        kind: "TASK",
        ts,
        title: t.title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badge: t.status,
      });
    }

    const eventLabels: Record<string, string> = {
      JOINING_START: "Joining started",
      JOINING_END: "Joining ended",
      PREG_SCAN: "Pregnancy scan",
      LAMBING_START: "Lambing started",
      LAMBING_END: "Lambing ended",
      WEANING: "Weaning",
      MARKING: "Marking",
      SHEARING: "Shearing",
      DRENCH: "Drench",
      VACCINATION: "Vaccination",
      WEIGH: "Weigh",
      MORTALITY: "Mortality",
      SALE: "Sale",
      PURCHASE: "Purchase",
      NOTE: "Note",
    };

    for (const ev of activityEventsQuery.data ?? []) {
      const ts = ev.actualAt ?? ev.plannedAt ?? ev.createdAt;
      if (!ts) continue;

      const title = eventLabels[ev.eventType] ?? ev.eventType;
      const badge = ev.actualAt ? "DONE" : "PLANNED";

      let subtitle: string | undefined;
      if (ev.payloadJson && typeof ev.payloadJson === "object") {
        const notes = (ev.payloadJson as any).notes;
        if (typeof notes === "string" && notes.trim()) {
          subtitle = notes.trim();
        }
      }

      items.push({
        key: `event:${ev.id}`,
        kind: "EVENT",
        ts,
        title: `Event: ${title}`,
        subtitle,
        badge,
      });
    }


    items.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
    return items.slice(0, showAllTimeline ? 60 : 24);
  }, [activityEventsQuery.data, feedEventsQuery.data, issuesQuery.data, paddockById, plansQuery.data, showAllTimeline, tasksQuery.data]);

  const planMovePrefill = () => {
    try {
      localStorage.setItem(PREFILL_MOVES_MOB_ID_KEY, mob.id);
      setNotice("Open the Moves tab: this mob will be preselected.");
    } catch {
      setNotice("Open the Moves tab and select this mob.");
    }
  };

  const logFeedPrefill = () => {
    try {
      localStorage.setItem(PREFILL_FEED_MOB_ID_KEY, mob.id);
      setNotice("Open the Feed tab: this mob will be preselected.");
    } catch {
      setNotice("Open the Feed tab and select this mob.");
    }
  };

  const [moveToPaddockId, setMoveToPaddockId] = useState<string>("");
  const [moveReason, setMoveReason] = useState("");

  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issuePaddockId, setIssuePaddockId] = useState<string>("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAtLocal, setTaskDueAtLocal] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPaddockId, setTaskPaddockId] = useState<string>("");

  const [allocPaddockId, setAllocPaddockId] = useState<string>("");
  const [allocHeadCount, setAllocHeadCount] = useState("");
  const [allocNotes, setAllocNotes] = useState("");

  const [eventType, setEventType] = useState<string>("JOINING_START");
  const [eventWhenKind, setEventWhenKind] = useState<"actual" | "planned">("actual");
  const [eventWhenLocal, setEventWhenLocal] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [eventNotes, setEventNotes] = useState("");

  const [eventRamCount, setEventRamCount] = useState("");
  const [eventJoinDays, setEventJoinDays] = useState("");
  const [eventGestationDays, setEventGestationDays] = useState("");
  const [eventOffspringBorn, setEventOffspringBorn] = useState("");
  const [eventOffspringAlive, setEventOffspringAlive] = useState("");
  const [eventOffspringDead, setEventOffspringDead] = useState("");

  const [splitName, setSplitName] = useState("");
  const [splitHeadCount, setSplitHeadCount] = useState("");
  const [splitPaddockId, setSplitPaddockId] = useState<string>("");

  const [mergeFromMobId, setMergeFromMobId] = useState<string>("");

  useEffect(() => {
    // Reset quick forms when switching mobs.
    setNotice(null);
    setQuickMode(null);
    setShowAllTimeline(false);

    setMoveReason("");
    setMoveToPaddockId("");

    setIssueTitle("");
    setIssueSeverity("");
    setIssueDescription("");
    setIssuePaddockId(mob.currentPaddockId ?? "");

    setTaskTitle("");
    setTaskDueAtLocal("");
    setTaskDescription("");
    setTaskPaddockId(mob.currentPaddockId ?? "");

    setAllocPaddockId(mob.currentPaddockId ?? "");
    setAllocHeadCount("");
    setAllocNotes("");

    setEventType("JOINING_START");
    setEventWhenKind("actual");
    setEventWhenLocal(toDatetimeLocalValue(new Date().toISOString()));
    setEventNotes("");
    setEventRamCount("");
    setEventJoinDays("");
    setEventGestationDays("");
    setEventOffspringBorn("");
    setEventOffspringAlive("");
    setEventOffspringDead("");

    setSplitName("");
    setSplitHeadCount("");
    setSplitPaddockId("");

    setMergeFromMobId("");
  }, [mob.currentPaddockId, mob.id]);

  useEffect(() => {
    if (moveToPaddockId) return;

    const firstDifferent = moveTargets[0]?.id ?? "";
    if (firstDifferent) {
      setMoveToPaddockId(firstDifferent);
    }
  }, [moveTargets, moveToPaddockId]);


  useEffect(() => {
    if (allocPaddockId) return;

    const preferred = mob.currentPaddockId ?? paddocksSorted[0]?.id ?? "";
    if (preferred) {
      setAllocPaddockId(preferred);
    }
  }, [allocPaddockId, mob.currentPaddockId, paddocksSorted]);

  const moveNowMutation = useMutation({
    mutationFn: async (input: { toPaddockId: string; reason?: string }) => {
      const id = createUuid();
      const now = new Date().toISOString();

      const body = {
        id,
        category: "GENERAL" as const,
        mobId: mob.id,
        fromPaddockId: mob.currentPaddockId ?? null,
        toPaddockId: input.toPaddockId,
        status: "COMPLETED" as const,
        plannedAt: now,
        actualAt: now,
        reason: input.reason || undefined,
      };

      try {
        const response = await apiFetch<ApiSingleResponse<MobMovementPlan>>("/mob-movement-plans", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const local: MobMovementPlan = {
          id,
          farmId: getFarmId(),
          mobId: mob.id,
          fromPaddockId: mob.currentPaddockId ?? null,
          toPaddockId: input.toPaddockId,
          status: "COMPLETED",
          plannedAt: now,
          actualAt: now,
          reason: input.reason ? input.reason : null,
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
          actualAt: local.actualAt,
        };

        if (local.fromPaddockId) actionData.fromPaddockId = local.fromPaddockId;
        if (local.reason) actionData.reason = local.reason;

        await enqueueAction({
          entity: "mob_movement_plans",
          op: "CREATE",
          data: actionData,
        });

        await updateLocalMobCurrentPaddock(local.mobId, local.toPaddockId);

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Move recorded. Mob current paddock will update after refresh/sync.");
      setQuickMode(null);
      setMoveReason("");
      await qc.invalidateQueries({ queryKey: ["mob-movement-plans"] });
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
  });

  const createIssueMutation = useMutation({
    mutationFn: async (input: { title: string; severity?: string; description?: string; paddockId?: string | null }) => {
      const id = createUuid();

      const body = {
        id,
        title: input.title,
        severity: input.severity || undefined,
        description: input.description || undefined,
        paddockId: input.paddockId ?? null,
        mobId: mob.id,
        status: "OPEN" as const,
      };

      try {
        const response = await apiFetch<ApiSingleResponse<Issue>>("/issues", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const now = new Date().toISOString();

        const local: Issue = {
          id,
          farmId: getFarmId(),
          category: "GENERAL",
          title: input.title,
          description: input.description ? input.description : null,
          status: "OPEN",
          severity: input.severity ? input.severity : null,
          locationGeoJson: null,
          feederId: null,
          waterAssetId: null,
          paddockId: typeof input.paddockId === "string" ? input.paddockId : null,
          mobId: mob.id,
          createdById: getUserId(),
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
        };

        await upsertEntities("issues", [local as any]);

        const actionData: Record<string, unknown> = {
          id: local.id,
          title: local.title,
          status: local.status,
          category: local.category,
        };

        if (local.description) actionData.description = local.description;
        if (local.severity) actionData.severity = local.severity;
        if (local.paddockId) actionData.paddockId = local.paddockId;
        if (local.mobId) actionData.mobId = local.mobId;

        await enqueueAction({
          entity: "issues",
          op: "CREATE",
          data: actionData,
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Issue created.");
      setQuickMode(null);
      setIssueTitle("");
      setIssueSeverity("");
      setIssueDescription("");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (input: { title: string; dueAt?: string | null; description?: string; paddockId?: string | null }) => {
      const id = createUuid();

      const status: TaskStatus = "OPEN";

      const body = {
        id,
        title: input.title,
        description: input.description || undefined,
        status,
        dueAt: typeof input.dueAt === "string" ? input.dueAt : null,
        paddockId: input.paddockId ?? null,
        mobId: mob.id,
      };

      try {
        const response = await apiFetch<ApiSingleResponse<Task>>("/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const now = new Date().toISOString();

        const local: Task = {
          id,
          farmId: getFarmId(),
          title: input.title,
          description: input.description ? input.description : null,
          status,
          dueAt: typeof input.dueAt === "string" ? input.dueAt : null,
          paddockId: typeof input.paddockId === "string" ? input.paddockId : null,
          mobId: mob.id,
          createdById: getUserId(),
          assignedToId: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };

        await upsertEntities("tasks", [local as any]);

        const actionData: Record<string, unknown> = {
          id: local.id,
          title: local.title,
          status: local.status,
        };

        if (local.description) actionData.description = local.description;
        if (typeof input.dueAt === "string") actionData.dueAt = input.dueAt;
        if (local.paddockId) actionData.paddockId = local.paddockId;
        if (local.mobId) actionData.mobId = local.mobId;

        await enqueueAction({
          entity: "tasks",
          op: "CREATE",
          data: actionData,
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Task created.");
      setQuickMode(null);
      setTaskTitle("");
      setTaskDueAtLocal("");
      setTaskDescription("");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });



  const createAllocationMutation = useMutation({
    mutationFn: async (input: { paddockId: string; headCount?: number | null; notes?: string }) => {
      const id = createUuid();
      const now = new Date().toISOString();

      const body: Record<string, unknown> = {
        id,
        mobId: mob.id,
        paddockId: input.paddockId,
        startedAt: now,
      };

      if (input.headCount !== undefined) body.headCount = input.headCount;
      if (input.notes) body.notes = input.notes;

      try {
        const response = await apiFetch<ApiSingleResponse<MobPaddockAllocation>>("/mob-paddock-allocations", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const local: MobPaddockAllocation = {
          id,
          farmId: getFarmId(),
          mobId: mob.id,
          paddockId: input.paddockId,
          headCount: input.headCount === undefined ? null : input.headCount,
          startedAt: now,
          endedAt: null,
          notes: input.notes ? input.notes : null,
          createdAt: now,
          updatedAt: now,
        };

        await upsertEntities("mob_paddock_allocations", [local as any]);

        await enqueueAction({
          entity: "mob_paddock_allocations",
          op: "CREATE",
          data: body,
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Allocation saved.");
      setAllocHeadCount("");
      setAllocNotes("");
      await qc.invalidateQueries({ queryKey: ["mob-paddock-allocations"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const endAllocationMutation = useMutation({
    mutationFn: async (allocation: MobPaddockAllocation) => {
      const now = new Date().toISOString();

      try {
        const response = await apiFetch<ApiSingleResponse<MobPaddockAllocation>>(
          `/mob-paddock-allocations/${allocation.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ endedAt: now }),
          },
        );
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const local: MobPaddockAllocation = {
          ...allocation,
          endedAt: now,
          updatedAt: now,
        };

        await upsertEntities("mob_paddock_allocations", [local as any]);
        await enqueueAction({
          entity: "mob_paddock_allocations",
          op: "UPDATE",
          data: { id: allocation.id, endedAt: now },
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Allocation ended.");
      await qc.invalidateQueries({ queryKey: ["mob-paddock-allocations"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const createMobEventMutation = useMutation({
    mutationFn: async (input: { eventType: string; whenKind: "actual" | "planned"; whenIso: string; payloadJson?: Record<string, unknown> }) => {
      const id = createUuid();
      const now = new Date().toISOString();

      const body: Record<string, unknown> = {
        id,
        entityType: "mobs",
        entityId: mob.id,
        eventType: input.eventType,
        payloadJson: input.payloadJson,
      };

      if (input.whenKind === "planned") {
        body.plannedAt = input.whenIso;
      } else {
        body.actualAt = input.whenIso;
      }

      try {
        const response = await apiFetch<ApiSingleResponse<ActivityEvent>>("/activity-events", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const local: ActivityEvent = {
          id,
          farmId: getFarmId(),
          entityType: "mobs",
          entityId: mob.id,
          eventType: input.eventType,
          plannedAt: input.whenKind === "planned" ? input.whenIso : null,
          actualAt: input.whenKind === "actual" ? input.whenIso : null,
          payloadJson: input.payloadJson ?? null,
          createdAt: now,
          updatedAt: now,
        };

        await upsertEntities("activity_events", [local as any]);
        await enqueueAction({
          entity: "activity_events",
          op: "CREATE",
          data: body,
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Event created.");
      setEventNotes("");
      setEventRamCount("");
      setEventJoinDays("");
      setEventGestationDays("");
      setEventOffspringBorn("");
      setEventOffspringAlive("");
      setEventOffspringDead("");
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const markMobEventDoneMutation = useMutation({
    mutationFn: async (event: ActivityEvent) => {
      const now = new Date().toISOString();

      try {
        const response = await apiFetch<ApiSingleResponse<ActivityEvent>>(`/activity-events/${event.id}`, {
          method: "PATCH",
          body: JSON.stringify({ actualAt: now }),
        });
        await upsertEntities("activity_events", [response.data as any]);
        return response.data;
      } catch (err) {
        if (!isOfflineLikeError(err)) throw err;

        const local: ActivityEvent = {
          ...event,
          actualAt: now,
          updatedAt: now,
        };

        await upsertEntities("activity_events", [local as any]);
        await enqueueAction({
          entity: "activity_events",
          op: "UPDATE",
          data: { id: event.id, actualAt: now },
        });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Event marked done.");
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const splitMobMutation = useMutation({
    mutationFn: async (input: { name: string; headCount: number; paddockId: string | null }) => {
      const newMobId = createUuid();
      const nextHeadCount = mob.headCount - input.headCount;
      if (nextHeadCount <= 0) {
        throw new Error("Split would leave this mob empty. Reduce the split head count.");
      }

      const createBody: Record<string, unknown> = {
        id: newMobId,
        name: input.name,
        species: mob.species,
        headCount: input.headCount,
        currentPaddockId: input.paddockId,
      };

      if (mob.avgWeightKg) {
        const w = Number(mob.avgWeightKg);
        if (Number.isFinite(w) && w > 0) createBody.avgWeightKg = w;
      }

      let created: Mob | null = null;

      try {
        const response = await apiFetch<ApiSingleResponse<Mob>>("/mobs", {
          method: "POST",
          body: JSON.stringify(createBody),
        });
        created = response.data;

        await apiFetch<ApiSingleResponse<Mob>>(`/mobs/${mob.id}`, {
          method: "PATCH",
          body: JSON.stringify({ headCount: nextHeadCount }),
        });

        return { newMobId: created.id };
      } catch (err) {
        if (!isOfflineLikeError(err)) {
          if (created) {
            try {
              await apiFetch<void>(`/mobs/${created.id}`, { method: "DELETE" });
            } catch {
              // ignore rollback failure
            }
          }
          throw err;
        }

        const now = new Date().toISOString();

        const localNew: Mob = {
          id: newMobId,
          farmId: getFarmId(),
          name: input.name,
          species: mob.species,
          headCount: input.headCount,
          avgWeightKg: mob.avgWeightKg ?? null,
          currentPaddockId: input.paddockId,
          createdAt: now,
          updatedAt: now,
        };

        await upsertEntities("mobs", [localNew as any]);

        const actionData: Record<string, unknown> = {
          id: localNew.id,
          name: localNew.name,
          species: localNew.species,
          headCount: localNew.headCount,
        };

        if (typeof createBody.avgWeightKg === "number") actionData.avgWeightKg = createBody.avgWeightKg;
        if (input.paddockId) actionData.currentPaddockId = input.paddockId;

        await enqueueAction({ entity: "mobs", op: "CREATE", data: actionData });

        const cached = await listEntities<Mob>("mobs");
        const existing = cached.find((m) => m.id === mob.id) ?? mob;
        const localUpdated: Mob = {
          ...existing,
          headCount: nextHeadCount,
          updatedAt: now,
        };

        await upsertEntities("mobs", [localUpdated as any]);
        await enqueueAction({ entity: "mobs", op: "UPDATE", data: { id: localUpdated.id, headCount: localUpdated.headCount } });

        return { newMobId: localNew.id };
      }
    },
    onSuccess: async (result) => {
      setNotice(`Split created.`);
      setSplitName("");
      setSplitHeadCount("");
      setSplitPaddockId("");

      await qc.invalidateQueries({ queryKey: ["mobs"] });

      if (typeof onOpenMob === "function") {
        onOpenMob(result.newMobId);
      }
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const mergeMobMutation = useMutation({
    mutationFn: async (input: { fromMobId: string }) => {
      const fromMobId = input.fromMobId;
      if (!fromMobId) throw new Error("Choose a mob to merge.");

      const allMobs = mobsQuery.data && mobsQuery.data.length ? (mobsQuery.data as Mob[]) : await listEntities<Mob>("mobs");
      const fromMob = allMobs.find((m) => m.id === fromMobId) ?? null;
      if (!fromMob) throw new Error("Mob not found.");
      if (fromMob.id === mob.id) throw new Error("Cannot merge a mob into itself.");
      if (fromMob.species !== mob.species) throw new Error("Mobs must be the same species to merge.");

      // Prevent silent data loss: don't merge a mob that is currently split across paddocks.
      const activeFromAllocs = await getAllocationsForMob(fromMob.id);
      if (activeFromAllocs.length) {
        throw new Error("Source mob has active multi-paddock allocations. End allocations first.");
      }

      const nextHeadCount = mob.headCount + (fromMob.headCount ?? 0);

      const original = {
        headCount: mob.headCount,
        currentPaddockId: mob.currentPaddockId ?? null,
      };

      const updateBody: Record<string, unknown> = {
        headCount: nextHeadCount,
      };

      if (!original.currentPaddockId && fromMob.currentPaddockId) {
        updateBody.currentPaddockId = fromMob.currentPaddockId;
      }

      try {
        await apiFetch<ApiSingleResponse<Mob>>(`/mobs/${mob.id}`, {
          method: "PATCH",
          body: JSON.stringify(updateBody),
        });

        await apiFetch<void>(`/mobs/${fromMob.id}`, { method: "DELETE" });

        return { mergedFromName: fromMob.name };
      } catch (err) {
        if (!isOfflineLikeError(err)) {
          // Best-effort rollback if the delete failed after we updated the target mob.
          try {
            await apiFetch<ApiSingleResponse<Mob>>(`/mobs/${mob.id}`, {
              method: "PATCH",
              body: JSON.stringify(original),
            });
          } catch {
            // ignore rollback failure
          }
          throw err;
        }

        const now = new Date().toISOString();

        const cachedAllocs = await listEntities<MobPaddockAllocation>("mob_paddock_allocations");
        const hasActiveAllocs = cachedAllocs.some((a) => a.mobId === fromMob.id && !a.endedAt);
        if (hasActiveAllocs) {
          throw new Error("Source mob has active multi-paddock allocations. End allocations first.");
        }

        const cached = await listEntities<Mob>("mobs");
        const existing = cached.find((m) => m.id === mob.id) ?? mob;

        const localUpdated: Mob = {
          ...existing,
          headCount: nextHeadCount,
          currentPaddockId: (updateBody.currentPaddockId as string | undefined) ?? existing.currentPaddockId ?? null,
          updatedAt: now,
        };

        await upsertEntities("mobs", [localUpdated as any]);
        await enqueueAction({ entity: "mobs", op: "UPDATE", data: { id: localUpdated.id, headCount: localUpdated.headCount, currentPaddockId: localUpdated.currentPaddockId } });

        await deleteEntity("mobs", fromMob.id);
        await enqueueAction({ entity: "mobs", op: "DELETE", data: { id: fromMob.id } });

        return { mergedFromName: fromMob.name };
      }
    },
    onSuccess: async (result) => {
      setNotice(`Merged ${result.mergedFromName} into this mob.`);
      setMergeFromMobId("");
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const busy = moveNowMutation.isPending || createIssueMutation.isPending || createTaskMutation.isPending || createAllocationMutation.isPending || endAllocationMutation.isPending || createMobEventMutation.isPending || markMobEventDoneMutation.isPending || splitMobMutation.isPending || mergeMobMutation.isPending;

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panelTitle">
        <div>
          <div className="muted mono">Mob details</div>
          <h3 style={{ margin: "2px 0 0" }}>{mob.name}</h3>
          <div className="actions" style={{ marginTop: 8 }}>
            <span className="badge">{mob.species}</span>
            <span className="badge">{locationSummary ? `In: ${locationSummary}` : "No paddock"}</span>
            {activeAllocations.length ? <span className="badge">Split: {activeAllocations.length} paddocks</span> : null}
            {typeof daysSinceMove === "number" ? (
              <span className="badge">Last move: {daysSinceMove}d ago</span>
            ) : null}
            <span className="badge">Updated: {toLocale(mob.updatedAt)}</span>
          </div>
        </div>

        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button
            className={quickMode === "move" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setQuickMode((m) => (m === "move" ? null : "move"))}
            disabled={busy || moveTargets.length < 1}
            title={
              moveTargets.length < 1
                ? "Add a paddock (or set a different current paddock) to record a move"
                : undefined
            }
          >
            Move now
          </button>
          <button
            className={quickMode === "issue" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setQuickMode((m) => (m === "issue" ? null : "issue"))}
            disabled={busy}
          >
            New issue
          </button>
          <button
            className={quickMode === "task" ? "btn btnPrimary" : "btn"}
            type="button"
            onClick={() => setQuickMode((m) => (m === "task" ? null : "task"))}
            disabled={busy}
          >
            New task
          </button>
          <button className="btn" type="button" onClick={planMovePrefill} disabled={busy}>
            Plan move
          </button>
          <button className="btn" type="button" onClick={logFeedPrefill} disabled={busy}>
            Log feed
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => seeOnMap({ kind: "MOB", mobId: mob.id })}
            disabled={busy}
          >
            See on map
          </button>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>

      {notice ? (
        <div className="pill" style={{ marginTop: 8 }}>
          {notice}
        </div>
      ) : null}

      <details style={{ marginTop: 10 }}>
        <summary className="muted" style={{ cursor: "pointer" }}>
          Split / merge mobs
        </summary>

        <div className="hr" style={{ marginTop: 10 }} />

        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Split mob</h4>
            <p className="muted" style={{ marginTop: 0 }}>Create a new mob from part of this mob's head count.</p>

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();

                const name = splitName.trim();
                if (!name) {
                  setNotice("New mob name is required.");
                  return;
                }

                const splitCount = toPositiveIntOrUndefined(splitHeadCount);
                if (!splitCount) {
                  setNotice("Split head count must be a positive integer.");
                  return;
                }

                if (splitCount >= mob.headCount) {
                  setNotice("Split head count must be less than the current mob head count.");
                  return;
                }

                const targetPaddockId = splitPaddockId || mob.currentPaddockId || "";

                void splitMobMutation.mutateAsync({
                  name,
                  headCount: splitCount,
                  paddockId: targetPaddockId ? targetPaddockId : null,
                });
              }}
            >
              <div className="row3">
                <label className="label">
                  New mob name
                  <input
                    className="input"
                    value={splitName}
                    onChange={(e) => setSplitName(e.target.value)}
                    placeholder={`${mob.name} (split)`}
                    disabled={busy}
                    required
                  />
                </label>

                <label className="label">
                  Head count
                  <input
                    className="input"
                    value={splitHeadCount}
                    onChange={(e) => setSplitHeadCount(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={1}
                    step={1}
                    disabled={busy}
                    required
                  />
                </label>

                <label className="label">
                  New mob paddock
                  <select
                    className="input"
                    value={splitPaddockId}
                    onChange={(e) => setSplitPaddockId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">{mob.currentPaddockId ? "(same as current)" : "(none)"}</option>
                    {paddocksSorted.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="actions">
                <button className="btn btnPrimary" type="submit" disabled={busy || splitMobMutation.isPending}>
                  {splitMobMutation.isPending ? "Splitting..." : "Split"}
                </button>
              </div>

              {splitMobMutation.isError ? <div className="alert">{(splitMobMutation.error as Error).message}</div> : null}
            </form>
          </div>

          <div className="hr" />

          <div>
            <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Merge mob</h4>
            <p className="muted" style={{ marginTop: 0 }}>
              Merge another mob into this mob (adds head counts, then archives the other mob). Source mob must not have active multi-paddock allocations.
            </p>

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();

                const fromId = mergeFromMobId;
                if (!fromId) {
                  setNotice("Choose a mob to merge.");
                  return;
                }

                const from = mergeCandidates.find((m) => m.id === fromId) ?? null;
                if (!from) {
                  setNotice("Selected mob is not available.");
                  return;
                }

                if (!confirm(`Merge "${from.name}" (${from.headCount} head) into "${mob.name}"? This will archive "${from.name}".`)) {
                  return;
                }

                void mergeMobMutation.mutateAsync({ fromMobId: fromId });
              }}
            >
              <div className="row3">
                <label className="label">
                  Mob to merge into this mob
                  <select
                    className="input"
                    value={mergeFromMobId}
                    onChange={(e) => setMergeFromMobId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">(choose)</option>
                    {mergeCandidates.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.headCount} head)
                      </option>
                    ))}
                  </select>
                </label>

                <div />
                <div />
              </div>

              <div className="actions">
                <button
                  className="btn btnPrimary"
                  type="submit"
                  disabled={busy || !mergeFromMobId || mergeMobMutation.isPending || mergeCandidates.length < 1}
                >
                  {mergeMobMutation.isPending ? "Merging..." : "Merge"}
                </button>
              </div>

              {mobsQuery.isLoading ? <p className="muted">Loading mobs...</p> : null}
              {mobsQuery.isError ? <div className="alert">Failed to load mob list for merging.</div> : null}
              {!mobsQuery.isLoading && mergeCandidates.length === 0 ? <p className="muted">No other {mob.species.toLowerCase()} mobs to merge.</p> : null}
              {mergeMobMutation.isError ? <div className="alert">{(mergeMobMutation.error as Error).message}</div> : null}
            </form>
          </div>
        </div>
      </details>

      {quickMode === "move" ? (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Move now (records a completed move)</h4>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!moveToPaddockId) return;
              if (moveToPaddockId === mob.currentPaddockId) return;

              void moveNowMutation.mutateAsync({
                toPaddockId: moveToPaddockId,
                reason: moveReason.trim() || undefined,
              });
            }}
          >
            <div className="row3">
              <label className="label">
                To paddock
                <select
                  className="input"
                  value={moveToPaddockId}
                  onChange={(e) => setMoveToPaddockId(e.target.value)}
                >
                  {moveTargets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="label">
                Reason
                <input
                  className="input"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Optional"
                />
              </label>

              <div />
            </div>

            <div className="actions">
              <button className="btn btnPrimary" type="submit" disabled={busy || !moveToPaddockId}>
                {moveNowMutation.isPending ? "Recording..." : "Record Completed Move"}
              </button>
              <button className="btn" type="button" onClick={() => setQuickMode(null)} disabled={busy}>
                Cancel
              </button>
            </div>

            {moveNowMutation.isError ? (
              <div className="alert">{(moveNowMutation.error as Error).message}</div>
            ) : null}
          </form>

          <div className="hr" />
        </div>
      ) : null}

      {quickMode === "issue" ? (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>New issue</h4>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const title = issueTitle.trim();
              if (!title) return;

              const severity = issueSeverity.trim();
              const description = issueDescription.trim();

              const paddockPayload = issuePaddockId ? issuePaddockId : mob.currentPaddockId ?? null;

              void createIssueMutation.mutateAsync({
                title,
                severity: severity || undefined,
                description: description || undefined,
                paddockId: paddockPayload,
              });
            }}
          >
            <div className="row3">
              <label className="label">
                Title
                <input
                  className="input"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g. Lame sheep in mob"
                  required
                />
              </label>

              <label className="label">
                Severity
                <input
                  className="input"
                  value={issueSeverity}
                  onChange={(e) => setIssueSeverity(e.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label className="label">
                Paddock
                <select className="input" value={issuePaddockId} onChange={(e) => setIssuePaddockId(e.target.value)}>
                  <option value="">(use mob current)</option>
                  {paddocksSorted.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="label">
              Description
              <textarea
                className="input"
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </label>

            <div className="actions">
              <button className="btn btnPrimary" type="submit" disabled={busy || !issueTitle.trim()}>
                {createIssueMutation.isPending ? "Creating..." : "Create Issue"}
              </button>
              <button className="btn" type="button" onClick={() => setQuickMode(null)} disabled={busy}>
                Cancel
              </button>
            </div>

            {createIssueMutation.isError ? (
              <div className="alert">{(createIssueMutation.error as Error).message}</div>
            ) : null}
          </form>

          <div className="hr" />
        </div>
      ) : null}

      {quickMode === "task" ? (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>New task</h4>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const title = taskTitle.trim();
              if (!title) return;

              const dueAt = fromDatetimeLocalValue(taskDueAtLocal);
              const description = taskDescription.trim();
              const paddockPayload = taskPaddockId ? taskPaddockId : mob.currentPaddockId ?? null;

              void createTaskMutation.mutateAsync({
                title,
                dueAt: dueAt ?? null,
                description: description || undefined,
                paddockId: paddockPayload,
              });
            }}
          >
            <div className="row3">
              <label className="label">
                Title
                <input
                  className="input"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Drench mob"
                  required
                />
              </label>

              <label className="label">
                Due at
                <input
                  className="input"
                  value={taskDueAtLocal}
                  onChange={(e) => setTaskDueAtLocal(e.target.value)}
                  type="datetime-local"
                />
              </label>

              <label className="label">
                Paddock
                <select className="input" value={taskPaddockId} onChange={(e) => setTaskPaddockId(e.target.value)}>
                  <option value="">(use mob current)</option>
                  {paddocksSorted.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="label">
              Notes
              <textarea
                className="input"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Optional"
                rows={3}
              />
            </label>

            <div className="actions">
              <button className="btn btnPrimary" type="submit" disabled={busy || !taskTitle.trim()}>
                {createTaskMutation.isPending ? "Creating..." : "Create Task"}
              </button>
              <button className="btn" type="button" onClick={() => setQuickMode(null)} disabled={busy}>
                Cancel
              </button>
            </div>

            {createTaskMutation.isError ? (
              <div className="alert">{(createTaskMutation.error as Error).message}</div>
            ) : null}
          </form>

          <div className="hr" />
        </div>
      ) : null}

      <div className="kpiRow">
        <div className="kpi">
          <div className="muted mono">Head count</div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>{mob.headCount}</div>
        </div>
        <div className="kpi">
          <div className="muted mono">Avg weight</div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>{mob.avgWeightKg ? `${mob.avgWeightKg} kg` : "-"}</div>
        </div>
        <div className="kpi">
          <div className="muted mono">Current paddock(s)</div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>{locationSummary || "-"}</div>
        </div>
      </div>

      <div className="hr" />

            <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Attachments
        </summary>

        <div style={{ marginTop: 10 }}>
          <AttachmentsPanel entityType="MOB" entityId={mob.id} disabled={busy} showHeader={false} />
        </div>
      </details>

<details style={{ marginTop: 10 }} open={activeAllocations.length > 0}>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Paddocks (multi)
        </summary>

        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Use allocations when one mob is split across multiple paddocks. Leave head count blank if unknown.
          </p>

          <div className="actions" style={{ marginBottom: 10 }}>
            <span className="pill">
              Allocated (known): {allocationTotals.known}
              {allocationTotals.unknown ? ` + ? (${allocationTotals.unknown} unknown)` : ""} | Unallocated:{" "}
              {allocationTotals.unknown ? "?" : allocationTotals.unallocated}
            </span>
            <button
              className="btn"
              type="button"
              onClick={() => void allocationsQuery.refetch()}
              disabled={allocationsQuery.isFetching}
            >
              Refresh
            </button>
          </div>

          {allocationsQuery.isLoading ? <p className="muted">Loading allocations...</p> : null}
          {allocationsQuery.isError ? (
            <div className="alert">Failed to load allocations: {(allocationsQuery.error as Error).message}</div>
          ) : null}

          {!allocationsQuery.isLoading && activeAllocations.length === 0 ? (
            <p className="muted">No active allocations. This mob is treated as being in its primary paddock only.</p>
          ) : null}

          {activeAllocations.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Paddock</th>
                    <th>Head</th>
                    <th>Started</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeAllocations.map((a) => {
                    const paddockName = paddockById.get(a.paddockId)?.name ?? "(unknown paddock)";
                    return (
                      <tr key={a.id}>
                        <td className="mono">{paddockName}</td>
                        <td>{typeof a.headCount === "number" ? a.headCount : "-"}</td>
                        <td className="muted">{toLocale(a.startedAt)}</td>
                        <td className="muted">{a.notes ?? ""}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => void endAllocationMutation.mutateAsync(a)}
                            disabled={busy || endAllocationMutation.isPending}
                          >
                            {endAllocationMutation.isPending ? "Ending..." : "End"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="hr" />

          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Add allocation</h4>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!allocPaddockId) return;

              const head = toPositiveIntOrUndefined(allocHeadCount);
              if (allocHeadCount.trim() && head === undefined) {
                setNotice("Head count must be a positive integer.");
                return;
              }

              void createAllocationMutation.mutateAsync({
                paddockId: allocPaddockId,
                headCount: head,
                notes: allocNotes.trim() || undefined,
              });
            }}
          >
            <div className="row3">
              <label className="label">
                Paddock
                <select className="input" value={allocPaddockId} onChange={(e) => setAllocPaddockId(e.target.value)}>
                  <option value="">(select)</option>
                  {paddocksSorted.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Head (optional)
                <input
                  className="input"
                  value={allocHeadCount}
                  onChange={(e) => setAllocHeadCount(e.target.value)}
                  inputMode="numeric"
                  type="number"
                  min={1}
                />
              </label>

              <div className="actions" style={{ alignItems: "flex-end" }}>
                <button className="btn btnPrimary" type="submit" disabled={busy || !allocPaddockId}>
                  {createAllocationMutation.isPending ? "Saving..." : "Add"}
                </button>
              </div>
            </div>

            <label className="label">
              Notes
              <textarea
                className="input"
                value={allocNotes}
                onChange={(e) => setAllocNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </label>

            {createAllocationMutation.isError ? (
              <div className="alert">{(createAllocationMutation.error as Error).message}</div>
            ) : null}
          </form>
        </div>
      </details>

      <details style={{ marginTop: 10 }} open={breedingStatus.joiningActive || breedingStatus.lambingActive}>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Breeding (joining / lambing)
        </summary>

        <div style={{ marginTop: 10 }}>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            <span className="pill">
              Joining:{" "}
              {breedingStatus.joiningActive
                ? `ACTIVE since ${toLocale(breedingStatus.joiningStartTs)}`
                : breedingStatus.joiningStartTs
                  ? `Last: ${toLocale(breedingStatus.joiningStartTs)}`
                  : "None"}
            </span>
            <span className="pill">
              Expected lambing:{" "}
              {breedingStatus.expectedLambingStart
                ? breedingStatus.expectedLambingEnd
                  ? `${toLocale(breedingStatus.expectedLambingStart)} -> ${toLocale(breedingStatus.expectedLambingEnd)}`
                  : toLocale(breedingStatus.expectedLambingStart)
                : "-"}
            </span>
            <span className="pill">
              Lambing:{" "}
              {breedingStatus.lambingActive
                ? `ACTIVE since ${toLocale(breedingStatus.lambingStartTs)}`
                : breedingStatus.lambingStartTs
                  ? `Last: ${toLocale(breedingStatus.lambingStartTs)}`
                  : "None"}
            </span>
            <button
              className="btn"
              type="button"
              onClick={() => void activityEventsQuery.refetch()}
              disabled={activityEventsQuery.isFetching}
            >
              Refresh
            </button>
          </div>

          <h4 style={{ margin: "10px 0 8px", fontFamily: "var(--font-display)" }}>Record event</h4>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();

              const whenIso = fromDatetimeLocalValue(eventWhenLocal);
              if (!whenIso) {
                setNotice("Invalid date/time.");
                return;
              }

              const payload: Record<string, unknown> = {};
              const notes = eventNotes.trim();
              if (notes) payload.notes = notes;

              if (eventType === "JOINING_START") {
                const ramCount = toPositiveIntOrUndefined(eventRamCount);
                const joinDays = toPositiveIntOrUndefined(eventJoinDays);
                const gestationDays = toPositiveIntOrUndefined(eventGestationDays);

                if (eventRamCount.trim() && ramCount === undefined) {
                  setNotice("Ram count must be a positive integer.");
                  return;
                }
                if (eventJoinDays.trim() && joinDays === undefined) {
                  setNotice("Join days must be a positive integer.");
                  return;
                }
                if (eventGestationDays.trim() && gestationDays === undefined) {
                  setNotice("Gestation days must be a positive integer.");
                  return;
                }

                if (typeof ramCount === "number") payload.ramCount = ramCount;
                if (typeof joinDays === "number") payload.joinDays = joinDays;
                if (typeof gestationDays === "number") payload.gestationDays = gestationDays;
              }

              if (eventType === "LAMBING_END") {
                const born = toNonNegativeIntOrUndefined(eventOffspringBorn);
                const alive = toNonNegativeIntOrUndefined(eventOffspringAlive);
                const dead = toNonNegativeIntOrUndefined(eventOffspringDead);

                if (eventOffspringBorn.trim() && born === undefined) {
                  setNotice("Born must be a non-negative integer.");
                  return;
                }
                if (eventOffspringAlive.trim() && alive === undefined) {
                  setNotice("Alive must be a non-negative integer.");
                  return;
                }
                if (eventOffspringDead.trim() && dead === undefined) {
                  setNotice("Dead must be a non-negative integer.");
                  return;
                }

                if (typeof born === "number") payload.offspringBorn = born;
                if (typeof alive === "number") payload.offspringAlive = alive;
                if (typeof dead === "number") payload.offspringDead = dead;
              }

              void createMobEventMutation.mutateAsync({
                eventType,
                whenKind: eventWhenKind,
                whenIso,
                payloadJson: Object.keys(payload).length ? payload : undefined,
              });
            }}
          >
            <div className="row3">
              <label className="label">
                Type
                <select className="input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  {MOB_EVENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Kind
                <select className="input" value={eventWhenKind} onChange={(e) => setEventWhenKind(e.target.value as any)}>
                  <option value="actual">Actual</option>
                  <option value="planned">Planned</option>
                </select>
              </label>

              <label className="label">
                When
                <input
                  className="input"
                  value={eventWhenLocal}
                  onChange={(e) => setEventWhenLocal(e.target.value)}
                  type="datetime-local"
                  required
                />
              </label>
            </div>

            {eventType === "JOINING_START" ? (
              <div className="row3" style={{ marginTop: 10 }}>
                <label className="label">
                  Ram count (optional)
                  <input
                    className="input"
                    value={eventRamCount}
                    onChange={(e) => setEventRamCount(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={1}
                  />
                </label>

                <label className="label">
                  Join days (optional)
                  <input
                    className="input"
                    value={eventJoinDays}
                    onChange={(e) => setEventJoinDays(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={1}
                  />
                </label>

                <label className="label">
                  Gestation days (optional)
                  <input
                    className="input"
                    value={eventGestationDays}
                    onChange={(e) => setEventGestationDays(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={1}
                    placeholder={mob.species === "CATTLE" ? "283" : "150"}
                  />
                </label>
              </div>
            ) : null}

            {eventType === "LAMBING_END" ? (
              <div className="row3" style={{ marginTop: 10 }}>
                <label className="label">
                  Offspring born
                  <input
                    className="input"
                    value={eventOffspringBorn}
                    onChange={(e) => setEventOffspringBorn(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={0}
                  />
                </label>

                <label className="label">
                  Offspring alive
                  <input
                    className="input"
                    value={eventOffspringAlive}
                    onChange={(e) => setEventOffspringAlive(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={0}
                  />
                </label>

                <label className="label">
                  Offspring dead
                  <input
                    className="input"
                    value={eventOffspringDead}
                    onChange={(e) => setEventOffspringDead(e.target.value)}
                    inputMode="numeric"
                    type="number"
                    min={0}
                  />
                </label>
              </div>
            ) : null}

            <label className="label" style={{ marginTop: 10 }}>
              Notes
              <textarea
                className="input"
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </label>

            <div className="actions">
              <button className="btn btnPrimary" type="submit" disabled={busy}>
                {createMobEventMutation.isPending ? "Saving..." : "Save event"}
              </button>
            </div>

            {createMobEventMutation.isError ? (
              <div className="alert">{(createMobEventMutation.error as Error).message}</div>
            ) : null}
          </form>

          <div className="hr" />

          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Recent events</h4>
          {activityEventsQuery.isLoading ? <p className="muted">Loading events...</p> : null}
          {activityEventsQuery.isError ? (
            <div className="alert">Failed to load events: {(activityEventsQuery.error as Error).message}</div>
          ) : null}

          {!activityEventsQuery.isLoading && recentMobEvents.length === 0 ? <p className="muted">No mob events yet.</p> : null}

          {recentMobEvents.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recentMobEvents.map((ev) => {
                    const when = ev.actualAt ?? ev.plannedAt ?? ev.createdAt;
                    const status = ev.actualAt ? "DONE" : "PLANNED";
                    const notes =
                      ev.payloadJson && typeof ev.payloadJson === "object" && typeof (ev.payloadJson as any).notes === "string"
                        ? String((ev.payloadJson as any).notes)
                        : "";

                    return (
                      <tr key={ev.id}>
                        <td className="mono">{ev.eventType}</td>
                        <td className="muted">{toLocale(when)}</td>
                        <td className="muted">{status}</td>
                        <td className="muted">{notes}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          {!ev.actualAt ? (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => void markMobEventDoneMutation.mutateAsync(ev)}
                              disabled={busy || markMobEventDoneMutation.isPending}
                            >
                              {markMobEventDoneMutation.isPending ? "Saving..." : "Mark done"}
                            </button>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="hr" />

      <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Activity timeline</h4>
      <p className="muted" style={{ marginTop: 0 }}>
        Combined view of moves, feed events, issues, tasks, and events for this mob.
      </p>

      {plansQuery.isError || feedEventsQuery.isError || issuesQuery.isError || tasksQuery.isError || activityEventsQuery.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {plansQuery.isError ? `Moves: ${(plansQuery.error as Error).message}\n` : ""}
          {feedEventsQuery.isError ? `Feed: ${(feedEventsQuery.error as Error).message}\n` : ""}
          {issuesQuery.isError ? `Issues: ${(issuesQuery.error as Error).message}\n` : ""}
          {tasksQuery.isError ? `Tasks: ${(tasksQuery.error as Error).message}\n` : ""}
          {activityEventsQuery.isError ? `Events: ${(activityEventsQuery.error as Error).message}\n` : ""}
        </div>
      ) : null}

      {timeline.length === 0 && !(plansQuery.isLoading || feedEventsQuery.isLoading || issuesQuery.isLoading || tasksQuery.isLoading || activityEventsQuery.isLoading) ? (
        <p className="muted">No activity yet for this mob.</p>
      ) : null}

      {timeline.length ? (
        <div className="timeline">
          {timeline.map((item) => (
            <div className="timelineItem" key={item.key}>
              <div className="timelineRail">
                <div className={`timelineDot timelineDot${item.kind}`} />
              </div>
              <div>
                <div className="timelineTop">
                  <div style={{ fontWeight: 750, letterSpacing: "-0.01em" }}>{item.title}</div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {toLocale(item.ts)}
                  </div>
                </div>
                <div className="actions" style={{ marginTop: 6 }}>
                  <span className="badge">{item.kind}</span>
                  {item.badge ? <span className="badge">{item.badge}</span> : null}
                  {item.subtitle ? <span className="muted" style={{ fontSize: 12 }}>{item.subtitle}</span> : null}
                </div>
              </div>
            </div>
          ))}

          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn" type="button" onClick={() => setShowAllTimeline((v) => !v)}>
              {showAllTimeline ? "Show less" : "Show more"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="hr" />

      <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Paddock history</h4>
      {!plansQuery.isLoading && paddockHistory.length === 0 ? <p className="muted">No completed moves yet.</p> : null}
      {paddockHistory.length ? (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>To</th>
              </tr>
            </thead>
            <tbody>
              {paddockHistory.map((h, idx) => {
                const fromName = h.fromPaddockId ? paddockById.get(h.fromPaddockId)?.name ?? "" : "";
                const toName = paddockById.get(h.paddockId)?.name ?? "";

                return (
                  <tr key={`${h.ts}:${h.paddockId}:${idx}`}>
                    <td className="muted">{toLocale(h.ts)}</td>
                    <td className="muted">{fromName || "-"}</td>
                    <td className="mono">{toName || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="hr" />

      <details>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Recent feed (table)
        </summary>
        <div style={{ marginTop: 10 }}>
          {feedEventsQuery.isLoading ? <p className="muted">Loading feed events...</p> : null}
          {!feedEventsQuery.isLoading && recentFeedEvents.length === 0 ? (
            <p className="muted">No feed events recorded for this mob.</p>
          ) : null}
          {recentFeedEvents.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Paddock</th>
                    <th>Source</th>
                    <th>Kg</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFeedEvents.map((e) => {
                    const paddockName = e.paddockId ? paddockById.get(e.paddockId)?.name ?? "" : "";
                    const source = e.hayLotId ? "Hay" : e.grainLotId ? "Grain" : "";

                    return (
                      <tr key={e.id}>
                        <td className="muted">{toLocale(e.occurredAt)}</td>
                        <td className="muted">{paddockName || "-"}</td>
                        <td className="muted">{source || "-"}</td>
                        <td>{e.quantityKg}</td>
                        <td className="muted">{e.notes ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="hr" />

      <details>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Recent moves (table)
        </summary>
        <div style={{ marginTop: 10 }}>
          {plansQuery.isLoading ? <p className="muted">Loading moves...</p> : null}
          {!plansQuery.isLoading && recentPlans.length === 0 ? <p className="muted">No moves recorded for this mob.</p> : null}
          {recentPlans.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Planned</th>
                    <th>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPlans.map((p) => {
                    const fromName = p.fromPaddockId ? paddockById.get(p.fromPaddockId)?.name ?? "" : "";
                    const toName = paddockById.get(p.toPaddockId)?.name ?? "";

                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="badge">{p.status}</span>
                        </td>
                        <td className="muted">{fromName || "-"}</td>
                        <td className="muted">{toName || "-"}</td>
                        <td className="muted">{toLocale(p.plannedAt)}</td>
                        <td className="muted">{toLocale(p.actualAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="hr" />

      <details>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Open issues (table)
        </summary>
        <div style={{ marginTop: 10 }}>
          {issuesQuery.isLoading ? <p className="muted">Loading issues...</p> : null}
          {!issuesQuery.isLoading && openIssues.length === 0 ? <p className="muted">No open issues for this mob.</p> : null}
          {openIssues.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {openIssues.map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.title}</td>
                      <td>
                        <span className="badge">{i.status}</span>
                      </td>
                      <td className="muted">{i.severity ?? ""}</td>
                      <td className="muted">{toLocale(i.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="hr" />

      <details>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Open tasks (table)
        </summary>
        <div style={{ marginTop: 10 }}>
          {tasksQuery.isLoading ? <p className="muted">Loading tasks...</p> : null}
          {!tasksQuery.isLoading && openTasks.length === 0 ? <p className="muted">No open tasks for this mob.</p> : null}
          {openTasks.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {openTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.title}</td>
                      <td>
                        <span className="badge">{t.status}</span>
                      </td>
                      <td className="muted">{t.dueAt ? toLocale(t.dueAt) : ""}</td>
                      <td className="muted">{toLocale(t.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>

      <div className="hr" />

      <details>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Production plans (table)
        </summary>
        <div style={{ marginTop: 10 }}>
          {productionPlansQuery.isLoading ? <p className="muted">Loading production plans...</p> : null}
          {productionPlansQuery.isError ? (
            <div className="alert">Production plans: {(productionPlansQuery.error as Error).message}</div>
          ) : null}
          {!productionPlansQuery.isLoading && productionPlans.length === 0 ? (
            <p className="muted">No production plans linked to this mob.</p>
          ) : null}
          {productionPlans.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Start</th>
                    <th>End</th>
                  </tr>
                </thead>
                <tbody>
                  {productionPlans.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.planName}</td>
                      <td>
                        <span className="badge">{p.status}</span>
                      </td>
                      <td className="muted">{toLocale(p.startDate)}</td>
                      <td className="muted">{toLocale(p.endDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

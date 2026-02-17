import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { areaHaFromGeoJson, formatAreaHaAcres, toNumberOrNull } from "../../../utils/geoArea";
import type {
  ActivityEvent,
  ApiListResponse,
  ApiSingleResponse,
  CropSeason,
  FeedEvent,
  Issue,
  Mob,
  MobMovementPlan,
  MobPaddockAllocation,
  Paddock,
  PaddockPlan,
  PestSpotting,
  ProductionPlan,
  Task,
} from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { seeOnMap } from "../../../ui/navigation";

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

function truncate(s: string, max: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}...`;
}

function isOpenIssueStatus(status: Issue["status"]): boolean {
  return status !== "RESOLVED" && status !== "CLOSED";
}

function isOpenTaskStatus(status: Task["status"]): boolean {
  return status !== "DONE" && status !== "CANCELLED";
}

function pickMoveTs(plan: MobMovementPlan): string {
  return plan.actualAt ?? plan.plannedAt;
}

function pickTaskTs(task: Task): string {
  return task.completedAt ?? task.dueAt ?? task.updatedAt;
}

function pickIssueTs(issue: Issue): string {
  return issue.resolvedAt ?? issue.updatedAt;
}

function pickEventTs(ev: ActivityEvent): string | null {
  return ev.actualAt ?? ev.plannedAt ?? ev.createdAt ?? null;
}

async function getMovementPlansForPaddock(paddockId: string): Promise<MobMovementPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<MobMovementPlan>>(
      `/mob-movement-plans?paddockId=${encodeURIComponent(paddockId)}`,
    );
    await upsertEntities("mob_movement_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<MobMovementPlan>("mob_movement_plans");
    const filtered = cached.filter((p) => p.toPaddockId === paddockId || p.fromPaddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getFeedEventsForPaddock(paddockId: string): Promise<FeedEvent[]> {
  try {
    const response = await apiFetch<ApiListResponse<FeedEvent>>(`/feed-events?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("feed_events", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<FeedEvent>("feed_events");
    const filtered = cached.filter((e) => e.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getIssuesForPaddock(paddockId: string): Promise<Issue[]> {
  try {
    const response = await apiFetch<ApiListResponse<Issue>>(`/issues?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("issues", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Issue>("issues");
    const filtered = cached.filter((i) => i.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getTasksForPaddock(paddockId: string): Promise<Task[]> {
  try {
    const response = await apiFetch<ApiListResponse<Task>>(`/tasks?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("tasks", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Task>("tasks");
    const filtered = cached.filter((t) => t.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getPestsForPaddock(paddockId: string): Promise<PestSpotting[]> {
  try {
    const response = await apiFetch<ApiListResponse<PestSpotting>>(`/pest-spottings?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("pest_spottings", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<PestSpotting>("pest_spottings");
    const filtered = cached.filter((p) => p.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getCropSeasonsForPaddock(paddockId: string): Promise<CropSeason[]> {
  try {
    const response = await apiFetch<ApiListResponse<CropSeason>>(`/crop-seasons?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("crop_seasons", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<CropSeason>("crop_seasons");
    const filtered = cached.filter((s) => s.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getPaddockPlansForPaddock(paddockId: string): Promise<PaddockPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<PaddockPlan>>(`/paddock-plans?paddockId=${encodeURIComponent(paddockId)}`);
    await upsertEntities("paddock_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<PaddockPlan>("paddock_plans");
    const filtered = cached.filter((p) => p.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getProductionPlansForPaddock(paddockId: string): Promise<ProductionPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<ProductionPlan>>(
      `/production-plans?paddockId=${encodeURIComponent(paddockId)}`,
    );
    await upsertEntities("production_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<ProductionPlan>("production_plans");
    const filtered = cached.filter((p) => p.paddockId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getActivityEventsForPaddock(paddockId: string): Promise<ActivityEvent[]> {
  const qs = new URLSearchParams({
    entityType: "paddocks",
    entityId: paddockId,
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
    const filtered = cached.filter((ev) => ev.entityType === "paddocks" && ev.entityId === paddockId);
    if (filtered.length) return filtered;
    throw err;
  }
}

async function getAllocationsForPaddock(paddockId: string): Promise<MobPaddockAllocation[]> {
  const qs = new URLSearchParams({ paddockId, active: "true" });

  try {
    const response = await apiFetch<ApiListResponse<MobPaddockAllocation>>(`/mob-paddock-allocations?${qs.toString()}`);
    await upsertEntities("mob_paddock_allocations", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const cached = await listEntities<MobPaddockAllocation>("mob_paddock_allocations");
    const filtered = cached.filter((a) => a.paddockId === paddockId && !a.endedAt);
    if (filtered.length) return filtered;
    throw err;
  }
}


type Kind = "MOVE" | "FEED" | "ISSUE" | "TASK" | "PEST" | "EVENT";

type TimelineItem = {
  key: string;
  kind: Kind;
  tsIso: string;
  title: string;
  subtitle?: string;
  badges?: string[];
};

type CreateIssueInput = {
  title: string;
  description?: string;
  severity?: string;
  mobId?: string | null;
};

type CreateTaskInput = {
  title: string;
  description?: string;
  dueAt?: string | null;
  mobId?: string | null;
};

export function PaddockDetailsPanel(props: {
  paddock: Paddock;
  paddockById: Map<string, Paddock>;
  mobs: Mob[];
  onClose: () => void;
}) {
  const { paddock, paddockById, mobs, onClose } = props;

  const qc = useQueryClient();

  const [notice, setNotice] = useState<string | null>(null);
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [quickMode, setQuickMode] = useState<null | "issue" | "task">(null);

  const mobById = useMemo(() => new Map(mobs.map((m) => [m.id, m])), [mobs]);

  const allocationsQuery = useQuery({
    queryKey: ["mob-paddock-allocations", { paddockId: paddock.id }],
    queryFn: () => getAllocationsForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const allocationByMobId = useMemo(() => {
    const map = new Map<string, { known: number; unknown: boolean }>();

    for (const a of allocationsQuery.data ?? []) {
      if (a.endedAt) continue;
      const entry = map.get(a.mobId) ?? { known: 0, unknown: false };
      if (typeof a.headCount === "number") entry.known += a.headCount;
      else entry.unknown = true;
      map.set(a.mobId, entry);
    }

    return map;
  }, [allocationsQuery.data]);

  const currentMobs = useMemo(() => {
    const list = mobs.filter((m) => m.currentPaddockId === paddock.id || allocationByMobId.has(m.id));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allocationByMobId, mobs, paddock.id]);

  const headCount = useMemo(() => {
    let known = 0;
    let unknown = 0;

    for (const m of currentMobs) {
      const alloc = allocationByMobId.get(m.id);
      if (alloc) {
        known += alloc.known;
        if (alloc.unknown) unknown += 1;
      } else {
        known += m.headCount ?? 0;
      }
    }

    return { known, unknown };
  }, [allocationByMobId, currentMobs]);

  const movementPlansQuery = useQuery({
    queryKey: ["mob-movement-plans", { paddockId: paddock.id }],
    queryFn: () => getMovementPlansForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const feedEventsQuery = useQuery({
    queryKey: ["feed-events", { paddockId: paddock.id }],
    queryFn: () => getFeedEventsForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const issuesQuery = useQuery({
    queryKey: ["issues", { paddockId: paddock.id }],
    queryFn: () => getIssuesForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks", { paddockId: paddock.id }],
    queryFn: () => getTasksForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const pestsQuery = useQuery({
    queryKey: ["pest-spottings", { paddockId: paddock.id }],
    queryFn: () => getPestsForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const cropSeasonsQuery = useQuery({
    queryKey: ["crop-seasons", { paddockId: paddock.id }],
    queryFn: () => getCropSeasonsForPaddock(paddock.id),
    staleTime: 30_000,
  });

  const paddockPlansQuery = useQuery({
    queryKey: ["paddock-plans", { paddockId: paddock.id }],
    queryFn: () => getPaddockPlansForPaddock(paddock.id),
    staleTime: 30_000,
  });

  const productionPlansQuery = useQuery({
    queryKey: ["production-plans", { paddockId: paddock.id }],
    queryFn: () => getProductionPlansForPaddock(paddock.id),
    staleTime: 30_000,
  });

  const activityEventsQuery = useQuery({
    queryKey: ["activity-events", { paddockId: paddock.id }],
    queryFn: () => getActivityEventsForPaddock(paddock.id),
    staleTime: 20_000,
  });

  const openIssues = useMemo(() => {
    const list = (issuesQuery.data ?? []).filter((i) => isOpenIssueStatus(i.status));
    list.sort((a, b) => pickIssueTs(b).localeCompare(pickIssueTs(a)));
    return list;
  }, [issuesQuery.data]);

  const openTasks = useMemo(() => {
    const list = (tasksQuery.data ?? []).filter((t) => isOpenTaskStatus(t.status));
    list.sort((a, b) => pickTaskTs(a).localeCompare(pickTaskTs(b)));
    return list;
  }, [tasksQuery.data]);

  const completedMovesIn = useMemo(() => {
    const list = (movementPlansQuery.data ?? []).filter((p) => p.status === "COMPLETED" && p.toPaddockId === paddock.id);
    list.sort((a, b) => pickMoveTs(b).localeCompare(pickMoveTs(a)));
    return list;
  }, [movementPlansQuery.data, paddock.id]);

  const lastMovedInAt = completedMovesIn[0]?.actualAt ?? completedMovesIn[0]?.plannedAt ?? null;

  const daysSinceMoveIn = useMemo(() => {
    if (!lastMovedInAt) return null;
    const d = new Date(lastMovedInAt);
    if (!Number.isFinite(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const days = Math.floor(diffMs / 86_400_000);
    return days >= 0 ? days : 0;
  }, [lastMovedInAt]);

  const [issueTitle, setIssueTitle] = useState("");
  const [issueSeverity, setIssueSeverity] = useState("");
  const [issueMobId, setIssueMobId] = useState<string>("");
  const [issueDescription, setIssueDescription] = useState("");

  const createIssueMutation = useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const id = createUuid();

      try {
        const response = await apiFetch<ApiSingleResponse<Issue>>("/issues", {
          method: "POST",
          body: JSON.stringify({
            id,
            title: input.title,
            description: input.description,
            severity: input.severity,
            paddockId: paddock.id,
            mobId: input.mobId ?? null,
          }),
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
          paddockId: paddock.id,
          mobId: typeof input.mobId === "string" ? input.mobId : null,
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
          paddockId: paddock.id,
        };

        if (local.description) actionData.description = local.description;
        if (local.severity) actionData.severity = local.severity;
        if (local.mobId) actionData.mobId = local.mobId;

        await enqueueAction({ entity: "issues", op: "CREATE", data: actionData });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Issue created.");
      setQuickMode(null);
      setIssueTitle("");
      setIssueSeverity("");
      setIssueMobId("");
      setIssueDescription("");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueAtLocal, setTaskDueAtLocal] = useState("");
  const [taskMobId, setTaskMobId] = useState<string>("");
  const [taskDescription, setTaskDescription] = useState("");

  const createTaskMutation = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const id = createUuid();

      try {
        const response = await apiFetch<ApiSingleResponse<Task>>("/tasks", {
          method: "POST",
          body: JSON.stringify({
            id,
            title: input.title,
            description: input.description,
            status: "OPEN",
            dueAt: typeof input.dueAt === "string" ? input.dueAt : null,
            paddockId: paddock.id,
            mobId: input.mobId ?? null,
            assignedToId: null,
          }),
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
          status: "OPEN",
          dueAt: typeof input.dueAt === "string" ? input.dueAt : null,
          paddockId: paddock.id,
          mobId: typeof input.mobId === "string" ? input.mobId : null,
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
          paddockId: paddock.id,
        };

        if (local.description) actionData.description = local.description;
        if (local.dueAt) actionData.dueAt = local.dueAt;
        if (local.mobId) actionData.mobId = local.mobId;

        await enqueueAction({ entity: "tasks", op: "CREATE", data: actionData });

        return local;
      }
    },
    onSuccess: async () => {
      setNotice("Task created.");
      setQuickMode(null);
      setTaskTitle("");
      setTaskDueAtLocal("");
      setTaskMobId("");
      setTaskDescription("");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const busy = createIssueMutation.isPending || createTaskMutation.isPending;

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const plan of movementPlansQuery.data ?? []) {
      const tsIso = pickMoveTs(plan);
      const mobName = mobById.get(plan.mobId)?.name ?? "Mob";

      const fromName = plan.fromPaddockId ? paddockById.get(plan.fromPaddockId)?.name ?? "" : "";
      const toName = paddockById.get(plan.toPaddockId)?.name ?? "";

      const direction = plan.toPaddockId === paddock.id ? "in" : plan.fromPaddockId === paddock.id ? "out" : "move";

      const title =
        direction === "in"
          ? `Move in: ${mobName}`
          : direction === "out"
            ? `Move out: ${mobName}`
            : `Move: ${mobName}`;

      const subtitleParts: string[] = [];
      if (fromName) subtitleParts.push(`From: ${fromName}`);
      if (toName) subtitleParts.push(`To: ${toName}`);
      if (plan.reason) subtitleParts.push(`Reason: ${truncate(plan.reason, 90)}`);

      items.push({
        key: `move:${plan.id}`,
        kind: "MOVE",
        tsIso,
        title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badges: [plan.status],
      });
    }

    for (const e of feedEventsQuery.data ?? []) {
      const mobName = e.mobId ? mobById.get(e.mobId)?.name ?? "" : "";
      const source = e.hayLotId ? "Hay" : e.grainLotId ? "Grain" : "Feed";

      const title = `Feed: ${source} ${e.quantityKg} kg${mobName ? ` (${mobName})` : ""}`;
      const subtitle = e.notes ? truncate(e.notes, 110) : undefined;

      items.push({
        key: `feed:${e.id}`,
        kind: "FEED",
        tsIso: e.occurredAt,
        title,
        subtitle,
      });
    }

    for (const i of issuesQuery.data ?? []) {
      const title = `Issue: ${i.title}`;
      const subtitleParts: string[] = [];
      if (i.severity) subtitleParts.push(`Severity: ${i.severity}`);
      if (i.mobId) subtitleParts.push(`Mob: ${mobById.get(i.mobId)?.name ?? ""}`);
      if (i.description) subtitleParts.push(truncate(i.description, 110));

      items.push({
        key: `issue:${i.id}`,
        kind: "ISSUE",
        tsIso: pickIssueTs(i),
        title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badges: [i.status],
      });
    }

    for (const t of tasksQuery.data ?? []) {
      const title = `Task: ${t.title}`;
      const subtitleParts: string[] = [];
      if (t.dueAt) subtitleParts.push(`Due: ${toLocale(t.dueAt)}`);
      if (t.mobId) subtitleParts.push(`Mob: ${mobById.get(t.mobId)?.name ?? ""}`);
      if (t.description) subtitleParts.push(truncate(t.description, 110));

      items.push({
        key: `task:${t.id}`,
        kind: "TASK",
        tsIso: pickTaskTs(t),
        title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badges: [t.status],
      });
    }

    for (const p of pestsQuery.data ?? []) {
      const title = `Pest: ${p.pestType}`;
      const subtitleParts: string[] = [];
      if (p.severity) subtitleParts.push(`Severity: ${p.severity}`);
      if (p.notes) subtitleParts.push(truncate(p.notes, 110));

      items.push({
        key: `pest:${p.id}`,
        kind: "PEST",
        tsIso: p.spottedAt,
        title,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badges: p.severity ? [p.severity] : undefined,
      });
    }

    for (const ev of activityEventsQuery.data ?? []) {
      const tsIso = pickEventTs(ev);
      if (!tsIso) continue;
      const isOpen = !ev.actualAt;

      const notes = (ev.payloadJson as any)?.notes;
      const subtitleParts: string[] = [];
      if (ev.plannedAt) subtitleParts.push(`Planned: ${toLocale(ev.plannedAt)}`);
      if (ev.actualAt) subtitleParts.push(`Actual: ${toLocale(ev.actualAt)}`);
      if (typeof notes === "string" && notes.trim()) subtitleParts.push(truncate(notes, 120));

      items.push({
        key: `event:${ev.id}`,
        kind: "EVENT",
        tsIso,
        title: `Event: ${ev.eventType}`,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
        badges: [isOpen ? "PLANNED" : "DONE"],
      });
    }

    items.sort((a, b) => (b.tsIso ?? "").localeCompare(a.tsIso ?? ""));
    return items;
  }, [
    activityEventsQuery.data,
    feedEventsQuery.data,
    issuesQuery.data,
    mobById,
    movementPlansQuery.data,
    paddock.id,
    paddockById,
    pestsQuery.data,
    tasksQuery.data,
  ]);

  const timelineDisplay = showAllTimeline ? timeline : timeline.slice(0, 14);

  const seasonsSorted = useMemo(() => {
    const list = (cropSeasonsQuery.data ?? []).slice();
    list.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return list;
  }, [cropSeasonsQuery.data]);

  const paddockPlansSorted = useMemo(() => {
    const list = (paddockPlansQuery.data ?? []).slice();
    list.sort((a, b) => b.plannedStart.localeCompare(a.plannedStart));
    return list;
  }, [paddockPlansQuery.data]);

  const productionPlansSorted = useMemo(() => {
    const list = (productionPlansQuery.data ?? []).slice();
    list.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return list;
  }, [productionPlansQuery.data]);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panelTitle">
        <div>
          <div className="muted mono">Paddock details</div>
          <h3 style={{ margin: "2px 0 0" }}>{paddock.name}</h3>
          <div className="actions" style={{ marginTop: 8 }}>
            <span className="badge">Area: {formatAreaHaAcres(areaHaFromGeoJson(paddock.boundaryGeoJson) ?? toNumberOrNull(paddock.areaHa)) || "(unknown)"}</span>
            <span className="badge">Boundary: {paddock.boundaryGeoJson ? "yes" : "no"}</span>
            {paddock.currentStatus ? <span className="badge">{paddock.currentStatus}</span> : null}
            <span className="badge">Mobs here: {currentMobs.length} ({headCount.known}{headCount.unknown ? " + ?" : ""} head)</span>
            {typeof daysSinceMoveIn === "number" ? <span className="badge">Last move-in: {daysSinceMoveIn}d ago</span> : null}
            <span className="badge">Open issues: {openIssues.length}</span>
            <span className="badge">Open tasks: {openTasks.length}</span>
            <span className="badge">Updated: {toLocale(paddock.updatedAt)}</span>
          </div>
        </div>

        <div className="actions" style={{ justifyContent: "flex-end" }}>
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
          <button
            className="btn"
            type="button"
            onClick={() => seeOnMap({ kind: "PADDOCK", paddockId: paddock.id })}
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
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Attachments
        </summary>

        <div style={{ marginTop: 10 }}>
          <AttachmentsPanel entityType="PADDOCK" entityId={paddock.id} disabled={busy} showHeader={false} />
        </div>
      </details>

      {quickMode === "issue" ? (
        <div style={{ marginTop: 10 }}>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>New issue</h4>

          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const title = issueTitle.trim();
              if (!title) return;
              const description = issueDescription.trim();
              const severity = issueSeverity.trim();

              void createIssueMutation.mutateAsync({
                title,
                description: description || undefined,
                severity: severity || undefined,
                mobId: issueMobId ? issueMobId : null,
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
                  placeholder="e.g. Fence down"
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
                Mob (optional)
                <select className="input" value={issueMobId} onChange={(e) => setIssueMobId(e.target.value)}>
                  <option value="">(none)</option>
                  {currentMobs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
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

            {createIssueMutation.isError ? <div className="alert">{(createIssueMutation.error as Error).message}</div> : null}
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

              void createTaskMutation.mutateAsync({
                title,
                dueAt: dueAt ?? null,
                description: description || undefined,
                mobId: taskMobId ? taskMobId : null,
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
                  placeholder="e.g. Check trough"
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
                Mob (optional)
                <select className="input" value={taskMobId} onChange={(e) => setTaskMobId(e.target.value)}>
                  <option value="">(none)</option>
                  {currentMobs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="label">
              Description
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

            {createTaskMutation.isError ? <div className="alert">{(createTaskMutation.error as Error).message}</div> : null}
          </form>

          <div className="hr" />
        </div>
      ) : null}

      <div className="row3" style={{ marginTop: 10 }}>
        <div>
          <div className="muted mono" style={{ fontSize: 12 }}>
            Current mobs
          </div>
          <div className="pill" style={{ display: "inline-block", marginTop: 6 }}>
            {currentMobs.length ? `${currentMobs.length} mobs, ${headCount.known}${headCount.unknown ? " + ?" : ""} head` : "None"}
          </div>
        </div>

        <div>
          <div className="muted mono" style={{ fontSize: 12 }}>
            Recent activity
          </div>
          <div className="pill" style={{ display: "inline-block", marginTop: 6 }}>
            {timeline.length} items
          </div>
        </div>

        <div className="actions" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => setShowAllTimeline((v) => !v)}>
            {showAllTimeline ? "Show less" : "Show more"}
          </button>
        </div>
      </div>

      {timelineDisplay.length ? (
        <div style={{ marginTop: 12 }}>
          {timelineDisplay.map((item) => (
            <div className="timelineItem" key={item.key}>
              <div className="timelineRail">
                <div className={`timelineDot timelineDot${item.kind}`} />
              </div>

              <div>
                <div className="timelineTop">
                  <div style={{ fontWeight: 750, letterSpacing: "-0.01em" }}>{item.title}</div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {toLocale(item.tsIso)}
                  </div>
                </div>

                <div className="actions" style={{ marginTop: 6 }}>
                  <span className="badge">{item.kind}</span>
                  {(item.badges ?? []).map((b) => (
                    <span key={b} className="badge">
                      {b}
                    </span>
                  ))}
                  {item.subtitle ? (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {item.subtitle}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {!showAllTimeline && timeline.length > timelineDisplay.length ? (
            <div className="pill" style={{ marginTop: 10 }}>
              Showing {timelineDisplay.length} of {timeline.length} items.
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          No recent activity found for this paddock.
        </p>
      )}

      <div className="hr" />

      <div className="row3" style={{ marginTop: 12 }}>
        <div>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Open issues</h4>
          {openIssues.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Mob</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {openIssues.slice(0, 8).map((i) => (
                    <tr key={i.id}>
                      <td className="mono">{i.title}</td>
                      <td className="muted">{i.severity ?? ""}</td>
                      <td className="muted">{i.mobId ? mobById.get(i.mobId)?.name ?? "" : ""}</td>
                      <td>
                        <span className="badge">{i.status}</span>
                      </td>
                      <td className="muted">{toLocale(i.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No open issues.</p>
          )}
        </div>

        <div>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Open tasks</h4>
          {openTasks.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Mob</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openTasks.slice(0, 8).map((t) => (
                    <tr key={t.id}>
                      <td className="mono">{t.title}</td>
                      <td className="muted">{t.mobId ? mobById.get(t.mobId)?.name ?? "" : ""}</td>
                      <td className="muted">{t.dueAt ? toLocale(t.dueAt) : ""}</td>
                      <td>
                        <span className="badge">{t.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No open tasks.</p>
          )}
        </div>

        <div>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Current mobs</h4>
          {currentMobs.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mob</th>
                    <th>Species</th>
                    <th>Head</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMobs.slice(0, 10).map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.name}</td>
                      <td className="muted">{m.species}</td>
                      <td>
                        {(() => {
                          const alloc = allocationByMobId.get(m.id) ?? null;
                          if (!alloc) return m.headCount;
                          if (alloc.unknown) return alloc.known > 0 ? `${alloc.known} + ?` : "?";
                          return alloc.known;
                        })()}
                      </td>
                      <td className="muted">{toLocale(m.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No mobs currently in this paddock.</p>
          )}
        </div>
      </div>

      {seasonsSorted.length || paddockPlansSorted.length || productionPlansSorted.length ? (
        <>
          <div className="hr" />

          <div className="row3" style={{ marginTop: 12 }}>
            <div>
              <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Crop seasons</h4>
              {seasonsSorted.length ? (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Crop</th>
                        <th>Start</th>
                        <th>End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasonsSorted.slice(0, 6).map((s) => (
                        <tr key={s.id}>
                          <td className="mono">{s.seasonName}</td>
                          <td className="muted">{s.cropType}</td>
                          <td className="muted">{new Date(s.startDate).toLocaleDateString()}</td>
                          <td className="muted">{s.endDate ? new Date(s.endDate).toLocaleDateString() : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No crop seasons.</p>
              )}
            </div>

            <div>
              <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Paddock plans</h4>
              {paddockPlansSorted.length ? (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paddockPlansSorted.slice(0, 6).map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{p.name}</td>
                          <td>
                            <span className="badge">{p.status}</span>
                          </td>
                          <td className="muted">{new Date(p.plannedStart).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No paddock plans.</p>
              )}
            </div>

            <div>
              <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Production plans</h4>
              {productionPlansSorted.length ? (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productionPlansSorted.slice(0, 6).map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{p.planName}</td>
                          <td>
                            <span className="badge">{p.status}</span>
                          </td>
                          <td className="muted">{new Date(p.startDate).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No production plans.</p>
              )}
            </div>
          </div>
        </>
      ) : null}

      <div className="hr" />

      <div className="actions" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          Tip: use the Map tab to view paddock boundaries and water assets (satellite imagery).
        </div>
        <button className="btn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

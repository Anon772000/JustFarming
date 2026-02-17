import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { listEntities, upsertEntities } from "../../../offline/indexedDb";
import { seeOnMap } from "../../../ui/navigation";
import type {
  ActivityEvent,
  ApiListResponse,
  ApiSingleResponse,
  FeedEvent,
  Issue,
  Mob,
  MobMovementPlan,
  Paddock,
  PestSpotting,
  Task,
} from "../../../types/api";

function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
  }

  return false;
}

function toLocale(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString();
}

function toTs(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NaN;
}

function inRange(ts: number, fromTs: number, toTsValue: number): boolean {
  if (!Number.isFinite(ts)) return false;
  return ts >= fromTs && ts <= toTsValue;
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

async function getMovementPlans(): Promise<MobMovementPlan[]> {
  try {
    const response = await apiFetch<ApiListResponse<MobMovementPlan>>("/mob-movement-plans");
    await upsertEntities("mob_movement_plans", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<MobMovementPlan>("mob_movement_plans");
    if (cached.length) return cached;
    throw err;
  }
}

async function getFeedEvents(): Promise<FeedEvent[]> {
  try {
    const response = await apiFetch<ApiListResponse<FeedEvent>>("/feed-events");
    await upsertEntities("feed_events", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<FeedEvent>("feed_events");
    if (cached.length) return cached;
    throw err;
  }
}

async function getIssues(): Promise<Issue[]> {
  try {
    const response = await apiFetch<ApiListResponse<Issue>>("/issues");
    await upsertEntities("issues", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Issue>("issues");
    if (cached.length) return cached;
    throw err;
  }
}

async function getTasks(): Promise<Task[]> {
  try {
    const response = await apiFetch<ApiListResponse<Task>>("/tasks");
    await upsertEntities("tasks", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<Task>("tasks");
    if (cached.length) return cached;
    throw err;
  }
}

async function getPestSpottings(): Promise<PestSpotting[]> {
  try {
    const response = await apiFetch<ApiListResponse<PestSpotting>>("/pest-spottings");
    await upsertEntities("pest_spottings", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;
    const cached = await listEntities<PestSpotting>("pest_spottings");
    if (cached.length) return cached;
    throw err;
  }
}

async function getActivityEvents(from: string, to: string): Promise<ActivityEvent[]> {
  const qs = new URLSearchParams({
    from,
    to,
    when: "any",
    limit: "1000",
    order: "desc",
  });

  try {
    const response = await apiFetch<ApiListResponse<ActivityEvent>>(`/activity-events?${qs.toString()}`);
    await upsertEntities("activity_events", response.data as any);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const cached = await listEntities<ActivityEvent>("activity_events");
    if (!cached.length) throw err;

    const fromTs = new Date(from).getTime();
    const toTsValue = new Date(to).getTime();

    const filtered = cached.filter((ev) => {
      const planned = toTs(ev.plannedAt);
      const actual = toTs(ev.actualAt);
      const created = toTs(ev.createdAt);

      return (
        inRange(planned, fromTs, toTsValue) ||
        inRange(actual, fromTs, toTsValue) ||
        inRange(created, fromTs, toTsValue)
      );
    });

    filtered.sort((a, b) => (pickEventTs(b) ?? "").localeCompare(pickEventTs(a) ?? ""));
    return filtered;
  }
}

type Kind = "MOVE" | "FEED" | "ISSUE" | "TASK" | "PEST" | "EVENT";

type TimelineItemBase = {
  key: string;
  kind: Kind;
  tsIso: string;
  title: string;
  subtitle?: string;
  badges?: string[];
};

type MoveItem = TimelineItemBase & {
  kind: "MOVE";
  plan: MobMovementPlan;
};

type FeedItem = TimelineItemBase & {
  kind: "FEED";
  feed: FeedEvent;
};

type IssueItem = TimelineItemBase & {
  kind: "ISSUE";
  issue: Issue;
};

type TaskItem = TimelineItemBase & {
  kind: "TASK";
  task: Task;
};

type PestItem = TimelineItemBase & {
  kind: "PEST";
  pest: PestSpotting;
};

type EventItem = TimelineItemBase & {
  kind: "EVENT";
  event: ActivityEvent;
};

type TimelineItem = MoveItem | FeedItem | IssueItem | TaskItem | PestItem | EventItem;

type StatusMode = "all" | "open" | "done";

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

function isOpenMoveStatus(status: MobMovementPlan["status"]): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

async function updateLocalMobCurrentPaddock(mobId: string, toPaddockId: string): Promise<void> {
  const mobs = await listEntities<Mob>("mobs");
  const existing = mobs.find((m) => m.id === mobId) ?? null;
  if (!existing) return;

  const now = new Date().toISOString();

  await upsertEntities("mobs", [
    {
      ...existing,
      currentPaddockId: toPaddockId,
      updatedAt: now,
    } as any,
  ]);
}

async function completeMovePlan(plan: MobMovementPlan): Promise<MobMovementPlan> {
  const now = new Date().toISOString();

  try {
    const response = await apiFetch<ApiSingleResponse<MobMovementPlan>>(`/mob-movement-plans/${plan.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "COMPLETED", actualAt: now }),
    });

    await upsertEntities("mob_movement_plans", [response.data as any]);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const updated: MobMovementPlan = {
      ...plan,
      status: "COMPLETED",
      actualAt: now,
      updatedAt: now,
    };

    await upsertEntities("mob_movement_plans", [updated as any]);

    await enqueueAction({
      entity: "mob_movement_plans",
      op: "UPDATE",
      data: { id: updated.id, status: updated.status, actualAt: now },
    });

    await updateLocalMobCurrentPaddock(updated.mobId, updated.toPaddockId);

    return updated;
  }
}

async function resolveIssue(issue: Issue): Promise<Issue> {
  const now = new Date().toISOString();

  try {
    const response = await apiFetch<ApiSingleResponse<Issue>>(`/issues/${issue.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "RESOLVED" }),
    });

    await upsertEntities("issues", [response.data as any]);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const updated: Issue = {
      ...issue,
      status: "RESOLVED",
      resolvedAt: issue.resolvedAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("issues", [updated as any]);

    await enqueueAction({
      entity: "issues",
      op: "UPDATE",
      data: { id: updated.id, status: updated.status },
    });

    return updated;
  }
}

async function markTaskDone(task: Task): Promise<Task> {
  const now = new Date().toISOString();

  try {
    const response = await apiFetch<ApiSingleResponse<Task>>(`/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "DONE" }),
    });

    await upsertEntities("tasks", [response.data as any]);
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const updated: Task = {
      ...task,
      status: "DONE",
      completedAt: task.completedAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("tasks", [updated as any]);

    await enqueueAction({
      entity: "tasks",
      op: "UPDATE",
      data: { id: updated.id, status: updated.status },
    });

    return updated;
  }
}

async function markActivityEventDone(event: ActivityEvent): Promise<ActivityEvent> {
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

    const updated: ActivityEvent = {
      ...event,
      actualAt: now,
      updatedAt: now,
    };

    await upsertEntities("activity_events", [updated as any]);

    await enqueueAction({
      entity: "activity_events",
      op: "UPDATE",
      data: { id: updated.id, actualAt: now },
    });

    return updated;
  }
}

export function FarmTimelinePage() {
  const qc = useQueryClient();

  const [pastDays, setPastDays] = useState(30);
  const [futureDays, setFutureDays] = useState(30);
  const [search, setSearch] = useState("");

  const [mobFilterId, setMobFilterId] = useState<string>("");
  const [paddockFilterId, setPaddockFilterId] = useState<string>("");
  const [statusMode, setStatusMode] = useState<StatusMode>("all");

  const [showMoves, setShowMoves] = useState(true);
  const [showFeed, setShowFeed] = useState(true);
  const [showIssues, setShowIssues] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showPests, setShowPests] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const [notice, setNotice] = useState<string | null>(null);

  const range = useMemo(() => {
    const now = Date.now();
    const from = new Date(now - pastDays * 86_400_000).toISOString();
    const to = new Date(now + futureDays * 86_400_000).toISOString();
    return { from, to };
  }, [futureDays, pastDays]);

  const paddocksQuery = useQuery({ queryKey: ["paddocks"], queryFn: getPaddocks, staleTime: 30_000 });
  const mobsQuery = useQuery({ queryKey: ["mobs"], queryFn: getMobs, staleTime: 30_000 });

  const movesQuery = useQuery({ queryKey: ["mob-movement-plans"], queryFn: getMovementPlans, staleTime: 20_000 });
  const feedQuery = useQuery({ queryKey: ["feed-events"], queryFn: getFeedEvents, staleTime: 20_000 });
  const issuesQuery = useQuery({ queryKey: ["issues"], queryFn: getIssues, staleTime: 20_000 });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: getTasks, staleTime: 20_000 });
  const pestsQuery = useQuery({ queryKey: ["pest-spottings"], queryFn: getPestSpottings, staleTime: 20_000 });

  const activityEventsQuery = useQuery({
    queryKey: ["activity-events", range],
    queryFn: () => getActivityEvents(range.from, range.to),
    staleTime: 20_000,
  });

  const paddocks = useMemo(() => {
    return (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddocksQuery.data]);

  const mobs = useMemo(() => {
    return (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data]);

  const paddockById = useMemo(() => new Map(paddocks.map((p) => [p.id, p])), [paddocks]);
  const mobById = useMemo(() => new Map(mobs.map((m) => [m.id, m])), [mobs]);

  const completeMoveMutation = useMutation({
    mutationFn: completeMovePlan,
    onSuccess: async () => {
      setNotice("Move completed.");
      await qc.invalidateQueries({ queryKey: ["mob-movement-plans"] });
      await qc.invalidateQueries({ queryKey: ["mobs"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const resolveIssueMutation = useMutation({
    mutationFn: resolveIssue,
    onSuccess: async () => {
      setNotice("Issue resolved.");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const markTaskDoneMutation = useMutation({
    mutationFn: markTaskDone,
    onSuccess: async () => {
      setNotice("Task marked done.");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const markActivityEventDoneMutation = useMutation({
    mutationFn: markActivityEventDone,
    onSuccess: async () => {
      setNotice("Event marked done.");
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (err) => setNotice((err as Error).message),
  });

  const busy =
    completeMoveMutation.isPending ||
    resolveIssueMutation.isPending ||
    markTaskDoneMutation.isPending ||
    markActivityEventDoneMutation.isPending;

  const timeline = useMemo(() => {
    const fromTs = new Date(range.from).getTime();
    const toTsValue = new Date(range.to).getTime();

    const wantsMob = mobFilterId.trim() !== "";
    const wantsPaddock = paddockFilterId.trim() !== "";

    const items: TimelineItem[] = [];

    if (showMoves) {
      for (const plan of movesQuery.data ?? []) {
        const isOpen = isOpenMoveStatus(plan.status);
        if (statusMode === "open" && !isOpen) continue;
        if (statusMode === "done" && isOpen) continue;

        if (wantsMob && plan.mobId !== mobFilterId) continue;
        if (wantsPaddock && plan.toPaddockId !== paddockFilterId && plan.fromPaddockId !== paddockFilterId) continue;

        const tsIso = pickMoveTs(plan);
        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        const mobName = mobById.get(plan.mobId)?.name ?? "Mob";
        const fromName = plan.fromPaddockId ? paddockById.get(plan.fromPaddockId)?.name ?? "" : "";
        const toName = paddockById.get(plan.toPaddockId)?.name ?? "";

        const title = `Move: ${mobName} -> ${toName || "(unknown paddock)"}`;

        const subtitleParts: string[] = [];
        if (fromName) subtitleParts.push(`From: ${fromName}`);
        if (plan.reason) subtitleParts.push(`Reason: ${truncate(plan.reason, 90)}`);

        items.push({
          key: `move:${plan.id}`,
          kind: "MOVE",
          tsIso,
          title,
          subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
          badges: [plan.status],
          plan,
        });
      }
    }

    if (showFeed && statusMode !== "open") {
      for (const e of feedQuery.data ?? []) {
        if (wantsMob && e.mobId !== mobFilterId) continue;
        if (wantsPaddock && e.paddockId !== paddockFilterId) continue;

        const tsIso = e.occurredAt;
        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        const mobName = e.mobId ? mobById.get(e.mobId)?.name ?? "" : "";
        const paddockName = e.paddockId ? paddockById.get(e.paddockId)?.name ?? "" : "";
        const source = e.hayLotId ? "Hay" : e.grainLotId ? "Grain" : "Feed";

        const title = `Feed: ${source} ${e.quantityKg} kg${mobName ? ` (${mobName})` : ""}`;
        const subtitleParts: string[] = [];
        if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);
        if (e.notes) subtitleParts.push(truncate(e.notes, 100));

        items.push({
          key: `feed:${e.id}`,
          kind: "FEED",
          tsIso,
          title,
          subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
          feed: e,
        });
      }
    }

    if (showIssues) {
      for (const i of issuesQuery.data ?? []) {
        const isOpen = isOpenIssueStatus(i.status);
        if (statusMode === "open" && !isOpen) continue;
        if (statusMode === "done" && isOpen) continue;

        if (wantsMob && i.mobId !== mobFilterId) continue;
        if (wantsPaddock && i.paddockId !== paddockFilterId) continue;

        const tsIso = pickIssueTs(i);
        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        const mobName = i.mobId ? mobById.get(i.mobId)?.name ?? "" : "";
        const paddockName = i.paddockId ? paddockById.get(i.paddockId)?.name ?? "" : "";

        const title = `Issue: ${i.title}`;
        const subtitleParts: string[] = [];
        if (i.severity) subtitleParts.push(`Severity: ${i.severity}`);
        if (mobName) subtitleParts.push(`Mob: ${mobName}`);
        if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);
        if (i.description) subtitleParts.push(truncate(i.description, 100));

        items.push({
          key: `issue:${i.id}`,
          kind: "ISSUE",
          tsIso,
          title,
          subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
          badges: [i.status],
          issue: i,
        });
      }
    }

    if (showTasks) {
      for (const t of tasksQuery.data ?? []) {
        const isOpen = isOpenTaskStatus(t.status);
        if (statusMode === "open" && !isOpen) continue;
        if (statusMode === "done" && isOpen) continue;

        if (wantsMob && t.mobId !== mobFilterId) continue;
        if (wantsPaddock && t.paddockId !== paddockFilterId) continue;

        const tsIso = pickTaskTs(t);
        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        const mobName = t.mobId ? mobById.get(t.mobId)?.name ?? "" : "";
        const paddockName = t.paddockId ? paddockById.get(t.paddockId)?.name ?? "" : "";

        const title = `Task: ${t.title}`;
        const subtitleParts: string[] = [];
        if (t.dueAt) subtitleParts.push(`Due: ${toLocale(t.dueAt)}`);
        if (mobName) subtitleParts.push(`Mob: ${mobName}`);
        if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);
        if (t.description) subtitleParts.push(truncate(t.description, 100));

        items.push({
          key: `task:${t.id}`,
          kind: "TASK",
          tsIso,
          title,
          subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
          badges: [t.status],
          task: t,
        });
      }
    }

    if (showPests && statusMode !== "open") {
      for (const p of pestsQuery.data ?? []) {
        if (wantsMob) continue;
        if (wantsPaddock && p.paddockId !== paddockFilterId) continue;

        const tsIso = p.spottedAt;
        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        const paddockName = p.paddockId ? paddockById.get(p.paddockId)?.name ?? "" : "";

        const title = `Pest: ${p.pestType}`;
        const subtitleParts: string[] = [];
        if (p.severity) subtitleParts.push(`Severity: ${p.severity}`);
        if (paddockName) subtitleParts.push(`Paddock: ${paddockName}`);
        if (p.notes) subtitleParts.push(truncate(p.notes, 100));

        items.push({
          key: `pest:${p.id}`,
          kind: "PEST",
          tsIso,
          title,
          subtitle: subtitleParts.length ? subtitleParts.join(" | ") : undefined,
          badges: p.severity ? [p.severity] : undefined,
          pest: p,
        });
      }
    }

    if (showEvents) {
      for (const ev of activityEventsQuery.data ?? []) {
        const isOpen = !ev.actualAt;
        if (statusMode === "open" && !isOpen) continue;
        if (statusMode === "done" && isOpen) continue;

        if (wantsMob && !(ev.entityType === "mobs" && ev.entityId === mobFilterId)) continue;
        if (wantsPaddock && !(ev.entityType === "paddocks" && ev.entityId === paddockFilterId)) continue;

        const tsIso = pickEventTs(ev);
        if (!tsIso) continue;

        const ts = toTs(tsIso);
        if (!inRange(ts, fromTs, toTsValue)) continue;

        let entityName = "Farm";
        if (ev.entityType === "paddocks") {
          entityName = paddockById.get(ev.entityId)?.name ?? "Paddock";
        } else if (ev.entityType === "mobs") {
          entityName = mobById.get(ev.entityId)?.name ?? "Mob";
        }

        const notes = (ev.payloadJson as any)?.notes;

        const subtitleParts: string[] = [];
        subtitleParts.push(`Entity: ${entityName}`);
        if (ev.plannedAt) subtitleParts.push(`Planned: ${toLocale(ev.plannedAt)}`);
        if (ev.actualAt) subtitleParts.push(`Actual: ${toLocale(ev.actualAt)}`);
        if (typeof notes === "string" && notes.trim()) subtitleParts.push(truncate(notes, 110));

        items.push({
          key: `event:${ev.id}`,
          kind: "EVENT",
          tsIso,
          title: `Event: ${ev.eventType}`,
          subtitle: subtitleParts.join(" | "),
          badges: [isOpen ? "PLANNED" : "DONE"],
          event: ev,
        });
      }
    }

    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) => {
          const hay = `${it.title} ${it.subtitle ?? ""} ${(it.badges ?? []).join(" ")}`.toLowerCase();
          return hay.includes(q);
        })
      : items;

    filtered.sort((a, b) => (b.tsIso ?? "").localeCompare(a.tsIso ?? ""));
    return filtered.slice(0, 250);
  }, [
    activityEventsQuery.data,
    feedQuery.data,
    issuesQuery.data,
    mobById,
    mobFilterId,
    movesQuery.data,
    paddockById,
    paddockFilterId,
    pestsQuery.data,
    range.from,
    range.to,
    search,
    showEvents,
    showFeed,
    showIssues,
    showMoves,
    showPests,
    showTasks,
    statusMode,
    tasksQuery.data,
  ]);

  const loadingAny =
    movesQuery.isLoading ||
    feedQuery.isLoading ||
    issuesQuery.isLoading ||
    tasksQuery.isLoading ||
    pestsQuery.isLoading ||
    activityEventsQuery.isLoading;

  const errorMsgs = [
    movesQuery.isError ? `Moves: ${(movesQuery.error as Error).message}` : null,
    feedQuery.isError ? `Feed: ${(feedQuery.error as Error).message}` : null,
    issuesQuery.isError ? `Issues: ${(issuesQuery.error as Error).message}` : null,
    tasksQuery.isError ? `Tasks: ${(tasksQuery.error as Error).message}` : null,
    pestsQuery.isError ? `Pests: ${(pestsQuery.error as Error).message}` : null,
    activityEventsQuery.isError ? `Events: ${(activityEventsQuery.error as Error).message}` : null,
  ].filter(Boolean) as string[];

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Timeline</h3>
          <p className="muted">Unified farm timeline: moves, feed, issues, tasks, pests, and activity events.</p>
        </div>

        <div className="actions">
          <div className="pill">
            {timeline.length} items | Range: {pastDays}d past / {futureDays}d future
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void movesQuery.refetch();
              void feedQuery.refetch();
              void issuesQuery.refetch();
              void tasksQuery.refetch();
              void pestsQuery.refetch();
              void activityEventsQuery.refetch();
              void mobsQuery.refetch();
              void paddocksQuery.refetch();
            }}
            disabled={
              busy ||
              movesQuery.isFetching ||
              feedQuery.isFetching ||
              issuesQuery.isFetching ||
              tasksQuery.isFetching ||
              pestsQuery.isFetching ||
              activityEventsQuery.isFetching
            }
          >
            Refresh
          </button>
        </div>
      </header>

      {notice ? (
        <div className="pill" style={{ marginTop: 10 }}>
          {notice}
        </div>
      ) : null}

      <div className="actions" style={{ alignItems: "flex-end" }}>
        <label className="label" style={{ minWidth: 150 }}>
          Past days
          <select className="input" value={pastDays} onChange={(e) => setPastDays(Number(e.target.value))} disabled={busy}>
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
            <option value={180}>180</option>
            <option value={365}>365</option>
          </select>
        </label>

        <label className="label" style={{ minWidth: 150 }}>
          Future days
          <select className="input" value={futureDays} onChange={(e) => setFutureDays(Number(e.target.value))} disabled={busy}>
            <option value={0}>0</option>
            <option value={7}>7</option>
            <option value={14}>14</option>
            <option value={30}>30</option>
            <option value={90}>90</option>
            <option value={180}>180</option>
          </select>
        </label>

        <label className="label" style={{ minWidth: 150 }}>
          Status
          <select className="input" value={statusMode} onChange={(e) => setStatusMode(e.target.value as StatusMode)} disabled={busy}>
            <option value="all">All</option>
            <option value="open">Open / planned</option>
            <option value="done">Done / completed</option>
          </select>
        </label>

        <label className="label" style={{ minWidth: 220 }}>
          Mob
          <select className="input" value={mobFilterId} onChange={(e) => setMobFilterId(e.target.value)} disabled={busy}>
            <option value="">(all)</option>
            {mobs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="label" style={{ minWidth: 220 }}>
          Paddock
          <select className="input" value={paddockFilterId} onChange={(e) => setPaddockFilterId(e.target.value)} disabled={busy}>
            <option value="">(all)</option>
            {paddocks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="label" style={{ minWidth: 260 }}>
          Search
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter timeline" disabled={busy} />
        </label>

        <div className="actions" style={{ marginTop: 0 }}>
          <button className={showMoves ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowMoves((v) => !v)} disabled={busy}>
            Moves
          </button>
          <button className={showFeed ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowFeed((v) => !v)} disabled={busy}>
            Feed
          </button>
          <button className={showIssues ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowIssues((v) => !v)} disabled={busy}>
            Issues
          </button>
          <button className={showTasks ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowTasks((v) => !v)} disabled={busy}>
            Tasks
          </button>
          <button className={showPests ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowPests((v) => !v)} disabled={busy}>
            Pests
          </button>
          <button className={showEvents ? "btn btnPrimary" : "btn"} type="button" onClick={() => setShowEvents((v) => !v)} disabled={busy}>
            Events
          </button>
        </div>
      </div>

      {loadingAny ? <p className="muted">Loading timeline...</p> : null}

      {errorMsgs.length ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {errorMsgs.join("\n")}
        </div>
      ) : null}

      {!loadingAny && timeline.length === 0 ? <p className="muted">No items in this range.</p> : null}

      {timeline.length ? (
        <div className="timeline" style={{ marginTop: 10 }}>
          {timeline.map((item) => {
            const showCompleteMove = item.kind === "MOVE" && isOpenMoveStatus(item.plan.status);
            const showResolveIssue = item.kind === "ISSUE" && isOpenIssueStatus(item.issue.status);
            const showDoneTask = item.kind === "TASK" && isOpenTaskStatus(item.task.status);
            const showDoneEvent = item.kind === "EVENT" && !item.event.actualAt;

            const focus = (() => {
              if (item.kind === "MOVE") {
                return { kind: "PADDOCK", paddockId: item.plan.toPaddockId } as const;
              }

              if (item.kind === "FEED") {
                if (item.feed.feederId) return { kind: "FEEDER", feederId: item.feed.feederId } as const;
                if (item.feed.paddockId) return { kind: "PADDOCK", paddockId: item.feed.paddockId } as const;
                if (item.feed.mobId) return { kind: "MOB", mobId: item.feed.mobId } as const;
                return null;
              }

              if (item.kind === "ISSUE") {
                return { kind: "ISSUE", issueId: item.issue.id } as const;
              }

              if (item.kind === "TASK") {
                if (item.task.paddockId) return { kind: "PADDOCK", paddockId: item.task.paddockId } as const;
                if (item.task.mobId) return { kind: "MOB", mobId: item.task.mobId } as const;
                return null;
              }

              if (item.kind === "PEST") {
                if (item.pest.locationGeoJson) {
                  return {
                    kind: "GEOJSON_POINT",
                    geoJson: item.pest.locationGeoJson,
                    label: `Pest: ${item.pest.pestType}`
                  } as const;
                }
                if (item.pest.paddockId) return { kind: "PADDOCK", paddockId: item.pest.paddockId } as const;
                return null;
              }

              if (item.kind === "EVENT") {
                if (item.event.entityType === "mobs") return { kind: "MOB", mobId: item.event.entityId } as const;
                if (item.event.entityType === "paddocks") return { kind: "PADDOCK", paddockId: item.event.entityId } as const;
                return null;
              }

              return null;
            })();

            return (
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
                    {item.subtitle ? <span className="muted" style={{ fontSize: 12 }}>{item.subtitle}</span> : null}
                  </div>

                  {focus ? (
                    <div className="actions" style={{ marginTop: 8 }}>
                      <button className="btn" type="button" onClick={() => seeOnMap(focus)} disabled={busy}>
                        See on map
                      </button>
                    </div>
                  ) : null}

                  {showCompleteMove || showResolveIssue || showDoneTask || showDoneEvent ? (
                    <div className="actions" style={{ marginTop: 10 }}>
                      {showCompleteMove ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm("Complete this move now?")) return;
                            void completeMoveMutation.mutateAsync(item.plan);
                          }}
                          disabled={busy}
                        >
                          Complete move
                        </button>
                      ) : null}

                      {showResolveIssue ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm("Resolve this issue?")) return;
                            void resolveIssueMutation.mutateAsync(item.issue);
                          }}
                          disabled={busy}
                        >
                          Resolve issue
                        </button>
                      ) : null}

                      {showDoneTask ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm("Mark this task done?")) return;
                            void markTaskDoneMutation.mutateAsync(item.task);
                          }}
                          disabled={busy}
                        >
                          Mark task done
                        </button>
                      ) : null}

                      {showDoneEvent ? (
                        <button
                          className="btn"
                          type="button"
                          onClick={() => {
                            if (!confirm("Mark this event done now?")) return;
                            void markActivityEventDoneMutation.mutateAsync(item.event);
                          }}
                          disabled={busy}
                        >
                          Mark event done
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div className="pill" style={{ marginTop: 10 }}>
            Showing up to 250 items. Use filters to narrow.
          </div>
        </div>
      ) : null}
    </section>
  );
}

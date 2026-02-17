import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type {
  ActivityEvent,
  ApiListResponse,
  ApiSingleResponse,
  Mob,
  Paddock,
} from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";


function canFocusEventOnMap(ev: ActivityEvent): boolean {
  return ev.entityType === "mobs" || ev.entityType === "paddocks";
}

function focusEventOnMap(ev: ActivityEvent): void {
  if (ev.entityType === "mobs") {
    seeOnMap({ kind: "MOB", mobId: ev.entityId });
    return;
  }

  if (ev.entityType === "paddocks") {
    seeOnMap({ kind: "PADDOCK", paddockId: ev.entityId });
  }
}

function createUuid(): string {
  return createStableUuid();
}

type StoredUser = { id: string; farmId: string; displayName: string; role: string };

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

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function toLocale(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString();
}

function pickDisplayTs(ev: ActivityEvent): string {
  return ev.actualAt ?? ev.plannedAt ?? ev.createdAt;
}

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function extractNotes(payloadJson: unknown): string {
  if (!isPlainObject(payloadJson)) return "";
  const notes = payloadJson.notes;
  return typeof notes === "string" ? notes : "";
}

function buildPayloadJson(notes: string, existing: unknown | null | undefined): unknown | null {
  const trimmed = notes.trim();
  if (!trimmed) return null;

  const base = isPlainObject(existing) ? existing : {};
  return { ...base, notes: trimmed };
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

type ActivityEventListParams = {
  from: string;
  to: string;
  when: "any" | "planned" | "actual";
};

async function getActivityEvents(params: ActivityEventListParams): Promise<ActivityEvent[]> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    when: params.when,
    limit: "1000",
    order: "desc",
  });

  try {
    const response = await apiFetch<ApiListResponse<ActivityEvent>>(`/activity-events?${qs.toString()}`);
    await upsertEntities("activity_events", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<ActivityEvent>("activity_events");
    if (!cached.length) throw err;

    const from = new Date(params.from).getTime();
    const to = new Date(params.to).getTime();

    const inRange = (iso: string | null | undefined): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return false;
      return t >= from && t <= to;
    };

    const filtered = cached.filter((ev) => {
      if (params.when === "planned") return inRange(ev.plannedAt);
      if (params.when === "actual") return inRange(ev.actualAt);
      return inRange(ev.plannedAt) || inRange(ev.actualAt) || inRange(ev.createdAt);
    });

    filtered.sort((a, b) => {
      if (params.when === "planned") return (b.plannedAt ?? "").localeCompare(a.plannedAt ?? "");
      if (params.when === "actual") return (b.actualAt ?? "").localeCompare(a.actualAt ?? "");
      return pickDisplayTs(b).localeCompare(pickDisplayTs(a));
    });

    return filtered;
  }
}

type CreateActivityEventInput = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  plannedAt?: string | null;
  actualAt?: string | null;
  payloadJson?: unknown | null;
};

type UpdateActivityEventInput = {
  entityType?: string;
  entityId?: string;
  eventType?: string;
  plannedAt?: string | null;
  actualAt?: string | null;
  payloadJson?: unknown | null;
};

async function createActivityEvent(input: CreateActivityEventInput): Promise<ActivityEvent> {
  try {
    const response = await apiFetch<ApiSingleResponse<ActivityEvent>>("/activity-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: ActivityEvent = {
      id: input.id,
      farmId: getFarmId(),
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      plannedAt: input.plannedAt ?? null,
      actualAt: input.actualAt ?? null,
      payloadJson: input.payloadJson ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("activity_events", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      entityType: local.entityType,
      entityId: local.entityId,
      eventType: local.eventType,
    };

    if (typeof local.plannedAt === "string") actionData.plannedAt = local.plannedAt;
    if (typeof local.actualAt === "string") actionData.actualAt = local.actualAt;
    if (local.payloadJson !== null) actionData.payloadJson = local.payloadJson;

    await enqueueAction({
      entity: "activity_events",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateActivityEvent(args: { activityEventId: string; input: UpdateActivityEventInput }): Promise<ActivityEvent> {
  try {
    const response = await apiFetch<ApiSingleResponse<ActivityEvent>>(`/activity-events/${args.activityEventId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<ActivityEvent>("activity_events");
    const existing = cached.find((e) => e.id === args.activityEventId) ?? null;

    const local: ActivityEvent = {
      id: args.activityEventId,
      farmId: existing?.farmId ?? getFarmId(),
      entityType: args.input.entityType ?? existing?.entityType ?? "farm",
      entityId: (args.input.entityId ?? existing?.entityId ?? getFarmId()) as string,
      eventType: args.input.eventType ?? existing?.eventType ?? "Event",
      plannedAt: args.input.plannedAt !== undefined ? (args.input.plannedAt ?? null) : (existing?.plannedAt ?? null),
      actualAt: args.input.actualAt !== undefined ? (args.input.actualAt ?? null) : (existing?.actualAt ?? null),
      payloadJson:
        args.input.payloadJson !== undefined
          ? (args.input.payloadJson ?? null)
          : (existing?.payloadJson ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("activity_events", [local as any]);

    await enqueueAction({
      entity: "activity_events",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteActivityEvent(activityEventId: string): Promise<void> {
  try {
    await apiFetch<void>(`/activity-events/${activityEventId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("activity_events", activityEventId);

    await enqueueAction({
      entity: "activity_events",
      op: "DELETE",
      data: { id: activityEventId },
    });
  }
}

type Scope = "farm" | "paddocks" | "mobs";

type ViewMode = "timeline" | "calendar";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date): Date {
  const firstNext = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return new Date(firstNext.getTime() - 1);
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function ActivityEventsPage() {
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  const [when, setWhen] = useState<ActivityEventListParams["when"]>("any");

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));

  const [timelinePastDays, setTimelinePastDays] = useState(30);
  const [timelineFutureDays, setTimelineFutureDays] = useState(30);

  const range = useMemo(() => {
    if (viewMode === "calendar") {
      const from = startOfMonth(month);
      const to = endOfMonth(month);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    const now = new Date();
    const from = new Date(now.getTime() - timelinePastDays * 86_400_000);
    const to = new Date(now.getTime() + timelineFutureDays * 86_400_000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [month, timelineFutureDays, timelinePastDays, viewMode]);

  const eventsQuery = useQuery({
    queryKey: ["activity-events", range, when],
    queryFn: () => getActivityEvents({ from: range.from, to: range.to, when }),
    staleTime: 20_000,
  });

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

  const paddocks = useMemo(() => {
    return (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [paddocksQuery.data]);

  const mobs = useMemo(() => {
    return (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [mobsQuery.data]);

  const paddockById = useMemo(() => new Map(paddocks.map((p) => [p.id, p])), [paddocks]);
  const mobById = useMemo(() => new Map(mobs.map((m) => [m.id, m])), [mobs]);

  const events = useMemo(() => {
    const list = (eventsQuery.data ?? []).slice();
    list.sort((a, b) => pickDisplayTs(b).localeCompare(pickDisplayTs(a)));
    return list;
  }, [eventsQuery.data]);

  const [editing, setEditing] = useState<ActivityEvent | null>(null);

  const [eventType, setEventType] = useState("");
  const [scope, setScope] = useState<Scope>("farm");
  const [scopeId, setScopeId] = useState("");
  const [plannedAtLocal, setPlannedAtLocal] = useState("");
  const [actualAtLocal, setActualAtLocal] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: createActivityEvent,
    onSuccess: async () => {
      setEditing(null);
      setEventType("");
      setNotes("");
      setPlannedAtLocal("");
      setActualAtLocal("");
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateActivityEvent,
    onSuccess: async () => {
      setEditing(null);
      setEventType("");
      setNotes("");
      setPlannedAtLocal("");
      setActualAtLocal("");
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteActivityEvent,
    onSuccess: async (_data, id) => {
      if (editing?.id === id) {
        setEditing(null);
        setEventType("");
        setNotes("");
        setPlannedAtLocal("");
        setActualAtLocal("");
      }
      await qc.invalidateQueries({ queryKey: ["activity-events"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const entityLabel = (ev: ActivityEvent): string => {
    if (ev.entityType === "farm") return "Farm";
    if (ev.entityType === "paddocks") return paddockById.get(ev.entityId)?.name ?? "Paddock";
    if (ev.entityType === "mobs") return mobById.get(ev.entityId)?.name ?? "Mob";
    return `${ev.entityType}:${ev.entityId}`;
  };

  const nowIso = new Date().toISOString();

  const overdue = useMemo(() => {
    const list = events.filter((e) => !e.actualAt && e.plannedAt && e.plannedAt < nowIso);
    list.sort((a, b) => (a.plannedAt ?? "").localeCompare(b.plannedAt ?? ""));
    return list;
  }, [events, nowIso]);

  const upcoming = useMemo(() => {
    const list = events.filter((e) => !e.actualAt && e.plannedAt && e.plannedAt >= nowIso);
    list.sort((a, b) => (a.plannedAt ?? "").localeCompare(b.plannedAt ?? ""));
    return list;
  }, [events, nowIso]);

  const completed = useMemo(() => {
    const list = events.filter((e) => !!e.actualAt);
    list.sort((a, b) => (b.actualAt ?? "").localeCompare(a.actualAt ?? ""));
    return list;
  }, [events]);

  const calendarCells = useMemo(() => {
    const first = startOfMonth(month);
    const startOffset = first.getDay();
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - startOffset, 0, 0, 0, 0);

    const cells: Array<{ date: Date; inMonth: boolean; key: string }> = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      cells.push({
        date: d,
        inMonth: d.getMonth() === month.getMonth(),
        key,
      });
    }

    return cells;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();

    for (const ev of events) {
      const ts = pickDisplayTs(ev);
      const key = dayKeyFromIso(ts);
      if (!key) continue;

      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }

    for (const [key, list] of map) {
      list.sort((a, b) => pickDisplayTs(b).localeCompare(pickDisplayTs(a)));
      map.set(key, list);
    }

    return map;
  }, [events]);

  const [selectedDay, setSelectedDay] = useState<string>(() => dayKeyFromIso(new Date().toISOString()));

  const selectedDayEvents = useMemo(() => {
    const list = eventsByDay.get(selectedDay) ?? [];
    return list;
  }, [eventsByDay, selectedDay]);

  const submitForm = () => {
    const trimmedType = eventType.trim();
    if (!trimmedType) return;

    const plannedAt = fromDatetimeLocalValue(plannedAtLocal);
    const actualAt = fromDatetimeLocalValue(actualAtLocal);

    if (!plannedAt && !actualAt) return;

    let entityType: string;
    let entityId: string;

    if (scope === "farm") {
      entityType = "farm";
      entityId = getFarmId();
    } else {
      entityType = scope;
      entityId = scopeId;
      if (!entityId) return;
    }

    const nextPayloadJson = buildPayloadJson(notes, editing?.payloadJson);

    if (editing) {
      void updateMutation.mutateAsync({
        activityEventId: editing.id,
        input: {
          entityType,
          entityId,
          eventType: trimmedType,
          plannedAt,
          actualAt,
          payloadJson: nextPayloadJson,
        },
      });
      return;
    }

    void createMutation.mutateAsync({
      id: createUuid(),
      entityType,
      entityId,
      eventType: trimmedType,
      plannedAt,
      actualAt,
      payloadJson: nextPayloadJson,
    });
  };

  const startEdit = (ev: ActivityEvent) => {
    setEditing(ev);
    setEventType(ev.eventType);
    setPlannedAtLocal(toDatetimeLocalValue(ev.plannedAt ?? null));
    setActualAtLocal(toDatetimeLocalValue(ev.actualAt ?? null));
    setNotes(extractNotes(ev.payloadJson));

    if (ev.entityType === "paddocks") {
      setScope("paddocks");
      setScopeId(ev.entityId);
    } else if (ev.entityType === "mobs") {
      setScope("mobs");
      setScopeId(ev.entityId);
    } else {
      setScope("farm");
      setScopeId("");
    }
  };

  const markDoneNow = (ev: ActivityEvent) => {
    const now = new Date().toISOString();

    void updateMutation.mutateAsync({
      activityEventId: ev.id,
      input: {
        actualAt: now,
      },
    });
  };

  const resetForm = () => {
    setEditing(null);
    setEventType("");
    setNotes("");
    setPlannedAtLocal("");
    setActualAtLocal("");
  };

  const dayList = viewMode === "calendar" ? selectedDayEvents : events;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Events</h3>
          <p className="muted">Plan and record work. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <div className="pill">
            {viewMode === "calendar" ? `${formatMonthLabel(month)}` : `Range: ${timelinePastDays}d past / ${timelineFutureDays}d future`}
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              void eventsQuery.refetch();
              void paddocksQuery.refetch();
              void mobsQuery.refetch();
            }}
            disabled={eventsQuery.isFetching || paddocksQuery.isFetching || mobsQuery.isFetching}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="actions" style={{ alignItems: "center" }}>
        <button
          className={viewMode === "timeline" ? "btn btnPrimary" : "btn"}
          type="button"
          onClick={() => setViewMode("timeline")}
          disabled={busy}
        >
          Timeline
        </button>
        <button
          className={viewMode === "calendar" ? "btn btnPrimary" : "btn"}
          type="button"
          onClick={() => setViewMode("calendar")}
          disabled={busy}
        >
          Calendar
        </button>

        <label className="label" style={{ minWidth: 200 }}>
          Show
          <select className="input" value={when} onChange={(e) => setWhen(e.target.value as any)}>
            <option value="any">Planned + actual</option>
            <option value="planned">Planned only</option>
            <option value="actual">Actual only</option>
          </select>
        </label>

        {viewMode === "timeline" ? (
          <>
            <label className="label" style={{ minWidth: 160 }}>
              Past days
              <select
                className="input"
                value={timelinePastDays}
                onChange={(e) => setTimelinePastDays(Number(e.target.value))}
              >
                <option value={7}>7</option>
                <option value={14}>14</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
                <option value={180}>180</option>
              </select>
            </label>
            <label className="label" style={{ minWidth: 160 }}>
              Future days
              <select
                className="input"
                value={timelineFutureDays}
                onChange={(e) => setTimelineFutureDays(Number(e.target.value))}
              >
                <option value={7}>7</option>
                <option value={14}>14</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
                <option value={180}>180</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <button className="btn" type="button" onClick={() => setMonth((m) => addMonths(m, -1))}>
              Prev
            </button>
            <button className="btn" type="button" onClick={() => setMonth((m) => addMonths(m, 1))}>
              Next
            </button>
            <button className="btn" type="button" onClick={() => setMonth(startOfMonth(new Date()))}>
              Today
            </button>
          </>
        )}
      </div>

      {eventsQuery.isLoading ? <p className="muted">Loading events...</p> : null}
      {eventsQuery.isError ? <div className="alert">Failed to load events: {(eventsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        style={{ marginTop: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        <div className="row3">
          <label className="label">
            Event type
            <input
              className="input"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="e.g. Spray, Weigh, Drench"
              required
            />
          </label>

          <label className="label">
            Link to
            <select
              className="input"
              value={scope}
              onChange={(e) => {
                const next = e.target.value as Scope;
                setScope(next);
                setScopeId("");
              }}
            >
              <option value="farm">Farm</option>
              <option value="paddocks">Paddock</option>
              <option value="mobs">Mob</option>
            </select>
          </label>

          <label className="label">
            Entity
            {scope === "farm" ? (
              <input className="input" value="Farm" disabled />
            ) : scope === "paddocks" ? (
              <select className="input" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                <option value="">Select paddock...</option>
                {paddocks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <select className="input" value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                <option value="">Select mob...</option>
                {mobs.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Planned at
            <input
              className="input"
              value={plannedAtLocal}
              onChange={(e) => setPlannedAtLocal(e.target.value)}
              type="datetime-local"
            />
          </label>

          <label className="label">
            Actual at
            <input
              className="input"
              value={actualAtLocal}
              onChange={(e) => setActualAtLocal(e.target.value)}
              type="datetime-local"
            />
          </label>

          <div />
        </div>

        <label className="label" style={{ marginTop: 10 }}>
          Notes
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
        </label>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !eventType.trim()}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Event"}
          </button>
          {editing ? (
            <button className="btn" type="button" onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          ) : null}

          {!editing ? (
            <div className="pill">
              Need one of: Planned at, Actual at
            </div>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      {editing ? <AttachmentsPanel entityType="ACTIVITY_EVENT" entityId={editing.id} disabled={busy} /> : null}


      <div className="hr" />

      {viewMode === "timeline" ? (
        <>
          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Overdue</h4>
          {overdue.length === 0 ? <p className="muted">No overdue planned events.</p> : null}
          {overdue.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Planned</th>
                    <th>Event</th>
                    <th>Entity</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map((ev) => (
                    <tr key={ev.id}>
                      <td className="muted">{toLocale(ev.plannedAt)}</td>
                      <td className="mono">{ev.eventType}</td>
                      <td className="muted">{entityLabel(ev)}</td>
                      <td className="muted">{extractNotes(ev.payloadJson)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          <button className="btn" type="button" onClick={() => markDoneNow(ev)} disabled={busy}>
                            Mark done
                          </button>
                          {canFocusEventOnMap(ev) ? (
                            <button className="btn" type="button" onClick={() => focusEventOnMap(ev)} disabled={busy}>
                              See on map
                            </button>
                          ) : null}
                          <button className="btn" type="button" onClick={() => startEdit(ev)} disabled={busy}>
                            Edit
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              if (!confirm("Delete this event?") ) return;
                              void deleteMutation.mutateAsync(ev.id);
                            }}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="hr" />

          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Upcoming</h4>
          {upcoming.length === 0 ? <p className="muted">No upcoming planned events.</p> : null}
          {upcoming.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Planned</th>
                    <th>Event</th>
                    <th>Entity</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((ev) => (
                    <tr key={ev.id}>
                      <td className="muted">{toLocale(ev.plannedAt)}</td>
                      <td className="mono">{ev.eventType}</td>
                      <td className="muted">{entityLabel(ev)}</td>
                      <td className="muted">{extractNotes(ev.payloadJson)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          <button className="btn" type="button" onClick={() => markDoneNow(ev)} disabled={busy}>
                            Mark done
                          </button>
                          {canFocusEventOnMap(ev) ? (
                            <button className="btn" type="button" onClick={() => focusEventOnMap(ev)} disabled={busy}>
                              See on map
                            </button>
                          ) : null}
                          <button className="btn" type="button" onClick={() => startEdit(ev)} disabled={busy}>
                            Edit
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              if (!confirm("Delete this event?") ) return;
                              void deleteMutation.mutateAsync(ev.id);
                            }}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="hr" />

          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Completed</h4>
          {completed.length === 0 ? <p className="muted">No completed events in this range.</p> : null}
          {completed.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Actual</th>
                    <th>Event</th>
                    <th>Entity</th>
                    <th>Planned</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map((ev) => (
                    <tr key={ev.id}>
                      <td className="muted">{toLocale(ev.actualAt)}</td>
                      <td className="mono">{ev.eventType}</td>
                      <td className="muted">{entityLabel(ev)}</td>
                      <td className="muted">{ev.plannedAt ? toLocale(ev.plannedAt) : ""}</td>
                      <td className="muted">{extractNotes(ev.payloadJson)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div className="actions" style={{ justifyContent: "flex-end" }}>
                          {canFocusEventOnMap(ev) ? (
                            <button className="btn" type="button" onClick={() => focusEventOnMap(ev)} disabled={busy}>
                              See on map
                            </button>
                          ) : null}
                          <button className="btn" type="button" onClick={() => startEdit(ev)} disabled={busy}>
                            Edit
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              if (!confirm("Delete this event?") ) return;
                              void deleteMutation.mutateAsync(ev.id);
                            }}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="calendarGrid" style={{ marginTop: 10 }}>
            {[
              "Sun",
              "Mon",
              "Tue",
              "Wed",
              "Thu",
              "Fri",
              "Sat",
            ].map((d) => (
              <div key={d} className="calendarDow">
                {d}
              </div>
            ))}

            {calendarCells.map((cell) => {
              const list = eventsByDay.get(cell.key) ?? [];
              const isSelected = selectedDay === cell.key;

              return (
                <button
                  key={cell.key}
                  type="button"
                  className={
                    isSelected
                      ? "calendarDay calendarDayActive"
                      : cell.inMonth
                        ? "calendarDay"
                        : "calendarDay calendarDayMuted"
                  }
                  onClick={() => setSelectedDay(cell.key)}
                >
                  <div className="calendarDayTop">
                    <div className="calendarDayNum">{cell.date.getDate()}</div>
                    {list.length ? <div className="calendarDayCount">{list.length}</div> : null}
                  </div>

                  <div className="calendarChips">
                    {list.slice(0, 3).map((ev) => (
                      <div key={ev.id} className={ev.actualAt ? "chip chipDone" : "chip chipPlanned"}>
                        {ev.eventType}
                      </div>
                    ))}
                    {list.length > 3 ? <div className="muted mono" style={{ fontSize: 11 }}>+{list.length - 3} more</div> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="hr" />

          <h4 style={{ margin: "0 0 8px", fontFamily: "var(--font-display)" }}>Day: {selectedDay}</h4>

          {dayList.length === 0 ? <p className="muted">No events on this day.</p> : null}

          {dayList.length ? (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Entity</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dayList.map((ev) => {
                    const whenStr = toLocale(pickDisplayTs(ev));
                    const status = ev.actualAt ? "DONE" : "PLANNED";

                    return (
                      <tr key={ev.id}>
                        <td className="muted">{whenStr}</td>
                        <td className="mono">{ev.eventType}</td>
                        <td className="muted">{entityLabel(ev)}</td>
                        <td>
                          <span className="badge">{status}</span>
                        </td>
                        <td className="muted">{extractNotes(ev.payloadJson)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div className="actions" style={{ justifyContent: "flex-end" }}>
                            {!ev.actualAt ? (
                              <button className="btn" type="button" onClick={() => markDoneNow(ev)} disabled={busy}>
                                Mark done
                              </button>
                            ) : null}
                            {canFocusEventOnMap(ev) ? (
                            <button className="btn" type="button" onClick={() => focusEventOnMap(ev)} disabled={busy}>
                              See on map
                            </button>
                          ) : null}
                          <button className="btn" type="button" onClick={() => startEdit(ev)} disabled={busy}>
                              Edit
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => {
                                if (!confirm("Delete this event?") ) return;
                                void deleteMutation.mutateAsync(ev.id);
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
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      {deleteMutation.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {(deleteMutation.error as Error).message}
        </div>
      ) : null}
    </section>
  );
}

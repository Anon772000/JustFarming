import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Mob, Paddock, Task, TaskStatus, User } from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { PREFILL_SELECTED_TASK_ID_KEY, seeOnMap } from "../../../ui/navigation";

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

function getUserId(): string {
  return getStoredUser()?.id ?? "00000000-0000-0000-0000-000000000000";
}

function isManager(): boolean {
  return (getStoredUser()?.role ?? "").toLowerCase() === "manager";
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

  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d.toISOString();
}

async function getTasks(): Promise<Task[]> {
  try {
    const response = await apiFetch<ApiListResponse<Task>>("/tasks");
    await upsertEntities("tasks", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Task>("tasks");
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

async function getUsers(): Promise<User[]> {
  // Listing users is manager-only.
  if (!isManager()) return [];

  try {
    const response = await apiFetch<ApiListResponse<User>>("/users");
    return response.data;
  } catch {
    return [];
  }
}

type CreateTaskInput = {
  id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueAt?: string | null;
  paddockId?: string | null;
  mobId?: string | null;
  assignedToId?: string | null;
};

type UpdateTaskInput = {
  title?: string;
  description?: string;
  status?: TaskStatus;
  dueAt?: string | null;
  paddockId?: string | null;
  mobId?: string | null;
  assignedToId?: string | null;
};

async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    const response = await apiFetch<ApiSingleResponse<Task>>("/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const status: TaskStatus = input.status ?? "OPEN";

    const local: Task = {
      id: input.id,
      farmId: getFarmId(),
      title: input.title,
      description: input.description ?? null,
      status,
      dueAt: typeof input.dueAt === "string" ? input.dueAt : null,
      paddockId: typeof input.paddockId === "string" ? input.paddockId : null,
      mobId: typeof input.mobId === "string" ? input.mobId : null,
      createdById: getUserId(),
      assignedToId: typeof input.assignedToId === "string" ? input.assignedToId : null,
      completedAt: status === "DONE" ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("tasks", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      title: local.title,
      status: local.status,
    };

    if (input.description) actionData.description = input.description;
    if (typeof input.dueAt === "string") actionData.dueAt = input.dueAt;
    if (typeof input.paddockId === "string") actionData.paddockId = input.paddockId;
    if (typeof input.mobId === "string") actionData.mobId = input.mobId;
    if (typeof input.assignedToId === "string") actionData.assignedToId = input.assignedToId;

    await enqueueAction({
      entity: "tasks",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateTask(args: { taskId: string; input: UpdateTaskInput }): Promise<Task> {
  try {
    const response = await apiFetch<ApiSingleResponse<Task>>(`/tasks/${args.taskId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Task>("tasks");
    const existing = cached.find((t) => t.id === args.taskId) ?? null;

    const nextStatus: TaskStatus = args.input.status ?? existing?.status ?? "OPEN";

    const completedAt =
      args.input.status !== undefined
        ? nextStatus === "DONE"
          ? existing?.completedAt ?? now
          : null
        : (existing?.completedAt ?? null);

    const local: Task = {
      id: args.taskId,
      farmId: existing?.farmId ?? getFarmId(),
      title: args.input.title ?? existing?.title ?? "Task",
      description: args.input.description ?? existing?.description ?? null,
      status: nextStatus,
      dueAt: args.input.dueAt !== undefined ? args.input.dueAt ?? null : (existing?.dueAt ?? null),
      paddockId:
        args.input.paddockId !== undefined
          ? (args.input.paddockId ?? null)
          : (existing?.paddockId ?? null),
      mobId:
        args.input.mobId !== undefined
          ? (args.input.mobId ?? null)
          : (existing?.mobId ?? null),
      createdById: existing?.createdById ?? getUserId(),
      assignedToId:
        args.input.assignedToId !== undefined
          ? (args.input.assignedToId ?? null)
          : (existing?.assignedToId ?? null),
      completedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("tasks", [local as any]);

    await enqueueAction({
      entity: "tasks",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteTask(taskId: string): Promise<void> {
  try {
    await apiFetch<void>(`/tasks/${taskId}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("tasks", taskId);

    await enqueueAction({
      entity: "tasks",
      op: "DELETE",
      data: { id: taskId },
    });
  }
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function TasksPage() {
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
    staleTime: 30_000,
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

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
    staleTime: 60_000,
    enabled: isManager(),
  });

  const [prefillTaskId, setPrefillTaskId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_TASK_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_TASK_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const [editing, setEditing] = useState<Task | null>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>("OPEN");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueAtLocal, setDueAtLocal] = useState("");
  const [paddockId, setPaddockId] = useState("");
  const [mobId, setMobId] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!prefillTaskId) return;

    const task = (tasksQuery.data ?? []).find((t) => t.id === prefillTaskId) ?? null;

    // Wait for initial load before giving up, otherwise we'd drop the deep link while data is still loading.
    if (!task) {
      if (tasksQuery.isLoading) return;
      setPrefillTaskId("");
      return;
    }

    setEditing(task);
    setTitle(task.title);
    setStatus(task.status);
    setAssignedToId(task.assignedToId ?? "");
    setDueAtLocal(toDatetimeLocalValue(task.dueAt ?? null));
    setPaddockId(task.paddockId ?? "");
    setMobId(task.mobId ?? "");
    setDescription(task.description ?? "");
    setPrefillTaskId("");
  }, [prefillTaskId, tasksQuery.data, tasksQuery.isLoading]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: async () => {
      setTitle("");
      setStatus("OPEN");
      setAssignedToId("");
      setDueAtLocal("");
      setPaddockId("");
      setMobId("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTask,
    onSuccess: async () => {
      setEditing(null);
      setTitle("");
      setStatus("OPEN");
      setAssignedToId("");
      setDueAtLocal("");
      setPaddockId("");
      setMobId("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: async (_data, taskIdArg) => {
      if (editing?.id === taskIdArg) {
        setEditing(null);
        setTitle("");
        setStatus("OPEN");
        setAssignedToId("");
        setDueAtLocal("");
        setPaddockId("");
        setMobId("");
        setDescription("");
      }
      await qc.invalidateQueries({ queryKey: ["tasks"] });
    },
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

  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of usersQuery.data ?? []) m.set(u.id, u);
    return m;
  }, [usersQuery.data]);

  const sorted = useMemo(() => {
    return (tasksQuery.data ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [tasksQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  const me = getStoredUser();

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Tasks</h3>
          <p className="muted">Create tasks, assign them, and track completion. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void tasksQuery.refetch()} disabled={tasksQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {tasksQuery.isLoading ? <p className="muted">Loading tasks...</p> : null}
      {tasksQuery.isError ? (
        <div className="alert">Failed to load tasks: {(tasksQuery.error as Error).message}</div>
      ) : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedTitle = title.trim();
          if (!trimmedTitle) return;

          const dueAtIso = fromDatetimeLocalValue(dueAtLocal);

          const assigned = isManager()
            ? (assignedToId ? assignedToId : null)
            : editing
              ? undefined
              : getUserId();

          const payload = {
            title: trimmedTitle,
            status,
            assignedToId: assigned,
            dueAt: dueAtIso ?? null,
            paddockId: paddockId ? paddockId : null,
            mobId: mobId ? mobId : null,
            description: description.trim() || undefined,
          } satisfies UpdateTaskInput;

          if (editing) {
            void updateMutation.mutateAsync({ taskId: editing.id, input: payload });
          } else {
            void createMutation.mutateAsync({ id: createUuid(), ...payload });
          }
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Title
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <label className="label">
            Status
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Due
            <input
              className="input"
              type="datetime-local"
              value={dueAtLocal}
              onChange={(e) => setDueAtLocal(e.target.value)}
            />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Assign to
            {isManager() ? (
              <select className="select" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">(unassigned)</option>
                {(usersQuery.data ?? [])
                  .slice()
                  .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName} ({u.role})
                    </option>
                  ))}
              </select>
            ) : (
              <input className="input" value={me?.displayName ?? "Me"} disabled />
            )}
          </label>

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
        </div>

        <label className="label">
          Description
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What needs doing?"
            style={{ minHeight: 44, resize: "vertical" }}
          />
        </label>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !title.trim()}>
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Task"}
          </button>
          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setTitle("");
                setStatus("OPEN");
                setAssignedToId("");
                setDueAtLocal("");
                setPaddockId("");
                setMobId("");
                setDescription("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          {isEditing && (editing?.paddockId || editing?.mobId) ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => {
                if (editing?.paddockId) {
                  seeOnMap({ kind: "PADDOCK", paddockId: editing.paddockId });
                } else if (editing?.mobId) {
                  seeOnMap({ kind: "MOB", mobId: editing.mobId });
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

      {editing ? <AttachmentsPanel entityType="TASK" entityId={editing.id} disabled={busy} /> : null}


      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Due</th>
              <th>Assigned</th>
              <th>Paddock</th>
              <th>Mob</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => {
              const paddockName = task.paddockId ? paddockById.get(task.paddockId)?.name ?? task.paddockId : "";
              const mobName = task.mobId ? mobById.get(task.mobId)?.name ?? task.mobId : "";
              const assignedName =
                !task.assignedToId
                  ? ""
                  : userById.get(task.assignedToId)?.displayName ??
                    (me && task.assignedToId === me.id ? `${me.displayName} (me)` : task.assignedToId);

              return (
                <tr key={task.id}>
                  <td style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 700 }}>{task.title}</div>
                    {task.description ? <div className="muted" style={{ marginTop: 4 }}>{task.description}</div> : null}
                  </td>
                  <td className="mono">{task.status}</td>
                  <td className="mono">{task.dueAt ? new Date(task.dueAt).toLocaleString() : ""}</td>
                  <td>{assignedName}</td>
                  <td>{paddockName}</td>
                  <td>{mobName}</td>
                  <td className="mono">{new Date(task.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy || !(task.paddockId || task.mobId)}
                        onClick={() => {
                          if (task.paddockId) {
                            seeOnMap({ kind: "PADDOCK", paddockId: task.paddockId });
                            return;
                          }
                          if (task.mobId) {
                            seeOnMap({ kind: "MOB", mobId: task.mobId });
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
                          setEditing(task);
                          setTitle(task.title);
                          setStatus(task.status);
                          setAssignedToId(task.assignedToId ?? "");
                          setDueAtLocal(toDatetimeLocalValue(task.dueAt ?? null));
                          setPaddockId(task.paddockId ?? "");
                          setMobId(task.mobId ?? "");
                          setDescription(task.description ?? "");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next: TaskStatus = task.status === "DONE" ? "OPEN" : "DONE";
                          void updateMutation.mutateAsync({ taskId: task.id, input: { status: next } });
                        }}
                      >
                        {task.status === "DONE" ? "Reopen" : "Done"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Delete task "${task.title}"?`)) return;
                          void deleteMutation.mutateAsync(task.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  No tasks yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Issue, IssueStatus, Mob, Paddock } from "../../../types/api";
import { AttachmentsPanel } from "../../attachments/components/AttachmentsPanel";
import { PREFILL_SELECTED_ISSUE_ID_KEY, seeOnMap } from "../../../ui/navigation";

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

function getUserId(): string {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "00000000-0000-0000-0000-000000000000";
    const u = JSON.parse(raw) as { id?: string };
    return typeof u.id === "string" ? u.id : "00000000-0000-0000-0000-000000000000";
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

async function getIssues(): Promise<Issue[]> {
  try {
    const response = await apiFetch<ApiListResponse<Issue>>("/issues");
    await upsertEntities("issues", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Issue>("issues");
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

type CreateIssueInput = {
  id: string;
  title: string;
  description?: string;
  status?: IssueStatus;
  severity?: string;
  paddockId?: string | null;
  mobId?: string | null;
};

type UpdateIssueInput = {
  title?: string;
  description?: string;
  status?: IssueStatus;
  severity?: string;
  paddockId?: string | null;
  mobId?: string | null;
};

function isResolved(status: IssueStatus): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

async function createIssue(input: CreateIssueInput): Promise<Issue> {
  try {
    const response = await apiFetch<ApiSingleResponse<Issue>>("/issues", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const status: IssueStatus = input.status ?? "OPEN";

    const local: Issue = {
      id: input.id,
      farmId: getFarmId(),
      category: "GENERAL",
      title: input.title,
      description: input.description ?? null,
      status,
      severity: input.severity ?? null,
      locationGeoJson: null,
      feederId: null,
      waterAssetId: null,
      paddockId: typeof input.paddockId === "string" ? input.paddockId : null,
      mobId: typeof input.mobId === "string" ? input.mobId : null,
      createdById: getUserId(),
      createdAt: now,
      updatedAt: now,
      resolvedAt: isResolved(status) ? now : null,
    };

    await upsertEntities("issues", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      title: local.title,
      status: local.status,
    };

    if (input.description) actionData.description = input.description;
    if (input.severity) actionData.severity = input.severity;
    if (typeof input.paddockId === "string") actionData.paddockId = input.paddockId;
    if (typeof input.mobId === "string") actionData.mobId = input.mobId;

    await enqueueAction({
      entity: "issues",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateIssue(args: { issueId: string; input: UpdateIssueInput }): Promise<Issue> {
  try {
    const response = await apiFetch<ApiSingleResponse<Issue>>(`/issues/${args.issueId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Issue>("issues");
    const existing = cached.find((i) => i.id === args.issueId) ?? null;

    const nextStatus: IssueStatus = args.input.status ?? existing?.status ?? "OPEN";

    const resolvedAt =
      args.input.status !== undefined
        ? isResolved(nextStatus)
          ? existing?.resolvedAt ?? now
          : null
        : (existing?.resolvedAt ?? null);

    const local: Issue = {
      id: args.issueId,
      farmId: existing?.farmId ?? getFarmId(),
      category: existing?.category ?? "GENERAL",
      title: args.input.title ?? existing?.title ?? "Issue",
      description: args.input.description ?? existing?.description ?? null,
      status: nextStatus,
      severity: args.input.severity ?? existing?.severity ?? null,
      locationGeoJson: existing?.locationGeoJson ?? null,
      feederId: existing?.feederId ?? null,
      waterAssetId: existing?.waterAssetId ?? null,
      paddockId:
        args.input.paddockId !== undefined
          ? (args.input.paddockId ?? null)
          : (existing?.paddockId ?? null),
      mobId:
        args.input.mobId !== undefined
          ? (args.input.mobId ?? null)
          : (existing?.mobId ?? null),
      createdById: existing?.createdById ?? getUserId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      resolvedAt,
    };

    await upsertEntities("issues", [local as any]);

    await enqueueAction({
      entity: "issues",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteIssue(issueId: string): Promise<void> {
  try {
    await apiFetch<void>(`/issues/${issueId}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("issues", issueId);

    await enqueueAction({
      entity: "issues",
      op: "DELETE",
      data: { id: issueId },
    });
  }
}

const STATUS_OPTIONS: Array<{ value: IssueStatus; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "TRIAGED", label: "Triaged" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export function IssuesPage() {
  const qc = useQueryClient();

  const issuesQuery = useQuery({
    queryKey: ["issues"],
    queryFn: getIssues,
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

  const [prefillIssueId, setPrefillIssueId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_ISSUE_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_ISSUE_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const [editing, setEditing] = useState<Issue | null>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<IssueStatus>("OPEN");
  const [severity, setSeverity] = useState("");
  const [paddockId, setPaddockId] = useState("");
  const [mobId, setMobId] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!prefillIssueId) return;

    const issue = (issuesQuery.data ?? []).find((i) => i.id === prefillIssueId) ?? null;

    // Wait for initial load before giving up, otherwise we'd drop the deep link while data is still loading.
    if (!issue) {
      if (issuesQuery.isLoading) return;
      setPrefillIssueId("");
      return;
    }

    setEditing(issue);
    setTitle(issue.title);
    setStatus(issue.status);
    setSeverity(issue.severity ?? "");
    setPaddockId(issue.paddockId ?? "");
    setMobId(issue.mobId ?? "");
    setDescription(issue.description ?? "");
    setPrefillIssueId("");
  }, [prefillIssueId, issuesQuery.data, issuesQuery.isLoading]);


  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: async () => {
      setTitle("");
      setStatus("OPEN");
      setSeverity("");
      setPaddockId("");
      setMobId("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateIssue,
    onSuccess: async () => {
      setEditing(null);
      setTitle("");
      setStatus("OPEN");
      setSeverity("");
      setPaddockId("");
      setMobId("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: async (_data, issueIdArg) => {
      if (editing?.id === issueIdArg) {
        setEditing(null);
        setTitle("");
        setStatus("OPEN");
        setSeverity("");
        setPaddockId("");
        setMobId("");
        setDescription("");
      }
      await qc.invalidateQueries({ queryKey: ["issues"] });
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

  const sorted = useMemo(() => {
    return (issuesQuery.data ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [issuesQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Issues</h3>
          <p className="muted">Log farm issues, link them to mobs or paddocks, and resolve them. Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void issuesQuery.refetch()} disabled={issuesQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {issuesQuery.isLoading ? <p className="muted">Loading issues...</p> : null}
      {issuesQuery.isError ? (
        <div className="alert">Failed to load issues: {(issuesQuery.error as Error).message}</div>
      ) : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedTitle = title.trim();
          if (!trimmedTitle) return;

          const payload = {
            title: trimmedTitle,
            status,
            severity: severity.trim() || undefined,
            paddockId: paddockId ? paddockId : null,
            mobId: mobId ? mobId : null,
            description: description.trim() || undefined,
          } satisfies UpdateIssueInput;

          if (editing) {
            void updateMutation.mutateAsync({ issueId: editing.id, input: payload });
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
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Severity
            <input
              className="input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              placeholder="e.g. Low, Medium, High"
            />
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
            Description
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What should we check next?"
              style={{ minHeight: 44, resize: "vertical" }}
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !title.trim()}>
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Issue"}
          </button>
          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setTitle("");
                setStatus("OPEN");
                setSeverity("");
                setPaddockId("");
                setMobId("");
                setDescription("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          {isEditing ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => seeOnMap({ kind: "ISSUE", issueId: editing!.id })}
            >
              See on map
            </button>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      {editing ? <AttachmentsPanel entityType="ISSUE" entityId={editing.id} disabled={busy} /> : null}


      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Severity</th>
              <th>Paddock</th>
              <th>Mob</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((issue) => {
              const paddockName = issue.paddockId ? paddockById.get(issue.paddockId)?.name ?? issue.paddockId : "";
              const mobName = issue.mobId ? mobById.get(issue.mobId)?.name ?? issue.mobId : "";

              return (
                <tr key={issue.id}>
                  <td style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 700 }}>{issue.title}</div>
                    {issue.description ? <div className="muted" style={{ marginTop: 4 }}>{issue.description}</div> : null}
                  </td>
                  <td className="mono">{issue.status}</td>
                  <td>{issue.severity ?? ""}</td>
                  <td>{paddockName}</td>
                  <td>{mobName}</td>
                  <td className="mono">{new Date(issue.updatedAt).toLocaleString()}</td>
                  <td>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => seeOnMap({ kind: "ISSUE", issueId: issue.id })}
                      >
                        See on map
                      </button>

                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(issue);
                          setTitle(issue.title);
                          setStatus(issue.status);
                          setSeverity(issue.severity ?? "");
                          setPaddockId(issue.paddockId ?? "");
                          setMobId(issue.mobId ?? "");
                          setDescription(issue.description ?? "");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const next: IssueStatus = isResolved(issue.status) ? "OPEN" : "RESOLVED";
                          void updateMutation.mutateAsync({ issueId: issue.id, input: { status: next } });
                        }}
                      >
                        {isResolved(issue.status) ? "Reopen" : "Resolve"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Delete issue "${issue.title}"?`)) return;
                          void deleteMutation.mutateAsync(issue.id);
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
                <td colSpan={7} className="muted">
                  No issues yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

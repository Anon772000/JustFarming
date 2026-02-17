import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { ensureDeviceId } from "../../../auth/session";
import { apiFetch } from "../../../api/http";
import type { ApiListResponse, ApiSingleResponse, User } from "../../../types/api";

type UserRole = "manager" | "worker";

type CreateUserRequest = {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
};

type UpdateUserRequest = {
  displayName?: string;
  password?: string;
  role?: UserRole;
  disabled?: boolean;
};

type DeviceSession = {
  id: string;
  deviceId?: string | null;
  userAgent?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
  isCurrentDevice: boolean;
};

type UserAdminAuditEntry = {
  id: string;
  farmId: string;
  targetUserId: string;
  eventType: "USER_ADMIN_CREATE" | "USER_ADMIN_UPDATE" | "USER_ADMIN_REVOKE_SESSION" | "USER_ADMIN_REVOKE_SESSIONS";
  actorUserId?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
};

type AuditActionFilter = UserAdminAuditEntry["eventType"] | "all";

function normalizeRole(raw: string): UserRole {
  return raw.toLowerCase() === "manager" ? "manager" : "worker";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function isDisabled(user: User): boolean {
  return !!user.disabledAt;
}

function auditActionLabel(eventType: UserAdminAuditEntry["eventType"]): string {
  switch (eventType) {
    case "USER_ADMIN_CREATE":
      return "Create user";
    case "USER_ADMIN_UPDATE":
      return "Update user";
    case "USER_ADMIN_REVOKE_SESSION":
      return "Revoke one session";
    case "USER_ADMIN_REVOKE_SESSIONS":
      return "Revoke all sessions";
    default:
      return eventType;
  }
}

function formatAuditDetails(details: Record<string, unknown> | null | undefined): string {
  if (!details || Object.keys(details).length === 0) return "";
  try {
    return JSON.stringify(details);
  } catch {
    return "";
  }
}

function parseFromDateMs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseToDateMs(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T23:59:59.999`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes("\"")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function UserAdminPage() {
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("worker");
  const [notice, setNotice] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("worker");
  const [editPassword, setEditPassword] = useState("");
  const [editDisabled, setEditDisabled] = useState(false);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  const [auditActionFilter, setAuditActionFilter] = useState<AuditActionFilter>("all");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditTargetFilter, setAuditTargetFilter] = useState("");
  const [auditFromDate, setAuditFromDate] = useState("");
  const [auditToDate, setAuditToDate] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: async () => apiFetch<ApiListResponse<User>>("/users"),
    staleTime: 30_000,
  });

  const meQuery = useQuery({
    queryKey: ["users", "me"],
    queryFn: async () => apiFetch<ApiSingleResponse<User>>("/users/me"),
    staleTime: 30_000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["users", "sessions", sessionUserId],
    enabled: !!sessionUserId,
    queryFn: async () => {
      const userId = sessionUserId as string;
      const qs = new URLSearchParams({ deviceId: ensureDeviceId() });
      return apiFetch<ApiListResponse<DeviceSession>>(`/users/${userId}/sessions?${qs.toString()}`);
    },
    staleTime: 15_000,
  });

  const auditQuery = useQuery({
    queryKey: ["users", "audit"],
    queryFn: async () => apiFetch<ApiListResponse<UserAdminAuditEntry>>("/users/audit?limit=500"),
    staleTime: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateUserRequest) =>
      apiFetch<ApiSingleResponse<User>>("/users", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("worker");
      setNotice("User created.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
    },
    onError: (e) => {
      setNotice((e as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (args: { userId: string; payload: UpdateUserRequest }) =>
      apiFetch<ApiSingleResponse<User>>(`/users/${args.userId}`, {
        method: "PATCH",
        body: JSON.stringify(args.payload),
      }),
    onSuccess: async (_data, args) => {
      setEditPassword("");
      setEditingId(null);
      setNotice("User updated.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["users", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["users", "sessions", args.userId] });
      await queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
    },
    onError: (e) => {
      setNotice((e as Error).message);
    },
  });

  const revokeSingleSessionMutation = useMutation({
    mutationFn: async (args: { userId: string; sessionId: string }) =>
      apiFetch<void>(`/users/${args.userId}/sessions/${args.sessionId}`, {
        method: "DELETE",
      }),
    onSuccess: async (_data, args) => {
      setNotice("Session signed out.");
      await queryClient.invalidateQueries({ queryKey: ["users", "sessions", args.userId] });
      await queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
    },
    onError: (e) => {
      setNotice((e as Error).message);
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiFetch<void>(`/users/${userId}/revoke-sessions`, {
        method: "POST",
      }),
    onSuccess: async (_data, userId) => {
      const currentId = meQuery.data?.data?.id ?? "";
      if (currentId && currentId === userId) {
        setNotice("Signed out all sessions for your account. This device may be asked to sign in again.");
      } else {
        setNotice("Signed out all active sessions for that user.");
      }
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["users", "sessions", userId] });
      await queryClient.invalidateQueries({ queryKey: ["users", "audit"] });
    },
    onError: (e) => {
      setNotice((e as Error).message);
    },
  });

  const users = useMemo(() => usersQuery.data?.data ?? [], [usersQuery.data]);
  const audits = useMemo(() => auditQuery.data?.data ?? [], [auditQuery.data]);
  const currentUserId = meQuery.data?.data?.id ?? "";

  const userById = useMemo(() => {
    const m = new Map<string, User>();
    for (const u of users) {
      m.set(u.id, u);
    }
    return m;
  }, [users]);

  const usersSortedByName = useMemo(() => {
    return users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [users]);

  const filteredAudits = useMemo(() => {
    const search = auditSearch.trim().toLowerCase();
    const fromMs = parseFromDateMs(auditFromDate);
    const toMs = parseToDateMs(auditToDate);

    return audits.filter((a) => {
      if (auditActionFilter !== "all" && a.eventType !== auditActionFilter) {
        return false;
      }

      if (auditActorFilter && (a.actorUserId ?? "") !== auditActorFilter) {
        return false;
      }

      if (auditTargetFilter && a.targetUserId !== auditTargetFilter) {
        return false;
      }

      const createdMs = new Date(a.createdAt).getTime();
      if (fromMs !== null && Number.isFinite(createdMs) && createdMs < fromMs) {
        return false;
      }

      if (toMs !== null && Number.isFinite(createdMs) && createdMs > toMs) {
        return false;
      }

      if (!search) {
        return true;
      }

      const actorName = a.actorUserId ? userById.get(a.actorUserId)?.displayName ?? "" : "";
      const targetName = userById.get(a.targetUserId)?.displayName ?? "";
      const actionText = auditActionLabel(a.eventType).toLowerCase();
      const detailText = formatAuditDetails(a.details).toLowerCase();

      return (
        actionText.includes(search) ||
        detailText.includes(search) ||
        (a.actorUserId ?? "").toLowerCase().includes(search) ||
        actorName.toLowerCase().includes(search) ||
        a.targetUserId.toLowerCase().includes(search) ||
        targetName.toLowerCase().includes(search)
      );
    });
  }, [audits, auditActionFilter, auditActorFilter, auditTargetFilter, auditFromDate, auditToDate, auditSearch, userById]);

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    revokeSessionsMutation.isPending ||
    revokeSingleSessionMutation.isPending;

  const exportAuditCsv = () => {
    if (filteredAudits.length === 0) {
      setNotice("No audit rows to export.");
      return;
    }

    const rows: string[][] = [
      [
        "when_iso",
        "when_local",
        "action",
        "event_type",
        "actor_user_id",
        "actor_display_name",
        "target_user_id",
        "target_display_name",
        "details_json",
      ],
    ];

    for (const a of filteredAudits) {
      const actorName = a.actorUserId ? userById.get(a.actorUserId)?.displayName ?? "" : "";
      const targetName = userById.get(a.targetUserId)?.displayName ?? "";

      rows.push([
        a.createdAt,
        formatDateTime(a.createdAt),
        auditActionLabel(a.eventType),
        a.eventType,
        a.actorUserId ?? "",
        actorName,
        a.targetUserId,
        targetName,
        formatAuditDetails(a.details),
      ]);
    }

    const stamp = new Date().toISOString().replaceAll(":", "-");
    downloadCsv(`croxton-east-admin-audit-${stamp}.csv`, rows);
    setNotice(`Exported ${filteredAudits.length} audit rows.`);
  };

  return (
    <div>
      <h3>User Management</h3>
      <p className="muted">Managers can create users, edit user details, disable/enable accounts, and control active sessions.</p>

      {notice ? <div className="pill">{notice}</div> : null}
      {usersQuery.isError ? <div className="alert">Failed to load users</div> : null}
      {meQuery.isError ? <div className="alert">Failed to load current user context</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);

          const payload: CreateUserRequest = {
            displayName: displayName.trim(),
            email: email.trim(),
            password,
            role,
          };

          if (!payload.displayName || !payload.email || !payload.password) return;

          void createMutation.mutateAsync(payload);
        }}
      >
        <label className="label">
          Display name
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>

        <label className="label">
          Email
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label className="label">
          Password
          <input
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={8}
            required
          />
        </label>

        <label className="label">
          Role
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="worker">worker</option>
            <option value="manager">manager</option>
          </select>
        </label>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={createMutation.isPending || busy}>
            {createMutation.isPending ? "Creating..." : "Create User"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setNotice(null);
              void usersQuery.refetch();
              void meQuery.refetch();
              void auditQuery.refetch();
              if (sessionUserId) {
                void sessionsQuery.refetch();
              }
            }}
            disabled={usersQuery.isFetching || meQuery.isFetching || busy}
          >
            Refresh
          </button>
        </div>
      </form>

      <div className="hr" />

      <h3>Users</h3>
      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Display</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const rowEditing = editingId === u.id;
              const savingThis = rowEditing && updateMutation.isPending;
              const isCurrentUser = !!currentUserId && u.id === currentUserId;
              const userIsDisabled = isDisabled(u);
              const showSessions = sessionUserId === u.id;
              const sessions = showSessions ? sessionsQuery.data?.data ?? [] : [];

              return (
                <Fragment key={u.id}>
                  <tr>
                    <td>
                      {rowEditing ? (
                        <input
                          className="input"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value)}
                          disabled={busy}
                        />
                      ) : (
                        <>
                          {u.displayName}
                          {isCurrentUser ? <span className="pill" style={{ marginLeft: 8 }}>You</span> : null}
                        </>
                      )}
                    </td>

                    <td className="mono">{u.email}</td>

                    <td>
                      {rowEditing ? (
                        <select
                          className="select"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UserRole)}
                          disabled={busy}
                        >
                          <option value="worker">worker</option>
                          <option value="manager">manager</option>
                        </select>
                      ) : (
                        normalizeRole(u.role)
                      )}
                    </td>

                    <td>
                      {rowEditing ? (
                        <select
                          className="select"
                          value={editDisabled ? "disabled" : "active"}
                          onChange={(e) => setEditDisabled(e.target.value === "disabled")}
                          disabled={busy}
                        >
                          <option value="active">active</option>
                          <option value="disabled">disabled</option>
                        </select>
                      ) : (
                        <span className="pill" style={{ background: userIsDisabled ? "#f8d7da" : undefined }}>
                          {userIsDisabled ? "Disabled" : "Active"}
                        </span>
                      )}
                    </td>

                    <td className="muted">{new Date(u.createdAt).toLocaleString()}</td>

                    <td>
                      {!rowEditing ? (
                        <div className="actions">
                          <button
                            className="btn"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setNotice(null);
                              setEditingId(u.id);
                              setEditDisplayName(u.displayName);
                              setEditRole(normalizeRole(u.role));
                              setEditDisabled(userIsDisabled);
                              setEditPassword("");
                            }}
                          >
                            Edit
                          </button>

                          <button
                            className="btn"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setNotice(null);
                              setSessionUserId((prev) => (prev === u.id ? null : u.id));
                            }}
                          >
                            {showSessions ? "Hide Sessions" : "Sessions"}
                          </button>

                          <button
                            className="btn"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const nextDisabled = !userIsDisabled;
                              const msg = nextDisabled
                                ? `Disable ${u.displayName}? They will not be able to sign in.`
                                : `Enable ${u.displayName}?`;

                              if (!confirm(msg)) return;
                              setNotice(null);
                              void updateMutation.mutateAsync({
                                userId: u.id,
                                payload: { disabled: nextDisabled },
                              });
                            }}
                          >
                            {userIsDisabled ? "Enable" : "Disable"}
                          </button>

                          <button
                            className="btn"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const msg = isCurrentUser
                                ? "Sign out all sessions for your account? This can sign out this device too."
                                : `Sign out all active sessions for ${u.displayName}?`;

                              if (!confirm(msg)) return;
                              setNotice(null);
                              void revokeSessionsMutation.mutateAsync(u.id);
                            }}
                          >
                            Sign Out Devices
                          </button>
                        </div>
                      ) : (
                        <div style={{ minWidth: 320 }}>
                          <label className="label" style={{ marginBottom: 8 }}>
                            New password (optional)
                            <input
                              className="input"
                              type="password"
                              minLength={8}
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="Leave blank to keep current password"
                              disabled={busy}
                            />
                          </label>

                          <div className="actions">
                            <button
                              className="btn btnPrimary"
                              type="button"
                              disabled={busy || !editDisplayName.trim()}
                              onClick={() => {
                                const payload: UpdateUserRequest = {};

                                if (editDisplayName.trim() !== u.displayName) {
                                  payload.displayName = editDisplayName.trim();
                                }

                                if (editRole !== normalizeRole(u.role)) {
                                  payload.role = editRole;
                                }

                                if (editDisabled !== userIsDisabled) {
                                  payload.disabled = editDisabled;
                                }

                                const trimmedPassword = editPassword.trim();
                                if (trimmedPassword) {
                                  if (trimmedPassword.length < 8) {
                                    setNotice("Password must be at least 8 characters.");
                                    return;
                                  }
                                  payload.password = trimmedPassword;
                                }

                                if (Object.keys(payload).length === 0) {
                                  setNotice("No changes to save.");
                                  return;
                                }

                                setNotice(null);
                                void updateMutation.mutateAsync({ userId: u.id, payload });
                              }}
                            >
                              {savingThis ? "Saving..." : "Save"}
                            </button>

                            <button
                              className="btn"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setNotice(null);
                                setEditingId(null);
                                setEditPassword("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>

                  {showSessions ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="actions" style={{ marginTop: 6 }}>
                          <div className="pill">Active sessions: {sessions.length}</div>
                          <button
                            className="btn"
                            type="button"
                            disabled={sessionsQuery.isFetching || busy}
                            onClick={() => {
                              setNotice(null);
                              void sessionsQuery.refetch();
                            }}
                          >
                            {sessionsQuery.isFetching ? "Refreshing..." : "Refresh Sessions"}
                          </button>
                        </div>

                        {sessionsQuery.isLoading ? <p className="muted" style={{ marginTop: 8 }}>Loading sessions...</p> : null}
                        {sessionsQuery.isError ? <div className="alert" style={{ marginTop: 8 }}>Failed to load sessions</div> : null}

                        {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 ? (
                          <p className="muted" style={{ marginTop: 8 }}>No active sessions.</p>
                        ) : null}

                        {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length > 0 ? (
                          <div className="tableWrap" style={{ marginTop: 8 }}>
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Device</th>
                                  <th>Last used</th>
                                  <th>Expires</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sessions.map((s) => (
                                  <tr key={s.id}>
                                    <td>
                                      <div className="mono" style={{ fontSize: 12 }}>{s.deviceId ?? "(no device id)"}</div>
                                      <div className="muted" style={{ marginTop: 4 }}>{s.userAgent ?? "Unknown device"}</div>
                                      {s.isCurrentDevice ? <span className="pill" style={{ marginTop: 6, display: "inline-block" }}>This device</span> : null}
                                    </td>
                                    <td className="muted">{formatDateTime(s.lastUsedAt)}</td>
                                    <td className="muted">{formatDateTime(s.expiresAt)}</td>
                                    <td>
                                      <button
                                        className="btn"
                                        type="button"
                                        disabled={busy}
                                        onClick={() => {
                                          if (!confirm("Sign out this session?")) return;
                                          setNotice(null);
                                          void revokeSingleSessionMutation.mutateAsync({
                                            userId: u.id,
                                            sessionId: s.id,
                                          });
                                        }}
                                      >
                                        Sign Out Session
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}

            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="hr" />

      <header className="sectionHead">
        <div>
          <h3>Admin Audit</h3>
          <p className="muted">Recent manager actions for user administration.</p>
        </div>
        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={auditQuery.isFetching}
            onClick={() => {
              void auditQuery.refetch();
            }}
          >
            {auditQuery.isFetching ? "Refreshing..." : "Refresh Audit"}
          </button>
          <button className="btn" type="button" disabled={filteredAudits.length === 0} onClick={exportAuditCsv}>
            Export CSV
          </button>
        </div>
      </header>

      <div className="row3" style={{ marginTop: 10 }}>
        <label className="label">
          Action
          <select className="input" value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value as AuditActionFilter)}>
            <option value="all">All actions</option>
            <option value="USER_ADMIN_CREATE">Create user</option>
            <option value="USER_ADMIN_UPDATE">Update user</option>
            <option value="USER_ADMIN_REVOKE_SESSION">Revoke one session</option>
            <option value="USER_ADMIN_REVOKE_SESSIONS">Revoke all sessions</option>
          </select>
        </label>

        <label className="label">
          Actor
          <select className="input" value={auditActorFilter} onChange={(e) => setAuditActorFilter(e.target.value)}>
            <option value="">All actors</option>
            {usersSortedByName.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="label">
          Target user
          <select className="input" value={auditTargetFilter} onChange={(e) => setAuditTargetFilter(e.target.value)}>
            <option value="">All targets</option>
            {usersSortedByName.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row3" style={{ marginTop: 10 }}>
        <label className="label">
          From date
          <input className="input" type="date" value={auditFromDate} onChange={(e) => setAuditFromDate(e.target.value)} />
        </label>

        <label className="label">
          To date
          <input className="input" type="date" value={auditToDate} onChange={(e) => setAuditToDate(e.target.value)} />
        </label>

        <label className="label">
          Search details
          <input
            className="input"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Type action, user, detail text"
          />
        </label>
      </div>

      <div className="actions" style={{ marginTop: 10 }}>
        <div className="pill">Showing {filteredAudits.length} of {audits.length}</div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setAuditActionFilter("all");
            setAuditActorFilter("");
            setAuditTargetFilter("");
            setAuditFromDate("");
            setAuditToDate("");
            setAuditSearch("");
          }}
        >
          Clear Filters
        </button>
      </div>

      {auditQuery.isLoading ? <p className="muted">Loading audit...</p> : null}
      {auditQuery.isError ? <div className="alert">Failed to load admin audit.</div> : null}

      {!auditQuery.isLoading && !auditQuery.isError ? (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudits.map((a) => {
                const actor = a.actorUserId ? userById.get(a.actorUserId) : undefined;
                const target = userById.get(a.targetUserId);
                const detailsText = formatAuditDetails(a.details);

                return (
                  <tr key={a.id}>
                    <td className="muted">{formatDateTime(a.createdAt)}</td>
                    <td>{auditActionLabel(a.eventType)}</td>
                    <td>{actor?.displayName ?? a.actorUserId ?? "Unknown"}</td>
                    <td>{target?.displayName ?? a.targetUserId}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{detailsText}</td>
                  </tr>
                );
              })}

              {filteredAudits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No audit entries match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

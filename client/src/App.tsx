import { useEffect, useMemo, useState } from "react";
import { MapPage } from "./features/map/pages/MapPage";
import { WaterPage } from "./features/water/pages/WaterPage";
import { MobListPage } from "./features/mobs/pages/MobListPage";
import { PaddockListPage } from "./features/paddocks/pages/PaddockListPage";
import { MobMovementPlansPage } from "./features/movements/pages/MobMovementPlansPage";
import { TelemetryPage } from "./features/telemetry/pages/TelemetryPage";
import { UserAdminPage } from "./features/users/pages/UserAdminPage";
import { IssuesPage } from "./features/issues/pages/IssuesPage";
import { TasksPage } from "./features/tasks/pages/TasksPage";
import { FeedPage } from "./features/feed/pages/FeedPage";
import { ContractorsPage } from "./features/contractors/pages/ContractorsPage";
import { PestSpottingsPage } from "./features/pests/pages/PestSpottingsPage";
import { ActivityEventsPage } from "./features/events/pages/ActivityEventsPage";
import { FarmTimelinePage } from "./features/timeline/pages/FarmTimelinePage";
import { PlanningPage } from "./features/planning/pages/PlanningPage";
import { apiFetch } from "./api/http";
import { getLastSync } from "./offline/indexedDb";
import { runSyncCycle } from "./offline/syncLoop";
import { APP_NAVIGATE_EVENT, type MapFocus } from "./ui/navigation";
import {
  AUTH_CHANGED_EVENT,
  AUTH_REQUIRED_EVENT,
  clearAuthSession,
  ensureDeviceId,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setAuthSession,
  type AuthUser,
} from "./auth/session";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

type DeviceSession = {
  id: string;
  deviceId: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  isCurrentDevice: boolean;
};

export function App() {
  const [accessToken, setAccessToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [lastSync, setLastSyncState] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [view, setView] = useState<"mobs" | "paddocks" | "moves" | "issues" | "tasks" | "feed" | "contractors" | "pests" | "planning" | "events" | "timeline" | "map" | "water" | "telemetry" | "users">("mobs");
  const [mapFocus, setMapFocus] = useState<MapFocus | null>(null);

  const authed = useMemo(() => !!accessToken, [accessToken]);
  const isManager = (user?.role ?? "").toLowerCase() === "manager";

  const mapWide = authed && view === "map";
  const containerClass = mapWide ? "container containerWide" : "container";
  const gridClass = mapWide ? "grid gridSingle" : "grid";

  useEffect(() => {
    if (accessToken) return;
    if (!getRefreshToken()) return;

    let cancelled = false;

    void (async () => {
      try {
        const data = await apiFetch<{ data: AuthUser }>("/users/me");
        if (cancelled) return;
        localStorage.setItem("user", JSON.stringify(data.data));
        setUser(data.data);
        setAccessToken(getAccessToken());
      } catch {
        // Session restore failed (user will see sign-in).
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || user) return;

    // Token exists (e.g. after refresh) but user info isn't cached locally.
    void (async () => {
      try {
        const data = await apiFetch<{ data: AuthUser }>("/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        localStorage.setItem("user", JSON.stringify(data.data));
        setUser(data.data);
      } catch {
        // ignore
      }
    })();
  }, [accessToken, user]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { view?: string; mapFocus?: MapFocus } | undefined;
      if (!detail) return;
      if (typeof detail.view === "string") {
        setView(detail.view as any);
      }
      if (detail.mapFocus) {
        setMapFocus(detail.mapFocus);
      }
    };
    window.addEventListener(APP_NAVIGATE_EVENT, handler as any);
    return () => window.removeEventListener(APP_NAVIGATE_EVENT, handler as any);
  }, []);

  useEffect(() => {
    const syncAuthState = () => {
      setAccessToken(getAccessToken());
      setUser(getStoredUser());
    };

    const onAuthRequired = () => {
      syncAuthState();
      setView("mobs");
      setMapFocus(null);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, syncAuthState as EventListener);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired as EventListener);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuthState as EventListener);
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired as EventListener);
    };
  }, []);

  useEffect(() => {
    if (authed) return;
    setSessionsOpen(false);
    setSessions([]);
    setSessionsError(null);
    setRevokingSessionId(null);
  }, [authed]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const cycle = async () => {
      try {
        await runSyncCycle();
        const last = await getLastSync();
        if (cancelled) return;
        setLastSyncState(last);
        setSyncError(null);
      } catch (e) {
        if (cancelled) return;
        setSyncError((e as Error).message);
      }
    };

    void cycle();

    const id = window.setInterval(() => {
      void cycle();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [accessToken]);

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId: ensureDeviceId() }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = (await res.json()) as AuthResponse;
      setAuthSession(data);
      setAccessToken(data.accessToken);
      setUser(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    const refreshToken = getRefreshToken();
    clearAuthSession();
    setAccessToken(null);
    setUser(null);
    setView("mobs");

    if (!refreshToken) return;

    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // ignore
    }
  };

  const logoutOtherDevices = async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setSessionNotice("No active session token found for this device.");
      return;
    }

    setSessionBusy(true);
    setSessionNotice(null);

    try {
      await apiFetch<void>("/auth/logout-others", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
      setSessionNotice("Signed out on other devices.");
      if (sessionsOpen) {
        const qs = new URLSearchParams({ deviceId: ensureDeviceId() });
        const refreshed = await apiFetch<{ data: DeviceSession[] }>(`/auth/sessions?${qs.toString()}`);
        setSessions(refreshed.data);
      }
    } catch (e) {
      setSessionNotice((e as Error).message);
    } finally {
      setSessionBusy(false);
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);

    try {
      const qs = new URLSearchParams({ deviceId: ensureDeviceId() });
      const result = await apiFetch<{ data: DeviceSession[] }>(`/auth/sessions?${qs.toString()}`);
      setSessions(result.data);
    } catch (e) {
      setSessionsError((e as Error).message);
    } finally {
      setSessionsLoading(false);
    }
  };

  const toggleSessions = () => {
    setSessionsOpen((prev) => {
      const next = !prev;
      if (next) {
        void loadSessions();
      }
      return next;
    });
  };

  const revokeSession = async (sessionId: string) => {
    if (!confirm("Sign out this device session?")) return;

    setRevokingSessionId(sessionId);
    setSessionNotice(null);

    try {
      await apiFetch<void>(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setSessionNotice("Session signed out.");
      await loadSessions();
    } catch (e) {
      setSessionNotice((e as Error).message);
    } finally {
      setRevokingSessionId(null);
    }
  };

  return (
    <div className={containerClass}>
      <header className="topbar">
        <div className="brand">
          <h1>Croxton East</h1>
          <p>Farm operations, planning, water, and telemetry in one place.</p>
        </div>
        <div className="pill">
          {authed ? `${user?.displayName ?? "Signed in"} (${user?.role ?? ""})` : "SIGN IN"}
        </div>
      </header>

      {!authed ? (
        <div className="grid">
          <section className="card">
            <h2>Sign In</h2>
            <p>Registration is disabled. Ask a manager to create an account for you.</p>

            {error && <div className="alert">{error}</div>}

            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <label className="label">
                Email
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="label">
                Password
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                />
              </label>

              <div className="actions">
                <button className="btn btnPrimary" type="submit" disabled={busy}>
                  {busy ? "Signing in..." : "Login"}
                </button>
              </div>
            </form>
          </section>

          <aside className="card">
            <h2>Setup Notes</h2>
            <p>Use your account to sign in. Managers can create users from the Users tab.</p>

            <div className="hr" />
            <div className="pill">Secure access enabled</div>
          </aside>
        </div>
      ) : (
        <div className={gridClass}>
          <section className="card">
            <h2>Operations</h2>
            <p>Daily ops: mobs, paddocks, moves, issues, tasks, feed, contractors, pest spotting, events, timeline, planning, and maps.</p>

            <div className="actions">
              <button
                className={view === "mobs" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("mobs")}
              >
                Mobs
              </button>
              <button
                className={view === "paddocks" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("paddocks")}
              >
                Paddocks
              </button>
              <button
                className={view === "moves" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("moves")}
              >
                Moves
              </button>
              <button
                className={view === "issues" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("issues")}
              >
                Issues
              </button>
              <button
                className={view === "tasks" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("tasks")}
              >
                Tasks
              </button>
              <button
                className={view === "feed" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("feed")}
              >
                Feed
              </button>
              <button
                className={view === "contractors" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("contractors")}
              >
                Contractors
              </button>
              <button
                className={view === "pests" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("pests")}
              >
                Pests
              </button>
              <button
                className={view === "planning" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("planning")}
              >
                Planning
              </button>
              <button
                className={view === "events" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("events")}
              >
                Events
              </button>
              <button
                className={view === "timeline" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("timeline")}
              >
                Timeline
              </button>
              <button
                className={view === "map" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("map")}
              >
                Map
              </button>
              <button
                className={view === "water" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("water")}
              >
                Water
              </button>
              <button
                className={view === "telemetry" ? "btn btnPrimary" : "btn"}
                type="button"
                onClick={() => setView("telemetry")}
              >
                Telemetry
              </button>
              {isManager ? (
                <button
                  className={view === "users" ? "btn btnPrimary" : "btn"}
                  type="button"
                  onClick={() => setView("users")}
                >
                  Users
                </button>
              ) : null}
              <button className="btn" type="button" onClick={() => void logout()}>
                Logout
              </button>
            </div>

            <div className="hr" />
            {view === "mobs" ? <MobListPage /> : null}
            {view === "paddocks" ? <PaddockListPage /> : null}
            {view === "moves" ? <MobMovementPlansPage /> : null}
            {view === "issues" ? <IssuesPage /> : null}
            {view === "tasks" ? <TasksPage /> : null}
            {view === "feed" ? <FeedPage /> : null}
            {view === "contractors" ? <ContractorsPage /> : null}
            {view === "pests" ? <PestSpottingsPage /> : null}
            {view === "planning" ? <PlanningPage /> : null}
            {view === "events" ? <ActivityEventsPage /> : null}
            {view === "timeline" ? <FarmTimelinePage /> : null}
            {view === "map" ? <MapPage focus={mapFocus} onFocusConsumed={() => setMapFocus(null)} /> : null}
            {view === "water" ? <WaterPage /> : null}
            {view === "telemetry" ? <TelemetryPage /> : null}
            {view === "users" && isManager ? <UserAdminPage /> : null}
          </section>

          <aside className="card">
            <h2>Status</h2>
            <div className="pill">{online ? "Online" : "Offline"}{lastSync ? ` | Last sync: ${new Date(lastSync).toLocaleString()}` : ""}</div>
            {syncError ? <div className="alert" style={{ marginTop: 10 }}>Sync: {syncError}</div> : null}

            <div className="hr" />
            <div className="actions">
              <button className="btn" type="button" onClick={() => void logoutOtherDevices()} disabled={sessionBusy || sessionsLoading}>
                {sessionBusy ? "Updating..." : "Sign Out Other Devices"}
              </button>
              <button className="btn" type="button" onClick={toggleSessions} disabled={sessionsLoading}>
                {sessionsOpen ? "Hide Sessions" : "Active Sessions"}
              </button>
            </div>
            {sessionNotice ? <div className="pill" style={{ marginTop: 10 }}>{sessionNotice}</div> : null}

            {sessionsOpen ? (
              <>
                <div className="hr" />
                <div className="actions" style={{ marginTop: 0 }}>
                  <button className="btn" type="button" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                    {sessionsLoading ? "Refreshing..." : "Refresh Sessions"}
                  </button>
                </div>

                {sessionsLoading ? <p className="muted">Loading sessions...</p> : null}
                {sessionsError ? <div className="alert">Sessions: {sessionsError}</div> : null}

                {!sessionsLoading && !sessionsError && sessions.length === 0 ? (
                  <p className="muted">No active sessions found.</p>
                ) : null}

                {!sessionsLoading && !sessionsError
                  ? sessions.map((s) => (
                      <div key={s.id} className="panel" style={{ marginTop: 10 }}>
                        <div className="actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
                          <span className="badge">{s.isCurrentDevice ? "This device" : "Other device"}</span>
                          {!s.isCurrentDevice ? (
                            <button
                              className="btn"
                              type="button"
                              onClick={() => void revokeSession(s.id)}
                              disabled={revokingSessionId === s.id || sessionBusy}
                            >
                              {revokingSessionId === s.id ? "Signing out..." : "Sign Out"}
                            </button>
                          ) : null}
                        </div>
                        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                          {s.userAgent ? s.userAgent : "Unknown device/browser"}
                        </div>
                        <div className="muted mono" style={{ marginTop: 4, fontSize: 12 }}>
                          Last used: {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : "-"}
                        </div>
                        <div className="muted mono" style={{ marginTop: 2, fontSize: 12 }}>
                          Expires: {new Date(s.expiresAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  : null}
              </>
            ) : null}

            {isManager ? (
              <>
                <div className="hr" />
                <p className="muted">Managers can add users under the Users tab.</p>
              </>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

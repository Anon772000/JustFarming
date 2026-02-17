import { ensureDeviceId, getAccessToken, getRefreshToken, markAuthRequired, updateAuthTokens } from "../auth/session";

const API_BASE = "/api/v1";

let refreshingPromise: Promise<boolean> | null = null;

function isAuthPath(path: string): boolean {
  return path.startsWith("/auth/");
}

async function refreshAuthToken(): Promise<boolean> {
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshToken,
          deviceId: ensureDeviceId(),
        }),
      });

      if (!response.ok) {
        return false;
      }

      const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
      if (!body.accessToken || !body.refreshToken) {
        return false;
      }

      updateAuthTokens({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
      });

      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshingPromise = null;
  });

  return refreshingPromise;
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const isFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const withHeaders = (token: string | null): Headers => {
    const headers = new Headers(init?.headers ?? {});

    if (!headers.has("Content-Type") && !isFormDataBody) {
      headers.set("Content-Type", "application/json");
    }

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  };

  const doFetch = (token: string | null): Promise<Response> => {
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: withHeaders(token),
    });
  };

  let response = await doFetch(getAccessToken());

  if (response.status !== 401 || isAuthPath(path)) {
    return response;
  }

  const refreshed = await refreshAuthToken();
  if (!refreshed) {
    markAuthRequired("Your session has expired.");
    return response;
  }

  response = await doFetch(getAccessToken());
  if (response.status === 401) {
    markAuthRequired("Your session has expired.");
  }

  return response;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(path, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return (await response.text()) as unknown as T;
  }

  return (await response.json()) as T;
}

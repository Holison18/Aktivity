"use client";
// Browser helpers for the student flow: server clock offset, location, POST with retry, local drafts.

// ----------------------------------------------------------------- clock (NF-12)
let offsetMs = 0;
/** Records the server clock offset, measured from a response's serverNow at load. */
export function syncClock(serverNow: number, sentAt: number, receivedAt = Date.now()) {
  // Assume the server stamped the time halfway through the round trip.
  offsetMs = serverNow - (sentAt + receivedAt) / 2;
}
export const serverNow = () => Date.now() + offsetMs;

// --------------------------------------------------------------- location (FR-14)
export type Pos = { lat: number; lng: number; accuracy: number };
export type PosError = "denied" | "unavailable" | "timeout" | "unsupported";
export type PosResult = { position: Pos; at: number } | { positionError: PosError; at: number };

let last: PosResult | null = null;

/** Asks the browser for a high-accuracy position. Reuses a reading younger than `maxAgeMs`. */
export function getPosition(maxAgeMs = 60_000, timeoutMs = 15_000): Promise<PosResult> {
  if (last && "position" in last && Date.now() - last.at < maxAgeMs) return Promise.resolve(last);
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({ positionError: "unsupported", at: Date.now() });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        last = { position: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }, at: Date.now() };
        resolve(last);
      },
      (err) => {
        const code: PosError = err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable";
        last = { positionError: code, at: Date.now() };
        resolve(last);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export const posFields = (r: PosResult | null) =>
  !r ? {} : "position" in r ? { position: r.position } : { positionError: r.positionError };

// ------------------------------------------------------------------ HTTP (NF-10)
export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: ApiError };
export type ApiError = { error: string; message?: string; reason?: string; distanceM?: number | null; accuracyM?: number | null; state?: string };

/**
 * POSTs JSON. Network failures and 5xx responses are retried with backoff (NF-10).
 * 4xx responses are final and returned to the caller.
 */
export async function post<T>(url: string, body: unknown, opts: { retries?: number; onRetry?: (n: number) => void } = {}): Promise<ApiResult<T>> {
  const retries = opts.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
      const data = await res.json().catch(() => ({ error: "bad_response", message: "The server sent an unreadable reply." }));
      if (res.ok) return { ok: true, status: res.status, data: data as T };
      if (res.status < 500 || attempt >= retries) return { ok: false, status: res.status, data: data as ApiError };
    } catch {
      if (attempt >= retries) return { ok: false, status: 0, data: { error: "network", message: "No connection to the server. Check your Wi-Fi or mobile data, then try again." } };
    }
    opts.onRetry?.(attempt + 1);
    await new Promise((r) => setTimeout(r, Math.min(8000, 800 * 2 ** attempt)));
  }
}

export async function getJson<T>(url: string): Promise<ApiResult<T> & { sentAt: number; receivedAt: number }> {
  const sentAt = Date.now();
  try {
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const data = await res.json().catch(() => ({ error: "bad_response" }));
    return { ok: res.ok, status: res.status, data, sentAt, receivedAt: Date.now() } as ApiResult<T> & { sentAt: number; receivedAt: number };
  } catch {
    return { ok: false, status: 0, data: { error: "network", message: "No connection to the server." }, sentAt, receivedAt: Date.now() };
  }
}

// ------------------------------------------------------ drafts kept in the browser (NF-10)
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: answers still live in memory */
  }
}
export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Student-side server logic: week lookup, session, overrides, geofence, rate limit, access log.
// Every student request passes through here before touching activity data (SRS 7).
import "server-only";
import type { NextRequest } from "next/server";
import { db, must } from "../supabase/service";
import { checkGeofence, roundCoord, roundTo10, type Fence, type GeoResult, type Position } from "../geo";
import { SUBMIT_GRACE_MS } from "../window";
import { hashIp, SESSION_COOKIE, signSession, verify, type StudentSession } from "../tokens";
import { RATE_PER_INDEX, RATE_PER_IP, RATE_WINDOW_MS } from "../env";

export type WeekRow = {
  id: string;
  class_id: string;
  number: number;
  title: string;
  opens_at: string;
  closes_at: string;
  published: boolean;
  link_token: string;
  geofence_enabled: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number;
  max_accuracy_m: number;
};

export type ActivityPublicRow = {
  id: string;
  week_id: string;
  position: number;
  type: string;
  title: string;
  instructions: string;
  config: unknown;
  max_attempts: number;
  max_score: number;
};

const WEEK_COLS =
  "id, class_id, number, title, opens_at, closes_at, published, link_token, geofence_enabled, center_lat, center_lng, radius_m, max_accuracy_m";
// The answer key column is deliberately absent here (FR-23, D-10).
export const ACTIVITY_PUBLIC_COLS = "id, week_id, position, type, title, instructions, config, max_attempts, max_score";

export async function weekByToken(token: string): Promise<(WeekRow & { class_name: string; join_code: string }) | null> {
  const res = await db().from("weeks").select(`${WEEK_COLS}, classes!inner(name, join_code)`).eq("link_token", token).maybeSingle();
  const row = must(res, "load week") as (WeekRow & { classes: { name: string; join_code: string } }) | null;
  if (!row) return null;
  const { classes, ...week } = row;
  return { ...week, class_name: classes.name, join_code: classes.join_code };
}

export async function weekById(id: string): Promise<WeekRow | null> {
  return must(await db().from("weeks").select(WEEK_COLS).eq("id", id).maybeSingle(), "load week") as WeekRow | null;
}

export const fenceOf = (w: WeekRow): Fence => ({
  enabled: w.geofence_enabled,
  lat: w.center_lat,
  lng: w.center_lng,
  radiusM: w.radius_m,
  maxAccuracyM: w.max_accuracy_m,
});

export type Overrides = { time: { expires_at: string } | null; geofence: { expires_at: string } | null };

/** Active exceptions for one student in one week (FR-24, D-07). Read on every access check. */
export async function activeOverrides(weekId: string, index: string, now: number): Promise<Overrides> {
  const rows = must(
    await db().from("overrides").select("kind, expires_at").eq("week_id", weekId).eq("index_number", index).gt("expires_at", new Date(now).toISOString()),
    "load overrides",
  ) as { kind: "time" | "geofence"; expires_at: string }[];
  const latest = (k: string) => rows.filter((r) => r.kind === k).sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0] ?? null;
  return { time: latest("time"), geofence: latest("geofence") };
}

export function requestMeta(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : null) || req.headers.get("x-real-ip") || null;
  return { ipHash: hashIp(ip), userAgent: (req.headers.get("user-agent") || "").slice(0, 300) };
}

export type AccessEvent = {
  class_id: string | null;
  week_id: string | null;
  activity_id?: string | null;
  index_number: string | null;
  event: "login" | "start" | "submit";
  allowed: boolean;
  reason: string;
  position?: Position | null;
  geo?: GeoResult | null;
  ipHash: string | null;
  userAgent: string;
};

/** Writes one access_events row (FR-20). Coordinates rounded to 4 dp, IP hashed. */
export async function logEvent(e: AccessEvent): Promise<void> {
  const res = await db()
    .from("access_events")
    .insert({
      class_id: e.class_id,
      week_id: e.week_id,
      activity_id: e.activity_id ?? null,
      index_number: e.index_number,
      event: e.event,
      allowed: e.allowed,
      reason: e.reason,
      lat: e.position ? roundCoord(e.position.lat) : null,
      lng: e.position ? roundCoord(e.position.lng) : null,
      accuracy_m: e.position ? Math.round(e.position.accuracy) : null,
      distance_m: e.geo?.distanceM != null ? Math.round(e.geo.distanceM) : null,
      ip_hash: e.ipHash,
      user_agent: e.userAgent,
    });
  if (res.error) console.error("access_events insert failed:", res.error.message);
}

/** Login rate limit (FR-05), counted from the access log so it works across serverless instances. */
export async function isRateLimited(index: string, ipHash: string | null): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const byIndex = db().from("access_events").select("id", { count: "exact", head: true }).eq("event", "login").eq("index_number", index).gte("created_at", since);
  const byIp = ipHash
    ? db().from("access_events").select("id", { count: "exact", head: true }).eq("event", "login").eq("ip_hash", ipHash).gte("created_at", since)
    : null;
  const [a, b] = await Promise.all([byIndex, byIp]);
  return (a.count ?? 0) >= RATE_PER_INDEX || (b?.count ?? 0) >= RATE_PER_IP;
}

// ------------------------------------------------------------------ session

/** Server-side validity: the signed expiry, extended if the admin later extended the window (FR-10). */
export function sessionValidUntil(s: StudentSession, week: WeekRow, overrides: Overrides): number {
  return Math.max(
    s.exp,
    Date.parse(week.closes_at) + SUBMIT_GRACE_MS,
    overrides.time ? Date.parse(overrides.time.expires_at) : 0,
  );
}

/** Session expiry for a fresh login (FR-04): when the window closes, or 30 min when viewing scores after close. */
export function sessionExpiryFor(week: WeekRow, overrides: Overrides, now: number): number {
  const close = Date.parse(week.closes_at) + SUBMIT_GRACE_MS;
  const t = overrides.time ? Date.parse(overrides.time.expires_at) : 0;
  return Math.max(close, t, now >= close ? now + 30 * 60_000 : 0);
}

export function sessionCookie(s: StudentSession) {
  return {
    name: SESSION_COOKIE,
    value: signSession(s),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      // The browser keeps the cookie a little longer; the server enforces the real expiry.
      expires: new Date(s.exp + 2 * 3_600_000),
    },
  };
}

export type StudentContext = {
  session: StudentSession;
  week: WeekRow;
  student: { index_number: string; name: string };
  overrides: Overrides;
  now: number;
};

/** Parses and verifies the student session cookie without touching the database. */
export function verifyStudentCookie(raw: string | undefined): StudentSession | null {
  return verify<StudentSession>("session", raw);
}

/** AR-1: the cookie is valid and belongs to a registered student of this class. */
export async function requireStudent(req: NextRequest): Promise<StudentContext | null> {
  const s = verifyStudentCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const now = Date.now();
  const [week, studentRes, overrides] = await Promise.all([
    weekById(s.w),
    db().from("students").select("index_number, name").eq("class_id", s.c).eq("index_number", s.i).maybeSingle(),
    activeOverrides(s.w, s.i, now),
  ]);
  const student = must(studentRes, "load student") as { index_number: string; name: string } | null;
  if (!week || week.class_id !== s.c || !student) return null;
  if (now >= sessionValidUntil(s, week, overrides)) return null;
  return { session: s, week, student, overrides, now };
}

// ----------------------------------------------------------------- geofence

export type GeoInput = { position?: Position | null; positionError?: string | null };

export function geoCheck(week: WeekRow, overrides: Overrides, input: GeoInput): GeoResult & { reasonCode: string } {
  const r = checkGeofence(fenceOf(week), input.position ?? null, !!overrides.geofence);
  // "no_position" is split by what the browser reported, so the student sees the right fix (FR-18).
  const reasonCode = r.reason === "no_position" && input.positionError === "denied" ? "permission_denied" : r.reason;
  return { ...r, reasonCode };
}

/** The denial body sent to the student. Distance only for "outside", to the nearest 10 m (FR-18). */
export function denial(geo: GeoResult & { reasonCode: string }) {
  return {
    error: "location",
    reason: geo.reasonCode,
    distanceM: geo.reason === "outside" && geo.distanceM != null ? roundTo10(geo.distanceM) : null,
    accuracyM: geo.reason === "low_accuracy" && geo.accuracyM != null ? Math.round(geo.accuracyM) : null,
  };
}

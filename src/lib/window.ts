// Time window rules (FR-07 to FR-11). The server clock decides; pass `now` from the server.

/** Submissions are accepted up to this long after closing, to cover network delay (FR-09). */
export const SUBMIT_GRACE_MS = 20_000;

export type WindowWeek = { published: boolean; opens_at: string | Date; closes_at: string | Date };

export type WindowState = "unpublished" | "before" | "open" | "closed";

const ms = (t: string | Date) => (t instanceof Date ? t.getTime() : Date.parse(t));

export function windowState(week: WindowWeek, now: number): WindowState {
  if (!week.published) return "unpublished";
  if (now < ms(week.opens_at)) return "before";
  if (now >= ms(week.closes_at)) return "closed";
  return "open";
}

/** Words for a window state in the admin UI ("before" is an internal value, not copy). */
export function windowLabel(state: WindowState | "draft"): string {
  switch (state) {
    case "before": return "Scheduled";
    case "open": return "Open";
    case "closed": return "Closed";
    default: return "Draft";
  }
}

/** True when activity content may be sent (FR-08): published and open, or a time exception applies. */
export function canStart(week: WindowWeek, now: number, timeOverride = false): boolean {
  if (!week.published) return false;
  return timeOverride || windowState(week, now) === "open";
}

/** True when a submission is accepted: open, or within the 20 s grace after closing, or a time exception. */
export function canSubmit(week: WindowWeek, now: number, timeOverride = false): boolean {
  if (!week.published) return false;
  if (timeOverride) return true;
  return now >= ms(week.opens_at) && now < ms(week.closes_at) + SUBMIT_GRACE_MS;
}

/** New closing time after the admin presses "Extend +10 min" n times (FR-10). */
export function extendClose(closesAt: string | Date, steps = 1, now = Date.now()): Date {
  // If the week already closed, extending reopens it for 10 min from now.
  const base = Math.max(ms(closesAt), now);
  return new Date(base + steps * 10 * 60_000);
}

export const ACCRA_TZ = "Africa/Accra";

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const DEFAULT_ACCRA_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ACCRA_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Formats a UTC instant in Accra time (NF-15), reusing cached Intl.DateTimeFormat instances. */
export function formatAccra(t: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  if (!opts || Object.keys(opts).length === 0) {
    return DEFAULT_ACCRA_FMT.format(new Date(t));
  }
  const key = JSON.stringify(opts);
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: ACCRA_TZ,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...opts,
    });
    formatterCache.set(key, fmt);
  }
  return fmt.format(new Date(t));
}

/** Converts a value from <input type="datetime-local"> (Accra wall time, which equals UTC) to ISO. */
export function accraLocalToIso(local: string): string {
  // Africa/Accra is UTC+0 with no daylight saving (SRS 2.3), so wall time equals UTC.
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(local);
  if (!m) throw new Error("invalid_datetime");
  return new Date(`${m[1]}T${m[2]}:00Z`).toISOString();
}

/** Converts an ISO instant to the value format of <input type="datetime-local"> in Accra time. */
export function isoToAccraLocal(iso: string | Date): string {
  return new Date(iso).toISOString().slice(0, 16);
}

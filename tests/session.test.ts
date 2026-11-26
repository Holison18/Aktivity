import { describe, expect, it } from "vitest";
import { denial, geoCheck, sessionExpiryFor, sessionValidUntil, type WeekRow } from "@/lib/server/student";
import { SUBMIT_GRACE_MS } from "@/lib/window";
import { totals, bestFromAttempts } from "@/lib/results";

const week: WeekRow = {
  id: "w", class_id: "c", number: 1, title: "T", link_token: "abcdefghijkl", published: true,
  opens_at: "2026-11-27T08:00:00.000Z", closes_at: "2026-11-27T10:00:00.000Z",
  geofence_enabled: true, center_lat: 5.6037, center_lng: -0.187, radius_m: 150, max_accuracy_m: 100,
};
const close = Date.parse(week.closes_at);
const none = { time: null, geofence: null };

describe("session expiry (FR-04)", () => {
  it("expires when the window closes (plus the 20 s submit grace)", () => {
    expect(sessionExpiryFor(week, none, Date.parse("2026-11-27T08:30:00Z"))).toBe(close + SUBMIT_GRACE_MS);
  });
  it("gives 30 minutes to view scores after the window closed (FR-11)", () => {
    const now = close + 3_600_000;
    expect(sessionExpiryFor(week, none, now)).toBe(now + 30 * 60_000);
  });
  it("follows a time exception that ends later", () => {
    const later = "2026-11-27T12:00:00.000Z";
    expect(sessionExpiryFor(week, { time: { expires_at: later }, geofence: null }, close - 1000)).toBe(Date.parse(later));
  });
  it("stays valid after the admin extends the window (FR-10)", () => {
    const s = { c: "c", w: "w", i: "1234567", exp: close + SUBMIT_GRACE_MS };
    const extended = { ...week, closes_at: new Date(close + 600_000).toISOString() };
    expect(sessionValidUntil(s, extended, none)).toBe(close + 600_000 + SUBMIT_GRACE_MS);
    expect(sessionValidUntil(s, week, none)).toBe(close + SUBMIT_GRACE_MS);
  });
});

describe("denial details (FR-18)", () => {
  it("shows distance to the nearest 10 m only when outside", () => {
    const out = geoCheck(week, none, { position: { lat: 5.6037 + 0.0045, lng: -0.187, accuracy: 15 } });
    expect(denial(out)).toEqual({ error: "location", reason: "outside", distanceM: 500, accuracyM: null });
    const low = geoCheck(week, none, { position: { lat: 5.6037, lng: -0.187, accuracy: 250.4 } });
    expect(denial(low)).toEqual({ error: "location", reason: "low_accuracy", distanceM: null, accuracyM: 250 });
  });
  it("separates permission off from no reading", () => {
    expect(geoCheck(week, none, { positionError: "denied" }).reasonCode).toBe("permission_denied");
    expect(geoCheck(week, none, { positionError: "timeout" }).reasonCode).toBe("no_position");
  });
  it("geofence exception allows a student outside (FR-24)", () => {
    const r = geoCheck(week, { time: null, geofence: { expires_at: "2099-01-01T00:00:00Z" } }, { position: { lat: 6, lng: 0, accuracy: 10 } });
    expect(r.allowed).toBe(true);
  });
});

describe("result totals shared by console and Excel (AC-6)", () => {
  const acts = [{ id: "a1", position: 1, title: "A", max_score: 30 }, { id: "a2", position: 2, title: "B", max_score: "12" }];
  it("sums the best score per activity and computes the percentage", () => {
    const best = bestFromAttempts([
      { activity_id: "a1", index_number: "1", score: 20, flagged: false },
      { activity_id: "a1", index_number: "1", score: 26, flagged: false },
      { activity_id: "a2", index_number: "1", score: "9", flagged: true },
    ]);
    const per = best.get("1")!;
    expect(per.a1).toEqual({ best: 26, attempts: 2, flagged: false });
    expect(totals(acts, per)).toEqual({ total: 35, max: 42, pct: 83.3 });
  });
  it("counts missing activities as zero", () => {
    expect(totals(acts, {})).toEqual({ total: 0, max: 42, pct: 0 });
  });
  it("supports weeks with more than 2 activities", () => {
    const many = [
      ...acts,
      { id: "a3", position: 3, title: "C", max_score: 18 },
      { id: "a4", position: 4, title: "D", max_score: 10 },
    ];
    const best = bestFromAttempts([
      { activity_id: "a1", index_number: "1", score: 25, flagged: false },
      { activity_id: "a3", index_number: "1", score: 15, flagged: false },
      { activity_id: "a4", index_number: "1", score: 10, flagged: false },
    ]);
    expect(totals(many, best.get("1")!)).toEqual({ total: 50, max: 70, pct: 71.4 });
  });
});

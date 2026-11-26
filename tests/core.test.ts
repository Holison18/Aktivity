import { describe, expect, it } from "vitest";
import { checkGeofence, haversineMeters, roundCoord, roundTo10 } from "@/lib/geo";
import { canStart, canSubmit, extendClose, windowState, SUBMIT_GRACE_MS, accraLocalToIso, isoToAccraLocal } from "@/lib/window";
import { attemptsLeft, bestScore, nextAttemptNo, submissionDecision } from "@/lib/attempts";
import { evaluate, fillTemplate } from "@/lib/expr";
import { nameKey, normalizeIndex, isValidIndex, sameClassCode } from "@/lib/identity";
import { randomToken, signSession, verifySession, sign, verify, hashIp } from "@/lib/tokens";

describe("haversine distance (FR-15)", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(5.6037, -0.187, 5.6037, -0.187)).toBe(0);
  });
  it("matches a known distance: 1 degree of latitude is about 111.2 km", () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeCloseTo(111_195, -1);
  });
  it("matches Accra to Kumasi (about 200 km)", () => {
    const d = haversineMeters(5.6037, -0.187, 6.6885, -1.6244);
    expect(d / 1000).toBeGreaterThan(195);
    expect(d / 1000).toBeLessThan(205);
  });
  it("is symmetric and handles the antimeridian", () => {
    expect(haversineMeters(0, 179.9, 0, -179.9)).toBeCloseTo(haversineMeters(0, -179.9, 0, 179.9), 6);
    expect(haversineMeters(0, 179.9, 0, -179.9)).toBeLessThan(23_000);
  });
  it("rounds coordinates to 4 dp and distances to 10 m (FR-18, FR-20)", () => {
    expect(roundCoord(5.603749)).toBe(5.6037);
    expect(roundCoord(-0.18706)).toBe(-0.1871);
    expect(roundTo10(504)).toBe(500);
    expect(roundTo10(505)).toBe(510);
  });
});

describe("geofence check (FR-15 to FR-19)", () => {
  const fence = { enabled: true, lat: 5.6037, lng: -0.187, radiusM: 150, maxAccuracyM: 100 };
  // about 0.0045 deg latitude = 500 m
  const outside = { lat: 5.6037 + 0.0045, lng: -0.187, accuracy: 20 };
  const inside = { lat: 5.6038, lng: -0.1871, accuracy: 20 };

  it("allows a position inside the radius", () => {
    const r = checkGeofence(fence, inside);
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe("ok");
  });
  it("denies a student 500 m away and reports the distance (AC-2)", () => {
    const r = checkGeofence(fence, outside);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("outside");
    expect(roundTo10(r.distanceM!)).toBe(500);
  });
  it("rejects a reading with poor accuracy even when the centre is inside (FR-16)", () => {
    const r = checkGeofence(fence, { ...inside, accuracy: 150 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("low_accuracy");
  });
  it("accepts accuracy exactly at the limit", () => {
    expect(checkGeofence(fence, { ...inside, accuracy: 100 }).allowed).toBe(true);
  });
  it("denies when no position is given", () => {
    expect(checkGeofence(fence, null).reason).toBe("no_position");
  });
  it("allows anything when the fence is off (FR-19) or an exception applies (FR-24)", () => {
    expect(checkGeofence({ ...fence, enabled: false }, null).allowed).toBe(true);
    expect(checkGeofence(fence, outside, true)).toMatchObject({ allowed: true, reason: "override" });
  });
  it("treats NaN accuracy as too low", () => {
    expect(checkGeofence(fence, { ...inside, accuracy: NaN }).reason).toBe("low_accuracy");
  });
});

describe("time window (FR-07 to FR-11)", () => {
  const opens = Date.parse("2026-11-27T08:00:00Z");
  const closes = Date.parse("2026-11-27T10:00:00Z");
  const week = { published: true, opens_at: new Date(opens).toISOString(), closes_at: new Date(closes).toISOString() };

  it("reports before / open / closed / unpublished", () => {
    expect(windowState(week, opens - 1)).toBe("before");
    expect(windowState(week, opens)).toBe("open");
    expect(windowState(week, closes - 1)).toBe("open");
    expect(windowState(week, closes)).toBe("closed");
    expect(windowState({ ...week, published: false }, opens + 1)).toBe("unpublished");
  });
  it("sends content only while open and published (FR-08, AC-3)", () => {
    expect(canStart(week, opens - 1000)).toBe(false);
    expect(canStart(week, opens + 1000)).toBe(true);
    expect(canStart(week, closes + 1000)).toBe(false);
    expect(canStart({ ...week, published: false }, opens + 1000)).toBe(false);
  });
  it("accepts a submission 10 s after close and rejects one at 30 s (FR-09, AC-4)", () => {
    expect(canSubmit(week, closes + 10_000)).toBe(true);
    expect(canSubmit(week, closes + 30_000)).toBe(false);
    expect(canSubmit(week, closes + SUBMIT_GRACE_MS - 1)).toBe(true);
    expect(canSubmit(week, closes + SUBMIT_GRACE_MS)).toBe(false);
    expect(canSubmit(week, opens - 1)).toBe(false);
  });
  it("time exception opens the window for one student (FR-24) but not an unpublished week", () => {
    expect(canStart(week, closes + 3_600_000, true)).toBe(true);
    expect(canSubmit(week, closes + 3_600_000, true)).toBe(true);
    expect(canStart({ ...week, published: false }, opens + 1, true)).toBe(false);
  });
  it("extends by 10 min steps, and from now when already closed (FR-10)", () => {
    expect(extendClose(week.closes_at, 1, opens).getTime()).toBe(closes + 600_000);
    expect(extendClose(week.closes_at, 3, opens).getTime()).toBe(closes + 1_800_000);
    const late = closes + 5 * 60_000;
    expect(extendClose(week.closes_at, 1, late).getTime()).toBe(late + 600_000);
  });
  it("converts Accra wall time to UTC and back (NF-15)", () => {
    expect(accraLocalToIso("2026-11-27T08:00")).toBe("2026-11-27T08:00:00.000Z");
    expect(isoToAccraLocal("2026-11-27T08:00:00.000Z")).toBe("2026-11-27T08:00");
  });
});

describe("attempt limits (FR-25, NF-11)", () => {
  it("gives the next attempt number until the limit", () => {
    expect(nextAttemptNo(0, 2)).toBe(1);
    expect(nextAttemptNo(1, 2)).toBe(2);
    expect(nextAttemptNo(2, 2)).toBeNull();
    expect(attemptsLeft(3, 2)).toBe(0);
  });
  it("best score counts", () => {
    expect(bestScore([])).toBeNull();
    expect(bestScore([{ attempt_no: 1, score: 20, max_score: 30 }, { attempt_no: 2, score: "12", max_score: 30 }])).toBe(20);
  });
  it("treats a repeated attempt number as a duplicate, not a new attempt", () => {
    expect(submissionDecision(1, [], 2)).toBe("accept");
    expect(submissionDecision(1, [1], 2)).toBe("duplicate");
    expect(submissionDecision(2, [1], 2)).toBe("accept");
    expect(submissionDecision(3, [1, 2], 2)).toBe("reject");
    expect(submissionDecision(2, [], 2)).toBe("reject");
    expect(submissionDecision(0, [], 2)).toBe("reject");
  });
});

describe("formula evaluator", () => {
  it("handles precedence, power and functions", () => {
    expect(evaluate("1 + 2 * 3", {})).toBe(7);
    expect(evaluate("2^3^2", {})).toBe(512);
    expect(evaluate("-2^2", {})).toBe(-4);
    expect(evaluate("L * log2(N)", { L: 8, N: 94 })).toBeCloseTo(52.44, 2);
    expect(evaluate("2^(H-1) / 1e10", { H: 41 })).toBeCloseTo(109.95, 2);
    expect(evaluate("max(1, 5, 3) + sqrt(16)", {})).toBe(9);
  });
  it("rejects unknown names and code", () => {
    expect(() => evaluate("constructor", {})).toThrow();
    expect(() => evaluate("process.exit()", {})).toThrow();
    expect(() => evaluate("1 +", {})).toThrow();
    expect(() => evaluate("foo(1)", {})).toThrow();
    expect(() => evaluate("toString()", {})).toThrow();
    expect(() => evaluate("__proto__", {})).toThrow();
  });
  it("fills templates", () => {
    expect(fillTemplate("L = {L}, N = {N}, {missing}", { L: 8, N: 26 })).toBe("L = 8, N = 26, {missing}");
  });
});

describe("identity rules (FR-02, FR-03, section 4)", () => {
  it("normalises index numbers: trimmed, uppercase, no spaces", () => {
    expect(normalizeIndex("  ab 12 34 ")).toBe("AB1234");
  });
  it("compares names ignoring case and spacing", () => {
    expect(nameKey("  Ama   K.  Mensah ")).toBe(nameKey("ama k. mensah"));
    expect(nameKey("Ama Mensah")).not.toBe(nameKey("Kofi Mensah"));
  });
  it("validates against the configured pattern (default 7 digits)", () => {
    expect(isValidIndex("1234567", /^\d{7}$/)).toBe(true);
    expect(isValidIndex("123456", /^\d{7}$/)).toBe(false);
    expect(isValidIndex("12345678", /^\d{7}$/)).toBe(false);
  });
  it("compares class codes ignoring case and spaces", () => {
    expect(sameClassCode("cyb 42", "CYB42")).toBe(true);
    expect(sameClassCode("", "")).toBe(false);
  });
});

describe("tokens (FR-04, NF-02)", () => {
  it("round-trips a session and rejects tampering and expiry", () => {
    const t = signSession({ c: "class", w: "week", i: "1234567", exp: Date.now() + 60_000 });
    expect(verifySession(t)?.i).toBe("1234567");
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ c: "class", w: "week", i: "7654321", exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifySession(`${forged}.${mac}`)).toBeNull();
    expect(verifySession(`${body}.x${mac}`)).toBeNull();
    expect(verifySession(signSession({ c: "c", w: "w", i: "1", exp: Date.now() - 1 }))).toBeNull();
  });
  it("binds signatures to their kind", () => {
    const t = sign("ticket", { a: 1 });
    expect(verify("ticket", t)).toEqual({ a: 1 });
    expect(verify("session", t)).toBeNull();
  });
  it("makes 12-character random link tokens", () => {
    const seen = new Set(Array.from({ length: 500 }, () => randomToken()));
    expect(seen.size).toBe(500);
    for (const t of seen) expect(t).toMatch(/^[A-Za-z0-9]{12}$/);
  });
  it("hashes IPs without storing them", () => {
    const h = hashIp("10.0.0.1")!;
    expect(h).not.toContain("10.0.0.1");
    expect(hashIp("10.0.0.1")).toBe(h);
    expect(hashIp("10.0.0.2")).not.toBe(h);
  });
});

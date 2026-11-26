// Acceptance criteria AC-1 to AC-8 (SRS 8.1) against the live Supabase project.
// Calls the real route handlers in-process. Skipped unless .env.local has the Supabase keys.
// Run:  npm run test:live
// Creates a throwaway class and deletes it (with everything under it) at the end.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local: the suite is skipped below */
}
const LIVE = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const C = { lat: 5.6037, lng: -0.187 };
const INSIDE = { lat: C.lat + 0.0002, lng: C.lng + 0.0001, accuracy: 20 };
const OUTSIDE = { lat: C.lat + 0.0045, lng: C.lng, accuracy: 20 }; // about 500 m north
const rnd = () => "9" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");

describe.skipIf(!LIVE)("acceptance (live Supabase)", () => {
  // Imported lazily so the skipped suite never touches env-dependent modules.
  let db: typeof import("@/lib/supabase/service").db;
  let routes: {
    login: typeof import("@/app/api/s/login/route").POST;
    week: typeof import("@/app/api/s/week/route").GET;
    start: typeof import("@/app/api/s/start/route").POST;
    submit: typeof import("@/app/api/s/submit/route").POST;
  };
  let tpl: typeof import("@/lib/activities/templates");
  let parseActivity: typeof import("@/lib/activities/registry").parseActivity;

  const ctx = { classId: "", code: "", w1: { id: "", token: "" }, w2: { id: "", token: "" }, a1: "", a2: "" };
  const bodies: string[] = []; // every student response body, for AC-5

  async function call(handler: (r: NextRequest) => Promise<Response>, path: string, opts: { body?: unknown; cookie?: string; method?: string; ip?: string } = {}) {
    const req = new NextRequest(`http://localhost${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "x-forwarded-host": "localhost",
        "x-forwarded-for": opts.ip ?? "10.1.2.3",
        "user-agent": "acceptance-test",
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const res = await handler(req);
    const text = await res.text();
    bodies.push(text);
    const set = res.headers.getSetCookie?.() ?? [];
    const cookie = set.map((c) => c.split(";")[0]).find((c) => c.startsWith("sap_session="));
    return { status: res.status, json: JSON.parse(text), text, cookie };
  }

  async function register(token: string, index: string, name: string, pos = INSIDE, ip?: string) {
    const first = await call(routes.login, "/api/s/login", { body: { token, index, position: pos }, ip });
    expect(first.json.status).toBe("register");
    const r = await call(routes.login, "/api/s/login", { body: { token, index, position: pos, register: { indexConfirm: index, name, classCode: ctx.code } }, ip });
    return r;
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/supabase/service"));
    routes = {
      login: (await import("@/app/api/s/login/route")).POST,
      week: (await import("@/app/api/s/week/route")).GET,
      start: (await import("@/app/api/s/start/route")).POST,
      submit: (await import("@/app/api/s/submit/route")).POST,
    };
    tpl = await import("@/lib/activities/templates");
    ({ parseActivity } = await import("@/lib/activities/registry"));
    const { randomToken } = await import("@/lib/tokens");

    ctx.code = "ACC" + Math.floor(Math.random() * 1e5);
    const cls = await db().from("classes").insert({ name: `Acceptance test ${new Date().toISOString()}`, join_code: ctx.code, default_lat: C.lat, default_lng: C.lng, default_radius_m: 150 }).select("id").single();
    if (cls.error) throw new Error(cls.error.message);
    ctx.classId = cls.data.id;
    const now = Date.now();
    const mkWeek = async (number: number, opens: number, closes: number) => {
      const token = randomToken(12);
      const w = await db().from("weeks").insert({ class_id: ctx.classId, number, title: `Week ${number}`, opens_at: new Date(opens).toISOString(), closes_at: new Date(closes).toISOString(), published: true, link_token: token, geofence_enabled: true, center_lat: C.lat, center_lng: C.lng, radius_m: 150, max_accuracy_m: 100 }).select("id").single();
      if (w.error) throw new Error(w.error.message);
      return { id: w.data.id as string, token };
    };
    ctx.w1 = await mkWeek(1, now - 10 * 60_000, now + 60 * 60_000);
    ctx.w2 = await mkWeek(2, now + 86_400_000, now + 86_400_000 + 7_200_000);
    const mkAct = async (weekId: string, position: number, t: typeof tpl.ciaTemplate) => {
      const p = parseActivity(t.type, t.config, t.answer_key);
      const a = await db().from("activities").insert({ week_id: weekId, position, type: t.type, title: t.title, instructions: t.instructions, config: p.config, answer_key: p.key, max_score: p.maxScore, max_attempts: 2 }).select("id").single();
      if (a.error) throw new Error(a.error.message);
      return a.data.id as string;
    };
    ctx.a1 = await mkAct(ctx.w1.id, 1, tpl.ciaTemplate);
    ctx.a2 = await mkAct(ctx.w1.id, 2, tpl.passwordTemplate);
    await mkAct(ctx.w2.id, 1, tpl.ciaTemplate);
  }, 60_000);

  afterAll(async () => {
    if (ctx.classId) await db().from("classes").delete().eq("id", ctx.classId);
  });

  const S1 = rnd();
  let s1Cookie = "";

  it("FR-02: wrong class code and bad index format give the same generic message", async () => {
    const bad = await call(routes.login, "/api/s/login", { body: { token: ctx.w1.token, index: "12AB", position: INSIDE } });
    const wrong = await call(routes.login, "/api/s/login", { body: { token: ctx.w1.token, index: rnd(), position: INSIDE, register: { indexConfirm: "x", name: "A B", classCode: "NOPE" } } });
    expect(bad.status).toBe(400);
    // index_mismatch is checked first for "x", so test the class code with a matching confirmation:
    const idx = rnd();
    const wrongCode = await call(routes.login, "/api/s/login", { body: { token: ctx.w1.token, index: idx, position: INSIDE, register: { indexConfirm: idx, name: "Ama Mensah", classCode: "NOPE" } } });
    expect(wrongCode.status).toBe(400);
    expect(wrongCode.json.message).toBe(bad.json.message);
    expect(wrong.status).toBe(400);
  });

  it("AC-1: a registered student inside the radius completes both activities; score with feedback in under 1 s", async () => {
    const r = await register(ctx.w1.token, S1, "Ama Mensah");
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();
    s1Cookie = r.cookie!;

    const wk = await call(routes.week, "/api/s/week", { cookie: s1Cookie });
    expect(wk.json.activities).toHaveLength(2);

    const st1 = await call(routes.start, "/api/s/start", { cookie: s1Cookie, body: { activityId: ctx.a1, position: INSIDE } });
    expect(st1.status).toBe(200);
    const key = tpl.ciaTemplate.answer_key as { cards: Record<string, { category: string; judge: string }> };
    const perfect = { placements: Object.fromEntries(Object.entries(key.cards).map(([id, k]) => [id, { category: k.category, judge: k.judge }])) };
    const t0 = performance.now();
    const sub1 = await call(routes.submit, "/api/s/submit", { cookie: s1Cookie, body: { activityId: ctx.a1, ticket: st1.json.ticket, answers: perfect, position: INSIDE } });
    const ms = performance.now() - t0;
    expect(sub1.status).toBe(200);
    expect(sub1.json.score).toBe(30);
    expect(sub1.json.result.sections[0].items.length).toBe(15);
    expect(ms).toBeLessThan(1000);

    const st2 = await call(routes.start, "/api/s/start", { cookie: s1Cookie, body: { activityId: ctx.a2, position: INSIDE } });
    const sub2 = await call(routes.submit, "/api/s/submit", { cookie: s1Cookie, body: { activityId: ctx.a2, ticket: st2.json.ticket, answers: { pairs: { p1: "b", p2: "a" } }, position: INSIDE } });
    expect(sub2.status).toBe(200);
    expect(sub2.json.score).toBe(2);
    expect(sub2.json.flagged).toBe(false);
  });

  it("NF-11: resubmitting the same attempt returns the saved result and creates no duplicate", async () => {
    const st = await db().from("attempts").select("id").eq("activity_id", ctx.a1).eq("index_number", S1);
    expect(st.data).toHaveLength(1);
    // Re-sign the first ticket by starting is not possible (attempt 1 used), so replay through the DB-backed rule:
    const before = st.data!.length;
    const { signTicket } = await import("@/lib/tokens");
    const replay = await call(routes.submit, "/api/s/submit", { cookie: s1Cookie, body: { activityId: ctx.a1, ticket: signTicket({ a: ctx.a1, i: S1, n: 1, s: Date.now() }), answers: {}, position: INSIDE } });
    expect(replay.status).toBe(200);
    expect(replay.json.duplicate).toBe(true);
    expect(replay.json.score).toBe(30);
    const after = await db().from("attempts").select("id").eq("activity_id", ctx.a1).eq("index_number", S1);
    expect(after.data!.length).toBe(before);
  });

  it("FR-03: the same index registered with a different name is blocked and flagged", async () => {
    const r = await call(routes.login, "/api/s/login", { body: { token: ctx.w1.token, index: S1, position: INSIDE, register: { indexConfirm: S1, name: "Kofi Someone", classCode: ctx.code } } });
    expect(r.status).toBe(409);
    const ev = await db().from("access_events").select("id").eq("index_number", S1).eq("reason", "name_mismatch");
    expect(ev.data!.length).toBeGreaterThan(0);
  });

  it("AC-2: a student 500 m outside is denied with the distance on both start and submit", async () => {
    const S2 = rnd();
    const r = await register(ctx.w1.token, S2, "Kwame Boateng");
    const cookie = r.cookie!;
    const denied = await call(routes.start, "/api/s/start", { cookie, body: { activityId: ctx.a1, position: OUTSIDE } });
    expect(denied.status).toBe(403);
    expect(denied.json.reason).toBe("outside");
    expect(denied.json.distanceM).toBe(500);
    expect(denied.json.activity).toBeUndefined();

    const low = await call(routes.start, "/api/s/start", { cookie, body: { activityId: ctx.a1, position: { ...INSIDE, accuracy: 400 } } });
    expect(low.json.reason).toBe("low_accuracy");

    const st = await call(routes.start, "/api/s/start", { cookie, body: { activityId: ctx.a1, position: INSIDE } });
    const sub = await call(routes.submit, "/api/s/submit", { cookie, body: { activityId: ctx.a1, ticket: st.json.ticket, answers: {}, position: OUTSIDE } });
    expect(sub.status).toBe(403);
    expect(sub.json.error).toBe("location");
    expect(sub.json.reason).toBe("outside");
    expect(sub.json.distanceM).toBe(500);

    const saved = await db().from("attempts").select("id").eq("activity_id", ctx.a1).eq("index_number", S2);
    expect(saved.data).toHaveLength(0);

    const log = await db().from("access_events").select("event, allowed, reason, lat, distance_m").eq("index_number", S2).eq("week_id", ctx.w1.id);
    expect(log.data!.some((e) => e.event === "start" && !e.allowed && e.reason === "outside")).toBe(true);
    expect(log.data!.some((e) => e.event === "submit" && !e.allowed && e.reason === "outside")).toBe(true);
    // FR-20: coordinates stored rounded to 4 dp
    for (const e of log.data!) if (e.lat != null) expect(Number(e.lat)).toBe(Math.round(Number(e.lat) * 1e4) / 1e4);
  });

  it("AC-3: before the window no activity content appears in any response", async () => {
    const r = await call(routes.login, "/api/s/login", { body: { token: ctx.w2.token, index: S1 } });
    expect(r.status).toBe(200);
    const st = await call(routes.start, "/api/s/start", { cookie: r.cookie!, body: { activityId: (await db().from("activities").select("id").eq("week_id", ctx.w2.id).single()).data!.id, position: INSIDE } });
    expect(st.status).toBe(403);
    expect(st.json.state).toBe("before");
    expect(st.text).not.toMatch(/pendrive|categories|cards|view/);
  });

  it("AC-4: a submission 10 s after closing is accepted, one 30 s after is rejected; after the window, no content", async () => {
    const st1 = await call(routes.start, "/api/s/start", { cookie: s1Cookie, body: { activityId: ctx.a1, position: INSIDE } });
    const st2 = await call(routes.start, "/api/s/start", { cookie: s1Cookie, body: { activityId: ctx.a2, position: INSIDE } });
    expect(st1.json.attemptNo).toBe(2);
    expect(st2.json.attemptNo).toBe(2);

    await db().from("weeks").update({ closes_at: new Date(Date.now() - 10_000).toISOString() }).eq("id", ctx.w1.id);
    const ok = await call(routes.submit, "/api/s/submit", { cookie: s1Cookie, body: { activityId: ctx.a1, ticket: st1.json.ticket, answers: {}, position: INSIDE, auto: true } });
    expect(ok.status).toBe(200);

    await db().from("weeks").update({ closes_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", ctx.w1.id);
    const late = await call(routes.submit, "/api/s/submit", { cookie: s1Cookie, body: { activityId: ctx.a2, ticket: st2.json.ticket, answers: {}, position: INSIDE, auto: true } });
    expect(late.status).toBe(403);

    // AC-3, after the window: login works (past scores), but start returns no content.
    const again = await call(routes.login, "/api/s/login", { body: { token: ctx.w1.token, index: S1 } });
    expect(again.status).toBe(200);
    const after = await call(routes.start, "/api/s/start", { cookie: again.cookie!, body: { activityId: ctx.a2, position: INSIDE } });
    expect(after.status).toBe(403);
    expect(after.text).not.toMatch(/numeric|pairs|view/);
    const wk = await call(routes.week, "/api/s/week", { cookie: again.cookie! });
    expect(wk.json.week.state).toBe("closed");
    expect(wk.json.activities.find((a: { id: string }) => a.id === ctx.a1).best).toBe(30); // FR-11: past scores visible
  });

  it("AC-5: no answer key appears in any student response", () => {
    const all = bodies.join("\n");
    expect(all).not.toContain("answer_key");
    expect(all).not.toContain("formula");
    expect(all).not.toContain("tolerance");
    expect(all).not.toContain("choiceMatchesTop");
    expect(all).not.toMatch(/"correct"\s*:/);
  });

  it("AC-6: the Excel export has four sheets and totals that match the console", async () => {
    const { buildWorkbook } = await import("@/lib/server/excel");
    const { totals } = await import("@/lib/results");
    const { buffer } = await buildWorkbook({ classId: ctx.classId, weekId: ctx.w1.id });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Attempts", "Answers", "Access log"]);

    // Console numbers: the same RPC + totals() that /api/admin/results uses.
    const rpc = await db().rpc("week_results", { p_week: ctx.w1.id });
    const consoleTotals = new Map<string, number>();
    for (const s of rpc.data.students) consoleTotals.set(s.index_number, totals(rpc.data.activities, s.results).total);

    const sheet = wb.getWorksheet("Summary")!;
    const header = (sheet.getRow(1).values as unknown[]).map(String);
    const totalCol = header.indexOf("Total");
    let checked = 0;
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      const idx = String(row.getCell(1).value);
      expect(Number(row.getCell(totalCol).value)).toBe(consoleTotals.get(idx));
      checked++;
    });
    expect(checked).toBe(consoleTotals.size);
    expect(consoleTotals.get(S1)).toBe(32);
  });

  it("AC-7: the database allows more than two activities while enforcing positive unique positions", async () => {
    const t = tpl.ciaTemplate;
    const third = await db().from("activities").insert({ week_id: ctx.w1.id, position: 3, type: t.type, title: "Third", config: t.config, answer_key: t.answer_key, max_score: 30 }).select("id").single();
    expect(third.error).toBeNull();
    if (third.data?.id) await db().from("activities").delete().eq("id", third.data.id);
    const invalid = await db().from("activities").insert({ week_id: ctx.w1.id, position: 0, type: t.type, title: "Zero", config: t.config, answer_key: t.answer_key, max_score: 30 });
    expect(invalid.error?.code).toBe("23514");
    const dup = await db().from("activities").insert({ week_id: ctx.w1.id, position: 1, type: t.type, title: "Dup", config: t.config, answer_key: t.answer_key, max_score: 30 });
    expect(dup.error?.code).toBe("23505");
  });

  it("FR-05: the 11th sign-in attempt for one index in 10 minutes is rate limited", async () => {
    const idx = rnd();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call(routes.login, "/api/s/login", { body: { token: ctx.w2.token, index: idx } })).status;
    expect(last).toBe(429);
  });

  it("AC-8: 150 simulated logins within 2 minutes all complete without errors", async () => {
    // Re-open week 1 for the burst.
    await db().from("weeks").update({ closes_at: new Date(Date.now() + 3_600_000).toISOString() }).eq("id", ctx.w1.id);
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: 150 }, async (_, i) => {
        const idx = `8${String(i).padStart(3, "0")}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
        const r = await register(ctx.w1.token, idx, `Student Number${i}`, INSIDE, "10.9.9.9");
        return r.status;
      }),
    );
    const elapsed = Date.now() - t0;
    expect(results.filter((s) => s !== 200)).toEqual([]);
    expect(elapsed).toBeLessThan(120_000);
    console.log(`AC-8: 150 registrations + logins in ${(elapsed / 1000).toFixed(1)} s`);
  }, 150_000);
});

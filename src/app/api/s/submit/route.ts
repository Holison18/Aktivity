// Submit an attempt. Ordered checks (SRS 7): session -> window (+20 s grace) -> attempts -> location.
// Anyone outside the geofence radius (without an exception) is blocked from submitting.
// Idempotent: a retry or double tap with the same ticket returns the saved result (NF-11).
import type { NextRequest } from "next/server";
import { json, readBody, SESSION_ENDED } from "@/lib/server/http";
import { submitBody } from "@/lib/server/schemas";
import { db, must } from "@/lib/supabase/service";
import { activeOverrides, denial, geoCheck, logEvent, requestMeta, sessionValidUntil, verifyStudentCookie, weekById } from "@/lib/server/student";
import { canSubmit } from "@/lib/window";
import { attemptsLeft, bestScore, submissionDecision } from "@/lib/attempts";
import { scoreSubmission } from "@/lib/activities/registry";
import { SESSION_COOKIE, verifyTicket } from "@/lib/tokens";
import type { ScoreResult } from "@/lib/activities/types";

type AttemptRow = { attempt_no: number; score: number; max_score: number; feedback: ScoreResult; flagged: boolean; flag_reason: string | null };

export async function POST(req: NextRequest) {
  const body = await readBody(req, submitBody);
  if (!body.ok) return body.res;
  const meta = requestMeta(req);

  // AR-1 session & ticket (pure CPU HMAC checks before hitting the database)
  const s = verifyStudentCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return json(SESSION_ENDED, 401);
  const ticket = verifyTicket(body.data.ticket);
  if (!ticket || ticket.a !== body.data.activityId || ticket.i !== s.i) {
    return json({ error: "ticket", message: "This attempt could not be matched to your sign-in. Reload the page and start the activity again." }, 400);
  }

  const now = Date.now();
  // Single parallel round-trip for session context, activity (+ answer key), and existing attempts.
  const [week, studentRes, overrides, actRes, mineRes] = await Promise.all([
    weekById(s.w),
    db().from("students").select("index_number, name").eq("class_id", s.c).eq("index_number", s.i).maybeSingle(),
    activeOverrides(s.w, s.i, now),
    // The answer key is loaded only here, for scoring on the server (D-10).
    db().from("activities").select("id, week_id, type, config, answer_key, max_attempts, max_score").eq("id", ticket.a).eq("week_id", s.w).maybeSingle(),
    db()
      .from("attempts")
      .select("attempt_no, score, max_score, feedback, flagged, flag_reason")
      .eq("activity_id", ticket.a)
      .eq("class_id", s.c)
      .eq("index_number", s.i)
      .order("attempt_no"),
  ]);

  const student = must(studentRes, "load student") as { index_number: string; name: string } | null;
  if (!week || week.class_id !== s.c || !student || now >= sessionValidUntil(s, week, overrides)) {
    return json(SESSION_ENDED, 401);
  }

  const act = must(actRes, "load activity") as { id: string; type: string; config: unknown; answer_key: unknown; max_attempts: number; max_score: number } | null;
  if (!act) return json({ error: "not_found", message: "This activity no longer exists. Ask your lecturer." }, 404);

  const base = { class_id: week.class_id, week_id: week.id, activity_id: act.id, index_number: student.index_number, event: "submit" as const, ...meta };

  const loadMine = async () =>
    must(
      await db().from("attempts").select("attempt_no, score, max_score, feedback, flagged, flag_reason").eq("activity_id", act.id).eq("class_id", week.class_id).eq("index_number", student.index_number).order("attempt_no"),
      "load attempts",
    ) as AttemptRow[];

  const reply = (row: AttemptRow, all: AttemptRow[], duplicate: boolean) =>
    json({
      attemptNo: row.attempt_no,
      score: Number(row.score),
      maxScore: Number(row.max_score),
      result: row.feedback,
      flagged: row.flagged,
      attemptsLeft: attemptsLeft(all.length, act.max_attempts),
      best: bestScore(all),
      duplicate,
    });

  let mine = must(mineRes, "load attempts") as AttemptRow[];
  const decision = submissionDecision(ticket.n, mine.map((m) => m.attempt_no), act.max_attempts);
  if (decision === "duplicate") return reply(mine.find((m) => m.attempt_no === ticket.n)!, mine, true);

  // AR-2 window, with 20 s grace after closing (FR-09, AC-4)
  if (!canSubmit(week, now, !!overrides.time)) {
    await logEvent({ ...base, allowed: false, reason: "window_closed", position: body.data.position });
    return json({ error: "window", message: "The week closed before your answers arrived. Your earlier scores still count." }, 403);
  }

  // AR-4 attempts
  if (decision === "reject") {
    await logEvent({ ...base, allowed: false, reason: "no_attempts_left", position: body.data.position });
    return json({ error: "attempts", message: "You have no attempts left on this activity. Your best score counts." }, 409);
  }

  // AR-3 location: re-checked on submit; block submissions outside the allowed radius.
  const geo = geoCheck(week, overrides, body.data);
  if (!geo.allowed) {
    await logEvent({ ...base, allowed: false, reason: geo.reasonCode, position: body.data.position, geo });
    return json(denial(geo), 403);
  }

  const { answers, result } = scoreSubmission(act.type, act.config, act.answer_key, body.data.answers, {
    index: student.index_number,
    reveal: ticket.n >= act.max_attempts,
  });

  // Write the attempt and access log concurrently instead of serially.
  const [, ins] = await Promise.all([
    logEvent({ ...base, allowed: true, reason: geo.reasonCode, position: body.data.position, geo }),
    db().from("attempts").insert({
      activity_id: act.id,
      class_id: week.class_id,
      index_number: student.index_number,
      attempt_no: ticket.n,
      started_at: new Date(ticket.s).toISOString(),
      submitted_at: new Date(now).toISOString(),
      auto_submitted: body.data.auto,
      answers,
      score: result.score,
      max_score: result.max,
      feedback: result,
      flagged: false,
      flag_reason: null,
    }),
  ]);
  if (ins.error && ins.error.code !== "23505") throw new Error(ins.error.message);

  // Fast path: no unique-constraint race, so return the inserted row without re-querying.
  if (!ins.error) {
    const saved: AttemptRow = {
      attempt_no: ticket.n,
      score: result.score,
      max_score: result.max,
      feedback: result,
      flagged: false,
      flag_reason: null,
    };
    return reply(saved, [...mine, saved], false);
  }

  // On a unique-constraint race (23505) the first insert wins; return what was saved.
  mine = await loadMine();
  const saved = mine.find((m) => m.attempt_no === ticket.n)!;
  return reply(saved, mine, true);
}

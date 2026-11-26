// Start an activity. Ordered checks (SRS 7): session -> window -> location -> attempts left.
// The first failure stops the request. On success the activity is sent WITHOUT its answer key.
import type { NextRequest } from "next/server";
import { json, readBody, SESSION_ENDED } from "@/lib/server/http";
import { startBody } from "@/lib/server/schemas";
import { db, must } from "@/lib/supabase/service";
import { ACTIVITY_PUBLIC_COLS, activeOverrides, denial, geoCheck, logEvent, requestMeta, sessionValidUntil, verifyStudentCookie, weekById, type ActivityPublicRow } from "@/lib/server/student";
import { canStart, windowState } from "@/lib/window";
import { nextAttemptNo } from "@/lib/attempts";
import { publicView } from "@/lib/activities/registry";
import { SESSION_COOKIE, signTicket } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  const body = await readBody(req, startBody);
  if (!body.ok) return body.res;
  const meta = requestMeta(req);

  // AR-1 session (verify signed cookie first, then fetch all read dependencies in one parallel round-trip)
  const s = verifyStudentCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s) return json(SESSION_ENDED, 401);
  const now = Date.now();

  const [week, studentRes, overrides, actRes, countRes] = await Promise.all([
    weekById(s.w),
    db().from("students").select("index_number, name").eq("class_id", s.c).eq("index_number", s.i).maybeSingle(),
    activeOverrides(s.w, s.i, now),
    db().from("activities").select(ACTIVITY_PUBLIC_COLS).eq("id", body.data.activityId).eq("week_id", s.w).maybeSingle(),
    db().from("attempts").select("attempt_no").eq("activity_id", body.data.activityId).eq("index_number", s.i).eq("class_id", s.c),
  ]);

  const student = must(studentRes, "load student") as { index_number: string; name: string } | null;
  if (!week || week.class_id !== s.c || !student || now >= sessionValidUntil(s, week, overrides)) {
    return json(SESSION_ENDED, 401);
  }

  const act = must(actRes, "load activity") as ActivityPublicRow | null;
  if (!act) return json({ error: "not_found", message: "This activity is not part of your week. Go back and pick one from the list." }, 404);

  const base = { class_id: week.class_id, week_id: week.id, activity_id: act.id, index_number: student.index_number, event: "start" as const, ...meta };

  // AR-2 window (FR-08: no content outside the window)
  if (!canStart(week, now, !!overrides.time)) {
    const state = windowState(week, now);
    await logEvent({ ...base, allowed: false, reason: `window_${state}` });
    return json({ error: "window", state, message: state === "before" ? "This week has not opened yet." : "This week is closed. You can still see your scores." }, 403);
  }

  // AR-3 location
  const geo = geoCheck(week, overrides, body.data);
  if (!geo.allowed) {
    await logEvent({ ...base, allowed: false, reason: geo.reasonCode, position: body.data.position, geo });
    return json(denial(geo), 403);
  }

  // AR-4 attempts left
  const usedNos = (must(countRes, "count attempts") as { attempt_no: number }[]).map((r) => r.attempt_no);
  const attemptNo = nextAttemptNo(usedNos.length, act.max_attempts);
  if (attemptNo == null) {
    await logEvent({ ...base, allowed: false, reason: "no_attempts_left", position: body.data.position, geo });
    return json({ error: "attempts", message: "You have used all your attempts for this activity. Your best score counts." }, 409);
  }

  await logEvent({ ...base, allowed: true, reason: geo.reasonCode, position: body.data.position, geo });

  return json({
    activity: {
      id: act.id,
      type: act.type,
      title: act.title,
      instructions: act.instructions,
      maxScore: Number(act.max_score),
      view: publicView(act.type, act.config, student.index_number),
    },
    attemptNo,
    maxAttempts: act.max_attempts,
    ticket: signTicket({ a: act.id, i: student.index_number, n: attemptNo, s: now }),
    serverNow: now,
  });
}

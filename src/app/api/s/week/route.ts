// "This week" data for a signed-in student (FR-06, FR-11). Never includes activity content or keys.
import type { NextRequest } from "next/server";
import { json, SESSION_ENDED } from "@/lib/server/http";
import { db, must } from "@/lib/supabase/service";
import { activeOverrides, sessionCookie, sessionValidUntil, verifyStudentCookie, weekById } from "@/lib/server/student";
import { SESSION_COOKIE } from "@/lib/tokens";
import { attemptsLeft, bestScore } from "@/lib/attempts";
import { canStart, windowState } from "@/lib/window";

export async function GET(req: NextRequest) {
  const session = verifyStudentCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return json(SESSION_ENDED, 401);
  const now = Date.now();

  // Single parallel round-trip: session validation + week activities + all attempts for this student in this class.
  const [week, studentRes, overrides, actsRes, allAttemptsRes] = await Promise.all([
    weekById(session.w),
    db().from("students").select("index_number, name").eq("class_id", session.c).eq("index_number", session.i).maybeSingle(),
    activeOverrides(session.w, session.i, now),
    db().from("activities").select("id, position, type, title, max_attempts, max_score").eq("week_id", session.w).order("position"),
    db()
      .from("attempts")
      .select("activity_id, attempt_no, score, max_score, flagged, activities!inner(title, week_id, weeks!inner(number, title))")
      .eq("class_id", session.c)
      .eq("index_number", session.i),
  ]);

  const student = must(studentRes, "load student") as { index_number: string; name: string } | null;
  if (!week || week.class_id !== session.c || !student || now >= sessionValidUntil(session, week, overrides)) {
    return json(SESSION_ENDED, 401);
  }

  const acts = must(actsRes, "load activities") as { id: string; position: number; type: string; title: string; max_attempts: number; max_score: number }[];
  const allAttempts = must(allAttemptsRes, "load attempts") as unknown as {
    activity_id: string;
    attempt_no: number;
    score: number;
    max_score: number;
    flagged: boolean;
    activities: { title: string; week_id: string; weeks: { number: number; title: string } };
  }[];

  const state = windowState(week, now);
  const open = canStart(week, now, !!overrides.time);
  const currentByActivity = new Map<string, { attempt_no: number; score: number; max_score: number; flagged: boolean }[]>();
  const pastMap = new Map<string, { week: number; weekTitle: string; title: string; best: number; max: number }>();

  for (const t of allAttempts) {
    if (t.activities.week_id === week.id) {
      let bucket = currentByActivity.get(t.activity_id);
      if (!bucket) {
        bucket = [];
        currentByActivity.set(t.activity_id, bucket);
      }
      bucket.push({ attempt_no: t.attempt_no, score: t.score, max_score: t.max_score, flagged: t.flagged });
    } else {
      const k = t.activity_id;
      const cur = pastMap.get(k);
      const s = Number(t.score);
      if (!cur || s > cur.best) {
        pastMap.set(k, { week: t.activities.weeks.number, weekTitle: t.activities.weeks.title, title: t.activities.title, best: s, max: Number(t.max_score) });
      }
    }
  }

  const activities = acts.map((a) => {
    const mine = currentByActivity.get(a.id) ?? [];
    const used = mine.length;
    const left = attemptsLeft(used, a.max_attempts);
    return {
      id: a.id,
      position: a.position,
      title: a.title,
      type: a.type,
      maxScore: Number(a.max_score),
      maxAttempts: a.max_attempts,
      attemptsUsed: used,
      attemptsLeft: left,
      best: bestScore(mine),
      flagged: mine.some((t) => t.flagged),
      status: used === 0 ? (open ? "not_started" : "unavailable") : left > 0 && open ? "can_retry" : "done",
    };
  });

  const res = json({
    serverNow: now,
    student: { index: student.index_number, name: student.name },
    week: {
      id: week.id,
      number: week.number,
      title: week.title,
      opensAt: week.opens_at,
      closesAt: overrides.time && Date.parse(overrides.time.expires_at) > Date.parse(week.closes_at) ? overrides.time.expires_at : week.closes_at,
      state: overrides.time && week.published ? "open" : state,
      geofenceEnabled: week.geofence_enabled && !overrides.geofence,
      maxAccuracyM: week.max_accuracy_m,
    },
    activities,
    past: [...pastMap.values()].sort((a, b) => a.week - b.week),
  });

  // Re-issue the cookie so its expiry follows an extended window (FR-04, FR-10).
  const exp = sessionValidUntil(session, week, overrides);
  if (exp > session.exp) {
    const c = sessionCookie({ ...session, exp });
    res.cookies.set(c.name, c.value, c.options);
  }
  return res;
}

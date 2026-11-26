// Student detail (FR-33): every attempt, the answers, location checks, flags, and the exception form (FR-24).
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { ResultView } from "@/components/ResultView";
import { OverrideForm, EndOverrideButton } from "@/components/admin/OverrideForm";
import { describeAnswers } from "@/lib/activities/registry";
import { formatAccra } from "@/lib/window";
import type { ScoreResult } from "@/lib/activities/types";
import { requestTime } from "@/lib/server/http";

export default async function StudentDetail(props: PageProps<"/admin/weeks/[id]/students/[index]">) {
  await requireAdmin();
  const { id, index: rawIndex } = await props.params;
  const index = decodeURIComponent(rawIndex);
  if (!z.uuid().safeParse(id).success) notFound();
  const [weekRes, actsRes, evRes, ovRes] = await Promise.all([
    db().from("weeks").select("id, class_id, number, title").eq("id", id).maybeSingle(),
    db().from("activities").select("id, position, title, type, config").eq("week_id", id).order("position"),
    db().from("access_events").select("created_at, event, allowed, reason, lat, lng, accuracy_m, distance_m, activity_id, user_agent").eq("week_id", id).eq("index_number", index).order("created_at", { ascending: false }).limit(500),
    db().from("overrides").select("id, kind, reason, expires_at, created_at").eq("week_id", id).eq("index_number", index).order("created_at", { ascending: false }),
  ]);
  const week = must(weekRes, "load week") as { id: string; class_id: string; number: number; title: string } | null;
  if (!week) notFound();
  const acts = must(actsRes, "load activities") as { id: string; position: number; title: string; type: string; config: unknown }[];
  const events = must(evRes, "load events") as { created_at: string; event: string; allowed: boolean; reason: string | null; lat: number | null; lng: number | null; accuracy_m: number | null; distance_m: number | null; activity_id: string | null; user_agent: string | null }[];
  const overrides = must(ovRes, "load overrides") as { id: string; kind: string; reason: string; expires_at: string; created_at: string }[];

  const [studentRes, attemptsRes] = await Promise.all([
    db().from("students").select("index_number, name, registered_at").eq("class_id", week.class_id).eq("index_number", index).maybeSingle(),
    acts.length
      ? db().from("attempts").select("activity_id, attempt_no, started_at, submitted_at, auto_submitted, answers, score, max_score, feedback, flagged, flag_reason").eq("class_id", week.class_id).eq("index_number", index).in("activity_id", acts.map((a) => a.id)).order("submitted_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const student = must(studentRes, "load student") as { index_number: string; name: string; registered_at: string } | null;
  if (!student) notFound();
  const attempts = must(attemptsRes, "load attempts") as {
    activity_id: string; attempt_no: number; started_at: string | null; submitted_at: string; auto_submitted: boolean; answers: unknown; score: number; max_score: number; feedback: ScoreResult; flagged: boolean; flag_reason: string | null;
  }[];
  const now = requestTime();

  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <p className="label"><Link href={`/admin/weeks/${id}/results`} className="underline underline-offset-2">Week {week.number} results</Link></p>
        <h1 className="display text-4xl sm:text-5xl">{student.name}</h1>
        <p><strong className="tabular-nums">{student.index_number}</strong> · registered {formatAccra(student.registered_at)}</p>
      </div>

      <section className="space-y-4">
        <h2 className="label">Attempts</h2>
        {attempts.length === 0 && <p className="notice">No attempts this week.</p>}
        {acts.map((a) => {
          const mine = attempts.filter((t) => t.activity_id === a.id);
          if (!mine.length) return null;
          return (
            <div key={a.id} className="space-y-3">
              <h3 className="text-ink text-lg font-medium">Activity {a.position}: {a.title}</h3>
              {mine.map((t) => (
                <details key={t.attempt_no} className="card p-5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="display text-2xl tabular-nums">{Number(t.score)}<span className="text-sm font-sans font-light text-muted">/{Number(t.max_score)}</span></span>
                    <span>Attempt {t.attempt_no}</span>
                    <span className="text-sm">{formatAccra(t.submitted_at, { second: "2-digit" })}{t.auto_submitted ? " · auto-submitted" : ""}</span>
                    {t.flagged && <span className="mark-bad">Flagged: {t.flag_reason}</span>}
                  </summary>
                  <div className="mt-5 space-y-5">
                    <p className="text-sm break-words"><strong>Answers:</strong> {describeAnswers(a.type, a.config, t.answers)}</p>
                    <ResultView result={t.feedback} />
                  </div>
                </details>
              ))}
            </div>
          );
        })}
      </section>

      <section className="space-y-4">
        <h2 className="label">Exceptions</h2>
        {overrides.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Kind</th><th>Reason</th><th>Granted</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id}>
                    <td>{o.kind}</td><td>{o.reason}</td><td>{formatAccra(o.created_at)}</td><td>{formatAccra(o.expires_at)}</td>
                    <td>{Date.parse(o.expires_at) > now ? <EndOverrideButton id={o.id} /> : <span className="text-body">ended</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card p-5"><OverrideForm weekId={id} index={index} /></div>
      </section>

      <section className="space-y-4">
        <h2 className="label">Location checks and access log</h2>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Time</th><th>Event</th><th>Result</th><th>Reason</th><th className="text-right">Distance</th><th className="text-right">Accuracy</th><th>Position</th></tr></thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatAccra(e.created_at, { second: "2-digit" })}</td>
                  <td>{e.event}{e.activity_id ? ` A${acts.find((a) => a.id === e.activity_id)?.position ?? "?"}` : ""}</td>
                  <td>{e.allowed ? <span className="mark-ok">Allowed</span> : <span className="mark-bad">Denied</span>}</td>
                  <td>{e.reason}</td>
                  <td className="text-right tabular-nums">{e.distance_m != null ? `${Number(e.distance_m)} m` : "–"}</td>
                  <td className="text-right tabular-nums">{e.accuracy_m != null ? `±${Number(e.accuracy_m)} m` : "–"}</td>
                  <td className="tabular-nums text-sm">{e.lat != null ? `${Number(e.lat)}, ${Number(e.lng)}` : "–"}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={7} className="text-body">No access events this week.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

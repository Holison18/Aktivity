// Flagged items for review: attempts flagged at submission (FR-17) and blocked
// re-registrations under a different name (FR-03).
import Link from "next/link";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { formatAccra } from "@/lib/window";

export default async function ReviewPage() {
  await requireAdmin();
  const [flagRes, nameRes] = await Promise.all([
    db().from("attempts").select("index_number, attempt_no, score, max_score, flag_reason, submitted_at, activities!inner(position, title, week_id, weeks!inner(number, title))").eq("flagged", true).order("submitted_at", { ascending: false }).limit(300),
    db().from("access_events").select("created_at, index_number, week_id, weeks(number, title)").eq("reason", "name_mismatch").order("created_at", { ascending: false }).limit(300),
  ]);
  const flagged = must(flagRes, "load flagged") as unknown as { index_number: string; attempt_no: number; score: number; max_score: number; flag_reason: string; submitted_at: string; activities: { position: number; title: string; week_id: string; weeks: { number: number; title: string } } }[];
  const names = must(nameRes, "load name flags") as unknown as { created_at: string; index_number: string; week_id: string; weeks: { number: number; title: string } | null }[];

  return (
    <div className="space-y-12">
      <h1 className="display text-4xl sm:text-5xl">
        Review{" "}
        <span className="fade-line">flagged items</span>
      </h1>

      <section className="space-y-3">
        <h2 className="label">Attempts flagged at submission ({flagged.length})</h2>
        <p className="text-sm">The answers were saved, but the location check at submission failed. Open the student to see the location history.</p>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Submitted</th><th>Week</th><th>Activity</th><th>Index number</th><th>Attempt</th><th className="text-right">Score</th><th>Reason</th></tr></thead>
            <tbody>
              {flagged.map((f, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatAccra(f.submitted_at)}</td>
                  <td>{f.activities.weeks.number}</td>
                  <td>{f.activities.title}</td>
                  <td><Link className="underline underline-offset-2" href={`/admin/weeks/${f.activities.week_id}/students/${encodeURIComponent(f.index_number)}`}>{f.index_number}</Link></td>
                  <td>{f.attempt_no}</td>
                  <td className="text-right tabular-nums">{Number(f.score)}/{Number(f.max_score)}</td>
                  <td>{f.flag_reason}</td>
                </tr>
              ))}
              {flagged.length === 0 && <tr><td colSpan={7} className="text-body">Nothing flagged.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="label">Index number claimed under a different name ({names.length})</h2>
        <p className="text-sm">Someone tried to register an index number that is already registered under another name. The attempt was blocked.</p>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Time</th><th>Index number</th><th>Week</th></tr></thead>
            <tbody>
              {names.map((n, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{formatAccra(n.created_at)}</td>
                  <td className="tabular-nums">{n.index_number}</td>
                  <td>{n.weeks ? `Week ${n.weeks.number}: ${n.weeks.title}` : "–"}</td>
                </tr>
              ))}
              {names.length === 0 && <tr><td colSpan={3} className="text-body">None.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

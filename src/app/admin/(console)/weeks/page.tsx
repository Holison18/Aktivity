import Link from "next/link";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { siteOrigin } from "@/lib/server/admin-data";
import { AccraTime } from "@/components/admin/bits";
import { DeleteWeekButton } from "@/components/admin/WeekControls";
import { ProjectQrButton } from "@/components/admin/QrProjector";
import { windowLabel, windowState } from "@/lib/window";
import { requestTime } from "@/lib/server/http";

function statusBadgeClass(state: string) {
  if (state === "open") return "badge badge-ok";
  if (state === "before") return "badge badge-blue";
  if (state === "draft") return "badge badge-gold";
  return "badge badge-neutral";
}

export default async function WeeksPage() {
  await requireAdmin();
  const [weeksRes, origin] = await Promise.all([
    db().from("weeks").select("id, number, title, opens_at, closes_at, published, link_token, classes!inner(name, join_code), activities(count)").order("opens_at", { ascending: false }).limit(200),
    siteOrigin(),
  ]);
  const weeks = must(weeksRes, "load weeks") as unknown as {
    id: string; number: number; title: string; opens_at: string; closes_at: string; published: boolean; link_token: string; classes: { name: string; join_code: string }; activities: { count: number }[];
  }[];
  const now = requestTime();
  return (
    <div className="space-y-8">
      <h1 className="display text-4xl sm:text-5xl">
        Scheduled{" "}
        <span className="fade-line">weeks</span>
      </h1>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Class</th><th>Week</th><th>Title</th><th>Opens</th><th>Status</th><th>Activities</th><th /></tr></thead>
          <tbody>
            {weeks.map((w) => {
              const st = w.published ? windowState(w, now) : "draft";
              const label = windowLabel(st);
              return (
                <tr key={w.id}>
                  <td>{w.classes.name}</td>
                  <td className="display text-lg">{w.number}</td>
                  <td><Link href={`/admin/weeks/${w.id}`} className="font-medium text-ink underline decoration-line underline-offset-4 hover:text-brand">{w.title}</Link></td>
                  <td><AccraTime iso={w.opens_at} /></td>
                  <td><span className={statusBadgeClass(st)}>{label}</span></td>
                  <td className="tabular-nums">{w.activities[0]?.count ?? 0}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <ProjectQrButton
                        item={{
                          id: w.id,
                          url: `${origin}/w/${w.link_token}`,
                          className: w.classes.name,
                          weekNumber: w.number,
                          weekTitle: w.title,
                          joinCode: w.classes.join_code,
                          statusLabel: label,
                        }}
                        label="QR"
                        variant="secondary"
                      />
                      <Link href={`/admin/weeks/${w.id}/results`} className="btn btn-outline-brand btn-sm">Results</Link>
                      <DeleteWeekButton weekId={w.id} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {weeks.length === 0 && <tr><td colSpan={7} className="text-body">No weeks yet. Use “New week”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

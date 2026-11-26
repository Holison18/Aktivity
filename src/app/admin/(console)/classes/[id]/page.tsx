import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin, selectAll } from "@/lib/server/admin";
import { buildClassQrItems, pickDefaultQrWeekId, siteOrigin } from "@/lib/server/admin-data";
import ClassForm from "@/components/admin/ClassForm";
import CollapsibleSection from "@/components/admin/CollapsibleSection";
import StudentsTable from "@/components/admin/StudentsTable";
import { DeleteClassButton, DeleteWeekButton } from "@/components/admin/WeekControls";
import { ProjectQrButton } from "@/components/admin/QrProjector";
import { AccraTime } from "@/components/admin/bits";
import { Arrow } from "@/components/ui";
import { windowLabel, windowState } from "@/lib/window";
import { requestTime } from "@/lib/server/http";

export default async function ClassPage(props: PageProps<"/admin/classes/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [clsRes, weeks, students, origin] = await Promise.all([
    db().from("classes").select("*").eq("id", id).maybeSingle(),
    db().from("weeks").select("id, number, title, opens_at, closes_at, published, link_token, activities(count)").eq("class_id", id).order("number"),
    selectAll<{ index_number: string; name: string; registered_at: string; attempts: { count: number }[] }>((f, t) =>
      db().from("students").select("index_number, name, registered_at, attempts(count)").eq("class_id", id).order("index_number").range(f, t),
    ),
    siteOrigin(),
  ]);
  const cls = must(clsRes, "load class") as {
    id: string; name: string; join_code: string; default_lat: number | null; default_lng: number | null; default_radius_m: number; course_ends_on: string | null;
  } | null;
  if (!cls) notFound();

  const weekRows = must(weeks, "load weeks") as unknown as { id: string; number: number; title: string; opens_at: string; closes_at: string; published: boolean; link_token: string; activities: { count: number }[] }[];
  const now = requestTime();
  const qrItems = buildClassQrItems(cls.name, cls.join_code, weekRows, origin, now);
  const defaultQrWeekId = pickDefaultQrWeekId(weekRows, now);

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="display text-4xl sm:text-5xl">{cls.name}</h1>
        <div className="text-right">
          <span className="badge badge-gold px-4 py-1.5 text-xl tracking-widest">{cls.join_code}</span>
          <p className="label mt-2">Class code</p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="label">Weeks</h2>
          <div className="flex flex-wrap gap-2">
            {qrItems.length > 0 && (
              <ProjectQrButton items={qrItems} initialId={defaultQrWeekId} label="Project QR" variant="dark" />
            )}
            <a className="btn btn-secondary btn-sm" href={`/api/admin/export?class=${id}`}>Download Excel (all weeks)</a>
            <Link className="btn btn-primary btn-sm" href={`/admin/weeks/new?class=${id}`}>New week <Arrow /></Link>
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Week</th><th>Title</th><th>Opens</th><th>Closes</th><th>Status</th><th>Activities</th><th /></tr></thead>
            <tbody>
              {weekRows.map((w) => (
                <tr key={w.id}>
                  <td className="display text-lg">{w.number}</td>
                  <td><Link href={`/admin/weeks/${w.id}`} className="underline underline-offset-2">{w.title}</Link></td>
                  <td><AccraTime iso={w.opens_at} /></td>
                  <td><AccraTime iso={w.closes_at} /></td>
                  <td>{windowLabel(w.published ? windowState(w, now) : "draft")}</td>
                  <td className="tabular-nums">{w.activities[0]?.count ?? 0}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <ProjectQrButton items={qrItems} initialId={w.id} label="QR" variant="outline" />
                      <Link href={`/admin/weeks/${w.id}/results`} className="btn btn-secondary btn-sm">Results</Link>
                      <DeleteWeekButton weekId={w.id} />
                    </div>
                  </td>
                </tr>
              ))}
              {weekRows.length === 0 && <tr><td colSpan={7} className="text-body">No weeks yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="label">Students</h2>
        <StudentsTable
          classId={id}
          students={students.map((s) => ({
            index_number: s.index_number,
            name: s.name,
            registered_at: s.registered_at,
            attempts: s.attempts[0]?.count ?? 0,
          }))}
        />
      </section>

      <CollapsibleSection
        title="Class settings"
        summary={
          cls.default_lat != null && cls.default_lng != null
            ? `Default geofence set (${cls.default_radius_m} m radius). Edit class name, code, default location, or course end date.`
            : `Default radius ${cls.default_radius_m} m (no default location set yet). Edit class name, code, default location, or course end date.`
        }
        actionLabel="Edit settings"
      >
        <div className="space-y-5">
          <p className="text-sm">The default location seeds each new week&apos;s geofence. Changing the class code stops new registrations with the old code; registered students are not affected.</p>
          <ClassForm initial={cls} />
        </div>
      </CollapsibleSection>

      <section className="space-y-3">
        <h2 className="label">Other</h2>
        <DeleteClassButton classId={cls.id} classNameLabel={cls.name} redirectTo="/admin" />
      </section>
    </div>
  );
}

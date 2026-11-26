import Link from "next/link";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { buildClassQrItems, pickDefaultQrWeekId, siteOrigin, type WeekForQr } from "@/lib/server/admin-data";
import { requestTime } from "@/lib/server/http";
import ClassForm from "@/components/admin/ClassForm";
import { DeleteClassButton } from "@/components/admin/WeekControls";
import { ProjectQrButton } from "@/components/admin/QrProjector";
import { Arrow, ArrowUpRight } from "@/components/ui";

export default async function ClassesPage() {
  await requireAdmin();
  const [classesRes, origin] = await Promise.all([
    db().from("classes").select("id, name, join_code, created_at, students(count), weeks(id, number, title, opens_at, closes_at, published, link_token)").order("created_at", { ascending: false }),
    siteOrigin(),
  ]);
  const classes = must(classesRes, "load classes") as unknown as {
    id: string; name: string; join_code: string; students: { count: number }[]; weeks: WeekForQr[];
  }[];

  const now = requestTime();
  const hasClasses = classes.length > 0;
  const totalStudents = classes.reduce((sum, c) => sum + (c.students[0]?.count ?? 0), 0);
  const totalWeeks = classes.reduce((sum, c) => sum + c.weeks.length, 0);

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="display text-4xl sm:text-5xl">
          Classes{" "}
          <span className="fade-line block">and class codes</span>
        </h1>
        {hasClasses && (
          <div className="cta-pair">
            <Link href="/admin/classes/new" className="btn btn-primary">New class</Link>
            <Link href="/admin/classes/new" className="btn btn-primary btn-icon" aria-label="Create a new class">
              <ArrowUpRight />
            </Link>
          </div>
        )}
      </div>

      {hasClasses ? (
        <>
          <section className="surface-soft grid gap-6 px-7 py-6 sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div className="sm:px-4 first:sm:pl-0">
              <p className="display text-3xl tabular-nums">{classes.length}</p>
              <p className="mt-1 text-sm">{classes.length === 1 ? "Active class" : "Active classes"}</p>
            </div>
            <div className="sm:px-6">
              <p className="display text-3xl tabular-nums">{totalStudents}</p>
              <p className="mt-1 text-sm">{totalStudents === 1 ? "Registered student" : "Registered students"}</p>
            </div>
            <div className="sm:px-6">
              <p className="display text-3xl tabular-nums">{totalWeeks}</p>
              <p className="mt-1 text-sm">{totalWeeks === 1 ? "Scheduled week" : "Scheduled weeks"}</p>
            </div>
          </section>

          <ul className="grid gap-6 md:grid-cols-2">
            {classes.map((c) => {
              const studentCount = c.students[0]?.count ?? 0;
              const weekCount = c.weeks.length;
              const qrItems = buildClassQrItems(c.name, c.join_code, c.weeks, origin, now);
              const defaultQrWeekId = pickDefaultQrWeekId(c.weeks, now);
              return (
                <li key={c.id} className="card-raised flex flex-col justify-between gap-6 p-6 sm:p-7">
                  <Link href={`/admin/classes/${c.id}`} className="flex items-start justify-between gap-5">
                    <div className="space-y-2.5">
                      <span className="badge badge-blue">
                        {weekCount} {weekCount === 1 ? "week" : "weeks"}
                      </span>
                      <p className="text-ink text-xl font-semibold leading-snug">{c.name}</p>
                      <p className="text-sm">
                        {studentCount} {studentCount === 1 ? "student" : "students"} registered
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="badge badge-gold px-3 py-1 tracking-widest text-sm">{c.join_code}</span>
                      <p className="label mt-2">Class code</p>
                    </div>
                  </Link>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/classes/${c.id}`} className="btn btn-outline-brand btn-sm">
                        Open class <Arrow />
                      </Link>
                      {qrItems.length > 0 && (
                        <ProjectQrButton items={qrItems} initialId={defaultQrWeekId} label="Project QR" variant="dark" />
                      )}
                    </div>
                    <DeleteClassButton classId={c.id} compact />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="space-y-6">
          <p className="notice">No classes yet. Create the first one below.</p>
          <section className="card p-6 space-y-5">
            <h2 className="text-ink text-xl font-semibold">New class</h2>
            <ClassForm />
          </section>
        </div>
      )}
    </div>
  );
}

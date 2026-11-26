import Link from "next/link";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin, selectAll } from "@/lib/server/admin";
import StudentsTable from "@/components/admin/StudentsTable";
import { ArrowUpRight } from "@/components/ui";

export default async function StudentsPage() {
  await requireAdmin();

  const [classesRes, students] = await Promise.all([
    db().from("classes").select("id, name").order("created_at", { ascending: false }),
    selectAll<{ class_id: string; index_number: string; name: string; registered_at: string; attempts: { count: number }[] }>((f, t) =>
      db().from("students").select("class_id, index_number, name, registered_at, attempts(count)").order("index_number").range(f, t),
    ),
  ]);

  const classes = must(classesRes, "load classes") as { id: string; name: string }[];
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const totalAttempts = students.reduce((sum, s) => sum + (s.attempts[0]?.count ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-4xl sm:text-5xl">
          Students{" "}
          <span className="fade-line">and rosters</span>
        </h1>
        {classes.length === 0 && (
          <div className="cta-pair">
            <Link href="/admin/classes/new" className="btn btn-primary btn-sm">Create a class</Link>
            <Link href="/admin/classes/new" className="btn btn-primary btn-sm btn-icon" aria-label="Create a class">
              <ArrowUpRight />
            </Link>
          </div>
        )}
      </div>

      {classes.length === 0 ? (
        <p className="notice">
          Create a class first before adding or importing students.{" "}
          <Link href="/admin" className="underline">Go to classes</Link>
        </p>
      ) : (
        <>
          <section className="surface-soft grid gap-6 px-6 py-5 sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div className="sm:px-4 first:sm:pl-0">
              <p className="display text-3xl tabular-nums">{students.length}</p>
              <p className="mt-0.5 text-sm">{students.length === 1 ? "Registered student" : "Registered students"}</p>
            </div>
            <div className="sm:px-6">
              <p className="display text-3xl tabular-nums">{classes.length}</p>
              <p className="mt-0.5 text-sm">{classes.length === 1 ? "Class roster" : "Class rosters"}</p>
            </div>
            <div className="sm:px-6">
              <p className="display text-3xl tabular-nums">{totalAttempts}</p>
              <p className="mt-0.5 text-sm">{totalAttempts === 1 ? "Total submission" : "Total submissions"}</p>
            </div>
          </section>

          <StudentsTable
            classes={classes}
            students={students.map((s) => ({
              class_id: s.class_id,
              index_number: s.index_number,
              name: s.name,
              registered_at: s.registered_at,
              class_name: classNameById.get(s.class_id) ?? "Unknown class",
              attempts: s.attempts[0]?.count ?? 0,
            }))}
          />
        </>
      )}
    </div>
  );
}

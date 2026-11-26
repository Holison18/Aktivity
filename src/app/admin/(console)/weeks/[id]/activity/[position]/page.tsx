import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import ActivityBuilder from "@/components/admin/ActivityBuilder";
import { BASE_ACTIVITY_TYPES } from "@/lib/activities/registry";
import { BLANKS, TEMPLATES } from "@/lib/activities/templates";

export default async function ActivityPage(props: PageProps<"/admin/weeks/[id]/activity/[position]">) {
  await requireAdmin();
  const { id, position } = await props.params;
  if (!z.uuid().safeParse(id).success || !/^[1-9]\d{0,2}$/.test(position)) notFound();
  const pos = Number(position);

  const [weekRes, actRes] = await Promise.all([
    db().from("weeks").select("id, number, title").eq("id", id).maybeSingle(),
    db().from("activities").select("id, type, title, instructions, max_attempts, config, answer_key").eq("week_id", id).eq("position", pos).maybeSingle(),
  ]);
  const week = must(weekRes, "load week") as { id: string; number: number; title: string } | null;
  if (!week) notFound();
  const act = must(actRes, "load activity") as { id: string; type: string; title: string; instructions: string; max_attempts: number; config: unknown; answer_key: unknown } | null;
  const used = act ? (await db().from("attempts").select("id", { count: "exact", head: true }).eq("activity_id", act.id)).count ?? 0 : 0;

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="label"><Link href={`/admin/weeks/${id}`} className="underline underline-offset-2">Week {week.number}: {week.title}</Link></p>
        <h1 className="display text-4xl sm:text-5xl">Activity {position}</h1>
      </div>
      <ActivityBuilder
        weekId={id}
        position={pos}
        initial={act}
        templates={TEMPLATES}
        blanks={BLANKS}
        types={Object.values(BASE_ACTIVITY_TYPES).map((t) => ({ id: t.id, label: t.label, description: t.description }))}
        hasAttempts={used > 0}
      />
    </div>
  );
}

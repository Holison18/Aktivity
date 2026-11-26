import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { fetchWeekResults, siteOrigin } from "@/lib/server/admin-data";
import { windowLabel, windowState } from "@/lib/window";
import LiveResults from "@/components/admin/LiveResults";
import type { QrTarget } from "@/components/admin/QrProjector";

export default async function ResultsPage(props: PageProps<"/admin/weeks/[id]/results">) {
  await requireAdmin();
  const { id } = await props.params;
  // Sort and search live in the URL so a refresh on the projector keeps them (LiveResults writes them back).
  const sp = await props.searchParams;
  const sort = sp.sort === "total" || sp.sort === "name" ? sp.sort : "index";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  if (!z.uuid().safeParse(id).success) notFound();
  // Preload initial results on the server so the table renders immediately without a client-side fetch waterfall.
  const [initialData, origin] = await Promise.all([fetchWeekResults(id), siteOrigin()]);
  if (!initialData) notFound();
  const week = initialData.week;
  const [weeksRes, clsRes] = await Promise.all([
    db().from("weeks").select("id, number, title, link_token").eq("class_id", week.class_id).order("number"),
    db().from("classes").select("name, join_code").eq("id", week.class_id).single(),
  ]);
  const weeks = must(weeksRes, "load weeks") as { id: string; number: number; title: string; link_token: string }[];
  const cls = must(clsRes, "load class") as { name: string; join_code: string };
  const currentWeek = weeks.find((w) => w.id === id);
  const qrItem: QrTarget | undefined = currentWeek
    ? {
        id: week.id,
        url: `${origin}/w/${currentWeek.link_token}`,
        className: cls.name,
        weekNumber: week.number,
        weekTitle: week.title,
        joinCode: cls.join_code,
        statusLabel: windowLabel(week.published ? windowState(week, initialData.serverNow) : "draft"),
      }
    : undefined;
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <p className="label"><Link href={`/admin/weeks/${id}`} className="underline underline-offset-2">Week {week.number} settings</Link></p>
        <h1 className="display text-5xl">
          Live results
          <span className="fade-line block">{week.title}</span>
        </h1>
      </div>
      <LiveResults key={id} weekId={id} classId={week.class_id} weeks={weeks} initialSort={sort} initialQuery={q} initialData={initialData} qrItem={qrItem} />
    </div>
  );
}

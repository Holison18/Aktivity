import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin";
import { classOptions } from "@/lib/server/admin-data";
import WeekForm from "@/components/admin/WeekForm";

export default async function NewWeekPage(props: PageProps<"/admin/weeks/new">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const classes = await classOptions();
  const defaultClassId = typeof sp.class === "string" ? sp.class : undefined;
  const backHref = defaultClassId ? `/admin/classes/${defaultClassId}` : "/admin/weeks";
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl">
          Schedule
          <span className="fade-line block">a new week</span>
        </h1>
        <Link href={backHref} className="btn btn-secondary btn-sm">
          {defaultClassId ? "Back to class" : "Back to weeks"}
        </Link>
      </div>
      {classes.length === 0 ? (
        <p className="notice">Create a class first. <Link href="/admin" className="underline">Go to classes</Link></p>
      ) : (
        <WeekForm classes={classes} defaultClassId={defaultClassId} cancelHref={backHref} />
      )}
    </div>
  );
}

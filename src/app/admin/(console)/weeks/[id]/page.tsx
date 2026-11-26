import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, must } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/server/admin";
import { classOptions, siteOrigin } from "@/lib/server/admin-data";
import WeekForm, { type WeekInitial } from "@/components/admin/WeekForm";
import CollapsibleSection from "@/components/admin/CollapsibleSection";
import { DeleteActivityButton, WeekAdminActions, WeekLink, WindowControls } from "@/components/admin/WeekControls";
import { ProjectQrButton, type QrTarget } from "@/components/admin/QrProjector";
import { activityTypeSummary } from "@/lib/activities/registry";
import { windowLabel, windowState, formatAccra } from "@/lib/window";
import { Arrow, Plus } from "@/components/ui";
import { requestTime } from "@/lib/server/http";

export default async function WeekPage(props: PageProps<"/admin/weeks/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [weekRes, classes, acts, origin] = await Promise.all([
    db().from("weeks").select("*, classes!inner(name, join_code)").eq("id", id).maybeSingle(),
    classOptions(),
    db().from("activities").select("id, position, type, title, max_attempts, max_score, config").eq("week_id", id).order("position"),
    siteOrigin(),
  ]);
  const week = must(weekRes, "load week") as (WeekInitial & { link_token: string; classes: { name: string; join_code: string } }) | null;
  if (!week) notFound();
  const activities = must(acts, "load activities") as { id: string; position: number; type: string; title: string; max_attempts: number; max_score: number; config: unknown }[];
  const state = windowLabel(week.published ? windowState(week, requestTime()) : "draft");
  const weekUrl = `${origin}/w/${week.link_token}`;
  const qrItem: QrTarget = {
    id: week.id,
    url: weekUrl,
    className: week.classes.name,
    weekNumber: week.number,
    weekTitle: week.title,
    joinCode: week.classes.join_code,
    statusLabel: state,
  };
  const nextPosition = Math.max(0, ...activities.map((a) => a.position)) + 1;

  return (
    <div className="space-y-14">
      <div className="space-y-4">
        <p className="label">
          <Link href={`/admin/classes/${week.class_id}`} className="underline underline-offset-2">{week.classes.name}</Link> · Week {week.number} · {state}
        </p>
        <h1 className="display text-4xl sm:text-5xl">{week.title}</h1>
        <p className="text-sm">{formatAccra(week.opens_at)} to <strong>{formatAccra(week.closes_at)}</strong> (Accra time)</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/weeks/${id}/results`} className="btn btn-primary btn-sm">Live results <Arrow /></Link>
          <ProjectQrButton item={qrItem} label="Project QR" variant="dark" />
          <a href={`/api/admin/export?class=${week.class_id}&week=${id}`} className="btn btn-secondary btn-sm">Download Excel</a>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="label">Week link & QR code</h2>
        <WeekLink weekId={id} url={weekUrl} qr={qrItem} />
        <p className="text-sm">The link opens the sign-in page only. Time window, geofence and class code still apply.</p>
      </section>

      <section className="card p-6 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-ink text-xl font-medium">Activities</h2>
            <span className="badge badge-blue tabular-nums">{activities.length}</span>
          </div>
          <Link
            className="btn btn-primary btn-sm shrink-0"
            href={`/admin/weeks/${id}/activity/${nextPosition}`}
          >
            <Plus /> Add activity
          </Link>
        </div>
        {activities.length > 0 ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {activities.map((activity) => (
              <li key={activity.id} className="card-raised p-6 space-y-4">
                <p className="label">Activity {activity.position}</p>
                <div>
                  <p className="text-ink text-lg font-medium">{activity.title}</p>
                  <p className="text-sm">{activityTypeSummary(activity.type, activity.config)} · max {Number(activity.max_score)} · {activity.max_attempts} attempt{activity.max_attempts > 1 ? "s" : ""}, best counts</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn btn-primary btn-sm" href={`/admin/weeks/${id}/activity/${activity.position}`}>Edit and preview</Link>
                  <DeleteActivityButton activityId={activity.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">No activities added to this week yet. Click “Add activity” to create the first one.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="label">During class</h2>
        <WindowControls weekId={id} />
      </section>

      <CollapsibleSection
        title="Schedule and geofence"
        summary={
          week.geofence_enabled
            ? `Geofence on (${week.radius_m} m radius, ±${week.max_accuracy_m} m accuracy limit) · ${week.published ? "Published" : "Draft"}`
            : `Geofence off · ${week.published ? "Published" : "Draft"}`
        }
        actionLabel="Edit schedule & geofence"
      >
        <WeekForm classes={classes} initial={week} />
      </CollapsibleSection>

      <section className="space-y-3">
        <h2 className="label">Other</h2>
        <WeekAdminActions weekId={id} classId={week.class_id} />
      </section>
    </div>
  );
}

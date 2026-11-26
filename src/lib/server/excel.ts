// Excel export (FR-34): Summary, Attempts, Answers, Access log. Built with exceljs on the server.
import "server-only";
import ExcelJS from "exceljs";
import { db, must } from "../supabase/service";
import { selectAll } from "./admin";
import { bestFromAttempts, totals, type ActivityMeta } from "../results";
import { describeAnswers } from "../activities/registry";
import { formatAccra } from "../window";
import { APP_NAME } from "../env";

type Week = { id: string; number: number; title: string; opens_at: string; closes_at: string };
type Act = { id: string; week_id: string; position: number; title: string; type: string; config: unknown; max_score: number };
type Attempt = { activity_id: string; index_number: string; attempt_no: number; started_at: string | null; submitted_at: string; auto_submitted: boolean; answers: unknown; score: number; max_score: number; flagged: boolean; flag_reason: string | null };
type Event = { created_at: string; week_id: string | null; activity_id: string | null; index_number: string | null; event: string; allowed: boolean; reason: string | null; lat: number | null; lng: number | null; accuracy_m: number | null; distance_m: number | null; user_agent: string | null };

export async function buildWorkbook(scope: { classId: string; weekId?: string }): Promise<{ buffer: Buffer; filename: string }> {
  let wq = db().from("weeks").select("id, number, title, opens_at, closes_at").eq("class_id", scope.classId).order("number");
  if (scope.weekId) wq = wq.eq("id", scope.weekId);

  const [clsRes, weeksRes, students] = await Promise.all([
    db().from("classes").select("id, name").eq("id", scope.classId).single(),
    wq,
    selectAll<{ index_number: string; name: string; registered_at: string }>((f, t) =>
      db().from("students").select("index_number, name, registered_at").eq("class_id", scope.classId).order("index_number").range(f, t),
    ),
  ]);
  const cls = must(clsRes, "load class") as { id: string; name: string };
  const weeks = must(weeksRes, "load weeks") as Week[];
  const weekIds = weeks.map((w) => w.id);
  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const nameOf = new Map(students.map((s) => [s.index_number, s.name]));

  // The answer key is never selected for the export either; only config is needed to describe answers.
  const [actsRes, events] = await Promise.all([
    weekIds.length ? db().from("activities").select("id, week_id, position, title, type, config, max_score").in("week_id", weekIds) : Promise.resolve({ data: [], error: null }),
    weekIds.length
      ? selectAll<Event>((f, t) =>
          db().from("access_events").select("created_at, week_id, activity_id, index_number, event, allowed, reason, lat, lng, accuracy_m, distance_m, user_agent").in("week_id", weekIds).order("created_at").range(f, t),
        )
      : Promise.resolve([] as Event[]),
  ]);
  const acts = must(actsRes, "load activities") as Act[];
  acts.sort((a, b) => weekById.get(a.week_id)!.number - weekById.get(b.week_id)!.number || a.position - b.position);
  const actById = new Map(acts.map((a) => [a.id, a]));
  const actIds = acts.map((a) => a.id);

  const attempts = actIds.length
    ? await selectAll<Attempt>((f, t) =>
        db().from("attempts").select("activity_id, index_number, attempt_no, started_at, submitted_at, auto_submitted, answers, score, max_score, flagged, flag_reason").in("activity_id", actIds).order("submitted_at").range(f, t),
      )
    : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  const actLabel = (a: Act) => `W${weekById.get(a.week_id)!.number} A${a.position}: ${a.title}`;

  // ---------------------------------------------------------------- Summary
  const meta: ActivityMeta[] = acts.map((a) => ({ id: a.id, position: a.position, title: a.title, max_score: a.max_score }));
  const best = bestFromAttempts(attempts);
  const summary = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  summary.columns = [
    { header: "Index number", key: "index", width: 16 },
    { header: "Name", key: "name", width: 28 },
    ...acts.map((a) => ({ header: `${actLabel(a)} (/${Number(a.max_score)})`, key: a.id, width: 22 })),
    { header: "Total", key: "total", width: 10 },
    { header: "Max", key: "max", width: 8 },
    { header: "Percent", key: "pct", width: 10 },
  ];
  for (const s of students) {
    const per = best.get(s.index_number) ?? {};
    const t = totals(meta, per);
    const row: Record<string, unknown> = { index: s.index_number, name: s.name, total: t.total, max: t.max, pct: t.pct };
    for (const a of acts) row[a.id] = per[a.id] ? Number(per[a.id].best) : null;
    summary.addRow(row);
  }

  // --------------------------------------------------------------- Attempts
  const att = wb.addWorksheet("Attempts", { views: [{ state: "frozen", ySplit: 1 }] });
  att.columns = [
    { header: "Week", key: "week", width: 7 },
    { header: "Activity", key: "activity", width: 32 },
    { header: "Index number", key: "index", width: 16 },
    { header: "Name", key: "name", width: 26 },
    { header: "Attempt", key: "no", width: 9 },
    { header: "Started (Accra)", key: "started", width: 20 },
    { header: "Submitted (Accra)", key: "submitted", width: 20 },
    { header: "Auto-submitted", key: "auto", width: 14 },
    { header: "Score", key: "score", width: 8 },
    { header: "Max", key: "max", width: 8 },
    { header: "Flagged", key: "flagged", width: 9 },
    { header: "Flag reason", key: "reason", width: 26 },
  ];
  for (const t of attempts) {
    const a = actById.get(t.activity_id)!;
    att.addRow({
      week: weekById.get(a.week_id)!.number, activity: a.title, index: t.index_number, name: nameOf.get(t.index_number) ?? "", no: t.attempt_no,
      started: t.started_at ? formatAccra(t.started_at, { weekday: undefined, year: "numeric", second: "2-digit" }) : "",
      submitted: formatAccra(t.submitted_at, { weekday: undefined, year: "numeric", second: "2-digit" }),
      auto: t.auto_submitted ? "yes" : "no", score: Number(t.score), max: Number(t.max_score), flagged: t.flagged ? "yes" : "no", reason: t.flag_reason ?? "",
    });
  }

  // ---------------------------------------------------------------- Answers
  const ans = wb.addWorksheet("Answers", { views: [{ state: "frozen", ySplit: 1 }] });
  ans.columns = [
    { header: "Week", key: "week", width: 7 },
    { header: "Activity", key: "activity", width: 32 },
    { header: "Index number", key: "index", width: 16 },
    { header: "Attempt", key: "no", width: 9 },
    { header: "Answers", key: "answers", width: 120 },
  ];
  for (const t of attempts) {
    const a = actById.get(t.activity_id)!;
    ans.addRow({ week: weekById.get(a.week_id)!.number, activity: a.title, index: t.index_number, no: t.attempt_no, answers: describeAnswers(a.type, a.config, t.answers) });
  }

  // ------------------------------------------------------------- Access log
  const log = wb.addWorksheet("Access log", { views: [{ state: "frozen", ySplit: 1 }] });
  log.columns = [
    { header: "Time (Accra)", key: "time", width: 20 },
    { header: "Week", key: "week", width: 7 },
    { header: "Activity", key: "activity", width: 28 },
    { header: "Index number", key: "index", width: 16 },
    { header: "Event", key: "event", width: 9 },
    { header: "Allowed", key: "allowed", width: 9 },
    { header: "Reason", key: "reason", width: 20 },
    { header: "Latitude", key: "lat", width: 11 },
    { header: "Longitude", key: "lng", width: 11 },
    { header: "Accuracy (m)", key: "acc", width: 12 },
    { header: "Distance (m)", key: "dist", width: 12 },
    { header: "Browser", key: "ua", width: 50 },
  ];
  for (const e of events) {
    log.addRow({
      time: formatAccra(e.created_at, { weekday: undefined, year: "numeric", second: "2-digit" }),
      week: e.week_id ? weekById.get(e.week_id)?.number : "", activity: e.activity_id ? actById.get(e.activity_id)?.title ?? "" : "",
      index: e.index_number ?? "", event: e.event, allowed: e.allowed ? "yes" : "no", reason: e.reason ?? "",
      lat: e.lat != null ? Number(e.lat) : null, lng: e.lng != null ? Number(e.lng) : null,
      acc: e.accuracy_m != null ? Number(e.accuracy_m) : null, dist: e.distance_m != null ? Number(e.distance_m) : null, ua: e.user_agent ?? "",
    });
  }

  for (const ws of wb.worksheets) {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const filename = scope.weekId && weeks[0] ? `${slug(cls.name)}-week-${weeks[0].number}.xlsx` : `${slug(cls.name)}-all-weeks.xlsx`;
  return { buffer, filename };
}

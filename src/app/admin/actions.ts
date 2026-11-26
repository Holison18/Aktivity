"use server";
// Admin mutations (FR-10, FR-12, FR-13, FR-24, FR-28 to FR-31).
// Server Actions: Next.js compares Origin with Host and rejects cross-site calls (NF-03).
// Every action re-checks the admin and validates its input with a Zod schema.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { db, must } from "@/lib/supabase/service";
import { randomToken } from "@/lib/tokens";
import { accraLocalToIso, extendClose } from "@/lib/window";
import { cleanName, isValidIndex, nameKey, normalizeIndex } from "@/lib/identity";
import { ActivityValidationError, parseActivity, publicView, TYPE_IDS } from "@/lib/activities/registry";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; issues?: string[] };

function fail(err: unknown): { ok: false; error: string; issues?: string[] } {
  if (err instanceof ActivityValidationError) return { ok: false, error: "The activity has problems. Fix them and save again.", issues: err.issues };
  if (err instanceof z.ZodError) return { ok: false, error: "Some fields are invalid.", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const e = err as { code?: string; message?: string };
  const msg = e.message ?? String(err);
  if (msg.includes("NEXT_REDIRECT")) throw err;
  if (e.code === "23505" || /duplicate key/.test(msg)) {
    if (/weeks_class_id_number_key/.test(msg)) return { ok: false, error: "This class already has a week with that number. Pick another number." };
    if (/activities_week_id_position_key/.test(msg)) return { ok: false, error: "That activity slot is already used." };
    if (/students_pkey/.test(msg)) return { ok: false, error: "Another student in this class already has that index number. Use Merge instead." };
    return { ok: false, error: "That value is already used." };
  }
  if (e.code === "23514" || /check constraint/.test(msg)) {
    if (/activities_position_check/.test(msg)) return { ok: false, error: "The database still restricts weeks to 2 activities. Run supabase/migrations/0004_allow_more_activities.sql in Supabase to allow more." };
    return { ok: false, error: `A value is out of range (${msg.replace(/^.*constraint\s*/, "")}).` };
  }
  console.error(err);
  return { ok: false, error: msg.replace(/^[^:]+:\s*/, "") || "Something went wrong." };
}

const num = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);
const optNum = (min: number, max: number) =>
  z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().finite().min(min).max(max)]).transform((v) => (v === "" || v == null ? null : Number(v)));

// ---------------------------------------------------------------- classes (FR-28)

const classSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  join_code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9 -]+$/, "Use letters, digits, spaces or -"),
  default_lat: optNum(-90, 90),
  default_lng: optNum(-180, 180),
  default_radius_m: num(10, 50000),
  course_ends_on: z.union([z.literal(""), z.null(), z.iso.date()]).transform((v) => v || null),
});

export async function saveClass(input: z.input<typeof classSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const { id, ...v } = classSchema.parse(input);
    const row = { ...v, join_code: v.join_code.toUpperCase() };
    const res = id
      ? await db().from("classes").update(row).eq("id", id).select("id").single()
      : await db().from("classes").insert(row).select("id").single();
    const saved = must(res, "save class") as { id: string };
    revalidatePath("/admin", "layout");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClass(classId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = z.uuid().parse(classId);
    must(await db().from("classes").delete().eq("id", id), "delete class");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const addStudentSchema = z.object({
  classId: z.uuid(),
  indexNumber: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
});

export async function addStudent(input: z.input<typeof addStudentSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const v = addStudentSchema.parse(input);
    const idx = normalizeIndex(v.indexNumber);
    if (!isValidIndex(idx)) return { ok: false, error: "That index number does not match the expected format." };
    const name = cleanName(v.name);
    if (name.length < 3 || !/\s/.test(name)) {
      return { ok: false, error: "Type the student's full name: first name and surname." };
    }
    const key = nameKey(name);
    const others = must(
      await db().from("students").select("class_id, name, name_key").eq("index_number", idx),
      "check index",
    ) as { class_id: string; name: string; name_key: string }[];
    if (others.some((o) => o.class_id === v.classId)) {
      return { ok: false, error: `Student ${idx} is already registered in this class.` };
    }
    const conflict = others.find((o) => o.name_key !== key);
    if (conflict) {
      return { ok: false, error: `Index ${idx} is already registered in another class as "${conflict.name}". Use the same name or correct it first.` };
    }
    must(
      await db().from("students").insert({ class_id: v.classId, index_number: idx, name, name_key: key }),
      "add student",
    );
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const importStudentsSchema = z.object({
  classId: z.uuid(),
  text: z.string().min(1).max(200_000),
});

export async function importStudents(
  input: z.input<typeof importStudentsSchema>,
): Promise<ActionResult<{ added: number; skipped: number; issues: string[] }>> {
  try {
    await requireAdmin();
    const v = importStudentsSchema.parse(input);
    const rawLines = v.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return { ok: false, error: "Paste at least one student line (index number and full name)." };
    if (rawLines.length > 2000) return { ok: false, error: "Import at most 2,000 lines at a time." };

    const parsed: { lineNo: number; idx: string; name: string; key: string }[] = [];
    const issues: string[] = [];
    const seen = new Set<string>();

    rawLines.forEach((line, i) => {
      const lineNo = i + 1;
      // Skip an optional header row like "index,name" or "index_number\tfull_name"
      if (i === 0 && /^(index|student|id)\b/i.test(line) && /\bname\b/i.test(line)) return;
      let rawIdx = "";
      let rawName = "";
      if (line.includes("\t")) {
        const parts = line.split("\t");
        rawIdx = parts[0] ?? "";
        rawName = parts.slice(1).join(" ");
      } else if (line.includes(",")) {
        const parts = line.split(",");
        rawIdx = parts[0] ?? "";
        rawName = parts.slice(1).join(" ");
      } else {
        const m = line.match(/^(\S+)\s+(.+)$/);
        if (m) {
          rawIdx = m[1];
          rawName = m[2];
        }
      }
      const idx = normalizeIndex(rawIdx.replace(/^["']|["']$/g, ""));
      const name = cleanName(rawName.replace(/^["']|["']$/g, ""));
      if (!idx || !isValidIndex(idx)) {
        issues.push(`Line ${lineNo}: invalid index number "${rawIdx.trim() || line}"`);
        return;
      }
      if (name.length < 3 || !/\s/.test(name)) {
        issues.push(`Line ${lineNo} (${idx}): full name must include first name and surname`);
        return;
      }
      if (seen.has(idx)) {
        issues.push(`Line ${lineNo} (${idx}): duplicate in pasted list (skipped)`);
        return;
      }
      seen.add(idx);
      parsed.push({ lineNo, idx, name, key: nameKey(name) });
    });

    if (parsed.length === 0) {
      return { ok: false, error: "No valid student rows found. Use one student per line: e.g. 1234567, Ama Mensah", issues };
    }

    const existing = must(
      await db().from("students").select("class_id, index_number, name, name_key").in("index_number", parsed.map((p) => p.idx)),
      "check existing students",
    ) as { class_id: string; index_number: string; name: string; name_key: string }[];

    const inThisClass = new Set(existing.filter((e) => e.class_id === v.classId).map((e) => e.index_number));
    const otherNameByIdx = new Map<string, { name: string; key: string }>();
    for (const e of existing) {
      if (e.class_id !== v.classId && !otherNameByIdx.has(e.index_number)) {
        otherNameByIdx.set(e.index_number, { name: e.name, key: e.name_key });
      }
    }

    let skipped = 0;
    const toInsert: { class_id: string; index_number: string; name: string; name_key: string }[] = [];
    for (const p of parsed) {
      if (inThisClass.has(p.idx)) {
        skipped++;
        continue;
      }
      const conflict = otherNameByIdx.get(p.idx);
      if (conflict && conflict.key !== p.key) {
        issues.push(`Line ${p.lineNo} (${p.idx}): already registered in another class as "${conflict.name}"`);
        continue;
      }
      toInsert.push({ class_id: v.classId, index_number: p.idx, name: p.name, name_key: p.key });
    }

    if (toInsert.length > 0) {
      must(await db().from("students").insert(toInsert), "import students");
      revalidatePath("/admin", "layout");
    }

    return { ok: true, added: toInsert.length, skipped, issues };
  } catch (e) {
    return fail(e);
  }
}

const deleteStudentSchema = z.object({ classId: z.uuid(), indexNumber: z.string().min(1).max(40) });

export async function deleteStudent(input: z.input<typeof deleteStudentSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const v = deleteStudentSchema.parse(input);
    const idx = normalizeIndex(v.indexNumber);
    must(
      await db().from("students").delete().eq("class_id", v.classId).eq("index_number", idx),
      "delete student",
    );
    must(
      await db().from("access_events").delete().eq("class_id", v.classId).eq("index_number", idx),
      "delete student access events",
    );
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const correctSchema = z.object({ classId: z.uuid(), oldIndex: z.string().min(1), newIndex: z.string().min(1).max(40), newName: z.string().min(2).max(120) });

export async function correctStudent(input: z.input<typeof correctSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const v = correctSchema.parse(input);
    const idx = normalizeIndex(v.newIndex);
    if (!isValidIndex(idx)) return { ok: false, error: "That index number does not match the expected format." };
    const name = cleanName(v.newName);
    must(await db().rpc("correct_student", { p_class: v.classId, p_old: v.oldIndex, p_new_index: idx, p_new_name: name, p_new_name_key: nameKey(name) }), "correct student");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const mergeSchema = z.object({ classId: z.uuid(), keep: z.string().min(1), drop: z.string().min(1) });

export async function mergeStudents(input: z.input<typeof mergeSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const v = mergeSchema.parse(input);
    if (v.keep === v.drop) return { ok: false, error: "Pick two different registrations." };
    must(await db().rpc("merge_students", { p_class: v.classId, p_keep: v.keep, p_drop: v.drop }), "merge students");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ weeks (FR-29)

const weekSchema = z
  .object({
    id: z.uuid().optional(),
    class_id: z.uuid(),
    number: num(1, 60).int(),
    title: z.string().trim().min(1).max(160),
    opens_local: z.string(),
    closes_local: z.string(),
    published: z.boolean(),
    geofence_enabled: z.boolean(),
    center_lat: optNum(-90, 90),
    center_lng: optNum(-180, 180),
    radius_m: num(10, 50000).int(),
    max_accuracy_m: num(5, 5000).int(),
  })
  .refine((v) => !v.geofence_enabled || (v.center_lat != null && v.center_lng != null), { message: "Set the geofence centre, or switch the geofence off.", path: ["center_lat"] });

export async function saveWeek(input: z.input<typeof weekSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const { id, opens_local, closes_local, ...v } = weekSchema.parse(input);
    const opens_at = accraLocalToIso(opens_local);
    const closes_at = accraLocalToIso(closes_local);
    if (Date.parse(closes_at) <= Date.parse(opens_at)) return { ok: false, error: "The closing time must be after the opening time." };
    const row = { ...v, opens_at, closes_at };
    const res = id
      ? await db().from("weeks").update(row).eq("id", id).select("id").single()
      : await db().from("weeks").insert({ ...row, link_token: randomToken(12) }).select("id").single();
    const saved = must(res, "save week") as { id: string };
    revalidatePath("/admin", "layout");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateLink(weekId: string): Promise<ActionResult<{ token: string }>> {
  try {
    await requireAdmin();
    const token = randomToken(12);
    must(await db().from("weeks").update({ link_token: token }).eq("id", z.uuid().parse(weekId)), "regenerate link");
    revalidatePath("/admin", "layout");
    return { ok: true, token };
  } catch (e) {
    return fail(e);
  }
}

/** FR-10: extend the closing time by 10 minutes. */
export async function extendWeek(weekId: string): Promise<ActionResult<{ closes_at: string }>> {
  try {
    await requireAdmin();
    const w = must(await db().from("weeks").select("closes_at").eq("id", z.uuid().parse(weekId)).single(), "load week") as { closes_at: string };
    const closes_at = extendClose(w.closes_at, 1).toISOString();
    must(await db().from("weeks").update({ closes_at }).eq("id", weekId), "extend week");
    revalidatePath("/admin", "layout");
    return { ok: true, closes_at };
  } catch (e) {
    return fail(e);
  }
}

/** FR-10: close the week now. Students get the 20 s grace to finish submitting. */
export async function closeWeekNow(weekId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const w = must(await db().from("weeks").select("opens_at").eq("id", z.uuid().parse(weekId)).single(), "load week") as { opens_at: string };
    const now = Date.now();
    const closes_at = new Date(Math.max(now, Date.parse(w.opens_at) + 1000)).toISOString();
    must(await db().from("weeks").update({ closes_at }).eq("id", weekId), "close week");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** FR-31: copy a week (settings and activities) as the next week number, one week later, unpublished. */
export async function duplicateWeek(weekId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const w = must(await db().from("weeks").select("*").eq("id", z.uuid().parse(weekId)).single(), "load week") as Record<string, unknown> & { class_id: string; opens_at: string; closes_at: string; title: string };
    const max = must(await db().from("weeks").select("number").eq("class_id", w.class_id).order("number", { ascending: false }).limit(1), "load weeks") as { number: number }[];
    const shift = (t: string) => new Date(Date.parse(t) + 7 * 86_400_000).toISOString();
    const copy = {
      class_id: w.class_id,
      number: (max[0]?.number ?? 0) + 1,
      title: `${w.title} (copy)`,
      opens_at: shift(w.opens_at),
      closes_at: shift(w.closes_at),
      published: false,
      link_token: randomToken(12),
      geofence_enabled: w.geofence_enabled,
      center_lat: w.center_lat,
      center_lng: w.center_lng,
      radius_m: w.radius_m,
      max_accuracy_m: w.max_accuracy_m,
    };
    const created = must(await db().from("weeks").insert(copy).select("id").single(), "create week") as { id: string };
    const acts = must(await db().from("activities").select("position, type, title, instructions, config, answer_key, max_attempts, max_score").eq("week_id", weekId), "load activities") as Record<string, unknown>[];
    if (acts.length) must(await db().from("activities").insert(acts.map((a) => ({ ...a, week_id: created.id }))), "copy activities");
    revalidatePath("/admin", "layout");
    return { ok: true, id: created.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteWeek(weekId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = z.uuid().parse(weekId);
    must(await db().from("weeks").delete().eq("id", id), "delete week");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------- activities (FR-21, FR-30)

const activitySchema = z.object({
  week_id: z.uuid(),
  position: num(1, 999).int(),
  type: z.enum(TYPE_IDS as [string, ...string[]]),
  title: z.string().trim().min(1).max(160),
  instructions: z.string().max(4000).default(""),
  max_attempts: num(1, 20).int(),
  config: z.unknown(),
  answer_key: z.unknown(),
});

export async function saveActivity(input: z.input<typeof activitySchema>): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const v = activitySchema.parse(input);
    const parsed = parseActivity(v.type, v.config, v.answer_key);
    const row = { ...v, config: parsed.config, answer_key: parsed.key, max_score: parsed.maxScore };
    const existing = must(await db().from("activities").select("id").eq("week_id", v.week_id).eq("position", v.position).maybeSingle(), "load slot") as { id: string } | null;
    if (existing) {
      const used = await db().from("attempts").select("id", { count: "exact", head: true }).eq("activity_id", existing.id);
      if ((used.count ?? 0) > 0) {
        // Fixing wording is allowed after submissions, but a new type or max score would make saved scores inconsistent.
        const cur = must(await db().from("activities").select("max_score, type").eq("id", existing.id).single(), "load activity") as { max_score: number; type: string };
        if (Number(cur.max_score) !== parsed.maxScore || cur.type !== v.type) {
          return { ok: false, error: "Students have already submitted this activity. You can fix wording, but not change its type or maximum score." };
        }
      }
    }
    const res = existing
      ? await db().from("activities").update(row).eq("id", existing.id).select("id").single()
      : await db().from("activities").insert(row).select("id").single();
    const saved = must(res, "save activity") as { id: string };
    revalidatePath("/admin", "layout");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActivity(activityId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    const used = await db().from("attempts").select("id", { count: "exact", head: true }).eq("activity_id", z.uuid().parse(activityId));
    if ((used.count ?? 0) > 0) return { ok: false, error: "Students have already submitted this activity, so it cannot be deleted." };
    must(await db().from("activities").delete().eq("id", activityId), "delete activity");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const previewSchema = z.object({ type: z.string(), config: z.unknown(), answer_key: z.unknown(), index: z.string().max(40).default("1234567") });

/** Validates a draft activity and returns what a student would receive (FR-30 preview). */
export async function previewActivity(input: z.input<typeof previewSchema>): Promise<ActionResult<{ view: unknown; maxScore: number }>> {
  try {
    await requireAdmin();
    const v = previewSchema.parse(input);
    const parsed = parseActivity(v.type, v.config, v.answer_key);
    return { ok: true, view: publicView(v.type, parsed.config, normalizeIndex(v.index) || "1234567"), maxScore: parsed.maxScore };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------- exceptions (FR-24)

const overrideSchema = z.object({
  week_id: z.uuid(),
  index_number: z.string().min(1).max(40),
  kind: z.enum(["geofence", "time"]),
  reason: z.string().trim().min(3).max(500),
  expires_local: z.string(),
});

export async function createOverride(input: z.input<typeof overrideSchema>): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const v = overrideSchema.parse(input);
    const week = must(await db().from("weeks").select("class_id").eq("id", v.week_id).single(), "load week") as { class_id: string };
    const expires_at = accraLocalToIso(v.expires_local);
    if (Date.parse(expires_at) <= Date.now()) return { ok: false, error: "The expiry must be in the future." };
    must(
      await db().from("overrides").insert({ week_id: v.week_id, class_id: week.class_id, index_number: normalizeIndex(v.index_number), kind: v.kind, reason: v.reason, expires_at, created_by: admin.userId }),
      "create exception",
    );
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Ends an exception now. The row is kept, so every exception stays in the log (FR-24). */
export async function endOverride(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    must(await db().from("overrides").update({ expires_at: new Date().toISOString() }).eq("id", z.uuid().parse(id)), "end exception");
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

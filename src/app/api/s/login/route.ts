// Student sign-in and registration (FR-01 to FR-05, FR-14 to FR-18 at login).
import type { NextRequest } from "next/server";
import { json, readBody } from "@/lib/server/http";
import { loginBody } from "@/lib/server/schemas";
import { db, must } from "@/lib/supabase/service";
import { cleanName, isValidIndex, nameKey, normalizeIndex, sameClassCode } from "@/lib/identity";
import { windowState } from "@/lib/window";
import {
  activeOverrides, denial, geoCheck, isRateLimited, logEvent, requestMeta, sessionCookie, sessionExpiryFor, weekByToken,
} from "@/lib/server/student";

// One message for a wrong class code or a badly formed index/reference number, so it reveals nothing (FR-02).
const GENERIC = { error: "generic", message: "We could not sign you in. Check your index or reference number and the class code on the board, then try again." };

export async function POST(req: NextRequest) {
  const body = await readBody(req, loginBody);
  if (!body.ok) return body.res;
  const { token, register, position, positionError } = body.data;
  const meta = requestMeta(req);
  const now = Date.now();

  const index = normalizeIndex(body.data.index);
  const [week, rateLimited] = await Promise.all([
    weekByToken(token),
    isRateLimited(index.slice(0, 32), meta.ipHash),
  ]);
  if (!week) return json({ error: "link", message: "This week link is not valid. Ask your lecturer for the current link." }, 404);

  const base = { class_id: week.class_id, week_id: week.id, index_number: index.slice(0, 32), event: "login" as const, ...meta };

  if (rateLimited) {
    return json({ error: "rate", message: "Too many sign-in attempts. Wait 10 minutes, then try again." }, 429);
  }

  if (!isValidIndex(index)) {
    await logEvent({ ...base, allowed: false, reason: "bad_index_format" });
    return json(GENERIC, 400);
  }

  const [studentRes, overrides] = await Promise.all([
    db().from("students").select("index_number, name, name_key").eq("class_id", week.class_id).eq("index_number", index).maybeSingle(),
    activeOverrides(week.id, index, now),
  ]);
  let student = must(studentRes, "load student") as { index_number: string; name: string; name_key: string } | null;

  if (!student && !register) {
    // Unknown index: open the registration form (FR-02).
    await logEvent({ ...base, allowed: false, reason: "not_registered" });
    return json({ status: "register" });
  }

  if (register) {
    if (normalizeIndex(register.indexConfirm) !== index) {
      await logEvent({ ...base, allowed: false, reason: "index_mismatch" });
      return json({ error: "confirm", message: "The two numbers do not match. Type your index or reference number again in both fields." }, 400);
    }
    if (!sameClassCode(register.classCode, week.join_code)) {
      await logEvent({ ...base, allowed: false, reason: "bad_class_code" });
      return json(GENERIC, 400);
    }
    const name = cleanName(register.name);
    const key = nameKey(name);
    if (name.length < 3 || !/\s/.test(name)) {
      return json({ error: "name", message: "Type your full name: first name and surname." }, 400);
    }
    // FR-03: an index number belongs to one person. The same number with a different name is blocked and flagged.
    const others = must(await db().from("students").select("name_key").eq("index_number", index), "check index") as { name_key: string }[];
    if (others.some((o) => o.name_key !== key)) {
      await logEvent({ ...base, allowed: false, reason: "name_mismatch" });
      return json({ error: "taken", message: "This index or reference number is already registered under a different name. If it is yours, ask your lecturer to check it." }, 409);
    }
    if (!student) {
      const ins = await db().from("students").insert({ class_id: week.class_id, index_number: index, name, name_key: key }).select("index_number, name, name_key").single();
      if (ins.error && ins.error.code !== "23505") throw new Error(ins.error.message);
      student = ins.data ?? (must(await db().from("students").select("index_number, name, name_key").eq("class_id", week.class_id).eq("index_number", index).single(), "reload student") as typeof student);
      if (student && student.name_key !== key) {
        await logEvent({ ...base, allowed: false, reason: "name_mismatch" });
        return json({ error: "taken", message: "This index or reference number is already registered under a different name. If it is yours, ask your lecturer to check it." }, 409);
      }
    }
  }
  if (!student) return json(GENERIC, 400);

  const state = windowState(week, now);
  // Location is checked whenever activities could be opened: window open, or a time exception (FR-17).
  if (week.published && (state === "open" || overrides.time)) {
    const geo = geoCheck(week, overrides, { position, positionError });
    if (!geo.allowed) {
      await logEvent({ ...base, allowed: false, reason: geo.reasonCode, position, geo });
      return json(denial(geo), 403);
    }
    await logEvent({ ...base, allowed: true, reason: geo.reasonCode, position, geo });
  } else {
    await logEvent({ ...base, allowed: true, reason: `window_${state}`, position });
  }

  const c = sessionCookie({ c: week.class_id, w: week.id, i: index, exp: sessionExpiryFor(week, overrides, now) });
  const res = json({ status: "ok", name: student.name });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

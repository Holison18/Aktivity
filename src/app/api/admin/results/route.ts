// Live results for one week (FR-32): one database query per refresh (NF-09).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { json } from "@/lib/server/http";
import { checkAdmin } from "@/lib/server/admin";
import { fetchWeekResults, type ResultsPayload } from "@/lib/server/admin-data";

export type { ResultsPayload };

export async function GET(req: NextRequest) {
  const c = await checkAdmin();
  if (!c.ok) return json({ error: c.reason }, 401);
  const week = z.uuid().safeParse(req.nextUrl.searchParams.get("week"));
  if (!week.success) return json({ error: "bad_request" }, 400);

  const body = await fetchWeekResults(week.data);
  if (!body) return json({ error: "not_found" }, 404);
  return json(body);
}

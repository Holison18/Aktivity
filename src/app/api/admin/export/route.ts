// Excel download for a week or a whole class (FR-34).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { json } from "@/lib/server/http";
import { checkAdmin } from "@/lib/server/admin";
import { buildWorkbook } from "@/lib/server/excel";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const c = await checkAdmin();
  if (!c.ok) return json({ error: c.reason }, 401);
  const sp = req.nextUrl.searchParams;
  const classId = z.uuid().safeParse(sp.get("class"));
  const weekId = sp.get("week") ? z.uuid().safeParse(sp.get("week")) : null;
  if (!classId.success || (weekId && !weekId.success)) return json({ error: "bad_request" }, 400);

  const { buffer, filename } = await buildWorkbook({ classId: classId.data, weekId: weekId?.success ? weekId.data : undefined });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

import type { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/server/http";
import { SESSION_COOKIE } from "@/lib/tokens";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "origin" }, 403);
  const res = json({ status: "ok" });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

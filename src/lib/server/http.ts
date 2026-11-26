import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

/** JSON response that is never cached (student data is per-request). */
export function json(body: unknown, status = 200, init?: { headers?: Record<string, string> }) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

/** Rejects cross-site POSTs: Origin (or Referer) must match the Host (NF-03). */
export function sameOrigin(req: NextRequest): boolean {
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const host = rawHost ? rawHost.split(",")[0].trim().toLowerCase() : "";
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!host || !origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/** Parses and validates a JSON body. Returns a 400 response on failure. */
export async function readBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  if (!sameOrigin(req)) return { ok: false, res: json({ error: "origin", message: "This request came from another site and was blocked." }, 403) };
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 256_000) return { ok: false, res: json({ error: "too_large", message: "The request is too large." }, 413) };
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: json({ error: "bad_request", message: "The request could not be read. Reload the page and try again." }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: json({ error: "bad_request", message: "Some fields are missing or invalid. Check the form and try again." }, 400) };
  return { ok: true, data: parsed.data };
}

export const SESSION_ENDED = { error: "session", message: "Your session has ended. Sign in again with your index number." };

/** The server clock for this request. Pages are rendered per request (force-dynamic), so this is the time the server decides with (FR-07). */
export function requestTime(): number {
  return Date.now();
}

// Admin access (FR-27): a Supabase Auth user, signed in at MFA level aal2, listed in `admins`.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { authClient } from "../supabase/auth-server";
import { db, must } from "../supabase/service";

export type Admin = { userId: string; email: string };

export type AdminCheck =
  | { ok: true; admin: Admin }
  | { ok: false; reason: "signed_out" | "mfa_required" | "not_admin" };

// Short-lived in-memory cache of verified admin allowlist entries to avoid hitting `admins` on every request/poll.
const ADMIN_CACHE_TTL_MS = 60_000;
const adminRowCache = new Map<string, { email: string; exp: number }>();

async function lookupAdminRow(userId: string): Promise<{ email: string } | null> {
  const now = Date.now();
  const cached = adminRowCache.get(userId);
  if (cached && cached.exp > now) return { email: cached.email };
  const row = must(
    await db().from("admins").select("user_id, email").eq("user_id", userId).maybeSingle(),
    "check admin",
  ) as { user_id: string; email: string } | null;
  if (!row) {
    adminRowCache.delete(userId);
    return null;
  }
  adminRowCache.set(userId, { email: row.email, exp: now + ADMIN_CACHE_TTL_MS });
  return { email: row.email };
}

/** Per-request deduplicated admin check: layout + page share a single verification. */
export const checkAdmin = cache(async (): Promise<AdminCheck> => {
  const supa = await authClient();
  // getClaims() verifies the JWT locally via cached JWKS (or Auth server if symmetric) and returns `sub`, `email`, and `aal`.
  const { data } = await supa.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { ok: false, reason: "signed_out" };
  if (claims.aal !== "aal2") return { ok: false, reason: "mfa_required" };
  const row = await lookupAdminRow(claims.sub);
  if (!row) return { ok: false, reason: "not_admin" };
  const email = typeof claims.email === "string" && claims.email ? claims.email : row.email;
  return { ok: true, admin: { userId: claims.sub, email } };
});

/** For pages and server actions: redirects to sign-in unless the caller is a listed admin with MFA. */
export async function requireAdmin(): Promise<Admin> {
  const c = await checkAdmin();
  if (!c.ok) redirect(`/admin/login?reason=${c.reason}`);
  return c.admin;
}

/** Reads every row of a query in pages, past Supabase's default 1000-row limit. */
export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const res = await build(from, from + page - 1);
    if (res.error) throw new Error(res.error.message);
    out.push(...(res.data ?? []));
    if (!res.data || res.data.length < page) return out;
  }
}

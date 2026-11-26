// Service-role Supabase client. Bypasses RLS, so it exists only in server code (SRS 4, NF-04).
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleKey, supabaseUrl } from "../env";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl(), serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: "public" },
    });
  }
  return client;
}

/** Throws a readable error when a Supabase call failed. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    // PGRST205 / PGRST202: table or function not found, almost always because the migration was not run.
    const hint =
      res.error.code === "PGRST205" || res.error.code === "PGRST202"
        ? " Run supabase/migrations/0001_init.sql in the Supabase SQL editor for this project (see README, Set up)."
        : res.error.code === "42501"
          ? " The server role has no table grants: run supabase/migrations/0002_service_role_grants.sql in the Supabase SQL editor."
          : "";
    const err = new Error(`${what}: ${res.error.message}.${hint}`) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data;
}

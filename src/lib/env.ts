// Environment access. Server-only values are read lazily so a missing value fails loudly at use.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Aktivity";

export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  return v;
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
  return v;
}

export function serviceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!v) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server environment only).");
  return v;
}

/** Login attempts allowed per index number in 10 minutes (SRS 6.1). */
export const RATE_PER_INDEX = Number(process.env.RATE_LIMIT_PER_INDEX || 10);
/** Login attempts allowed per IP in 10 minutes. High, because a class shares one campus address. */
export const RATE_PER_IP = Number(process.env.RATE_LIMIT_PER_IP || 1500);
export const RATE_WINDOW_MS = 10 * 60_000;

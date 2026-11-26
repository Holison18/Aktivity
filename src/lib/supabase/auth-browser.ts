"use client";
// Browser Supabase Auth client, used only on the admin sign-in page for password + MFA.
// It never queries tables: RLS has no policy for anon or authenticated (SRS 4).
import { createBrowserClient } from "@supabase/ssr";

export function browserAuth() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

// Creates (or finds) a Supabase Auth user and lists it as a console admin (FR-27).
// Usage: node scripts/make-admin.mjs you@university.edu "a-strong-password"
// The admin enrols an authenticator app at first sign-in (MFA is required).
import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env.local"); } catch { /* use the shell environment */ }
const [email, password] = process.argv.slice(2);
if (!email) {
  console.error('Usage: node scripts/make-admin.mjs email "password"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  if (!password || password.length < 12) {
    console.error("User not found. Give a password of at least 12 characters to create it.");
    process.exit(1);
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log(`Created auth user ${email}`);
}
const { error } = await db.from("admins").upsert({ user_id: user.id, email: user.email });
if (error) throw error;
console.log(`${email} is now an admin. Sign in at /admin and set up your authenticator app.`);

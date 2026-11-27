// Pre-deployment readiness check for Vercel production environment variables.
// Reads .env.local if present and verifies required keys without printing secret values.
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    /* ignore if already loaded */
  }
}

const checks = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    validate: (v) => /^https:\/\/.+\.supabase\.co\/?$/i.test(v) || /^https:\/\/.+/i.test(v),
    hint: "Must be your HTTPS Supabase project URL (e.g. https://<ref>.supabase.co).",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    validate: (v) => v.length >= 20 && !v.startsWith("your-"),
    hint: "Copy the anon/publishable key from Supabase Project Settings -> API.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    validate: (v) => v.length >= 20 && !v.startsWith("your-"),
    hint: "Copy the service_role/secret key from Supabase Project Settings -> API (server-only).",
  },
  {
    name: "SESSION_SECRET",
    required: true,
    validate: (v) => v.length >= 32,
    hint: "Must be at least 32 random characters (required when NODE_ENV=production).",
  },
  {
    name: "IP_HASH_SALT",
    required: false,
    validate: (v) => v.length >= 16,
    hint: "Recommended 32+ random characters (falls back to SESSION_SECRET if unset).",
  },
  {
    name: "INDEX_NUMBER_PATTERN",
    required: false,
    validate: (v) => {
      try {
        new RegExp(v);
        return true;
      } catch {
        return false;
      }
    },
    hint: "Valid regular expression (defaults to ^\\d{7,10}$).",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    required: false,
    validate: (v) => /^https:\/\/.+/i.test(v),
    hint: "Optional locally; set to your production https:// URL in Vercel (otherwise auto-detected from request host).",
  },
];

let failed = false;
console.log("Production environment check:\n");

for (const c of checks) {
  const val = (process.env[c.name] ?? "").trim();
  if (!val) {
    if (c.required) {
      failed = true;
      console.log(`  [FAIL] ${c.name} — missing (${c.hint})`);
    } else {
      console.log(`  [INFO] ${c.name} — unset (${c.hint})`);
    }
    continue;
  }
  if (!c.validate(val)) {
    failed = true;
    console.log(`  [FAIL] ${c.name} — invalid (${c.hint})`);
  } else {
    console.log(`  [ OK ] ${c.name} (set, length ${val.length})`);
  }
}

console.log("");
if (failed) {
  console.error("One or more required production environment variables are missing or invalid.");
  process.exit(1);
}
console.log("All required production environment variables look ready for Vercel.");

# Aktivity

Weekly class activities with index-number sign-in, a time window and a geofence. Built with Next.js 16 (App Router, TypeScript) and Supabase, as specified in `docs/Software Requirements Specification Student Activity Platform.docx`.

Requirement-by-requirement status lives in **[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)**.

The earlier single-laptop prototype is in `prototype/` and still runs (`cd prototype && npm start`) as the fallback for lesson 1 (SRS 8.2).

## Set up (once)

1. **Supabase project.** In the SQL editor, run the migrations in `supabase/migrations/` in order (`0001_init.sql` through `0004_allow_more_activities.sql`). They create the eight tables, constraints, indexes, Row Level Security (no public access) and helper functions.
2. **Auth settings.** In Authentication → Providers, keep Email enabled. In Authentication → Multi-Factor, make sure **TOTP is enabled**. Turn off public sign-ups (Authentication → Settings) so only accounts you create exist.
3. **Environment.** Copy `.env.example` to `.env.local` and fill in the URL, anon key, service role key and a `SESSION_SECRET`.
4. **Install and create your admin account:**
   ```bash
   npm install
   node scripts/make-admin.mjs you@university.edu "a long password"
   ```
5. **Run:** `npm run dev`, open `http://localhost:3000/admin`, sign in, and scan the QR code with an authenticator app.

Location only works on secure pages. `localhost` counts as secure; phones on the campus network need the deployed **HTTPS** site.

## Weekly use

1. **Classes:** create a class, set the class code and the default classroom location (use "Use my current location" from inside the room).
2. **New week:** number, title, opening and closing time (Accra time), geofence (map, radius, accuracy limit), published switch. Saving creates the **week link**; use Copy to share it.
3. **Activities:** add activities to a week using **+ Add activity** from the templates (CIA sorting, risk rating, password strength) or a blank of any type, then *Validate and preview*.
4. **In class:** write the class code on the board, share the link, open **Live results** (refreshes every 5 s). Use **Extend +10 min** or **Close now** as needed. Grant a per-student **exception** from the student's detail page if their device cannot share location.
5. **After class:** **Download Excel** (Summary, Attempts, Answers, Access log). Check **Review** for flagged submissions and blocked name mismatches.

Before the first lesson, test the geofence from the back row of the classroom. Phones usually report 5 to 30 m accuracy; laptops can be off by hundreds of metres. Use a radius of 100 m or more.

## Tests

```bash
npm test             # unit tests: haversine, window, attempts, every scorer, tokens, totals (no network)
npm run test:live    # acceptance criteria AC-1 to AC-8 against the Supabase project in .env.local
npm run typecheck
npm run lint
```

`test:live` creates a throwaway class, runs every SRS acceptance test through the real route handlers, then deletes the class.

For AC-8 over the network against a deployment (use a test week):

```bash
node scripts/load-test.mjs https://your-site /w/<token> <CLASSCODE> <centre-lat> <centre-lng>
```

## Deploy (Vercel)

1. **Run all Supabase migrations** in the Supabase SQL Editor in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_service_role_grants.sql`
   - `supabase/migrations/0003_perf_indexes.sql`
   - `supabase/migrations/0004_allow_more_activities.sql`
2. **Verify local env readiness:** run `npm run check:prod` to confirm all required variables are populated in `.env.local` (especially a 32+ character `SESSION_SECRET`).
3. **Import the project in Vercel** (Framework Preset: **Next.js**, Node.js `>=20.9`).
4. **Add Environment Variables** in Vercel (**Project Settings → Environment Variables** for Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `SESSION_SECRET` (32+ random chars; required in production)
   - `IP_HASH_SALT` (recommended 32+ random chars)
   - `INDEX_NUMBER_PATTERN` (e.g. `^\d{7}$`)
   - `NEXT_PUBLIC_APP_NAME` (e.g. `Aktivity`)
   - `NEXT_PUBLIC_SITE_URL` (your production `https://` URL, e.g. `https://your-app.vercel.app` — optional; if omitted, week links auto-detect the request host)
   - `RATE_LIMIT_PER_INDEX` (`10`) and `RATE_LIMIT_PER_IP` (`1500`)
5. **Function region & Supabase region:** pick the Vercel Function Region closest to your Supabase region and Ghana (e.g. `eu-west` / `lhr1` London or `cdg1` Paris) and test latency from campus.
6. **Supabase Auth URLs:** in Supabase (**Authentication → URL Configuration**), set **Site URL** to your Vercel `https://` URL and keep public sign-ups turned off with **TOTP MFA enabled**.
7. **Deploy and verify:** open `https://<your-domain>/admin`, sign in with MFA, project a week QR code, and test geolocation from a phone over HTTPS.

## Add an activity type

1. Server module in `src/lib/activities/<type>.ts` implementing `ActivityType`: config schema, answer-key schema, answers schema, `view` (never includes the key), `score`, `maxScore`, `describe`, `validate`.
2. Register it in `src/lib/activities/registry.ts`.
3. Student renderer in `src/components/activities/renderers.tsx` (`RENDERERS`).
4. Add tests in `tests/scorers.test.ts`.

Existing types are not touched (FR-22). A new weekly activity of an existing type needs configuration only.

## Data and privacy

- Students never reach the database: every request goes through server code using the service role key, which exists only in server environment variables.
- Answer keys are read only by the scoring code on the server.
- IP addresses are stored as salted hashes, coordinates rounded to 4 decimal places.
- Set the course end date on each class; `select public.purge_location_data();` deletes access records 90 days after it (schedule it with `pg_cron`, see the migration). Confirm the retention period with the university's data protection officer.

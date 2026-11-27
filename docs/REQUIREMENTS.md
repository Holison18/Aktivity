# Requirements tracker

Source: `Software Requirements Specification Student Activity Platform.docx` (raw text in `docs/srs-extracted.txt`).
Every SRS requirement is listed here by ID. After each build iteration, this file is checked and updated.

Status legend:
- `[ ]` not started
- `[~]` partially done (note says what is missing)
- `[x]` implemented, and verified by an automated test or a build check
- `[k]` implemented, but needs the live Supabase project to verify end to end

Priority: **M** = Must (lesson 1, 27 Nov), **S** = Should (lesson 2, 4 Dec), **C** = Could.

## Decisions taken on open questions (SRS 8.3)

| Question | Decision used in the build |
|---|---|
| Index number format | Configurable regex `INDEX_NUMBER_PATTERN`, default `^\d{7,10}$` (7–10 digits to accept index and reference numbers) |
| Which prototype activities run in week 1 | All three are seeded as templates; the admin picks 2 per week |
| Failed location check at submit: flag or block | Flag, as written in FR-17 |
| Show distance to a denied student | Yes, rounded to 10 m, as written in FR-18 |
| Retention period | 90 days after course end, purge function provided (`purge_location_data`) |
| Platform name / domain | Placeholder `APP_NAME` env var, default "Aktivity" |
| Re-registration with a different name (FR-03) | An index already registered anywhere with a different `name_key` is blocked and flagged in `access_events` (reason `name_mismatch`) |

## 3.1 Student access and sessions

| ID | P | Requirement (short) | Status | Where / how verified |
|---|---|---|---|---|
| FR-01 | M | Week link fixes class + week; new student registers (index twice, full name, class code); returning student enters index only | [k] | `src/app/w/[token]/page.tsx`, `api/s/login`, `StudentApp.tsx`; live test AC-1 |
| FR-02 | M | Unregistered index opens registration; wrong class code or bad index format gives one generic message | [k] | login route `GENERIC` message; live test FR-02 |
| FR-03 | M | Index registered once; same index with different name (case/space-insensitive) blocked and flagged | [k] | login route `name_mismatch` check across all classes; live test FR-03; listed in /admin/review |
| FR-04 | M | Signed httpOnly session cookie expiring when week window closes | [x] | `tokens.ts` HMAC session, `sessionExpiryFor`; httpOnly/Secure/Lax; tests/session.test.ts |
| FR-05 | M | Login rate limit per IP and per index (10 per 10 min per index; high per-IP limit) | [k] | `isRateLimited` counts access_events (10/index, 1500/IP per 10 min); live test FR-05 |
| FR-06 | M | Week page: title, open/close times, live countdown, 1-2 activities with status and best score | [k] | `/api/s/week` + StudentApp week screen with countdown |
## 3.2 Time window

| ID | P | Requirement (short) | Status | Where / how verified |
|---|---|---|---|---|
| FR-07 | M | Server clock decides open/close | [x] | `window.ts`, server clock only; tests/core.test.ts |
| FR-08 | M | Activity content sent only while published and window open | [x] | `canStart` in start route; no content in page/week responses; unit + live AC-3 |
| FR-09 | M | Auto-submit at close; server accepts up to 20 s after close | [x] | `canSubmit` 20 s grace; Countdown `onZero` auto-submits; unit + live AC-4 |
| FR-10 | S | Admin extends close by 10 min steps or closes early | [k] | `extendWeek`/`closeWeekNow` actions; session follows extension (`sessionValidUntil`, unit tested) |
| FR-11 | M | Outside window: show when it opens / closed; past scores visible | [k] | week screen states + past weeks list; live AC-4 checks best score visible after close |
## 3.3 Geofencing

| ID | P | Requirement (short) | Status | Where / how verified |
|---|---|---|---|---|
| FR-12 | M | Admin sets geofence per week (lat, lng, radius); map picker + "use my location" | [k] | `WeekForm` + Leaflet `MapPicker` (drag/click) + lat/lng inputs + use my location |
| FR-13 | S | Week geofence copies class default on creation, editable per week | [x] | `WeekForm` seeds centre/radius from class defaults on create |
| FR-14 | M | Browser asks high-accuracy position after a short explanation | [x] | `getPosition` enableHighAccuracy, after the locate screen explanation and privacy notice |
| FR-15 | M | Server haversine distance; allowed only within radius | [x] | `haversineMeters`/`checkGeofence` on the server; tests/core.test.ts |
| FR-16 | M | Reading with accuracy worse than limit (default 100 m) rejected, retry asked | [x] | accuracy worse than `max_accuracy_m` rejected (default 100, admin-set); unit + live AC-2 |
| FR-17 | M | Checked at login, activity start, each submit; failed submit check saves + flags attempt | [k] | checked at login, start, submit; failed submit saved + flagged; live AC-2 |
| FR-18 | M | Denied student sees reason; for "outside" also distance to nearest 10 m | [x] | `denial()` reasons + distance to 10 m; StudentApp DENIAL_TEXT; tests/session.test.ts |
| FR-19 | S | Admin can switch geofence off per week | [x] | `geofence_enabled` switch; fence_off unit test |
| FR-20 | M | Every check logged (result, distance, accuracy, time); coords rounded to 4 dp | [k] | `logEvent` on every check, coords rounded 4 dp; live AC-2 checks rounding |
## 3.4 Activities and scoring

| ID | P | Requirement (short) | Status | Where / how verified |
|---|---|---|---|---|
| FR-21 | M | Week holds 1-2 activities: title, instructions, type, config, answer key, max score | [x] | activities table + `parseActivity`; tests/scorers.test.ts |
| FR-22 | M | Types: Sorting, Rating, Calculation & choice; new types plug in without changing others | [x] | sorting, rating, calc_choice modules + registry; contract test |
| FR-23 | M | Server-side scoring; keys never sent; score + per-item feedback right after submit | [x] | scoring in submit route; `view()` has no key; unit tests + bundle grep (0 hits) + live AC-5 |
| FR-24 | M | Admin grants per-student geofence/time exception for a week with reason + expiry; logged | [k] | overrides table, `createOverride`/`endOverride` (rows kept as log), form on student detail; read in `activeOverrides` |
| FR-25 | S | 2 attempts by default, best counts; admin changes per activity | [x] | `max_attempts` default 2 per activity, best counts; tests/core.test.ts |
| FR-26 | C | Numeric questions seeded from index number | [x] | `questionVars` seeded by index; tests show neighbours differ |
## 3.5 Admin console

| ID | P | Requirement (short) | Status | Where / how verified |
|---|---|---|---|---|
| FR-27 | M | Admin email + password + MFA; only listed admins reach console | [k] | Supabase Auth password + TOTP (`LoginForm`); `requireAdmin` needs aal2 + admins row; needs one live sign-in |
| FR-28 | M | Create classes with class codes; review students; correct name/index; merge duplicates | [k] | classes page, `StudentsTable` correct + merge (`correct_student`, `merge_students` SQL) |
| FR-29 | M | Schedule week: number, title, open, close, geofence, published; unique link + Copy; regenerate invalidates old | [k] | `saveWeek` creates 12-char token; `WeekLink` Copy + Regenerate |
| FR-30 | S | Build/edit activities with a form per type; preview as student | [~] | templates, blanks, server validation, live student preview, answer-key editor. Missing: structured form per type (config is edited as JSON) |
| FR-31 | C | Duplicate a past week | [k] | `duplicateWeek` copies settings + activities, +7 days, unpublished |
| FR-32 | M | Live results: best per activity, total, %, refresh 5 s, started/submitted counts | [k] | `LiveResults` polls `/api/admin/results` every 5 s; started/submitted counters |
| FR-33 | S | Student detail: attempts, answers, location checks, flagged | [k] | `/admin/weeks/[id]/students/[index]`: attempts, answers, feedback, access log, flags, exceptions |
| FR-34 | M | Excel per week or class: Summary, Attempts, Answers, Access log | [k] | `lib/server/excel.ts` four sheets, per week or class; live AC-6 |
## 4. Data requirements

| ID | Requirement (short) | Status | Where / how verified |
|---|---|---|---|
| D-01 | Eight tables: classes, students, weeks, activities, attempts, access_events, overrides, admins (columns as SRS section 4) | [x] | `supabase/migrations/0001_init.sql` |
| D-02 | students PK (class_id, index_number); index trimmed + uppercase; name_key lowercase single-spaced | [x] | PK + uppercase/trim check; `normalizeIndex`, `nameKey` tested |
| D-03 | weeks unique (class_id, number); timestamptz; unique link_token; max_accuracy_m default 100 | [x] | unique (class_id, number), unique link_token, default 100 |
| D-04 | activities position 1 or 2 check + unique (week_id, position) = cap of 2 in the database | [k] | check (position in (1,2)) + unique (week_id, position); live AC-7 |
| D-05 | attempts unique (activity_id, index_number, attempt_no) | [x] | unique constraint; idempotent submit relies on it |
| D-06 | access_events: event login/start/submit, allowed and denied both written | [x] | check constraint; allowed and denied both logged |
| D-07 | overrides kind geofence/time, read on every access check | [x] | `activeOverrides` on every session/start/submit |
| D-08 | RLS on every table, no anon policy; browsers never query DB directly | [k] | RLS on all 8 tables, no policies, grants revoked from anon/authenticated |
| D-09 | Student requests use service role key in server code only | [x] | `supabase/service.ts` is server-only; key has no NEXT_PUBLIC_ prefix; bundle grep 0 hits |
| D-10 | answer_key read only by server scoring code | [x] | answer_key selected only by the submit route and the admin builder |
| D-11 | IP stored as salted hash; coords rounded to 4 dp | [x] | `hashIp` salted SHA-256; `roundCoord` |
| D-12 | Location rows deleted 90 days after course end | [~] | `purge_location_data()` + class `course_ends_on`. Missing: schedule it with pg_cron |
## 5. UI requirements

| ID | Requirement (short) | Status | Where / how verified |
|---|---|---|---|
| UI-01 | Colours: white bg, #0A0A0A text, #F5F5F5 fills, #E5E5E5 hairlines | [x] | tokens in `globals.css` |
| UI-02 | Wide heavy display face (Syne/Unbounded) for titles + big numbers; optional grey fade on title second line | [x] | Syne 700/800 via next/font; `.fade-line` |
| UI-03 | Light grey body text, key words bold black | [x] | Inter 300 #5c5c5c; strong = #0a0a0a |
| UI-04 | Buttons: black pill + arrow; grey pill secondary; grey text link tertiary | [x] | `.btn-primary` + `Arrow`, `.btn-secondary`, `.btn-link` |
| UI-05 | Nav: grey capsule with 3-4 links + one black pill action | [x] | console nav capsule + New week pill; current section on a white pill (`NavLinks`, `aria-current`) |
| UI-06 | Numbers in display face, small uppercase grey label | [x] | `Stat` component |
| UI-07 | Flat surfaces, hairline borders, soft shadow only on raised cards, no gradients except title fade | [x] | `.card`; shadow only on `.card-raised`; colours, corners and shadows are named tokens in `globals.css` |
| UI-08 | Correct/incorrect: small green/red mark plus text label | [x] | `.mark-ok`/`.mark-bad` always with a text label |
| UI-09 | Motion under 200 ms, respects reduced motion | [x] | all motion 200 ms or less with custom ease-out; reduced motion zeroes movement and keeps fades (`--rise`/`--press` tokens) |
| UI-10 | Screens: Login, Location check, This week, Activity, Result (student) | [k] | StudentApp screens: login, register, locate, week, activity, result |
| UI-11 | Screens: Admin sign in, Live results, Classes & students, Week scheduler, Activity builder, Student detail | [k] | admin sign in, live results, classes, scheduler, builder, student detail, review |
| UI-12 | Mobile-first student flow, touch targets >= 44 px | [x] | single column; student buttons and chips min 44 px (admin `btn-sm` is 36 px, laptop-targeted) |
| UI-13 | WCAG 2.1 AA contrast; grey body text >= 4.5:1 | [x] | body 6.7:1, labels 5.3:1, placeholder 4.9:1 on the grey field (was 4.2:1); title fade only on large text (3:1 rule) |
| UI-14 | Keyboard operable, visible focus ring; drag-and-drop has tap/keyboard alternative | [x] | `:focus-visible` ring in the base layer (controls keep their shape when focused); every choice is a button (no drag); map has click + typed coordinates |
| UI-15 | Error messages say what happened and what to do | [x] | error messages say what happened and what to do |
| UI-16 | First student page < 300 KB JS | [~] | measured 140 KB gzip transferred to modern browsers; 474 KB uncompressed, mostly the React/Next runtime. Met as transfer size only |
| UI-17 | Map picker loads only on scheduler page | [x] | `next/dynamic` import in `WeekForm` only |
## 6. Non-functional requirements

| ID | Requirement (short) | Status | Where / how verified |
|---|---|---|---|
| NF-01 | Server decides geofence; accuracy rejection; checks at login/start/submit logged; outside submissions flagged | [k] | server-side geofence, accuracy rejection, 3 checkpoints, flags |
| NF-02 | Cookies httpOnly, Secure, SameSite=Lax; link token 12 random chars; link opens sign-in only | [x] | cookie flags; `randomToken(12)` tested; link page = sign-in only |
| NF-03 | Every input validated server-side with a schema (Zod); admin changes check origin | [x] | Zod on every route and action; `sameOrigin` on student POSTs (cross-site POST returned 403 in smoke test); Server Actions Origin check |
| NF-04 | Secrets only in server env; service role key never reaches browser | [x] | bundle grep for service role key: 0 hits |
| NF-05 | Answer keys never in any student response | [x] | unit tests + bundle grep + live AC-5 |
| NF-06 | Privacy notice before location prompt: what, why, how long | [x] | `PrivacyNotice` on the locate screen before the prompt |
| NF-07 | Only admin can read location data | [x] | location only shown in admin pages and export (requireAdmin) |
| NF-08 | Capacity: 150 concurrent, 150 logins / 2 min, submit p95 < 500 ms | [k] | live AC-8 (in-process) + `scripts/load-test.mjs` (HTTP) |
| NF-09 | Admin results refresh = one query per refresh | [x] | `week_results` RPC = one query per refresh |
| NF-10 | Answers kept in browser while working; failed submit retries automatically with visible state | [x] | localStorage drafts; `post` retries 6 times with visible state |
| NF-11 | Submit idempotent (double tap / retry cannot duplicate) | [k] | unique constraint + `submissionDecision`; unit + live test |
| NF-12 | Countdown uses server clock offset measured at page load | [x] | `syncClock` at load and on every week poll |
| NF-13 | Each activity type = module with config schema, student renderer, server scorer | [x] | ActivityType contract + `RENDERERS` |
| NF-14 | Automated tests: haversine, window checks, attempt limits, every scorer | [x] | 70 unit tests: haversine, window, attempts, every scorer |
| NF-15 | All times stored UTC, shown in Africa/Accra | [x] | timestamptz; `formatAccra`; Accra = UTC conversion tested |
## 7. Architecture: ordered checks on start/submit

| ID | Check | Status | Where / how verified |
|---|---|---|---|
| AR-1 | Session cookie valid and belongs to a registered student of this class | [x] | `requireStudent` |
| AR-2 | Week published and window open, or time exception | [x] | `canStart`/`canSubmit` + time exception |
| AR-3 | Position accurate enough and inside radius, or geofence exception, or geofence off | [x] | `geoCheck` + geofence exception / fence off |
| AR-4 | Attempts left on this activity | [x] | `nextAttemptNo` / `submissionDecision` |
| AR-5 | Start returns activity without key; submit scores, saves, returns result | [x] | start returns `publicView`; submit scores, saves, returns result |
## 8.1 Acceptance criteria

| # | Test | Passes when | Status | How verified |
|---|---|---|---|---|
| AC-1 | Registered student inside radius completes both activities | Score shows < 1 s with feedback | [k] | `tests/acceptance.live.test.ts`: score + 15 feedback items, timed under 1 s |
| AC-2 | Student 500 m outside tries to start | Denied, distance shown | [k] | live test: 403, reason outside, distance 500 m |
| AC-3 | Student opens week before and after window | No activity content in any response | [k] | unit test + live test before and after the window |
| AC-4 | Submit 10 s and 30 s after close | First accepted, second rejected | [k] | unit test + live test (10 s accepted, 30 s rejected) |
| AC-5 | Inspect network responses and scripts | No answer key appears | [x] | unit tests + built-bundle grep (0 hits); live test also checks every response body |
| AC-6 | Open Excel export | Four sheets, totals match console | [k] | live test: 4 sheets, Summary totals equal console totals |
| AC-7 | Admin tries to add a third activity | System refuses | [k] | DB constraint + action check + UI offers 2 slots; live test inserts position 3 |
| AC-8 | 150 simulated logins within 2 minutes | All complete without errors | [k] | live test (150 in-process) + `npm run load-test` over HTTP |
## Iteration log

| # | Date | What was done | Tracker rows changed |
|---|---|---|---|
| 0 | 2026-11-23 | SRS converted to this tracker; prototype moved to `prototype/`; Next.js 16 app scaffolded at the root | none yet |
| 1 | 2026-11-23 | Database schema, constraints, RLS, SQL helpers (`supabase/migrations/0001_init.sql`) | D-01 to D-12 |
| 2 | 2026-11-23 | Core libraries (geo, window, tokens, identity, formula evaluator) and the 3 activity types with the prototype content as templates. Bug found by tests and fixed: the formula evaluator resolved prototype names such as `constructor` | FR-07, FR-15, FR-16, FR-21 to FR-26, NF-13, NF-14 |
| 3 | 2026-11-23 | Student API (login/register, week, start, submit) with the ordered checks; student UI | FR-01 to FR-20, AR-1 to AR-5, NF-10 to NF-12, UI-10 |
| 4 | 2026-11-23 | Admin: MFA sign-in, classes/students, scheduler with map, builder with preview, live results, student detail, exceptions, review, Excel | FR-24, FR-27 to FR-34, UI-11 |
| 5 | 2026-11-23 | Verification: typecheck, lint, production build, smoke test, bundle size and key-leak checks, 70 unit tests passing; live acceptance suite written (12 tests, waiting for Supabase keys) | UI-13, UI-16, AC-1 to AC-8 |
| 6 | 2026-11-23 | UI polish within SRS 5.1: motion tokens, press feedback, hover only on pointer devices, `@starting-style` screen entry, staggered lists, score reveal, fixed-width busy/copied labels, answered-progress bar, current-page nav pill. Typecheck, lint and 70 unit tests pass | UI-04, UI-05, UI-09, UI-12, UI-14 |
| 7 | 2026-11-23 | Design audit fixes: focus ring moved into `@layer base` (it was overriding pill and field corners on focus); merge students now asks before removing a record; window states shown as Scheduled/Open/Closed/Draft; long title words wrap instead of overflowing phones; placeholder contrast raised to 4.9:1; spinner on Start/Try again and admin password step; title line-height 1.0; colour transitions use the custom ease; hard-coded colours, radii and shadows moved to tokens; live results keeps sort and search in the URL. Typecheck, lint and 70 unit tests pass; production build not rerun (dev and start servers were using `.next`) | UI-07, UI-13, UI-14, FR-28, FR-32 |

## Remaining work

1. Put the Supabase keys in `.env.local`, run the migration, then `npm run test:live`. Every `[k]` row it covers moves to `[x]` when it passes.
2. Sign in to the console once to verify MFA enrolment (FR-27).
3. FR-30 (Should, lesson 2): a structured form per activity type instead of the JSON editor.
4. Schedule `purge_location_data()` with pg_cron (D-12).
5. Test the geofence from the back row of the classroom; run `scripts/load-test.mjs` against the deployed site (AC-8 over HTTP).

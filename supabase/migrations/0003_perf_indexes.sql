-- Performance indexes for review queries, live results, student detail logs, and week ordering.
-- Run in the Supabase SQL editor or with `supabase db push`.

-- /admin/review: flagged attempts sorted by newest first
create index if not exists attempts_flagged_submitted_idx
  on public.attempts (submitted_at desc)
  where flagged = true;

-- /admin/review: name_mismatch blocks sorted by newest first
create index if not exists access_events_name_mismatch_idx
  on public.access_events (created_at desc)
  where reason = 'name_mismatch';

-- week_results() RPC: count distinct students who successfully started in a week
create index if not exists access_events_week_started_idx
  on public.access_events (week_id, index_number)
  where event = 'start' and allowed = true;

-- Student detail page & student deletion/correction/merge log updates
create index if not exists access_events_week_index_idx
  on public.access_events (week_id, index_number, created_at desc);

create index if not exists access_events_class_index_idx
  on public.access_events (class_id, index_number);

-- /admin/weeks ordering by opens_at desc
create index if not exists weeks_opens_at_idx
  on public.weeks (opens_at desc);

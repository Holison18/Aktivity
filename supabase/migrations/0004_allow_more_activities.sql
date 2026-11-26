-- Allow more than 2 activities per week.
-- Run in the Supabase SQL editor, or with `supabase db push`.

alter table public.activities
  drop constraint if exists activities_position_check;

alter table public.activities
  add constraint activities_position_check check (position >= 1);

notify pgrst, 'reload schema';

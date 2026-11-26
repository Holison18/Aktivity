-- Grants for the server (service_role) on the platform's tables.
-- Newer Supabase projects no longer grant table access to API roles automatically,
-- so without this the server gets "permission denied for table ...".
-- anon and authenticated stay without access (SRS 4: browsers never query the database).
-- Safe to run more than once.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.classes, public.students, public.weeks, public.activities,
  public.attempts, public.access_events, public.overrides, public.admins
to service_role;

grant usage, select on all sequences in schema public to service_role;

grant execute on function public.week_results(uuid)                           to service_role;
grant execute on function public.correct_student(uuid, text, text, text, text) to service_role;
grant execute on function public.merge_students(uuid, text, text)             to service_role;
grant execute on function public.purge_location_data()                        to service_role;

-- Keep the public roles locked out, whatever the project defaults are.
revoke all on all tables in schema public from anon, authenticated;

notify pgrst, 'reload schema';

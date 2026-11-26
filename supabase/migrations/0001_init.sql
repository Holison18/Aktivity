-- Student Activity Platform: initial schema (SRS section 4).
-- Run in the Supabase SQL editor, or with `supabase db push`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- classes
create table public.classes (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 120),
  join_code        text not null check (length(btrim(join_code)) between 3 and 32),
  default_lat      double precision check (default_lat between -90 and 90),
  default_lng      double precision check (default_lng between -180 and 180),
  default_radius_m integer not null default 150 check (default_radius_m between 10 and 50000),
  course_ends_on   date,            -- drives the 90-day location retention rule
  created_at       timestamptz not null default now()
);

-- --------------------------------------------------------------- students
create table public.students (
  class_id      uuid not null references public.classes(id) on delete cascade,
  index_number  text not null check (index_number = upper(btrim(index_number)) and length(index_number) between 1 and 32),
  name          text not null check (length(btrim(name)) between 2 and 120),
  name_key      text not null,
  registered_at timestamptz not null default now(),
  primary key (class_id, index_number)
);
create index students_index_number_idx on public.students (index_number);

-- ------------------------------------------------------------------ weeks
create table public.weeks (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  number           integer not null check (number between 1 and 60),
  title            text not null check (length(btrim(title)) between 1 and 160),
  opens_at         timestamptz not null,
  closes_at        timestamptz not null,
  published        boolean not null default false,
  link_token       text not null unique check (length(link_token) >= 12),
  geofence_enabled boolean not null default true,
  center_lat       double precision check (center_lat between -90 and 90),
  center_lng       double precision check (center_lng between -180 and 180),
  radius_m         integer not null default 150 check (radius_m between 10 and 50000),
  max_accuracy_m   integer not null default 100 check (max_accuracy_m between 5 and 5000),
  created_at       timestamptz not null default now(),
  unique (class_id, number),
  check (closes_at > opens_at),
  check (not geofence_enabled or (center_lat is not null and center_lng is not null))
);

-- ------------------------------------------------------------- activities
-- The cap of two activities per week is enforced here (SRS 2.4, 4):
-- position must be 1 or 2, and (week_id, position) is unique.
create table public.activities (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references public.weeks(id) on delete cascade,
  position     smallint not null check (position in (1, 2)),
  type         text not null,
  title        text not null check (length(btrim(title)) between 1 and 160),
  instructions text not null default '',
  config       jsonb not null,
  answer_key   jsonb not null,
  max_attempts integer not null default 2 check (max_attempts between 1 and 20),
  max_score    numeric not null check (max_score > 0),
  created_at   timestamptz not null default now(),
  unique (week_id, position)
);

-- --------------------------------------------------------------- attempts
create table public.attempts (
  id             uuid primary key default gen_random_uuid(),
  activity_id    uuid not null references public.activities(id) on delete cascade,
  class_id       uuid not null,
  index_number   text not null,
  attempt_no     integer not null check (attempt_no >= 1),
  started_at     timestamptz,
  submitted_at   timestamptz not null default now(),
  auto_submitted boolean not null default false,
  answers        jsonb not null,
  score          numeric not null,
  max_score      numeric not null,
  feedback       jsonb not null,
  flagged        boolean not null default false,
  flag_reason    text,
  unique (activity_id, index_number, attempt_no),
  foreign key (class_id, index_number)
    references public.students(class_id, index_number) on update cascade on delete cascade
);
create index attempts_class_index_idx on public.attempts (class_id, index_number);

-- ---------------------------------------------------------- access_events
create table public.access_events (
  id           bigint generated always as identity primary key,
  class_id     uuid references public.classes(id) on delete cascade,
  week_id      uuid references public.weeks(id) on delete cascade,
  activity_id  uuid references public.activities(id) on delete set null,
  index_number text,
  event        text not null check (event in ('login', 'start', 'submit')),
  allowed      boolean not null,
  reason       text,
  lat          numeric(7,4),   -- rounded to 4 decimal places (about 11 m)
  lng          numeric(8,4),
  accuracy_m   numeric,
  distance_m   numeric,
  ip_hash      text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index access_events_rl_index_idx on public.access_events (index_number, event, created_at);
create index access_events_rl_ip_idx    on public.access_events (ip_hash, event, created_at);
create index access_events_week_idx     on public.access_events (week_id, created_at);

-- -------------------------------------------------------------- overrides
create table public.overrides (
  id           uuid primary key default gen_random_uuid(),
  week_id      uuid not null references public.weeks(id) on delete cascade,
  class_id     uuid not null,
  index_number text not null,
  kind         text not null check (kind in ('geofence', 'time')),
  reason       text not null check (length(btrim(reason)) between 3 and 500),
  expires_at   timestamptz not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  foreign key (class_id, index_number)
    references public.students(class_id, index_number) on update cascade on delete cascade
);
create index overrides_lookup_idx on public.overrides (week_id, index_number);

-- ----------------------------------------------------------------- admins
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text not null
);

-- ------------------------------------------------------ row level security
-- RLS on for every table, with no policy for anon or authenticated.
-- Only the service role (server code) can read or write.
alter table public.classes       enable row level security;
alter table public.students      enable row level security;
alter table public.weeks         enable row level security;
alter table public.activities    enable row level security;
alter table public.attempts      enable row level security;
alter table public.access_events enable row level security;
alter table public.overrides     enable row level security;
alter table public.admins        enable row level security;

revoke all on all tables in schema public from anon, authenticated;
-- Newer Supabase projects do not grant API roles table access by default: grant the server role explicitly.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- helpers

-- Live results for one week in a single round trip (SRS 6.3: one query per refresh).
create or replace function public.week_results(p_week uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with w as (
    select * from weeks where id = p_week
  ),
  acts as (
    select a.id, a.position, a.title, a.type, a.max_score, a.max_attempts
    from activities a join w on a.week_id = w.id
  ),
  best as (
    select t.index_number, t.activity_id,
           max(t.score) as best,
           count(*)     as attempts,
           bool_or(t.flagged) as flagged
    from attempts t join acts a on a.id = t.activity_id
    group by t.index_number, t.activity_id
  ),
  started as (
    select distinct e.index_number
    from access_events e join w on e.week_id = w.id
    where e.event = 'start' and e.allowed
  )
  select jsonb_build_object(
    'week', (select to_jsonb(w) - 'link_token' from w),
    'activities', coalesce((select jsonb_agg(to_jsonb(acts) order by position) from acts), '[]'::jsonb),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'index_number', s.index_number,
        'name', s.name,
        'started', exists (select 1 from started x where x.index_number = s.index_number),
        'results', coalesce((
          select jsonb_object_agg(b.activity_id, jsonb_build_object('best', b.best, 'attempts', b.attempts, 'flagged', b.flagged))
          from best b where b.index_number = s.index_number
        ), '{}'::jsonb)
      ) order by s.index_number)
      from students s join w on s.class_id = w.class_id
    ), '[]'::jsonb),
    'started_count', (select count(*) from started),
    'submitted_count', (select count(distinct index_number) from best)
  );
$$;

-- Correct a student's index number and/or name. Attempts and overrides follow
-- through ON UPDATE CASCADE; access_events are updated explicitly.
create or replace function public.correct_student(
  p_class uuid, p_old text, p_new_index text, p_new_name text, p_new_name_key text
) returns void
language plpgsql
set search_path = public
as $$
begin
  update students
     set index_number = p_new_index, name = p_new_name, name_key = p_new_name_key
   where class_id = p_class and index_number = p_old;
  if not found then
    raise exception 'student_not_found';
  end if;
  if p_new_index <> p_old then
    update access_events set index_number = p_new_index
     where class_id = p_class and index_number = p_old;
  end if;
end;
$$;

-- Merge a duplicate registration (p_drop) into p_keep. Attempts are renumbered
-- after p_keep's existing attempts so the unique constraint holds.
create or replace function public.merge_students(p_class uuid, p_keep text, p_drop text)
returns void
language plpgsql
set search_path = public
as $$
declare
  r record;
  next_no integer;
begin
  if p_keep = p_drop then
    raise exception 'same_student';
  end if;
  perform 1 from students where class_id = p_class and index_number = p_keep;
  if not found then raise exception 'keep_not_found'; end if;
  perform 1 from students where class_id = p_class and index_number = p_drop;
  if not found then raise exception 'drop_not_found'; end if;

  for r in
    select id, activity_id from attempts
     where class_id = p_class and index_number = p_drop
     order by submitted_at
  loop
    select coalesce(max(attempt_no), 0) + 1 into next_no
      from attempts
     where activity_id = r.activity_id and class_id = p_class and index_number = p_keep;
    update attempts set index_number = p_keep, attempt_no = next_no where id = r.id;
  end loop;

  update overrides     set index_number = p_keep where class_id = p_class and index_number = p_drop;
  update access_events set index_number = p_keep where class_id = p_class and index_number = p_drop;
  delete from students where class_id = p_class and index_number = p_drop;
end;
$$;

-- Retention (SRS 4, 6.2): delete location records 90 days after the course ends.
-- Schedule with pg_cron, e.g.  select cron.schedule('purge-locations', '0 3 * * *', 'select public.purge_location_data()');
create or replace function public.purge_location_data()
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  delete from access_events e
   using classes c
   where e.class_id = c.id
     and c.course_ends_on is not null
     and c.course_ends_on + 90 < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.week_results(uuid)                      from public, anon, authenticated;
revoke all on function public.correct_student(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.merge_students(uuid, text, text)        from public, anon, authenticated;
revoke all on function public.purge_location_data()                   from public, anon, authenticated;
grant execute on function public.week_results(uuid)                      to service_role;
grant execute on function public.correct_student(uuid, text, text, text, text) to service_role;
grant execute on function public.merge_students(uuid, text, text)        to service_role;
grant execute on function public.purge_location_data()                   to service_role;

-- Make the Supabase API (PostgREST) see the new tables and functions immediately.
notify pgrst, 'reload schema';

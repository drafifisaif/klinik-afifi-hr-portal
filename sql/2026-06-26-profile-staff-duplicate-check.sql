-- Diagnose duplicate profile/staff linkage that can break My Profile update flows.

-- 1. Profiles that appear more than once for the same auth id shape.
select
  id,
  email,
  full_name,
  role,
  branch_id
from profiles
order by email, id;

-- 2. Duplicate staff rows linked to the same profile_id.
select
  profile_id,
  count(*) as linked_staff_count,
  array_agg(id order by id) as staff_ids
from staff
where profile_id is not null
group by profile_id
having count(*) > 1
order by linked_staff_count desc, profile_id;

-- 3. Duplicate staff rows by email.
select
  lower(email) as normalized_email,
  count(*) as staff_count,
  array_agg(id order by id) as staff_ids
from staff
where coalesce(trim(email), '') <> ''
group by lower(email)
having count(*) > 1
order by staff_count desc, normalized_email;

-- 4. Staff rows for the same auth-linked profile with useful cleanup context.
select
  s.id,
  s.profile_id,
  s.full_name,
  s.email,
  s.status,
  s.branch_id,
  s.created_at,
  s.updated_at
from staff s
where s.profile_id in (
  select profile_id
  from staff
  where profile_id is not null
  group by profile_id
  having count(*) > 1
)
order by s.profile_id, s.updated_at desc nulls last, s.created_at desc nulls last, s.id desc;

-- Safe cleanup approach:
-- Keep the newest/most-correct active row for each profile_id and archive/delete only the wrong duplicate rows after manual review.
-- Do NOT run destructive cleanup blindly in production.

-- Recommended protection after cleanup and verification:
-- alter table staff add constraint staff_profile_id_unique unique (profile_id);
-- alter table profiles add constraint profiles_id_unique unique (id);

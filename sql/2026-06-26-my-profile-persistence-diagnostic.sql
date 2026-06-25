-- Diagnostic query for My Profile persistence checks.
-- Replace the email below when checking a different user.

select
  p.id as profile_id,
  p.email as profile_email,
  p.full_name as profile_full_name,
  p.avatar_url,
  p.branch_id as profile_branch_id,
  s.id as staff_id,
  s.profile_id as staff_profile_id,
  s.full_name as staff_full_name,
  s.email as staff_email,
  s.phone,
  s.ic_no,
  s.address,
  s.emergency_contact_name,
  s.emergency_contact_phone,
  s.branch_id as staff_branch_id,
  s.status,
  s.updated_at as staff_updated_at,
  p.updated_at as profile_updated_at
from profiles p
left join staff s on s.profile_id = p.id
where lower(coalesce(p.email, s.email, '')) = lower('testpic@klinikafifi.com.my')
order by coalesce(s.updated_at, s.created_at, p.updated_at, p.created_at) desc nulls last;

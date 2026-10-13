-- Allow authenticated staff to read only their own published roster rows.
-- Required by the attendance page and punch API when using the user session.

drop policy if exists "Staff can view own published rosters" on public.rosters;

create policy "Staff can view own published rosters"
on public.rosters
for select
to authenticated
using (
  is_published = true
  and exists (
    select 1
    from public.staff s
    where s.id = rosters.staff_id
      and s.profile_id = auth.uid()
  )
);

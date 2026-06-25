-- MC upload RLS fix
-- Goal:
-- - staff and branch_pic can submit only their own MC rows
-- - HR / super_admin keep broad review access through existing policies
-- - storage bucket mc-uploads stays private and scoped to each authenticated user path

-- leave_requests: allow self medical leave insert
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leave_requests'
      and policyname = 'leave_requests_insert_own_mc'
  ) then
    create policy leave_requests_insert_own_mc
    on public.leave_requests
    for insert
    to authenticated
    with check (
      lower(coalesce(leave_type, '')) = 'medical_leave'
      and profile_id = auth.uid()
      and exists (
        select 1
        from public.staff s
        where s.id = leave_requests.staff_id
          and s.profile_id = auth.uid()
      )
    );
  end if;
end $$;

-- leave_requests: allow staff / branch_pic to view their own MC rows
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leave_requests'
      and policyname = 'leave_requests_select_own_mc'
  ) then
    create policy leave_requests_select_own_mc
    on public.leave_requests
    for select
    to authenticated
    using (
      lower(coalesce(leave_type, '')) = 'medical_leave'
      and (
        profile_id = auth.uid()
        or exists (
          select 1
          from public.staff s
          where s.id = leave_requests.staff_id
            and s.profile_id = auth.uid()
        )
      )
    );
  end if;
end $$;

-- storage.objects: allow authenticated users to upload only into mc/{auth.uid()}/...
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'mc_uploads_insert_own_folder'
  ) then
    create policy mc_uploads_insert_own_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'mc-uploads'
      and (storage.foldername(name))[1] = 'mc'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;
end $$;

-- storage.objects: allow authenticated users to read only their own mc path
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'mc_uploads_select_own_folder'
  ) then
    create policy mc_uploads_select_own_folder
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'mc-uploads'
      and (storage.foldername(name))[1] = 'mc'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;
end $$;

-- storage.objects: allow authenticated users to update only their own mc path
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'mc_uploads_update_own_folder'
  ) then
    create policy mc_uploads_update_own_folder
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'mc-uploads'
      and (storage.foldername(name))[1] = 'mc'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    with check (
      bucket_id = 'mc-uploads'
      and (storage.foldername(name))[1] = 'mc'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
  end if;
end $$;

-- Verification query: leave_requests own MC rows can map back to the linked staff profile
select
  lr.id,
  lr.profile_id,
  lr.staff_id,
  s.profile_id as linked_staff_profile_id,
  lr.leave_type,
  lr.status
from public.leave_requests lr
left join public.staff s on s.id = lr.staff_id
where lower(coalesce(lr.leave_type, '')) = 'medical_leave'
order by lr.created_at desc nulls last
limit 20;

-- Verification query: mc-uploads storage paths
select
  bucket_id,
  name
from storage.objects
where bucket_id = 'mc-uploads'
order by created_at desc nulls last
limit 20;

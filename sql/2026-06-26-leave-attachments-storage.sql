-- Leave attachment storage and RLS support
-- Goal:
-- - leave request submissions require uploaded leave forms
-- - files stay private in the leave-attachments bucket
-- - authenticated users upload only to their own leave-requests/{staff_id}/{year}/... folder
-- - HR / super_admin / eligible branch PIC review through signed URLs in the app

insert into storage.buckets (id, name, public)
select 'leave-attachments', 'leave-attachments', false
where not exists (
  select 1
  from storage.buckets
  where id = 'leave-attachments'
);

-- Authenticated users can upload only into leave-requests/{their_staff_id}/{year}/...
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'leave_attachments_insert_own_staff_folder'
  ) then
    create policy leave_attachments_insert_own_staff_folder
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'leave-attachments'
      and (storage.foldername(name))[1] = 'leave-requests'
      and exists (
        select 1
        from public.staff s
        where s.profile_id = auth.uid()
          and s.id::text = (storage.foldername(name))[2]
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'leave_attachments_select_own_staff_folder'
  ) then
    create policy leave_attachments_select_own_staff_folder
    on storage.objects
    for select
    to authenticated
    using (
      bucket_id = 'leave-attachments'
      and (storage.foldername(name))[1] = 'leave-requests'
      and exists (
        select 1
        from public.staff s
        where s.profile_id = auth.uid()
          and s.id::text = (storage.foldername(name))[2]
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'leave_attachments_update_own_staff_folder'
  ) then
    create policy leave_attachments_update_own_staff_folder
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'leave-attachments'
      and (storage.foldername(name))[1] = 'leave-requests'
      and exists (
        select 1
        from public.staff s
        where s.profile_id = auth.uid()
          and s.id::text = (storage.foldername(name))[2]
      )
    )
    with check (
      bucket_id = 'leave-attachments'
      and (storage.foldername(name))[1] = 'leave-requests'
      and exists (
        select 1
        from public.staff s
        where s.profile_id = auth.uid()
          and s.id::text = (storage.foldername(name))[2]
      )
    );
  end if;
end $$;

-- Verification queries
select id, name, public
from storage.buckets
where id = 'leave-attachments';

select bucket_id, name
from storage.objects
where bucket_id = 'leave-attachments'
order by created_at desc nulls last
limit 20;

-- Private feedback files. Apply before enabling uploads in the portal.
alter table public.feedbacks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.feedbacks'::regclass
      and conname = 'feedbacks_attachments_array_check'
  ) then
    alter table public.feedbacks
      add constraint feedbacks_attachments_array_check
      check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('feedback-attachments', 'feedback-attachments', false, 10485760)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'feedback_attachments_upload_own_folder'
  ) then
    create policy feedback_attachments_upload_own_folder
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'feedback-attachments'
        and (storage.foldername(name))[1] = 'feedback'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'feedback_attachments_select_own_folder'
  ) then
    create policy feedback_attachments_select_own_folder
      on storage.objects for select to authenticated
      using (
        bucket_id = 'feedback-attachments'
        and (storage.foldername(name))[1] = 'feedback'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'feedback_attachments_remove_own_folder'
  ) then
    create policy feedback_attachments_remove_own_folder
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'feedback-attachments'
        and (storage.foldername(name))[1] = 'feedback'
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;

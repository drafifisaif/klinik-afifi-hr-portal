create extension if not exists pgcrypto;

create table if not exists public.feedback_email_logs (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid null references public.feedbacks(id) on delete set null,
  target_staff_id uuid null references public.staff(id) on delete set null,
  target_profile_id uuid null references public.profiles(id) on delete set null,
  recipient_email text null,
  email_subject text null,
  email_status text not null default 'pending',
  resend_email_id text null,
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_email_logs_feedback_id_idx
  on public.feedback_email_logs (feedback_id);

create index if not exists feedback_email_logs_target_staff_id_idx
  on public.feedback_email_logs (target_staff_id);

create index if not exists feedback_email_logs_target_profile_id_idx
  on public.feedback_email_logs (target_profile_id);

create index if not exists feedback_email_logs_email_status_idx
  on public.feedback_email_logs (email_status);

create or replace function public.set_feedback_email_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_feedback_email_logs_updated_at on public.feedback_email_logs;

create trigger set_feedback_email_logs_updated_at
before update on public.feedback_email_logs
for each row
execute function public.set_feedback_email_logs_updated_at();

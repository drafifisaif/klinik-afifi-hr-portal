alter table if exists public.attendance_settings
add column if not exists early_leave_grace_minutes integer not null default 10;

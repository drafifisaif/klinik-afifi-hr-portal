-- Supporting indexes for the roster, attendance, leave and correction lookups.
-- All statements are idempotent and safe to run on production.

create index if not exists rosters_staff_date_idx
  on public.rosters (staff_id, roster_date);

create index if not exists rosters_branch_date_idx
  on public.rosters (branch_id, roster_date);

create index if not exists rosters_template_idx
  on public.rosters (shift_template_id);

create index if not exists attendance_records_staff_date_idx
  on public.attendance_records (staff_id, attendance_date);

create index if not exists attendance_records_branch_date_idx
  on public.attendance_records (branch_id, attendance_date);

create index if not exists attendance_adjustments_staff_date_idx
  on public.attendance_adjustments (staff_id, created_at);

create index if not exists leave_requests_staff_dates_idx
  on public.leave_requests (staff_id, start_date, end_date);

create index if not exists leave_requests_branch_status_idx
  on public.leave_requests (branch_id, status);

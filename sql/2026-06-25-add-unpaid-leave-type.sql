do $$
begin
  begin
    alter type public.leave_type add value if not exists 'unpaid_leave';
  exception
    when undefined_object then
      null;
  end;
end $$;

do $$
declare
  constraint_name text;
begin
  select tc.constraint_name
  into constraint_name
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
   and ccu.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'leave_requests'
    and tc.constraint_type = 'CHECK'
    and ccu.column_name = 'leave_type'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.leave_requests drop constraint if exists %I', constraint_name);
  end if;

  alter table public.leave_requests
    add constraint leave_requests_leave_type_check
    check (
      leave_type is null
      or leave_type in ('annual_leave', 'medical_leave', 'emergency_leave', 'unpaid_leave')
    );
end $$;

-- Verification query
select
  leave_type
from public.leave_requests
group by leave_type
order by leave_type;

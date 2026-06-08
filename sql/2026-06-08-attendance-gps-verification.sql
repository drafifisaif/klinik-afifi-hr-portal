alter table branches
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists gps_radius_meters integer default 300,
  add column if not exists gps_is_active boolean not null default true;

alter table attendance_records
  add column if not exists check_in_latitude numeric,
  add column if not exists check_in_longitude numeric,
  add column if not exists check_in_distance_meters numeric,
  add column if not exists check_in_location_status text,
  add column if not exists check_out_latitude numeric,
  add column if not exists check_out_longitude numeric,
  add column if not exists check_out_distance_meters numeric,
  add column if not exists check_out_location_status text,
  add column if not exists check_in_is_offsite boolean not null default false,
  add column if not exists check_out_is_offsite boolean not null default false,
  add column if not exists offsite_note text;

update branches
set gps_radius_meters = 300
where (
  upper(coalesce(code, '')) in ('PUTATAN', 'PAPAR')
  or lower(coalesce(name, '')) in ('putatan', 'papar')
)
and (
  gps_radius_meters is null
  or gps_radius_meters < 100
);

update branches
set gps_radius_meters = 500
where (
  upper(coalesce(code, '')) in ('RANAU', 'KINABATANGAN')
  or lower(coalesce(name, '')) in ('ranau', 'kinabatangan')
)
and (
  gps_radius_meters is null
  or gps_radius_meters < 100
);

-- Verification query: branch GPS configuration
select
  id,
  name,
  code,
  latitude,
  longitude,
  gps_radius_meters
from branches
order by name;

-- Verification query: attendance GPS/offsite columns
select column_name
from information_schema.columns
where table_name = 'attendance_records'
and column_name in (
  'check_in_latitude',
  'check_in_longitude',
  'check_in_distance_meters',
  'check_in_location_status',
  'check_out_latitude',
  'check_out_longitude',
  'check_out_distance_meters',
  'check_out_location_status',
  'check_in_is_offsite',
  'check_out_is_offsite',
  'offsite_note'
)
order by column_name;

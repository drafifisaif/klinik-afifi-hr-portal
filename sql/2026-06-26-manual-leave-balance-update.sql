with confirmed(branch_name, alias_name, annual_total_new, annual_remaining_new, medical_total_new, medical_remaining_new) as (
  values
    ('Ranau','Saleha',16,8,22,21),
    ('Ranau','Nayim',12,3,16,11),
    ('Ranau','Jess',12,8,16,16),
    ('Ranau','Dr Rizuwan',14,4,12,12),
    ('Ranau','Dr Izyan',16,9,16,15),
    ('Ranau','Nurul',12,0,16,16),
    ('Ranau','Ela',8,3,12,12),
    ('Ranau','Clare',8,2,12,12),
    ('Ranau','Fira',8,8,11,11),
    ('Putatan','Jajah',12,0,16,15),
    ('Putatan','Shaza',12,8,16,15),
    ('Putatan','Aisah',12,8,16,16),
    ('Papar','Zarinah',12,5,16,16),
    ('Papar','Amerah',12,8,16,16),
    ('Kinabatangan','Nilam',12,9,16,16),
    ('Kinabatangan','Dr Afikah',14,9,12,12),
    ('Kinabatangan','Yana',12,7,16,12),
    ('Kinabatangan','Aqilah',8,4,12,12)
),
aliases(branch_name, alias_name, match_term) as (
  values
    ('Ranau','Saleha','saleha'),
    ('Ranau','Saleha','siti salihah binti mohd said'),
    ('Ranau','Nayim','nayim'),
    ('Ranau','Nayim','nayim syafiq bin boy @ sharif'),
    ('Ranau','Jess','jess'),
    ('Ranau','Jess','jessica kariki'),
    ('Ranau','Dr Rizuwan','dr rizuwan'),
    ('Ranau','Dr Rizuwan','rizuwan'),
    ('Ranau','Dr Rizuwan','mohd noor rizuwan bin ismail'),
    ('Ranau','Dr Izyan','dr izyan'),
    ('Ranau','Dr Izyan','izyan'),
    ('Ranau','Dr Izyan','izyan binti mohd alwi'),
    ('Ranau','Nurul','nurul'),
    ('Ranau','Nurul','nurul sazwani amira binti juni'),
    ('Ranau','Ela','ela'),
    ('Ranau','Ela','nur aisya elavarasi binti abdullah'),
    ('Ranau','Clare','clare'),
    ('Ranau','Clare','clare vee rica bidik'),
    ('Ranau','Fira','fira'),
    ('Ranau','Fira','norhafirah'),
    ('Putatan','Jajah','jajah'),
    ('Putatan','Jajah','zulhijah binti perdinant'),
    ('Putatan','Shaza','shaza'),
    ('Putatan','Shaza','nur shazanie binti mohd jaini'),
    ('Putatan','Aisah','aisah'),
    ('Putatan','Aisah','aisah binti janun'),
    ('Papar','Zarinah','zarinah'),
    ('Papar','Zarinah','zarinah binti abd gapar'),
    ('Papar','Amerah','amerah'),
    ('Papar','Amerah','nur amerah binti mohd shah'),
    ('Kinabatangan','Nilam','nilam'),
    ('Kinabatangan','Dr Afikah','dr afikah'),
    ('Kinabatangan','Dr Afikah','dr norafika'),
    ('Kinabatangan','Dr Afikah','norafika'),
    ('Kinabatangan','Dr Afikah','norafika binti puddin'),
    ('Kinabatangan','Yana','yana'),
    ('Kinabatangan','Yana','mariana'),
    ('Kinabatangan','Yana','mariana binti piku'),
    ('Kinabatangan','Aqilah','aqilah'),
    ('Kinabatangan','Aqilah','aqilah nur adilah binti rudianto')
),
active_staff as (
  select
    s.id as staff_id,
    s.profile_id,
    s.full_name,
    s.email,
    s.status,
    s.branch_id,
    b.name as branch_name
  from staff s
  join branches b on b.id = s.branch_id
  where lower(coalesce(s.status, 'active')) = 'active'
),
matched_candidates as (
  select
    c.branch_name,
    c.alias_name,
    c.annual_total_new,
    c.annual_remaining_new,
    c.medical_total_new,
    c.medical_remaining_new,
    a.match_term,
    s.staff_id,
    s.profile_id,
    s.full_name,
    s.email,
    s.branch_id
  from confirmed c
  join aliases a on a.branch_name = c.branch_name and a.alias_name = c.alias_name
  join active_staff s on lower(s.branch_name) = lower(c.branch_name)
   and lower(coalesce(s.full_name,'')) like '%' || lower(a.match_term) || '%'
),
ranked_matches as (
  select *,
    row_number() over (
      partition by branch_name, alias_name
      order by
        case when lower(coalesce(full_name,'')) = lower(match_term) then 0 else 1 end,
        length(coalesce(full_name,'')),
        full_name,
        staff_id
    ) as rn,
    count(*) over (partition by branch_name, alias_name) as candidate_count
  from matched_candidates
),
matched_staff as (
  select * from ranked_matches where rn = 1 and candidate_count = 1
),
ambiguous_or_unmatched as (
  select
    c.branch_name,
    c.alias_name,
    coalesce(max(r.candidate_count), 0) as candidate_count,
    string_agg(distinct coalesce(r.full_name,'<none>') || ' [' || coalesce(r.staff_id::text,'') || ']', '; ' order by coalesce(r.full_name,'<none>')) as candidates
  from confirmed c
  left join ranked_matches r on r.branch_name = c.branch_name and r.alias_name = c.alias_name
  group by c.branch_name, c.alias_name
  having coalesce(max(r.candidate_count), 0) <> 1
),
usage_rows as (
  select
    lr.staff_id,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'annual_leave' then coalesce(lr.total_days, 0) else 0 end) as annual_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'emergency_leave' then coalesce(lr.total_days, 0) else 0 end) as emergency_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'medical_leave' then coalesce(lr.total_days, 0) else 0 end) as medical_usage
  from leave_requests lr
  group by lr.staff_id
),
latest_entitlement as (
  select * from (
    select
      le.*,
      row_number() over (
        partition by le.staff_id
        order by
          case when le.entitlement_year = extract(year from current_date)::int then 0 else 1 end,
          le.entitlement_year desc nulls last,
          le.effective_from desc nulls last,
          le.created_at desc nulls last,
          le.id desc
      ) as rn
    from leave_entitlements le
  ) ranked
  where rn = 1
),
preview as (
  select
    ms.branch_name,
    ms.staff_id,
    ms.full_name,
    ms.email,
    le.id as leave_entitlement_id,
    le.entitlement_year,
    le.annual_leave_total as current_al_total,
    greatest(coalesce(le.annual_leave_total,0) - coalesce(le.annual_leave_opening_used,0) - coalesce(u.annual_usage,0) - coalesce(u.emergency_usage,0), 0) as current_al_remaining,
    ms.annual_total_new,
    ms.annual_remaining_new,
    le.medical_leave_total as current_mc_total,
    greatest(coalesce(le.medical_leave_total,0) - coalesce(le.medical_leave_opening_used,0) - coalesce(u.medical_usage,0), 0) as current_mc_remaining,
    ms.medical_total_new,
    ms.medical_remaining_new,
    coalesce(u.annual_usage,0) as approved_annual_usage,
    coalesce(u.emergency_usage,0) as approved_emergency_usage,
    coalesce(u.medical_usage,0) as approved_medical_usage,
    greatest(ms.annual_total_new - ms.annual_remaining_new - coalesce(u.annual_usage,0) - coalesce(u.emergency_usage,0), 0) as new_annual_opening_used,
    greatest(ms.medical_total_new - ms.medical_remaining_new - coalesce(u.medical_usage,0), 0) as new_medical_opening_used
  from matched_staff ms
  left join latest_entitlement le on le.staff_id = ms.staff_id
  left join usage_rows u on u.staff_id = ms.staff_id
)
select * from preview order by branch_name, full_name;

-- Unmatched or ambiguous rows: review before any update.
with confirmed(branch_name, alias_name, annual_total_new, annual_remaining_new, medical_total_new, medical_remaining_new) as (
  values
    ('Ranau','Saleha',16,8,22,21),('Ranau','Nayim',12,3,16,11),('Ranau','Jess',12,8,16,16),('Ranau','Dr Rizuwan',14,4,12,12),('Ranau','Dr Izyan',16,9,16,15),('Ranau','Nurul',12,0,16,16),('Ranau','Ela',8,3,12,12),('Ranau','Clare',8,2,12,12),('Ranau','Fira',8,8,11,11),('Putatan','Jajah',12,0,16,15),('Putatan','Shaza',12,8,16,15),('Putatan','Aisah',12,8,16,16),('Papar','Zarinah',12,5,16,16),('Papar','Amerah',12,8,16,16),('Kinabatangan','Nilam',12,9,16,16),('Kinabatangan','Dr Afikah',14,9,12,12),('Kinabatangan','Yana',12,7,16,12),('Kinabatangan','Aqilah',8,4,12,12)
),
aliases(branch_name, alias_name, match_term) as (
  values
    ('Ranau','Saleha','saleha'),('Ranau','Saleha','siti salihah binti mohd said'),('Ranau','Nayim','nayim'),('Ranau','Nayim','nayim syafiq bin boy @ sharif'),('Ranau','Jess','jess'),('Ranau','Jess','jessica kariki'),('Ranau','Dr Rizuwan','dr rizuwan'),('Ranau','Dr Rizuwan','rizuwan'),('Ranau','Dr Rizuwan','mohd noor rizuwan bin ismail'),('Ranau','Dr Izyan','dr izyan'),('Ranau','Dr Izyan','izyan'),('Ranau','Dr Izyan','izyan binti mohd alwi'),('Ranau','Nurul','nurul'),('Ranau','Nurul','nurul sazwani amira binti juni'),('Ranau','Ela','ela'),('Ranau','Ela','nur aisya elavarasi binti abdullah'),('Ranau','Clare','clare'),('Ranau','Clare','clare vee rica bidik'),('Ranau','Fira','fira'),('Ranau','Fira','norhafirah'),('Putatan','Jajah','jajah'),('Putatan','Jajah','zulhijah binti perdinant'),('Putatan','Shaza','shaza'),('Putatan','Shaza','nur shazanie binti mohd jaini'),('Putatan','Aisah','aisah'),('Putatan','Aisah','aisah binti janun'),('Papar','Zarinah','zarinah'),('Papar','Zarinah','zarinah binti abd gapar'),('Papar','Amerah','amerah'),('Papar','Amerah','nur amerah binti mohd shah'),('Kinabatangan','Nilam','nilam'),('Kinabatangan','Dr Afikah','dr afikah'),('Kinabatangan','Dr Afikah','dr norafika'),('Kinabatangan','Dr Afikah','norafika'),('Kinabatangan','Dr Afikah','norafika binti puddin'),('Kinabatangan','Yana','yana'),('Kinabatangan','Yana','mariana'),('Kinabatangan','Yana','mariana binti piku'),('Kinabatangan','Aqilah','aqilah'),('Kinabatangan','Aqilah','aqilah nur adilah binti rudianto')
),
active_staff as (
  select s.id as staff_id, s.full_name, b.name as branch_name
  from staff s join branches b on b.id = s.branch_id
  where lower(coalesce(s.status,'active')) = 'active'
),
matched_candidates as (
  select c.branch_name, c.alias_name, a.match_term, s.staff_id, s.full_name
  from confirmed c
  join aliases a on a.branch_name = c.branch_name and a.alias_name = c.alias_name
  join active_staff s on lower(s.branch_name) = lower(c.branch_name)
   and lower(coalesce(s.full_name,'')) like '%' || lower(a.match_term) || '%'
),
ranked_matches as (
  select *, count(*) over (partition by branch_name, alias_name) as candidate_count
  from matched_candidates
)
select c.branch_name, c.alias_name, coalesce(max(r.candidate_count),0) as candidate_count,
       string_agg(distinct coalesce(r.full_name,'<none>') || ' [' || coalesce(r.staff_id::text,'') || ']', '; ' order by coalesce(r.full_name,'<none>')) as candidates
from confirmed c
left join ranked_matches r on r.branch_name = c.branch_name and r.alias_name = c.alias_name
group by c.branch_name, c.alias_name
having coalesce(max(r.candidate_count),0) <> 1
order by c.branch_name, c.alias_name;

-- UPDATE BLOCK: run only after confirming the unmatched/ambiguous query returns zero rows.
with confirmed(branch_name, alias_name, annual_total_new, annual_remaining_new, medical_total_new, medical_remaining_new) as (
  values
    ('Ranau','Saleha',16,8,22,21),('Ranau','Nayim',12,3,16,11),('Ranau','Jess',12,8,16,16),('Ranau','Dr Rizuwan',14,4,12,12),('Ranau','Dr Izyan',16,9,16,15),('Ranau','Nurul',12,0,16,16),('Ranau','Ela',8,3,12,12),('Ranau','Clare',8,2,12,12),('Ranau','Fira',8,8,11,11),('Putatan','Jajah',12,0,16,15),('Putatan','Shaza',12,8,16,15),('Putatan','Aisah',12,8,16,16),('Papar','Zarinah',12,5,16,16),('Papar','Amerah',12,8,16,16),('Kinabatangan','Nilam',12,9,16,16),('Kinabatangan','Dr Afikah',14,9,12,12),('Kinabatangan','Yana',12,7,16,12),('Kinabatangan','Aqilah',8,4,12,12)
),
aliases(branch_name, alias_name, match_term) as (
  values
    ('Ranau','Saleha','saleha'),('Ranau','Saleha','siti salihah binti mohd said'),('Ranau','Nayim','nayim'),('Ranau','Nayim','nayim syafiq bin boy @ sharif'),('Ranau','Jess','jess'),('Ranau','Jess','jessica kariki'),('Ranau','Dr Rizuwan','dr rizuwan'),('Ranau','Dr Rizuwan','rizuwan'),('Ranau','Dr Rizuwan','mohd noor rizuwan bin ismail'),('Ranau','Dr Izyan','dr izyan'),('Ranau','Dr Izyan','izyan'),('Ranau','Dr Izyan','izyan binti mohd alwi'),('Ranau','Nurul','nurul'),('Ranau','Nurul','nurul sazwani amira binti juni'),('Ranau','Ela','ela'),('Ranau','Ela','nur aisya elavarasi binti abdullah'),('Ranau','Clare','clare'),('Ranau','Clare','clare vee rica bidik'),('Ranau','Fira','fira'),('Ranau','Fira','norhafirah'),('Putatan','Jajah','jajah'),('Putatan','Jajah','zulhijah binti perdinant'),('Putatan','Shaza','shaza'),('Putatan','Shaza','nur shazanie binti mohd jaini'),('Putatan','Aisah','aisah'),('Putatan','Aisah','aisah binti janun'),('Papar','Zarinah','zarinah'),('Papar','Zarinah','zarinah binti abd gapar'),('Papar','Amerah','amerah'),('Papar','Amerah','nur amerah binti mohd shah'),('Kinabatangan','Nilam','nilam'),('Kinabatangan','Dr Afikah','dr afikah'),('Kinabatangan','Dr Afikah','dr norafika'),('Kinabatangan','Dr Afikah','norafika'),('Kinabatangan','Dr Afikah','norafika binti puddin'),('Kinabatangan','Yana','yana'),('Kinabatangan','Yana','mariana'),('Kinabatangan','Yana','mariana binti piku'),('Kinabatangan','Aqilah','aqilah'),('Kinabatangan','Aqilah','aqilah nur adilah binti rudianto')
),
active_staff as (
  select s.id as staff_id, s.profile_id, s.full_name, s.email, s.status, s.branch_id, b.name as branch_name
  from staff s join branches b on b.id = s.branch_id
  where lower(coalesce(s.status,'active')) = 'active'
),
matched_candidates as (
  select c.branch_name, c.alias_name, c.annual_total_new, c.annual_remaining_new, c.medical_total_new, c.medical_remaining_new,
         a.match_term, s.staff_id, s.profile_id, s.full_name, s.email, s.branch_id
  from confirmed c
  join aliases a on a.branch_name = c.branch_name and a.alias_name = c.alias_name
  join active_staff s on lower(s.branch_name) = lower(c.branch_name)
   and lower(coalesce(s.full_name,'')) like '%' || lower(a.match_term) || '%'
),
ranked_matches as (
  select *, row_number() over (partition by branch_name, alias_name order by case when lower(coalesce(full_name,'')) = lower(match_term) then 0 else 1 end, length(coalesce(full_name,'')), full_name, staff_id) as rn,
         count(*) over (partition by branch_name, alias_name) as candidate_count
  from matched_candidates
),
matched_staff as (
  select * from ranked_matches where rn = 1 and candidate_count = 1
),
usage_rows as (
  select lr.staff_id,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'annual_leave' then coalesce(lr.total_days, 0) else 0 end) as annual_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'emergency_leave' then coalesce(lr.total_days, 0) else 0 end) as emergency_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'medical_leave' then coalesce(lr.total_days, 0) else 0 end) as medical_usage
  from leave_requests lr
  group by lr.staff_id
),
latest_entitlement as (
  select * from (
    select le.*, row_number() over (
      partition by le.staff_id
      order by case when le.entitlement_year = extract(year from current_date)::int then 0 else 1 end,
               le.entitlement_year desc nulls last, le.effective_from desc nulls last, le.created_at desc nulls last, le.id desc
    ) as rn
    from leave_entitlements le
  ) ranked
  where rn = 1
),
update_source as (
  select
    ms.staff_id,
    le.id as leave_entitlement_id,
    coalesce(le.entitlement_year, extract(year from current_date)::int) as entitlement_year_target,
    ms.annual_total_new,
    ms.medical_total_new,
    greatest(ms.annual_total_new - ms.annual_remaining_new - coalesce(u.annual_usage,0) - coalesce(u.emergency_usage,0), 0) as annual_leave_opening_used_new,
    greatest(ms.medical_total_new - ms.medical_remaining_new - coalesce(u.medical_usage,0), 0) as medical_leave_opening_used_new
  from matched_staff ms
  left join latest_entitlement le on le.staff_id = ms.staff_id
  left join usage_rows u on u.staff_id = ms.staff_id
),
updated as (
  update leave_entitlements le
  set
    entitlement_year = us.entitlement_year_target,
    annual_leave_total = us.annual_total_new,
    medical_leave_total = us.medical_total_new,
    annual_leave_opening_used = us.annual_leave_opening_used_new,
    medical_leave_opening_used = us.medical_leave_opening_used_new,
    opening_balance_note = coalesce(le.opening_balance_note, 'Manual confirmed balance update on 2026-06-26')
  from update_source us
  where le.id = us.leave_entitlement_id
  returning le.staff_id, le.id as leave_entitlement_id
),
inserted as (
  insert into leave_entitlements (
    staff_id,
    entitlement_year,
    annual_leave_total,
    medical_leave_total,
    annual_leave_opening_used,
    medical_leave_opening_used,
    opening_balance_note,
    effective_from
  )
  select
    us.staff_id,
    us.entitlement_year_target,
    us.annual_total_new,
    us.medical_total_new,
    us.annual_leave_opening_used_new,
    us.medical_leave_opening_used_new,
    'Manual confirmed balance update on 2026-06-26',
    current_date
  from update_source us
  where us.leave_entitlement_id is null
  returning staff_id, id as leave_entitlement_id
)
select 'updated' as action, * from updated
union all
select 'inserted' as action, * from inserted;

-- VERIFICATION
with usage_rows as (
  select
    lr.staff_id,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'annual_leave' then coalesce(lr.total_days, 0) else 0 end) as annual_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'emergency_leave' then coalesce(lr.total_days, 0) else 0 end) as emergency_usage,
    sum(case when lower(coalesce(lr.status,'')) = 'approved' and lower(coalesce(lr.leave_type,'')) = 'medical_leave' then coalesce(lr.total_days, 0) else 0 end) as medical_usage
  from leave_requests lr
  group by lr.staff_id
),
latest_entitlement as (
  select * from (
    select le.*, row_number() over (
      partition by le.staff_id
      order by case when le.entitlement_year = extract(year from current_date)::int then 0 else 1 end,
               le.entitlement_year desc nulls last, le.effective_from desc nulls last, le.created_at desc nulls last, le.id desc
    ) as rn
    from leave_entitlements le
  ) ranked
  where rn = 1
)
select
  b.name as branch,
  s.id as staff_id,
  s.full_name,
  le.annual_leave_total,
  greatest(coalesce(le.annual_leave_total,0) - coalesce(le.annual_leave_opening_used,0) - coalesce(u.annual_usage,0) - coalesce(u.emergency_usage,0), 0) as annual_leave_remaining,
  le.medical_leave_total,
  greatest(coalesce(le.medical_leave_total,0) - coalesce(le.medical_leave_opening_used,0) - coalesce(u.medical_usage,0), 0) as medical_leave_remaining,
  le.annual_leave_opening_used,
  le.medical_leave_opening_used,
  le.entitlement_year
from staff s
join branches b on b.id = s.branch_id
left join latest_entitlement le on le.staff_id = s.id
left join usage_rows u on u.staff_id = s.id
where lower(coalesce(s.status,'active')) = 'active'
  and (
    lower(b.name) in ('ranau','putatan','papar','kinabatangan')
    and lower(coalesce(s.full_name,'')) in (
      'siti salihah binti mohd said','nayim syafiq bin boy @ sharif','jessica kariki','mohd noor rizuwan bin ismail','izyan binti mohd alwi','nurul sazwani amira binti juni','nur aisya elavarasi binti abdullah','clare vee rica bidik',
      'zulhijah binti perdinant','nur shazanie binti mohd jaini','aisah binti janun','zarinah binti abd gapar','nur amerah binti mohd shah','norafika binti puddin','mariana binti piku','aqilah nur adilah binti rudianto'
    )
  )
order by branch, full_name;

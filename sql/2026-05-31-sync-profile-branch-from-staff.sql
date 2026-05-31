update profiles p
set branch_id = s.branch_id
from staff s
where s.profile_id = p.id
  and s.branch_id is not null
  and (
    p.branch_id is distinct from s.branch_id
  );

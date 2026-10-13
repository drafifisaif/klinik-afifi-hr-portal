import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryResult } from "@/lib/data";
import { fetchPagedRows } from "@/lib/paged-query";
import type { PortalDateRange } from "@/lib/portal-date-range";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableRow, UserRole } from "@/lib/types";
import { addDaysToDateString, getMalaysiaDateString } from "@/lib/utils";

interface DataContext {
  supabase: SupabaseClient | null;
  staff: TableRow | null;
  profile: { branch_id?: string | null } | null;
  role: UserRole;
}

const directoryColumns = "id,profile_id,branch_id,full_name,email,position,department,status";
const rosterColumns = "id,staff_id,branch_id,roster_date,shift_template_id,custom_start_time,custom_end_time,notes,role_on_shift,is_published";

function scope(context: DataContext) {
  if (context.role === "staff") return { column: "staff_id", value: String(context.staff?.id ?? "") };
  if (context.role === "branch_pic") return { column: "branch_id", value: String(context.staff?.branch_id ?? context.profile?.branch_id ?? "") };
  return null;
}

function rangeFilter(column: string, ranges: PortalDateRange[]) {
  return ranges.map(({ start, end }) => `and(${column}.gte.${start},${column}.lte.${end})`).join(",");
}

export async function loadRosterRange(context: DataContext, ranges: PortalDateRange[]): Promise<QueryResult> {
  const filter = scope(context);
  // Preserve existing privileged roster hydration, strictly scoped by server identity.
  const client = filter ? createAdminClient() ?? context.supabase : context.supabase;
  if (!client) return { rows: [], error: "Supabase is not configured." };
  if (filter && !filter.value) return { rows: [], error: null };
  return fetchPagedRows((from, to) => {
    let query = client.from("rosters").select(rosterColumns, from === 0 ? { count: "exact" } : {})
      .or(rangeFilter("roster_date", ranges)).order("roster_date").order("created_at", { ascending: false }).order("id").range(from, to);
    if (filter) query = query.eq(filter.column, filter.value);
    return query;
  });
}

export async function loadPortalStaff(context: DataContext): Promise<QueryResult> {
  if (context.role === "staff") {
    return { rows: context.staff ? [Object.fromEntries(directoryColumns.split(",").map((key) => [key, context.staff![key]]))] : [], error: null };
  }
  const filter = scope(context);
  const client = filter ? createAdminClient() ?? context.supabase : context.supabase;
  if (!client) return { rows: [], error: "Supabase is not configured." };
  if (filter && !filter.value) return { rows: [], error: null };
  return fetchPagedRows((from, to) => {
    let query = client.from("staff").select(directoryColumns, from === 0 ? { count: "exact" } : {}).order("id").range(from, to);
    if (filter) query = query.eq("branch_id", filter.value);
    return query;
  });
}

export async function loadAttendanceRange(context: DataContext, requestedRanges: PortalDateRange[]) {
  const today = getMalaysiaDateString();
  const ranges = [...requestedRanges, { start: today, end: today }];
  const filter = scope(context);
  const client = context.supabase;
  const queryTable = (table: string, dateFilter?: string) => {
    if (!client) return Promise.resolve({ rows: [], error: "Supabase is not configured." } as QueryResult);
    if (filter && !filter.value) return Promise.resolve({ rows: [], error: null } as QueryResult);
    return fetchPagedRows((from, to) => {
      let query = client.from(table).select("*", from === 0 ? { count: "exact" } : {}).order("created_at", { ascending: false }).order("id").range(from, to);
      if (dateFilter) query = query.or(dateFilter);
      if (filter) query = query.eq(filter.column, filter.value);
      return query;
    });
  };
  const [attendance, rosters, leave, adjustments] = await Promise.all([
    queryTable("attendance_records", rangeFilter("attendance_date", ranges)),
    loadRosterRange(context, [...ranges, ...(context.staff ? [{ start: today, end: addDaysToDateString(today, 31) }] : [])]),
    queryTable("leave_requests", ranges.map(({ start, end }) => `and(start_date.lte.${end},end_date.gte.${start})`).join(",")),
    // Pending corrections can refer to earlier months; don't date-limit the review queue.
    queryTable("attendance_adjustments"),
  ]);
  return {
    attendanceRows: attendance.rows,
    rosterRows: rosters.rows,
    leaveRows: leave.rows,
    adjustmentRows: adjustments.rows,
    error: attendance.error ?? rosters.error ?? leave.error ?? adjustments.error,
  };
}

import { AttendancePage } from "@/components/attendance-page";
import { EmptyState } from "@/components/empty-state";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, type QueryResult } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDaysToDateString, getMalaysiaDateString } from "@/lib/utils";
import type { BranchOption, TableRow } from "@/lib/types";

export default async function AttendanceRoute() {
  const context = await requireRouteAccess("attendance");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Attendance access restricted"
        description="Your current role does not include the attendance workspace."
      />
    );
  }

  const adminClient = createAdminClient();
  const staffBranchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");

  const [attendanceRows, adjustmentRows, settingRows, branchRows, shiftTemplateRows, leaveRows, networkRows] = await Promise.all([
    fetchRows(context.supabase, "attendance_records", 400),
    fetchRows(context.supabase, "attendance_adjustments", 200),
    fetchRows(context.supabase, "attendance_settings", 100),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "shift_templates", 200),
    fetchRows(context.supabase, "leave_requests", 300),
    fetchRows(context.supabase, "clinic_network_ips", 200),
  ]);

  let rosterRows: QueryResult = { rows: [], error: null };
  let staffRows: QueryResult = { rows: [], error: null };
  const rosterWindowStart = addDaysToDateString(getMalaysiaDateString(), -31);
  const rosterWindowEnd = addDaysToDateString(getMalaysiaDateString(), 31);

  if (context.role === "staff" && context.staff?.id && adminClient) {
    const [personalRosterResult, personalStaffResult] = await Promise.all([
      adminClient
        .from("rosters")
        .select("*")
        .eq("staff_id", context.staff.id)
        .gte("roster_date", rosterWindowStart)
        .lte("roster_date", rosterWindowEnd)
        .order("roster_date", { ascending: true })
        .limit(120),
      adminClient.from("staff").select("*").eq("id", context.staff.id).limit(1),
    ]);

    rosterRows = {
      rows: (personalRosterResult.data ?? []) as TableRow[],
      error: personalRosterResult.error?.message ?? null,
    };
    staffRows = {
      rows: (personalStaffResult.data ?? []) as TableRow[],
      error: personalStaffResult.error?.message ?? null,
    };
  } else if (context.role === "branch_pic" && adminClient && staffBranchId) {
    const [branchRosterResult, branchStaffResult] = await Promise.all([
      adminClient
        .from("rosters")
        .select("*")
        .eq("branch_id", staffBranchId)
        .gte("roster_date", rosterWindowStart)
        .lte("roster_date", rosterWindowEnd)
        .order("roster_date", { ascending: true })
        .limit(300),
      adminClient
        .from("staff")
        .select("*")
        .eq("branch_id", staffBranchId)
        .limit(200),
    ]);

    rosterRows = {
      rows: (branchRosterResult.data ?? []) as TableRow[],
      error: branchRosterResult.error?.message ?? rosterRows.error,
    };
    staffRows = {
      rows: (branchStaffResult.data ?? []) as TableRow[],
      error: branchStaffResult.error?.message ?? staffRows.error,
    };
  } else {
    [rosterRows, staffRows] = await Promise.all([
      fetchRows(context.supabase, "rosters", 700),
      fetchRows(context.supabase, "staff", 300),
    ]);
  }

  const branches = branchRows.rows
    .map((row) => {
      const latitude = typeof row.latitude === "number" ? row.latitude : Number(row.latitude ?? NaN);
      const longitude = typeof row.longitude === "number" ? row.longitude : Number(row.longitude ?? NaN);
      const radius = typeof row.gps_radius_meters === "number" ? row.gps_radius_meters : Number(row.gps_radius_meters ?? NaN);

      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? row.branch_name ?? row.id),
        code: String(row.code ?? ""),
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        gps_radius_meters: Number.isFinite(radius) ? radius : null,
        is_active: row.gps_is_active === false ? false : row.is_active === false ? false : true,
      };
    })
    .filter((row) => row.id) as BranchOption[];

  return (
    <div className="space-y-6">
      <AttendancePage
        attendanceRows={attendanceRows.rows}
        adjustmentRows={adjustmentRows.rows}
        settingRows={settingRows.rows}
        staffRows={staffRows.rows}
        branchRows={branches}
        rosterRows={rosterRows.rows}
        shiftTemplateRows={shiftTemplateRows.rows}
        leaveRows={leaveRows.rows}
        networkRows={networkRows.rows}
        profile={context.profile}
        currentStaff={context.staff}
        role={context.role}
        error={
          attendanceRows.error
          ?? adjustmentRows.error
          ?? settingRows.error
          ?? staffRows.error
          ?? branchRows.error
          ?? rosterRows.error
          ?? shiftTemplateRows.error
          ?? leaveRows.error
          ?? networkRows.error
        }
      />
    </div>
  );
}

import { AttendancePage } from "@/components/attendance-page";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import type { BranchOption } from "@/lib/types";

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

  const [attendanceRows, adjustmentRows, settingRows, staffRows, branchRows, rosterRows, shiftTemplateRows, leaveRows, networkRows] = await Promise.all([
    fetchRows(context.supabase, "attendance_records", 400),
    fetchRows(context.supabase, "attendance_adjustments", 200),
    fetchRows(context.supabase, "attendance_settings", 100),
    fetchRows(context.supabase, "staff", 300),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "rosters", 400),
    fetchRows(context.supabase, "shift_templates", 200),
    fetchRows(context.supabase, "leave_requests", 300),
    fetchRows(context.supabase, "clinic_network_ips", 200),
  ]);

  const branches = branchRows.rows
    .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
    .filter((row) => row.id) as BranchOption[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Clock in and out against roster shifts, review attendance status, manage correction requests, and monitor branch attendance boards."
      />
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

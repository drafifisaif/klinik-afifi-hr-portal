import { AttendancePage } from "@/components/attendance-page";
import { EmptyState } from "@/components/empty-state";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { getMonthDateRange } from "@/lib/attendance-report";
import { loadAttendanceRange, loadPortalStaff } from "@/lib/portal-range-data";
import { getMalaysiaDateString } from "@/lib/utils";
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

  const today = getMalaysiaDateString();
  const month = getMonthDateRange(today.slice(0, 4), today.slice(5, 7));
  const initialRanges = [{ start: month.startDate, end: month.endDate }];
  const [rangeData, staffRows, settingRows, branchRows, shiftTemplateRows, networkRows] = await Promise.all([
    loadAttendanceRange(context, initialRanges),
    loadPortalStaff(context),
    fetchRows(context.supabase, "attendance_settings", 100),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "shift_templates", 200),
    fetchRows(context.supabase, "clinic_network_ips", 200),
  ]);

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
        initialRangeData={rangeData}
        initialRanges={initialRanges}
        settingRows={settingRows.rows}
        staffRows={staffRows.rows}
        branchRows={branches}
        shiftTemplateRows={shiftTemplateRows.rows}
        networkRows={networkRows.rows}
        profile={context.profile}
        currentStaff={context.staff}
        role={context.role}
        error={
          settingRows.error
          ?? staffRows.error
          ?? branchRows.error
          ?? shiftTemplateRows.error
          ?? networkRows.error
        }
      />
    </div>
  );
}

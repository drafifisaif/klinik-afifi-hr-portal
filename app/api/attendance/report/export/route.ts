import { NextResponse } from "next/server";

import { buildAttendanceReportRows, formatReportHours, getMonthDateRange } from "@/lib/attendance-report";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { BranchOption, TableRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { choosePreferredStaffRow } from "@/lib/data";
import { createXlsxWorkbook } from "@/lib/xlsx";

const HEADERS = [
  "No.",
  "Staff Name",
  "Branch",
  "Date",
  "Day",
  "Scheduled Shift",
  "Scheduled Start",
  "Scheduled End",
  "Check In",
  "Check Out",
  "Attendance Status",
  "Location Status",
  "Late Minutes",
  "Scheduled Hours",
  "Worked Hours",
  "OT Hours",
  "Correction Status",
  "Remarks",
];

function sanitizeFilter(value: string | null, fallback = "all") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toBranchOptions(rows: TableRow[]) {
  return rows
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
}

function buildFilename(fromDate: string, toDate: string) {
  if (fromDate.slice(0, 7) === toDate.slice(0, 7) && fromDate.endsWith("-01")) {
    return `attendance-report-${fromDate.slice(0, 7)}.xlsx`;
  }

  return `attendance-report-${fromDate}-to-${toDate}.xlsx`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  if (!supabase || !adminClient) {
    return NextResponse.json({ error: "Attendance export requires server-side Supabase configuration." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [{ data: profile }, { data: actingStaffRows, error: actingStaffError }] = await Promise.all([
    adminClient.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    adminClient.from("staff").select("*").eq("profile_id", user.id).limit(20),
  ]);

  if (actingStaffError) {
    return NextResponse.json({ error: actingStaffError.message }, { status: 400 });
  }

  const role = String(profile?.role ?? "staff").trim().toLowerCase();
  const allowed = ["hr", "super_admin", "operation", "branch_pic"].includes(role);

  if (!allowed) {
    return NextResponse.json({ error: "Attendance report export is restricted to HR, Operation, Super Admin, and authorized Branch PIC users." }, { status: 403 });
  }

  const actingStaff = choosePreferredStaffRow((actingStaffRows ?? []) as TableRow[]);
  const branchScopeId = role === "branch_pic" ? String(actingStaff?.branch_id ?? profile?.branch_id ?? "") : null;

  if (role === "branch_pic" && !branchScopeId) {
    return NextResponse.json({ error: "Branch PIC export requires a linked branch." }, { status: 403 });
  }

  const url = new URL(request.url);
  const monthRange = getMonthDateRange(url.searchParams.get("year") ?? new Date().getFullYear(), url.searchParams.get("month") ?? new Date().getMonth() + 1);
  const fromDate = String(url.searchParams.get("from") ?? monthRange.startDate).slice(0, 10);
  const toDate = String(url.searchParams.get("to") ?? monthRange.endDate).slice(0, 10);

  if (!fromDate || !toDate || fromDate > toDate) {
    return NextResponse.json({ error: "Invalid attendance report date range." }, { status: 400 });
  }

  const [attendanceResult, adjustmentResult, staffResult, branchResult, rosterResult, shiftTemplateResult, leaveResult, settingResult] = await Promise.all([
    adminClient.from("attendance_records").select("*").gte("attendance_date", fromDate).lte("attendance_date", toDate).limit(5000),
    adminClient.from("attendance_adjustments").select("*").limit(5000),
    adminClient.from("staff").select("*").limit(1000),
    adminClient.from("branches").select("*").limit(200),
    adminClient.from("rosters").select("*").gte("roster_date", fromDate).lte("roster_date", toDate).limit(5000),
    adminClient.from("shift_templates").select("*").limit(500),
    adminClient.from("leave_requests").select("*").lte("start_date", toDate).gte("end_date", fromDate).limit(5000),
    adminClient.from("attendance_settings").select("*").limit(500),
  ]);

  const loadError = attendanceResult.error
    ?? adjustmentResult.error
    ?? staffResult.error
    ?? branchResult.error
    ?? rosterResult.error
    ?? shiftTemplateResult.error
    ?? leaveResult.error
    ?? settingResult.error;

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }

  const branchId = sanitizeFilter(url.searchParams.get("branch"));

  if (branchScopeId && branchId !== "all" && branchId !== branchScopeId) {
    return NextResponse.json({ error: "Branch PIC can only export attendance for their own branch." }, { status: 403 });
  }

  const rows = buildAttendanceReportRows({
    attendanceRows: (attendanceResult.data ?? []) as TableRow[],
    adjustmentRows: (adjustmentResult.data ?? []) as TableRow[],
    staffRows: (staffResult.data ?? []) as TableRow[],
    branchRows: toBranchOptions((branchResult.data ?? []) as TableRow[]),
    rosterRows: (rosterResult.data ?? []) as TableRow[],
    shiftTemplateRows: (shiftTemplateResult.data ?? []) as TableRow[],
    leaveRows: (leaveResult.data ?? []) as TableRow[],
    settingRows: (settingResult.data ?? []) as TableRow[],
    filters: {
      fromDate,
      toDate,
      branchId,
      staffId: sanitizeFilter(url.searchParams.get("staff")),
      status: sanitizeFilter(url.searchParams.get("status")),
      locationStatus: sanitizeFilter(url.searchParams.get("location")),
      branchScopeId,
    },
  });

  const xlsxRows = rows.map((row, index) => [
    index + 1,
    row.staffName,
    row.branchName,
    formatDate(row.date),
    row.day,
    row.scheduledShift,
    row.scheduledStart,
    row.scheduledEnd,
    row.checkIn,
    row.checkOut,
    row.attendanceStatus,
    row.locationStatus,
    row.lateMinutes,
    formatReportHours(row.scheduledMinutes),
    formatReportHours(row.workedMinutes),
    formatReportHours(row.otMinutes),
    row.correctionStatus,
    row.remarks || "-",
  ]);
  const workbook = createXlsxWorkbook(HEADERS, xlsxRows);

  return new Response(workbook, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${buildFilename(fromDate, toDate)}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/workflows";
import { canAccessRoute } from "@/lib/navigation";
import {
  buildRosterWeeklySummaries,
  getCurrentMalaysiaWeekRange,
  resolveOperationalBranchId,
  toBranchOptions,
} from "@/lib/roster-summary";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMinutesAsHours } from "@/lib/utils";

function escapeCsv(value: string) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export async function GET(request: Request) {
  const context = await getCurrentUserContext();

  if (!context.user || !canAccessRoute(context.role, "rosterSummary")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const adminClient = createAdminClient();
  const client = adminClient ?? context.supabase;

  if (!client) {
    return new NextResponse("Supabase client not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const defaultWeek = getCurrentMalaysiaWeekRange();
  const operationalBranchId = resolveOperationalBranchId(context.staff, context.profile);
  const canViewAllBranches = context.role === "hr" || context.role === "super_admin";
  const requestedBranchId = url.searchParams.get("branch") ?? (canViewAllBranches ? "all" : operationalBranchId);
  const selectedBranchId = canViewAllBranches ? requestedBranchId : operationalBranchId;
  const roleFilter = url.searchParams.get("role") ?? "all";
  const startDate = url.searchParams.get("start") ?? defaultWeek.start;
  const endDate = url.searchParams.get("end") ?? defaultWeek.end;

  const [rosterResult, attendanceResult, staffResult, branchResult, profileResult] = await Promise.all([
    client.from("rosters").select("*").gte("roster_date", startDate).lte("roster_date", endDate).order("roster_date", { ascending: true }).limit(2000),
    client.from("attendance_records").select("*").gte("attendance_date", startDate).lte("attendance_date", endDate).limit(2000),
    client.from("staff").select("*").limit(500),
    client.from("branches").select("*").order("name", { ascending: true }).limit(100),
    client.from("profiles").select("*").limit(500),
  ]);

  const branches = toBranchOptions((branchResult.data ?? []) as Record<string, unknown>[]);
  const summaries = buildRosterWeeklySummaries({
    rosters: (rosterResult.data ?? []) as Record<string, unknown>[],
    attendanceRows: (attendanceResult.data ?? []) as Record<string, unknown>[],
    staffRows: (staffResult.data ?? []) as Record<string, unknown>[],
    profileRows: (profileResult.data ?? []) as Record<string, unknown>[],
    branches,
    selectedBranchId: selectedBranchId || (canViewAllBranches ? "all" : operationalBranchId),
    roleFilter,
  });

  const header = [
    "staff_name",
    "branch",
    "role",
    "roster_days",
    "scheduled_hours",
    "present_days",
    "worked_hours",
    "ot_hours",
    "missed_scheduled_hours",
    "not_punched_in",
    "incomplete_punch",
    "late_count",
    "early_out_count",
  ];

  const rows = summaries.map((row) => [
    row.staffName,
    row.branchName,
    row.roleLabel,
    String(row.rosterDays),
    formatMinutesAsHours(row.scheduledMinutes),
    String(row.presentDays),
    formatMinutesAsHours(row.workedMinutes),
    formatMinutesAsHours(row.otMinutes),
    formatMinutesAsHours(row.missedScheduledMinutes),
    String(row.notPunchedIn),
    String(row.incompletePunch),
    String(row.lateCount),
    String(row.earlyOutCount),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((value) => escapeCsv(String(value))).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster-summary-${startDate}-to-${endDate}.csv"`,
    },
  });
}

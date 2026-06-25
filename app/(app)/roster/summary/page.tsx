import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RosterSummaryPage } from "@/components/roster-summary-page";
import { requireRouteAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BranchOption, Profile, TableRow } from "@/lib/types";
import {
  calculateNetScheduledMinutesDetails,
  getMalaysiaDateString,
  normalizeString,
} from "@/lib/utils";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseDateOnly(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getCurrentMalaysiaWeekRange() {
  const today = parseDateOnly(getMalaysiaDateString());
  const weekday = today.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() + diff);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end),
  };
}

function toBranchOptions(rows: TableRow[]) {
  return rows
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? row.branch_name ?? row.id),
      code: String(row.code ?? ""),
    }))
    .filter((row) => row.id) as BranchOption[];
}

function resolveOperationalBranchId(staff: TableRow | null, profile: Profile | null) {
  return String(staff?.branch_id ?? profile?.branch_id ?? "");
}

function formatTimeLabel(value: unknown) {
  const raw = String(value ?? "").trim().slice(0, 5);
  if (!raw) {
    return "-";
  }

  const [hourString, minuteString] = raw.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return raw;
  }

  const meridiem = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatShiftLabel(start: unknown, end: unknown) {
  if (!start && !end) {
    return "Shift belum diset";
  }

  return `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`;
}

function isDoctorLike(staffRow: TableRow | null) {
  const value = normalizeString(staffRow?.position);
  return ["doctor", "doktor", "dr", "locum", "lokum"].some((keyword) => value.includes(keyword));
}

function resolveRoleLabel(staffRow: TableRow | null, profileRow: TableRow | null, rosterRow: TableRow) {
  const profileRole = normalizeString(profileRow?.role);
  if (profileRole === "branch_pic") {
    return "Branch PIC";
  }

  if (profileRole === "operation") {
    return "Operation";
  }

  if (profileRole === "hr") {
    return "HR";
  }

  if (profileRole === "super_admin") {
    return "Super Admin";
  }

  if (normalizeString(rosterRow.role_on_shift) === "doctor" || isDoctorLike(staffRow)) {
    return "Doctor";
  }

  return "Staff";
}

function resolveDailyStatus(row: TableRow | null, isFuture: boolean) {
  if (isFuture) {
    return "Upcoming";
  }

  if (!row) {
    return "Not Punched In";
  }

  const status = normalizeString(row.status);
  const hasCheckIn = Boolean(row.check_in_at);
  const hasCheckOut = Boolean(row.check_out_at);

  if ((hasCheckIn && !hasCheckOut) || status === "incomplete") {
    return "Incomplete";
  }

  if (status === "late" || Number(row.late_minutes ?? 0) > 0) {
    return "Late";
  }

  if (status === "present") {
    return "Present";
  }

  if (status === "absent") {
    return "Absent";
  }

  if (status === "mc") {
    return "MC";
  }

  if (status === "on_leave") {
    return "On Leave";
  }

  if (status === "pending_review") {
    return "Pending Review";
  }

  return hasCheckIn && hasCheckOut ? "Present" : "Not Punched In";
}

function shouldCountWorkedStatus(status: string) {
  const normalized = normalizeString(status);
  return normalized === "present" || normalized === "late";
}

function isExcusedStatus(status: string) {
  const normalized = normalizeString(status);
  return normalized === "mc" || normalized === "on leave";
}

function pickPreferredAttendance(existing: TableRow | undefined, candidate: TableRow) {
  if (!existing) {
    return candidate;
  }

  const existingScore = (existing.check_out_at ? 2 : 0) + (existing.check_in_at ? 1 : 0);
  const candidateScore = (candidate.check_out_at ? 2 : 0) + (candidate.check_in_at ? 1 : 0);

  if (candidateScore !== existingScore) {
    return candidateScore > existingScore ? candidate : existing;
  }

  const existingUpdated = String(existing.updated_at ?? existing.created_at ?? "");
  const candidateUpdated = String(candidate.updated_at ?? candidate.created_at ?? "");
  return candidateUpdated > existingUpdated ? candidate : existing;
}

export default async function RosterSummaryRoute({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("rosterSummary");
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Roster summary access restricted"
        description="Only HR, super admin, and allowed branch managers can access weekly roster hours summary."
      />
    );
  }

  const adminClient = createAdminClient();
  const client = adminClient ?? context.supabase;

  if (!client) {
    return (
      <EmptyState
        title="Roster summary unavailable"
        description="Supabase client is not configured."
      />
    );
  }

  const defaultWeek = getCurrentMalaysiaWeekRange();
  const operationalBranchId = resolveOperationalBranchId(context.staff, context.profile);
  const canViewAllBranches = context.role === "hr" || context.role === "super_admin";
  const requestedBranchId = getSearchParamValue(resolvedSearchParams.branch) ?? (canViewAllBranches ? "all" : operationalBranchId);
  const selectedBranchId = canViewAllBranches ? requestedBranchId : operationalBranchId;
  const roleFilter = getSearchParamValue(resolvedSearchParams.role) ?? "all";
  const startDate = getSearchParamValue(resolvedSearchParams.start) ?? defaultWeek.start;
  const endDate = getSearchParamValue(resolvedSearchParams.end) ?? defaultWeek.end;
  const today = getMalaysiaDateString();

  const [rosterResult, attendanceResult, staffResult, branchResult, profileResult] = await Promise.all([
    client
      .from("rosters")
      .select("*")
      .gte("roster_date", startDate)
      .lte("roster_date", endDate)
      .order("roster_date", { ascending: true })
      .limit(2000),
    client
      .from("attendance_records")
      .select("*")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .limit(2000),
    client
      .from("staff")
      .select("*")
      .limit(500),
    client
      .from("branches")
      .select("*")
      .order("name", { ascending: true })
      .limit(100),
    client
      .from("profiles")
      .select("*")
      .limit(500),
  ]);

  const branches = toBranchOptions((branchResult.data ?? []) as TableRow[]);
  const branchNameMap = new Map(branches.map((branch) => [branch.id, branch.name]));
  const staffRows = (staffResult.data ?? []) as TableRow[];
  const profileRows = (profileResult.data ?? []) as TableRow[];
  const staffMap = new Map(staffRows.map((row) => [String(row.id ?? ""), row]));
  const profileMap = new Map(profileRows.map((row) => [String(row.id ?? ""), row]));

  const filteredRosterRows = ((rosterResult.data ?? []) as TableRow[]).filter((row) => {
    if (selectedBranchId && selectedBranchId !== "all" && String(row.branch_id ?? "") !== selectedBranchId) {
      return false;
    }

    const staffRow = staffMap.get(String(row.staff_id ?? ""));
    const profileRow = profileMap.get(String(staffRow?.profile_id ?? ""));
    const resolvedRole = normalizeString(resolveRoleLabel(staffRow ?? null, profileRow ?? null, row));
    return roleFilter === "all" || resolvedRole === normalizeString(roleFilter);
  });

  const attendanceMap = new Map<string, TableRow>();
  ((attendanceResult.data ?? []) as TableRow[]).forEach((row) => {
    const key = `${String(row.staff_id ?? "")}:${String(row.attendance_date ?? "").slice(0, 10)}`;
    attendanceMap.set(key, pickPreferredAttendance(attendanceMap.get(key), row));
  });

  const summaryMap = new Map<string, {
    staffId: string;
    staffName: string;
    branchName: string;
    roleLabel: string;
    rosterDays: number;
    scheduledMinutes: number;
    dueScheduledMinutes: number;
    presentDays: number;
    workedMinutes: number;
    notPunchedIn: number;
    incompletePunch: number;
    lateCount: number;
    earlyOutCount: number;
    days: {
      date: string;
      shiftLabel: string;
      scheduledMinutes: number;
      grossMinutes: number;
      breakMinutes: number;
      countedWorkedMinutes: number;
      status: string;
      checkInAt: string | null;
      checkOutAt: string | null;
      lateMinutes: number;
      earlyLeaveMinutes: number;
    }[];
  }>();

  filteredRosterRows.forEach((rosterRow) => {
    const staffId = String(rosterRow.staff_id ?? "").trim();
    if (!staffId) {
      return;
    }

    const staffRow = staffMap.get(staffId) ?? null;
    const profileRow = profileMap.get(String(staffRow?.profile_id ?? "")) ?? null;
    const branchId = String(staffRow?.branch_id ?? profileRow?.branch_id ?? rosterRow.branch_id ?? "");
    const branchName = branchNameMap.get(branchId) ?? "No branch";
    const roleLabel = resolveRoleLabel(staffRow, profileRow, rosterRow);
    const rosterDate = String(rosterRow.roster_date ?? rosterRow.date ?? "").slice(0, 10);
    const attendanceRow = attendanceMap.get(`${staffId}:${rosterDate}`) ?? null;
    const startTime = rosterRow.custom_start_time ?? rosterRow.start_time ?? null;
    const endTime = rosterRow.custom_end_time ?? rosterRow.end_time ?? null;
    const branchCode = String(
      branches.find((branch) => branch.id === branchId)?.code
      ?? "",
    );
    const scheduleDetails = calculateNetScheduledMinutesDetails({
      branchCode,
      rosterDate,
      startTime,
      endTime,
    });
    const scheduledMinutes = scheduleDetails.netMinutes;
    const isFuture = rosterDate > today;
    const status = resolveDailyStatus(attendanceRow, isFuture);
    const countedWorkedMinutes = shouldCountWorkedStatus(status) ? scheduledMinutes : 0;
    const lateMinutes = Number(attendanceRow?.late_minutes ?? 0);
    const earlyLeaveMinutes = Number(attendanceRow?.early_leave_minutes ?? 0);

    const current = summaryMap.get(staffId) ?? {
      staffId,
      staffName: String(staffRow?.full_name ?? profileRow?.full_name ?? profileRow?.email ?? "Unknown User"),
      branchName,
      roleLabel,
      rosterDays: 0,
      scheduledMinutes: 0,
      dueScheduledMinutes: 0,
      presentDays: 0,
      workedMinutes: 0,
      notPunchedIn: 0,
      incompletePunch: 0,
      lateCount: 0,
      earlyOutCount: 0,
      days: [],
    };

    current.rosterDays += 1;
    current.scheduledMinutes += scheduledMinutes;

    if (!isFuture && !isExcusedStatus(status)) {
      current.dueScheduledMinutes += scheduledMinutes;
    }

    if (shouldCountWorkedStatus(status)) {
      current.presentDays += 1;
      current.workedMinutes += scheduledMinutes;
    }

    if (!isFuture && status === "Not Punched In") {
      current.notPunchedIn += 1;
    }

    if (!isFuture && status === "Incomplete") {
      current.incompletePunch += 1;
    }

    if (normalizeString(status) === "late" || lateMinutes > 0) {
      current.lateCount += 1;
    }

    if (earlyLeaveMinutes > 0) {
      current.earlyOutCount += 1;
    }

    current.days.push({
      date: rosterDate,
      shiftLabel: formatShiftLabel(startTime, endTime),
      scheduledMinutes,
      grossMinutes: scheduleDetails.grossMinutes,
      breakMinutes: scheduleDetails.breakMinutes,
      countedWorkedMinutes,
      status,
      checkInAt: attendanceRow?.check_in_at ? String(attendanceRow.check_in_at) : null,
      checkOutAt: attendanceRow?.check_out_at ? String(attendanceRow.check_out_at) : null,
      lateMinutes,
      earlyLeaveMinutes,
    });

    summaryMap.set(staffId, current);
  });

  const summaries = Array.from(summaryMap.values())
    .map((summary) => ({
      ...summary,
      missedScheduledMinutes: Math.max(summary.dueScheduledMinutes - summary.workedMinutes, 0),
      days: summary.days.sort((left, right) => left.date.localeCompare(right.date)),
    }))
    .sort((left, right) => left.staffName.localeCompare(right.staffName));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster Summary"
        description="Ringkasan jam kerja mingguan berdasarkan jam roster yang dijadualkan untuk hari staff hadir, bukan beza actual punch in dan punch out."
      />
      <RosterSummaryPage
        summaries={summaries}
        branches={canViewAllBranches ? branches : branches.filter((branch) => branch.id === operationalBranchId)}
        role={context.role}
        filters={{
          branchId: selectedBranchId || (canViewAllBranches ? "all" : operationalBranchId),
          roleFilter,
          startDate,
          endDate,
        }}
        canViewAllBranches={canViewAllBranches}
        emptyTitle="No items found for this filter."
        emptyDescription="No items found for this filter."
        error={[
          rosterResult.error?.message,
          attendanceResult.error?.message,
          staffResult.error?.message,
          branchResult.error?.message,
          profileResult.error?.message,
        ].filter(Boolean).join(" ") || null}
      />
    </div>
  );
}

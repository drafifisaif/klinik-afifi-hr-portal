import type { BranchOption, Profile, TableRow } from "@/lib/types";
import {
  calculateNetScheduledMinutesDetails,
  getMalaysiaDateString,
  normalizeString,
} from "@/lib/utils";

export interface SummaryDayRow {
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
}

export interface StaffWeeklySummaryRow {
  staffId: string;
  staffName: string;
  branchName: string;
  roleLabel: string;
  rosterDays: number;
  scheduledMinutes: number;
  dueScheduledMinutes: number;
  presentDays: number;
  workedMinutes: number;
  missedScheduledMinutes: number;
  otMinutes: number;
  notPunchedIn: number;
  incompletePunch: number;
  lateCount: number;
  earlyOutCount: number;
  days: SummaryDayRow[];
}

export function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function parseDateOnly(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

export function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getCurrentMalaysiaWeekRange() {
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

export function toBranchOptions(rows: TableRow[]) {
  return rows
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? row.branch_name ?? row.id),
      code: String(row.code ?? ""),
    }))
    .filter((row) => row.id) as BranchOption[];
}

export function resolveOperationalBranchId(staff: TableRow | null, profile: Profile | null) {
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
  if (profileRole === "branch_pic") return "Branch PIC";
  if (profileRole === "operation") return "Operation";
  if (profileRole === "hr") return "HR";
  if (profileRole === "super_admin") return "Super Admin";
  if (normalizeString(rosterRow.role_on_shift) === "doctor" || isDoctorLike(staffRow)) return "Doctor";
  return "Staff";
}

function resolveDailyStatus(row: TableRow | null, isFuture: boolean) {
  if (isFuture) return "Upcoming";
  if (!row) return "Not Punched In";

  const status = normalizeString(row.status);
  const hasCheckIn = Boolean(row.check_in_at);
  const hasCheckOut = Boolean(row.check_out_at);

  if ((hasCheckIn && !hasCheckOut) || status === "incomplete") return "Incomplete";
  if (status === "late" || Number(row.late_minutes ?? 0) > 0) return "Late";
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  if (status === "mc") return "MC";
  if (status === "on_leave") return "On Leave";
  if (status === "pending_review") return "Pending Review";

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
  if (!existing) return candidate;

  const existingScore = (existing.check_out_at ? 2 : 0) + (existing.check_in_at ? 1 : 0);
  const candidateScore = (candidate.check_out_at ? 2 : 0) + (candidate.check_in_at ? 1 : 0);
  if (candidateScore !== existingScore) return candidateScore > existingScore ? candidate : existing;

  const existingUpdated = String(existing.updated_at ?? existing.created_at ?? "");
  const candidateUpdated = String(candidate.updated_at ?? candidate.created_at ?? "");
  return candidateUpdated > existingUpdated ? candidate : existing;
}

export function buildRosterWeeklySummaries({
  rosters,
  attendanceRows,
  staffRows,
  profileRows,
  branches,
  selectedBranchId,
  roleFilter,
  today = getMalaysiaDateString(),
}: {
  rosters: TableRow[];
  attendanceRows: TableRow[];
  staffRows: TableRow[];
  profileRows: TableRow[];
  branches: BranchOption[];
  selectedBranchId: string;
  roleFilter: string;
  today?: string;
}) {
  const branchNameMap = new Map(branches.map((branch) => [branch.id, branch.name]));
  const staffMap = new Map(staffRows.map((row) => [String(row.id ?? ""), row]));
  const profileMap = new Map(profileRows.map((row) => [String(row.id ?? ""), row]));

  const filteredRosterRows = rosters.filter((row) => {
    if (selectedBranchId && selectedBranchId !== "all" && String(row.branch_id ?? "") !== selectedBranchId) {
      return false;
    }

    const staffRow = staffMap.get(String(row.staff_id ?? ""));
    const profileRow = profileMap.get(String(staffRow?.profile_id ?? ""));
    const resolvedRole = normalizeString(resolveRoleLabel(staffRow ?? null, profileRow ?? null, row));
    return roleFilter === "all" || resolvedRole === normalizeString(roleFilter);
  });

  const attendanceMap = new Map<string, TableRow>();
  attendanceRows.forEach((row) => {
    const key = `${String(row.staff_id ?? "")}:${String(row.attendance_date ?? "").slice(0, 10)}`;
    attendanceMap.set(key, pickPreferredAttendance(attendanceMap.get(key), row));
  });

  const summaryMap = new Map<string, Omit<StaffWeeklySummaryRow, "missedScheduledMinutes" | "otMinutes">>();

  filteredRosterRows.forEach((rosterRow) => {
    const staffId = String(rosterRow.staff_id ?? "").trim();
    if (!staffId) return;

    const staffRow = staffMap.get(staffId) ?? null;
    const profileRow = profileMap.get(String(staffRow?.profile_id ?? "")) ?? null;
    const branchId = String(staffRow?.branch_id ?? profileRow?.branch_id ?? rosterRow.branch_id ?? "");
    const branchName = branchNameMap.get(branchId) ?? "No branch";
    const roleLabel = resolveRoleLabel(staffRow, profileRow, rosterRow);
    const rosterDate = String(rosterRow.roster_date ?? rosterRow.date ?? "").slice(0, 10);
    const attendanceRow = attendanceMap.get(`${staffId}:${rosterDate}`) ?? null;
    const startTime = rosterRow.custom_start_time ?? rosterRow.start_time ?? null;
    const endTime = rosterRow.custom_end_time ?? rosterRow.end_time ?? null;
    const branchCode = String(branches.find((branch) => branch.id === branchId)?.code ?? "");
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
    if (!isFuture && !isExcusedStatus(status)) current.dueScheduledMinutes += scheduledMinutes;
    if (shouldCountWorkedStatus(status)) {
      current.presentDays += 1;
      current.workedMinutes += scheduledMinutes;
    }
    if (!isFuture && status === "Not Punched In") current.notPunchedIn += 1;
    if (!isFuture && status === "Incomplete") current.incompletePunch += 1;
    if (normalizeString(status) === "late" || lateMinutes > 0) current.lateCount += 1;
    if (earlyLeaveMinutes > 0) current.earlyOutCount += 1;

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

  return Array.from(summaryMap.values())
    .map((summary) => ({
      ...summary,
      missedScheduledMinutes: Math.max(summary.dueScheduledMinutes - summary.workedMinutes, 0),
      otMinutes: Math.max(summary.workedMinutes - (45 * 60), 0),
      days: summary.days.sort((left, right) => left.date.localeCompare(right.date)),
    }))
    .sort((left, right) => left.staffName.localeCompare(right.staffName));
}

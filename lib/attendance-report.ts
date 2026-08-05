import type { BranchOption, TableRow } from "@/lib/types";
import {
  calculateNetScheduledMinutesDetails,
  formatMalaysiaTime,
  formatMinutesAsHours,
  normalizeString,
} from "@/lib/utils";

export interface AttendanceReportFilters {
  fromDate: string;
  toDate: string;
  branchId?: string;
  staffId?: string;
  status?: string;
  locationStatus?: string;
  branchScopeId?: string | null;
}

export interface AttendanceReportRow {
  staffId: string;
  staffName: string;
  branchId: string;
  branchName: string;
  date: string;
  day: string;
  scheduledShift: string;
  scheduledStart: string;
  scheduledEnd: string;
  checkIn: string;
  checkOut: string;
  attendanceStatus: string;
  locationStatus: string;
  lateMinutes: number;
  scheduledMinutes: number;
  workedMinutes: number;
  otMinutes: number;
  correctionStatus: string;
  remarks: string;
}

function parseDateOnly(dateString: string) {
  const [year, month, day] = String(dateString).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year || 1970, Math.max((month || 1) - 1, 0), day || 1));
}

export function buildDateRange(startDate: string, endDate: string, maxDays = 370) {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const dates: string[] = [];

  for (let cursor = start, index = 0; cursor <= end && index < maxDays; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function getMonthDateRange(year: string | number, month: string | number) {
  const numericYear = Number(year) || new Date().getFullYear();
  const numericMonth = Math.min(Math.max(Number(month) || 1, 1), 12);
  const startDate = `${numericYear}-${String(numericMonth).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(numericYear, numericMonth, 0)).toISOString().slice(0, 10);

  return { startDate, endDate };
}

export function formatDateDay(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(parseDateOnly(date));
}

function combineDateAndTime(date: string, timeValue?: unknown) {
  const time = String(timeValue ?? "").trim().slice(0, 5);
  if (!date || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  return `${date}T${time}:00`;
}

function parseIso(value: unknown, referenceDate?: Date | null) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hours, minutes, seconds = "00"] = text.split(":");
    const base = referenceDate ? new Date(referenceDate) : new Date();
    base.setHours(Number(hours), Number(minutes), Number(seconds), 0);
    return Number.isNaN(base.getTime()) ? null : base;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeLateMinutes(checkInAt: unknown, scheduledStart: unknown, graceMinutes: number) {
  const checkIn = parseIso(checkInAt);
  const scheduled = parseIso(scheduledStart, checkIn);
  if (!checkIn || !scheduled) {
    return 0;
  }

  return Math.max(0, Math.round((checkIn.getTime() - scheduled.getTime()) / 60000) - graceMinutes);
}

function computeAttendanceStatus(row: TableRow | null, graceMinutes: number) {
  if (!row) {
    return "not_punched_in";
  }

  const checkIn = row.check_in_at;
  const checkOut = row.check_out_at;
  const lateMinutes = Number(row.late_minutes ?? computeLateMinutes(checkIn, row.scheduled_start, graceMinutes) ?? 0);

  if (checkIn && checkOut) {
    return lateMinutes > 0 ? "late" : "present";
  }

  if (checkIn) {
    return lateMinutes > 0 ? "late" : "incomplete";
  }

  return "not_punched_in";
}

function isLeaveForDate(row: TableRow, date: string) {
  if (normalizeString(row.status) !== "approved") {
    return false;
  }

  const start = String(row.start_date ?? "").slice(0, 10);
  const end = String(row.end_date ?? "").slice(0, 10);
  return Boolean(start && end && start <= date && end >= date);
}

function resolveShiftName(rosterRow: TableRow | null, template: TableRow | null) {
  return String(template?.name ?? rosterRow?.shift_name ?? "Shift belum diset");
}

function resolveBranchCode(branches: BranchOption[], branchId: string) {
  return String(branches.find((branch) => branch.id === branchId)?.code ?? "");
}

function resolveBranchName(branches: BranchOption[], branchId: string) {
  return branches.find((branch) => branch.id === branchId)?.name ?? "No branch";
}

function summarizeLocation(record: TableRow | null) {
  const checkIn = normalizeString(record?.check_in_location_status);
  const checkOut = normalizeString(record?.check_out_location_status);
  const statuses = [checkIn, checkOut].filter(Boolean);

  if (!statuses.length) {
    return "-";
  }

  if (statuses.includes("outside_location")) {
    return "Outside Location";
  }

  if (statuses.includes("permission_denied")) {
    return "Location Permission Denied";
  }

  if (statuses.includes("location_unavailable")) {
    return "Location Unavailable";
  }

  if (statuses.includes("verified_location")) {
    return "Verified Location";
  }

  return statuses.join(" / ");
}

function findCorrection(adjustments: TableRow[], staffId: string, date: string, recordId?: unknown) {
  return adjustments.find((row) => {
    if (recordId && String(row.attendance_record_id ?? "") === String(recordId)) {
      return true;
    }

    const requestedDate = String(row.requested_check_in_at ?? row.requested_check_out_at ?? row.created_at ?? "").slice(0, 10);
    return String(row.staff_id ?? "") === staffId && requestedDate === date;
  }) ?? null;
}

function rowMatchesStatus(rowStatus: string, filterStatus?: string) {
  const normalizedFilter = normalizeString(filterStatus);
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  return normalizeString(rowStatus) === normalizedFilter;
}

function rowMatchesLocation(locationStatus: string, filterStatus?: string) {
  const normalizedFilter = normalizeString(filterStatus);
  if (!normalizedFilter || normalizedFilter === "all") {
    return true;
  }

  return normalizeString(locationStatus).replaceAll(" ", "_") === normalizedFilter;
}

export function buildAttendanceReportRows({
  attendanceRows,
  adjustmentRows,
  staffRows,
  branchRows,
  rosterRows,
  shiftTemplateRows,
  leaveRows,
  settingRows,
  filters,
}: {
  attendanceRows: TableRow[];
  adjustmentRows: TableRow[];
  staffRows: TableRow[];
  branchRows: BranchOption[];
  rosterRows: TableRow[];
  shiftTemplateRows: TableRow[];
  leaveRows: TableRow[];
  settingRows: TableRow[];
  filters: AttendanceReportFilters;
}) {
  const fromDate = String(filters.fromDate ?? "").slice(0, 10);
  const toDate = String(filters.toDate ?? "").slice(0, 10);
  const rowsByKey = new Map<string, { rosterRow: TableRow | null; attendanceRow: TableRow | null; staffId: string; date: string }>();

  rosterRows.forEach((rosterRow) => {
    const date = String(rosterRow.roster_date ?? rosterRow.date ?? "").slice(0, 10);
    const staffId = String(rosterRow.staff_id ?? "").trim();
    if (!date || !staffId || date < fromDate || date > toDate) {
      return;
    }

    rowsByKey.set(`${staffId}:${date}`, { rosterRow, attendanceRow: null, staffId, date });
  });

  attendanceRows.forEach((attendanceRow) => {
    const date = String(attendanceRow.attendance_date ?? attendanceRow.created_at ?? "").slice(0, 10);
    const staffId = String(attendanceRow.staff_id ?? "").trim();
    if (!date || !staffId || date < fromDate || date > toDate) {
      return;
    }

    const key = `${staffId}:${date}`;
    const existing = rowsByKey.get(key);
    rowsByKey.set(key, { rosterRow: existing?.rosterRow ?? null, attendanceRow, staffId, date });
  });

  return Array.from(rowsByKey.values())
    .map(({ rosterRow, attendanceRow, staffId, date }) => {
      const staff = staffRows.find((row) => String(row.id ?? "") === staffId) ?? null;
      const branchId = String(rosterRow?.branch_id ?? attendanceRow?.branch_id ?? staff?.branch_id ?? "");
      const branchSetting = settingRows.find((row) => String(row.branch_id ?? "") === branchId)
        ?? settingRows.find((row) => !String(row.branch_id ?? "").trim())
        ?? null;
      const graceMinutes = Number(branchSetting?.grace_minutes ?? 10) || 10;
      const template = shiftTemplateRows.find((row) => String(row.id ?? "") === String(rosterRow?.shift_template_id ?? "")) ?? null;
      const approvedLeave = leaveRows.find((row) => String(row.staff_id ?? "") === staffId && isLeaveForDate(row, date)) ?? null;
      const leaveType = normalizeString(approvedLeave?.leave_type);
      const scheduledStart = attendanceRow?.scheduled_start ?? combineDateAndTime(date, rosterRow?.custom_start_time ?? template?.start_time);
      const scheduledEnd = attendanceRow?.scheduled_end ?? combineDateAndTime(date, rosterRow?.custom_end_time ?? template?.end_time);
      const scheduleDetails = calculateNetScheduledMinutesDetails({
        branchCode: resolveBranchCode(branchRows, branchId),
        rosterDate: date,
        startTime: rosterRow?.custom_start_time ?? template?.start_time ?? null,
        endTime: rosterRow?.custom_end_time ?? template?.end_time ?? null,
      });
      const baseStatus = approvedLeave
        ? leaveType === "medical_leave"
          ? "mc"
          : "on_leave"
        : computeAttendanceStatus(attendanceRow, graceMinutes);
      const correction = findCorrection(adjustmentRows, staffId, date, attendanceRow?.id);
      const hasAttendance = Boolean(attendanceRow?.check_in_at || attendanceRow?.check_out_at);
      const workedMinutes = hasAttendance ? scheduleDetails.netMinutes : 0;
      const remarks = [
        attendanceRow?.offsite_note,
        attendanceRow?.check_in_note,
        attendanceRow?.check_out_note,
        approvedLeave?.reason,
        correction?.reason,
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" | ");

      return {
        staffId,
        staffName: String(staff?.full_name ?? staff?.email ?? staffId),
        branchId,
        branchName: resolveBranchName(branchRows, branchId),
        date,
        day: formatDateDay(date),
        scheduledShift: resolveShiftName(rosterRow, template),
        scheduledStart: scheduledStart ? formatMalaysiaTime(scheduledStart) : "-",
        scheduledEnd: scheduledEnd ? formatMalaysiaTime(scheduledEnd) : "-",
        checkIn: attendanceRow?.check_in_at ? formatMalaysiaTime(attendanceRow.check_in_at) : "-",
        checkOut: attendanceRow?.check_out_at ? formatMalaysiaTime(attendanceRow.check_out_at) : "-",
        attendanceStatus: baseStatus,
        locationStatus: summarizeLocation(attendanceRow),
        lateMinutes: Number(attendanceRow?.late_minutes ?? computeLateMinutes(attendanceRow?.check_in_at, scheduledStart, graceMinutes) ?? 0),
        scheduledMinutes: scheduleDetails.netMinutes,
        workedMinutes,
        otMinutes: 0,
        correctionStatus: String(correction?.status ?? "-"),
        remarks,
      } satisfies AttendanceReportRow;
    })
    .filter((row) => {
      if (filters.branchScopeId && row.branchId !== filters.branchScopeId) {
        return false;
      }

      if (filters.branchId && filters.branchId !== "all" && row.branchId !== filters.branchId) {
        return false;
      }

      if (filters.staffId && filters.staffId !== "all" && row.staffId !== filters.staffId) {
        return false;
      }

      return rowMatchesStatus(row.attendanceStatus, filters.status) && rowMatchesLocation(row.locationStatus, filters.locationStatus);
    })
    .sort((left, right) => `${right.date}-${right.staffName}`.localeCompare(`${left.date}-${left.staffName}`));
}

export function formatReportHours(minutes: number) {
  return formatMinutesAsHours(minutes);
}

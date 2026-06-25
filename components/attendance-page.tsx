"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Edit3, LogIn, LogOut, RefreshCw, Save, TriangleAlert, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import {
  calculateNetScheduledMinutesDetails,
  cn,
  formatMinutesAsHours,
  formatDate,
  formatDateTime,
  getMalaysiaDateString,
  mapRowsWithId,
  normalizeString,
} from "@/lib/utils";

interface AttendancePageProps {
  attendanceRows: TableRow[];
  adjustmentRows: TableRow[];
  settingRows: TableRow[];
  staffRows: TableRow[];
  branchRows: BranchOption[];
  rosterRows: TableRow[];
  shiftTemplateRows: TableRow[];
  leaveRows: TableRow[];
  networkRows: TableRow[];
  profile: Profile | null;
  currentStaff: TableRow | null;
  role: UserRole;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

const emptyAdjustmentForm = {
  request_type: "forgot_punch_in",
  requested_check_in_at: "",
  requested_check_out_at: "",
  reason: "",
};

const emptyManualAttendanceForm = {
  check_in_at: "",
  check_out_at: "",
};

const emptyLocationForm = {
  branch_id: "",
  latitude: "",
  longitude: "",
  gps_radius_meters: "30",
  is_active: true,
};

const emptyNetworkForm = {
  id: "",
  branch_id: "",
  ip_address: "",
  label: "",
  notes: "",
  is_active: true,
};

function toDateInput(date = new Date()) {
  return getMalaysiaDateString(date);
}

function combineDateAndTime(date: string, timeValue?: string | null) {
  const time = String(timeValue ?? "").trim().slice(0, 5);
  if (!date || !time) {
    return null;
  }

  return `${date}T${time}:00`;
}

function normalizeTimeForPostgres(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    const seconds = String(value.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{2}:\d{2}$/.test(text)) {
    return `${text}:00`;
  }

  const isoMatch = text.match(/T(\d{2}:\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2] ?? "00"}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatShortTime(value: unknown) {
  if (!value) {
    return "-";
  }

  const text = String(value);
  if (/^\d{2}:\d{2}/.test(text)) {
    return text.slice(0, 5);
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDateTime(value: unknown) {
  if (!value) {
    return "";
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
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

function buildScheduledDateTime(rosterRow: TableRow | null, shiftTemplate: TableRow | null, field: "start" | "end") {
  const rosterDate = String(rosterRow?.roster_date ?? rosterRow?.date ?? "");
  const customValue = field === "start" ? rosterRow?.custom_start_time : rosterRow?.custom_end_time;
  const templateValue = field === "start" ? shiftTemplate?.start_time : shiftTemplate?.end_time;
  return combineDateAndTime(rosterDate, String(customValue ?? templateValue ?? ""));
}

function getShiftName(rosterRow: TableRow | null, shiftTemplate: TableRow | null) {
  return String(shiftTemplate?.name ?? rosterRow?.shift_name ?? "Shift belum diset");
}

function computeLateMinutes(checkInAt: unknown, scheduledStart: unknown, graceMinutes: number) {
  const checkIn = parseIso(checkInAt);
  const scheduled = parseIso(scheduledStart, checkIn);
  if (!checkIn || !scheduled) {
    return 0;
  }

  const diffMinutes = Math.max(0, Math.round((checkIn.getTime() - scheduled.getTime()) / 60000) - graceMinutes);
  return diffMinutes;
}

function computeEarlyLeaveMinutes(checkOutAt: unknown, scheduledEnd: unknown, graceMinutes: number) {
  const checkOut = parseIso(checkOutAt);
  const scheduled = parseIso(scheduledEnd, checkOut);
  if (!checkOut || !scheduled) {
    return 0;
  }

  const diffMinutes = Math.round((scheduled.getTime() - checkOut.getTime()) / 60000);
  return diffMinutes > graceMinutes ? diffMinutes : 0;
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
  const status = normalizeString(row.status);
  if (status !== "approved") {
    return false;
  }

  const start = String(row.start_date ?? "").slice(0, 10);
  const end = String(row.end_date ?? "").slice(0, 10);
  return Boolean(start && end && start <= date && end >= date);
}

function buildHistoryDates(days = 14) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return toDateInput(date);
  });
}

function getBoardStatusTone(status: string) {
  const normalized = normalizeString(status);

  if (normalized === "absent") {
    return "border-rose-200 bg-rose-50/75";
  }

  if (normalized === "incomplete") {
    return "border-amber-200 bg-amber-50/75";
  }

  if (normalized === "late") {
    return "border-orange-200 bg-orange-50/80";
  }

  if (normalized === "present") {
    return "border-emerald-200 bg-emerald-50/60";
  }

  return "border-[var(--border)] bg-white";
}

function getLocationStatusLabel(status: unknown) {
  const normalized = normalizeString(status);

  if (normalized === "verified_location") {
    return "Verified Location";
  }

  if (normalized === "outside_location") {
    return "Outside Location";
  }

  if (normalized === "permission_denied") {
    return "Location Permission Denied";
  }

  return "Location Unavailable";
}

function getLocationStatusMessage(status: unknown) {
  const normalized = normalizeString(status);

  if (normalized === "verified_location") {
    return "Location verified.";
  }

  if (normalized === "outside_location") {
    return "Location recorded outside branch radius.";
  }

  if (normalized === "permission_denied") {
    return "Location permission denied.";
  }

  return "Location unavailable.";
}

function MinuteAlertBadge({ tone, text }: { tone: "late" | "early"; text: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "late"
          ? "bg-orange-100 text-orange-700"
          : "bg-amber-100 text-amber-700",
      )}
    >
      {text}
    </span>
  );
}

function getBranchCode(branchRows: BranchOption[], branchId: string) {
  return String(branchRows.find((branch) => branch.id === branchId)?.code ?? "");
}

export function AttendancePage({
  attendanceRows,
  adjustmentRows,
  settingRows,
  staffRows,
  branchRows,
  rosterRows,
  shiftTemplateRows,
  leaveRows,
  networkRows,
  profile,
  currentStaff,
  role,
  error,
}: AttendancePageProps) {
  const router = useRouter();
  const supabase = createClient();
  const today = toDateInput();
  const operationalBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
  const [selectedBoardDate, setSelectedBoardDate] = useState(today);
  const [selectedBranchId, setSelectedBranchId] = useState(
    role === "branch_pic" || role === "staff" ? operationalBranchId : String(profile?.branch_id ?? "all") || "all",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [adjustmentMessage, setAdjustmentMessage] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [networkMessage, setNetworkMessage] = useState<string | null>(null);
  const [isPunching, setIsPunching] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);
  const [activeManualRecordId, setActiveManualRecordId] = useState<string | null>(null);
  const [isOffsitePunch, setIsOffsitePunch] = useState(false);
  const [offsiteNote, setOffsiteNote] = useState("");
  const [locationFilterBranchId, setLocationFilterBranchId] = useState(
    operationalBranchId || "all",
  );
  const [networkFilterBranchId, setNetworkFilterBranchId] = useState(
    operationalBranchId || "all",
  );
  const [manualAttendanceForm, setManualAttendanceForm] = useState(emptyManualAttendanceForm);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustmentForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [networkForm, setNetworkForm] = useState(emptyNetworkForm);
  const [settingsForm, setSettingsForm] = useState({
    id: "",
    branch_id: operationalBranchId,
    grace_minutes: "10",
    allow_early_check_in_minutes: "0",
    auto_absent_after_minutes: "60",
    early_leave_grace_minutes: "10",
    require_note_for_late: false,
    require_note_for_adjustment: false,
  });

  const canReviewAdjustments = role === "super_admin" || role === "hr" || role === "branch_pic";
  const canManageSettings = role === "super_admin" || role === "hr";
  const canManageBranchGps = role === "super_admin" || role === "hr";
  const canViewBranchGps = canManageBranchGps || role === "operation";
  const canManageNetworkIps = role === "super_admin" || role === "hr";
  const canViewNetworkIps = canManageNetworkIps || role === "operation";
  const canViewAllBranches = role === "super_admin" || role === "hr" || role === "operation";
  const canUsePersonalPunch = Boolean(currentStaff?.id && profile?.id);
  const showPersonalAttendanceSection =
    role === "staff" ||
    role === "branch_pic" ||
    (role === "operation" && canUsePersonalPunch);
  const showManagementOverview = role === "hr" || role === "super_admin";
  const attendance = useMemo(() => mapRowsWithId(attendanceRows), [attendanceRows]);
  const adjustments = useMemo(() => mapRowsWithId(adjustmentRows), [adjustmentRows]);
  const rosters = useMemo(() => mapRowsWithId(rosterRows), [rosterRows]);
  const staffDirectory = useMemo(() => mapRowsWithId(staffRows), [staffRows]);
  const settingsRows = useMemo(() => mapRowsWithId(settingRows), [settingRows]);
  const clinicNetworkRows = useMemo(() => mapRowsWithId(networkRows), [networkRows]);
  const filteredBranchLocationRows = useMemo(() => {
    if (locationFilterBranchId === "all") {
      return branchRows;
    }

    return branchRows.filter((row) => String(row.id ?? "") === locationFilterBranchId);
  }, [branchRows, locationFilterBranchId]);
  const selectedBranchOptions = useMemo(() => {
    if (role === "staff" || role === "branch_pic") {
      const lockedId = operationalBranchId;
      return branchRows.filter((branch) => branch.id === lockedId);
    }

    return branchRows;
  }, [branchRows, operationalBranchId, role]);

  const historyDates = useMemo(() => buildHistoryDates(14), []);
  const filteredNetworkRows = useMemo(() => {
    if (networkFilterBranchId === "all") {
      return clinicNetworkRows;
    }

    return clinicNetworkRows.filter((row) => String(row.branch_id ?? "") === networkFilterBranchId);
  }, [clinicNetworkRows, networkFilterBranchId]);
  const todayRoster = rosters.find(
    (row) =>
      String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
      String(row.roster_date ?? row.date ?? "").slice(0, 10) === today,
  ) ?? null;
  const nextRoster = rosters
    .filter(
      (row) =>
        String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
        String(row.roster_date ?? row.date ?? "").slice(0, 10) >= today,
    )
    .sort((left, right) => String(left.roster_date ?? left.date ?? "").localeCompare(String(right.roster_date ?? right.date ?? "")))[0] ?? null;
  const activeRoster = todayRoster ?? nextRoster;
  const activeShiftTemplate = shiftTemplateRows.find((row) => String(row.id ?? "") === String(activeRoster?.shift_template_id ?? "")) ?? null;
  const activeBranchName = branchRows.find((branch) => branch.id === operationalBranchId)?.name ?? "No branch";

  const scopedTodaySetting = settingsRows.find((row) => String(row.branch_id ?? "") === operationalBranchId)
    ?? settingsRows.find((row) => !String(row.branch_id ?? "").trim())
    ?? null;
  const graceMinutes = Number(scopedTodaySetting?.grace_minutes ?? 10) || 10;
  const todayAttendance = attendance.find(
    (row) =>
      String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
      String(row.attendance_date ?? row.created_at ?? "").slice(0, 10) === today,
  ) ?? null;

  const todayScheduledStart = buildScheduledDateTime(todayRoster, activeShiftTemplate, "start");
  const todayScheduledEnd = buildScheduledDateTime(todayRoster, activeShiftTemplate, "end");
  const todayScheduleDetails = calculateNetScheduledMinutesDetails({
    branchCode: getBranchCode(branchRows, operationalBranchId),
    rosterDate: String(todayRoster?.roster_date ?? today),
    startTime: todayRoster?.custom_start_time ?? activeShiftTemplate?.start_time ?? null,
    endTime: todayRoster?.custom_end_time ?? activeShiftTemplate?.end_time ?? null,
  });
  const todayStatus = computeAttendanceStatus(todayAttendance, graceMinutes);
  const todayLateMinutes = Number(todayAttendance?.late_minutes ?? computeLateMinutes(todayAttendance?.check_in_at, todayAttendance?.scheduled_start ?? todayScheduledStart, graceMinutes));
  const todayEarlyLeaveGraceMinutes = Number(scopedTodaySetting?.early_leave_grace_minutes ?? 10) || 10;
  const todayEarlyLeaveMinutes = Number(todayAttendance?.early_leave_minutes ?? computeEarlyLeaveMinutes(todayAttendance?.check_out_at, todayAttendance?.scheduled_end ?? todayScheduledEnd, todayEarlyLeaveGraceMinutes));

  const personalHistory = historyDates
    .map((date) => {
      const attendanceRow = attendance.find(
        (row) =>
          String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
          String(row.attendance_date ?? row.created_at ?? "").slice(0, 10) === date,
      ) ?? null;
      const rosterRow = rosters.find(
        (row) =>
          String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
          String(row.roster_date ?? row.date ?? "").slice(0, 10) === date,
      ) ?? null;
      const template = shiftTemplateRows.find((row) => String(row.id ?? "") === String(rosterRow?.shift_template_id ?? "")) ?? null;
      const correction = adjustments.find(
        (row) =>
          String(row.attendance_record_id ?? "") === String(attendanceRow?.id ?? "") ||
          (String(row.staff_id ?? "") === String(currentStaff?.id ?? "") &&
            String(row.created_at ?? "").slice(0, 10) === date),
      ) ?? null;

      const scheduleDetails = calculateNetScheduledMinutesDetails({
        branchCode: getBranchCode(branchRows, operationalBranchId),
        rosterDate: date,
        startTime: rosterRow?.custom_start_time ?? template?.start_time ?? null,
        endTime: rosterRow?.custom_end_time ?? template?.end_time ?? null,
      });

      return {
        date,
        attendanceRow,
        rosterRow,
        template,
        correction,
        earlyLeaveMinutes: Number(attendanceRow?.early_leave_minutes ?? computeEarlyLeaveMinutes(attendanceRow?.check_out_at, attendanceRow?.scheduled_end ?? buildScheduledDateTime(rosterRow, template, "end"), todayEarlyLeaveGraceMinutes)),
        scheduledNetMinutes: scheduleDetails.netMinutes,
      };
    })
    .filter((row) => row.attendanceRow || row.rosterRow || row.correction);

  const boardBranchId =
    role === "staff" || role === "branch_pic"
      ? operationalBranchId
      : selectedBranchId || "all";

  const visibleRosterRows = rosters.filter((row) => {
    const rosterDate = String(row.roster_date ?? row.date ?? "").slice(0, 10);
    if (rosterDate !== selectedBoardDate) {
      return false;
    }

    if (!canViewAllBranches || boardBranchId === "all") {
      return boardBranchId === "all" ? true : String(row.branch_id ?? "") === boardBranchId;
    }

    return String(row.branch_id ?? "") === boardBranchId;
  });

  const visibleBranchStaff = staffDirectory.filter((row) => {
    if (role === "branch_pic") {
      return String(row.branch_id ?? "") === operationalBranchId;
    }

    if (role === "staff") {
      return String(row.id ?? "") === String(currentStaff?.id ?? "");
    }

    if (boardBranchId === "all") {
      return true;
    }

    return String(row.branch_id ?? "") === boardBranchId;
  });

  const boardRows = visibleRosterRows.map((rosterRow) => {
    const member = visibleBranchStaff.find((row) => String(row.id ?? "") === String(rosterRow.staff_id ?? ""))
      ?? staffDirectory.find((row) => String(row.id ?? "") === String(rosterRow.staff_id ?? ""));
    const template = shiftTemplateRows.find((row) => String(row.id ?? "") === String(rosterRow.shift_template_id ?? "")) ?? null;
    const record = attendance.find(
      (row) =>
        String(row.staff_id ?? "") === String(rosterRow.staff_id ?? "") &&
        String(row.attendance_date ?? row.created_at ?? "").slice(0, 10) === selectedBoardDate,
    ) ?? null;
    const branchId = String(rosterRow.branch_id ?? member?.branch_id ?? "");
    const branchSetting = settingsRows.find((row) => String(row.branch_id ?? "") === branchId)
      ?? settingsRows.find((row) => !String(row.branch_id ?? "").trim())
      ?? null;
    const rowGraceMinutes = Number(branchSetting?.grace_minutes ?? 10) || 10;
    const rowEarlyLeaveGraceMinutes = Number(branchSetting?.early_leave_grace_minutes ?? 10) || 10;
    const approvedLeave = leaveRows.find(
      (row) => String(row.staff_id ?? "") === String(rosterRow.staff_id ?? "") && isLeaveForDate(row, selectedBoardDate),
    ) ?? null;
    const leaveType = normalizeString(approvedLeave?.leave_type);
    const derivedStatus = approvedLeave
      ? leaveType === "medical_leave"
        ? "mc"
        : "on_leave"
      : computeAttendanceStatus(record, rowGraceMinutes);
    const scheduledStart = record?.scheduled_start ?? buildScheduledDateTime(rosterRow, template, "start");
    const scheduledEnd = record?.scheduled_end ?? buildScheduledDateTime(rosterRow, template, "end");
    const scheduleDetails = calculateNetScheduledMinutesDetails({
      branchCode: getBranchCode(branchRows, branchId),
      rosterDate: selectedBoardDate,
      startTime: rosterRow?.custom_start_time ?? template?.start_time ?? null,
      endTime: rosterRow?.custom_end_time ?? template?.end_time ?? null,
    });
    const lateMinutes = Number(record?.late_minutes ?? computeLateMinutes(record?.check_in_at, scheduledStart, rowGraceMinutes));
    const earlyLeaveMinutes = Number(record?.early_leave_minutes ?? computeEarlyLeaveMinutes(record?.check_out_at, scheduledEnd, rowEarlyLeaveGraceMinutes));
    const autoAbsentAfterMinutes = Number(branchSetting?.auto_absent_after_minutes ?? 60) || 60;

    let finalStatus = derivedStatus;
    const scheduledStartDate = parseIso(scheduledStart);
    const selectedIsToday = selectedBoardDate === today;
    const now = new Date();

    if (!approvedLeave && !record && scheduledStartDate) {
      if (selectedBoardDate < today) {
        finalStatus = "absent";
      } else if (selectedIsToday && now.getTime() > scheduledStartDate.getTime() + autoAbsentAfterMinutes * 60000) {
        finalStatus = "absent";
      }
    }

    return {
      rosterRow,
      member,
      template,
      record,
      status: finalStatus,
      lateMinutes,
      scheduledStart,
      scheduledEnd,
      scheduledNetMinutes: scheduleDetails.netMinutes,
      earlyLeaveMinutes,
      checkInIp: String(record?.check_in_ip ?? ""),
      checkOutIp: String(record?.check_out_ip ?? ""),
      checkInNetworkStatus: String(record?.check_in_network_status ?? "unavailable"),
      checkOutNetworkStatus: String(record?.check_out_network_status ?? "unavailable"),
      checkInLocationStatus: String(record?.check_in_location_status ?? "location_unavailable"),
      checkOutLocationStatus: String(record?.check_out_location_status ?? "location_unavailable"),
      checkInDistanceMeters: Number(record?.check_in_distance_meters ?? 0) || 0,
      checkOutDistanceMeters: Number(record?.check_out_distance_meters ?? 0) || 0,
      checkInLatitude: record?.check_in_latitude ?? null,
      checkInLongitude: record?.check_in_longitude ?? null,
      checkOutLatitude: record?.check_out_latitude ?? null,
      checkOutLongitude: record?.check_out_longitude ?? null,
    };
  });

  const pendingAdjustments = adjustments.filter((row) => {
    if (normalizeString(row.status) !== "pending") {
      return false;
    }

    if (role === "super_admin" || role === "hr") {
      return true;
    }

    if (role === "branch_pic") {
      return String(row.branch_id ?? "") === operationalBranchId;
    }

    return String(row.profile_id ?? "") === String(profile?.id ?? "");
  });

  const branchSettingsSelection = settingsRows.find((row) => String(row.branch_id ?? "") === String(settingsForm.branch_id ?? ""))
    ?? null;
  const boardCounts = {
    present: boardRows.filter((row) => row.status === "present").length,
    late: boardRows.filter((row) => row.status === "late").length,
    absent: boardRows.filter((row) => row.status === "absent").length,
    incomplete: boardRows.filter((row) => row.status === "incomplete").length,
    notPunchedIn: boardRows.filter((row) => row.status === "not_punched_in").length,
    outsideLocation: boardRows.filter((row) => row.checkInLocationStatus === "outside_location" || row.checkOutLocationStatus === "outside_location").length,
  };

  function getStaffName(staffId: unknown) {
    const row = staffDirectory.find((item) => String(item.id ?? "") === String(staffId ?? ""));
    return String(row?.full_name ?? row?.email ?? "Unknown User");
  }

  function getBranchName(branchId: unknown) {
    return branchRows.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "No branch";
  }

  function loadSettings(branchId: string) {
    const row = settingsRows.find((item) => String(item.branch_id ?? "") === branchId) ?? null;
    setSettingsForm({
      id: String(row?.id ?? ""),
      branch_id: branchId,
      grace_minutes: String(row?.grace_minutes ?? 10),
      allow_early_check_in_minutes: String(row?.allow_early_check_in_minutes ?? 0),
      auto_absent_after_minutes: String(row?.auto_absent_after_minutes ?? 60),
      early_leave_grace_minutes: String(row?.early_leave_grace_minutes ?? 10),
      require_note_for_late: row?.require_note_for_late === true,
      require_note_for_adjustment: row?.require_note_for_adjustment === true,
    });
    setSettingsMessage(null);
  }

  function startEditNetworkRow(row: TableRow) {
    setNetworkForm({
      id: String(row.id ?? ""),
      branch_id: String(row.branch_id ?? ""),
      ip_address: String(row.ip_address ?? ""),
      label: String(row.label ?? ""),
      notes: String(row.notes ?? ""),
      is_active: row.is_active !== false && normalizeString(row.status) !== "inactive",
    });
    setNetworkMessage(null);
  }

  function startEditBranchLocation(branch: BranchOption) {
    setLocationForm({
      branch_id: String(branch.id ?? ""),
      latitude: branch.latitude === null || branch.latitude === undefined ? "" : String(branch.latitude),
      longitude: branch.longitude === null || branch.longitude === undefined ? "" : String(branch.longitude),
      gps_radius_meters: String(branch.gps_radius_meters ?? 30),
      is_active: branch.is_active !== false,
    });
    setLocationMessage(null);
  }

  async function requestPunchLocation() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return { status: "location_unavailable" as const };
    }

    return new Promise<{
      status: "captured" | "permission_denied" | "location_unavailable";
      latitude?: number;
      longitude?: number;
      accuracy?: number;
    }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            status: "captured",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            resolve({ status: "permission_denied" });
            return;
          }

          resolve({ status: "location_unavailable" });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  }

  async function handlePunch(action: "in" | "out") {
    if (!profile?.id || !currentStaff?.id) {
      setMessage("Complete your linked staff profile before using attendance.");
      return;
    }

    if (isOffsitePunch && !offsiteNote.trim()) {
      setMessage("Sila isi nota ringkas untuk offsite / external duty.");
      return;
    }

    setIsPunching(true);
    setMessage(null);
    try {
      const location = await requestPunchLocation();
      const response = await fetch("/api/attendance/punch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          location,
          offsite: {
            isOffsite: isOffsitePunch,
            note: offsiteNote.trim() || null,
          },
        }),
      });

      const result = await response.json();
      setIsPunching(false);

      if (!response.ok) {
        setMessage(String(result?.error ?? "Unable to save attendance punch."));
        return;
      }

      setMessage(String(result?.message ?? "Attendance punch saved."));
      setIsOffsitePunch(false);
      setOffsiteNote("");
      router.refresh();
    } catch (error) {
      setIsPunching(false);
      setMessage(error instanceof Error ? error.message : "Unable to save attendance punch.");
    }
  }

  async function saveBranchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !canManageBranchGps) {
      setLocationMessage("Branch GPS settings are restricted to HR and super admin.");
      return;
    }

    if (!locationForm.branch_id) {
      setLocationMessage("Branch is required.");
      return;
    }

    setIsSavingLocation(true);
    setLocationMessage(null);

    const payload = {
      latitude: locationForm.latitude ? Number(locationForm.latitude) : null,
      longitude: locationForm.longitude ? Number(locationForm.longitude) : null,
      gps_radius_meters: Number(locationForm.gps_radius_meters || 30) || 30,
      gps_is_active: locationForm.is_active,
    };

    const { error: saveError } = await supabase
      .from("branches")
      .update(payload)
      .eq("id", locationForm.branch_id);

    setIsSavingLocation(false);

    if (saveError) {
      setLocationMessage(saveError.message);
      return;
    }

    setLocationMessage("Branch GPS settings saved.");
    setLocationForm(emptyLocationForm);
    router.refresh();
  }

  async function saveNetworkRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !canManageNetworkIps) {
      setNetworkMessage("Clinic network IP settings are restricted to HR and super admin.");
      return;
    }

    if (!networkForm.branch_id || !networkForm.ip_address.trim()) {
      setNetworkMessage("Branch and IP address are required.");
      return;
    }

    setIsSavingNetwork(true);
    setNetworkMessage(null);

    const payload = {
      branch_id: networkForm.branch_id,
      ip_address: networkForm.ip_address.trim(),
      label: networkForm.label.trim() || null,
      notes: networkForm.notes.trim() || null,
      is_active: networkForm.is_active,
      status: networkForm.is_active ? "active" : "inactive",
    };

    const query = networkForm.id
      ? supabase.from("clinic_network_ips").update(payload).eq("id", networkForm.id)
      : supabase.from("clinic_network_ips").insert(payload);

    const { error: saveError } = await query;
    setIsSavingNetwork(false);

    if (saveError) {
      setNetworkMessage(saveError.message);
      return;
    }

    setNetworkForm(emptyNetworkForm);
    setNetworkMessage("Clinic network IP saved.");
    router.refresh();
  }

  async function deactivateNetworkRow(row: TableRow) {
    if (!supabase || !canManageNetworkIps) {
      setNetworkMessage("Clinic network IP settings are restricted to HR and super admin.");
      return;
    }

    const { error: updateError } = await supabase
      .from("clinic_network_ips")
      .update({
        is_active: false,
        status: "inactive",
      })
      .eq("id", row.id);

    if (updateError) {
      setNetworkMessage(updateError.message);
      return;
    }

    setNetworkMessage("Clinic network IP deactivated.");
    router.refresh();
  }

  async function handleSubmitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !profile?.id || !currentStaff?.id) {
      setAdjustmentMessage("Complete your linked staff profile before requesting a correction.");
      return;
    }

    setIsSavingAdjustment(true);
    setAdjustmentMessage(null);

    const payload = {
      request_type: adjustmentForm.request_type,
      requested_check_in_at: adjustmentForm.requested_check_in_at || null,
      requested_check_out_at: adjustmentForm.requested_check_out_at || null,
      reason: adjustmentForm.reason || null,
      staff_id: currentStaff.id,
      profile_id: profile.id,
      branch_id: currentStaff.branch_id ?? profile.branch_id ?? null,
      attendance_record_id: todayAttendance?.id ?? null,
      status: "pending",
    };

    const { error: insertError } = await supabase.from("attendance_adjustments").insert(payload);

    setIsSavingAdjustment(false);

    if (insertError) {
      setAdjustmentMessage(insertError.message);
      return;
    }

    setAdjustmentForm(emptyAdjustmentForm);
    setAdjustmentMessage("Correction request submitted.");
    router.refresh();
  }

  async function handleAdjustmentDecision(row: TableRow, status: "approved" | "rejected") {
    if (!supabase || !profile?.id) {
      setAdjustmentMessage("Unable to review this adjustment right now.");
      return;
    }

    if (status === "approved") {
      const requestedCheckIn = row.requested_check_in_at;
      const requestedCheckOut = row.requested_check_out_at;
      const sourceAttendanceId = String(row.attendance_record_id ?? "");
      const branchId = String(row.branch_id ?? "");
      const matchingRecord =
        attendance.find((item) => String(item.id ?? "") === sourceAttendanceId)
        ?? attendance.find(
          (item) =>
            String(item.staff_id ?? "") === String(row.staff_id ?? "") &&
            String(item.attendance_date ?? item.created_at ?? "").slice(0, 10) === String(requestedCheckIn ?? requestedCheckOut ?? "").slice(0, 10),
        )
        ?? null;
      const matchingRoster = rosters.find(
        (item) =>
          String(item.staff_id ?? "") === String(row.staff_id ?? "") &&
          String(item.roster_date ?? item.date ?? "").slice(0, 10) === String(requestedCheckIn ?? requestedCheckOut ?? "").slice(0, 10),
      ) ?? null;
      const matchingTemplate = shiftTemplateRows.find((item) => String(item.id ?? "") === String(matchingRoster?.shift_template_id ?? "")) ?? null;
      const branchSetting = settingsRows.find((item) => String(item.branch_id ?? "") === branchId)
        ?? settingsRows.find((item) => !String(item.branch_id ?? "").trim())
        ?? null;
      const rowGraceMinutes = Number(branchSetting?.grace_minutes ?? 10) || 10;
      const rowEarlyLeaveGraceMinutes = Number(branchSetting?.early_leave_grace_minutes ?? 10) || 10;
      const scheduledStart = matchingRecord?.scheduled_start ?? buildScheduledDateTime(matchingRoster, matchingTemplate, "start");
      const scheduledEnd = matchingRecord?.scheduled_end ?? buildScheduledDateTime(matchingRoster, matchingTemplate, "end");
      const lateMinutes = computeLateMinutes(requestedCheckIn, scheduledStart, rowGraceMinutes);
      const earlyLeaveMinutes = computeEarlyLeaveMinutes(requestedCheckOut, scheduledEnd, rowEarlyLeaveGraceMinutes);
      const nextStatus = computeAttendanceStatus(
        {
          ...matchingRecord,
          check_in_at: requestedCheckIn ?? matchingRecord?.check_in_at ?? null,
          check_out_at: requestedCheckOut ?? matchingRecord?.check_out_at ?? null,
          scheduled_start: scheduledStart,
          late_minutes: lateMinutes,
        },
        rowGraceMinutes,
      );

      if (matchingRecord?.id) {
        const { error: attendanceError } = await supabase
          .from("attendance_records")
          .update({
            check_in_at: requestedCheckIn ?? matchingRecord.check_in_at ?? null,
            check_out_at: requestedCheckOut ?? matchingRecord.check_out_at ?? null,
            scheduled_start: normalizeTimeForPostgres(scheduledStart),
            scheduled_end: normalizeTimeForPostgres(scheduledEnd),
            roster_id: matchingRoster?.id ?? matchingRecord.roster_id ?? null,
            late_minutes: lateMinutes,
            early_leave_minutes: earlyLeaveMinutes,
            status: nextStatus === "not_punched_in" ? "incomplete" : nextStatus,
          })
          .eq("id", matchingRecord.id);

        if (attendanceError) {
          setAdjustmentMessage(attendanceError.message);
          return;
        }
      } else {
        const requestedDate = String(requestedCheckIn ?? requestedCheckOut ?? "").slice(0, 10) || today;
        const { error: insertAttendanceError } = await supabase.from("attendance_records").insert({
          profile_id: row.profile_id ?? null,
          staff_id: row.staff_id,
          branch_id: row.branch_id ?? null,
          attendance_date: requestedDate,
          roster_id: matchingRoster?.id ?? null,
          scheduled_start: normalizeTimeForPostgres(scheduledStart),
          scheduled_end: normalizeTimeForPostgres(scheduledEnd),
          check_in_at: requestedCheckIn ?? null,
          check_out_at: requestedCheckOut ?? null,
          late_minutes: lateMinutes,
          early_leave_minutes: earlyLeaveMinutes,
          status: nextStatus === "not_punched_in" ? "incomplete" : nextStatus,
        });

        if (insertAttendanceError) {
          setAdjustmentMessage(insertAttendanceError.message);
          return;
        }
      }
    }

    const { error: reviewError } = await supabase
      .from("attendance_adjustments")
      .update({ status })
      .eq("id", row.id);

    if (reviewError) {
      setAdjustmentMessage(reviewError.message);
      return;
    }

    setAdjustmentMessage(`Adjustment ${status}.`);
    router.refresh();
  }

  function startManualUpdate(row: (typeof boardRows)[number]) {
    setActiveManualRecordId(String(row.record?.id ?? row.rosterRow.id ?? row.member?.id ?? ""));
    setManualAttendanceForm({
      check_in_at: formatShortDateTime(row.record?.check_in_at),
      check_out_at: formatShortDateTime(row.record?.check_out_at),
    });
    setManualMessage(null);
  }

  async function saveManualAttendance(row: (typeof boardRows)[number]) {
    if (!supabase || !profile?.id || role !== "super_admin" && role !== "hr") {
      setManualMessage("Manual updates are only available to HR and super admin.");
      return;
    }

    const scheduledStart = row.scheduledStart;
    const scheduledEnd = row.scheduledEnd;
    const branchSetting = settingsRows.find((item) => String(item.branch_id ?? "") === String(row.rosterRow.branch_id ?? row.member?.branch_id ?? ""))
      ?? settingsRows.find((item) => !String(item.branch_id ?? "").trim())
      ?? null;
    const rowGraceMinutes = Number(branchSetting?.grace_minutes ?? 10) || 10;
    const rowEarlyLeaveGraceMinutes = Number(branchSetting?.early_leave_grace_minutes ?? 10) || 10;
    const lateMinutes = computeLateMinutes(manualAttendanceForm.check_in_at, scheduledStart, rowGraceMinutes);
    const earlyLeaveMinutes = computeEarlyLeaveMinutes(manualAttendanceForm.check_out_at, scheduledEnd, rowEarlyLeaveGraceMinutes);
    const nextStatus = computeAttendanceStatus(
      {
        ...row.record,
        check_in_at: manualAttendanceForm.check_in_at || null,
        check_out_at: manualAttendanceForm.check_out_at || null,
        scheduled_start: scheduledStart,
        late_minutes: lateMinutes,
      },
      rowGraceMinutes,
    );

    if (row.record?.id) {
      const { error: updateError } = await supabase
        .from("attendance_records")
        .update({
          check_in_at: manualAttendanceForm.check_in_at || null,
          check_out_at: manualAttendanceForm.check_out_at || null,
          late_minutes: lateMinutes,
          early_leave_minutes: earlyLeaveMinutes,
          status: nextStatus === "not_punched_in" ? "incomplete" : nextStatus,
        })
        .eq("id", row.record.id);

      if (updateError) {
        setManualMessage(updateError.message);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("attendance_records").insert({
        profile_id: row.member?.profile_id ?? null,
        staff_id: row.member?.id ?? row.rosterRow.staff_id ?? null,
        branch_id: row.rosterRow.branch_id ?? row.member?.branch_id ?? null,
        attendance_date: selectedBoardDate,
        roster_id: row.rosterRow.id ?? null,
        scheduled_start: normalizeTimeForPostgres(scheduledStart),
        scheduled_end: normalizeTimeForPostgres(scheduledEnd),
        check_in_at: manualAttendanceForm.check_in_at || null,
        check_out_at: manualAttendanceForm.check_out_at || null,
        late_minutes: lateMinutes,
        early_leave_minutes: earlyLeaveMinutes,
        status: nextStatus === "not_punched_in" ? "incomplete" : nextStatus,
      });

      if (insertError) {
        setManualMessage(insertError.message);
        return;
      }
    }

    setManualMessage("Attendance record updated.");
    setActiveManualRecordId(null);
    setManualAttendanceForm(emptyManualAttendanceForm);
    router.refresh();
  }

  async function handleAdminRecordAction(row: (typeof boardRows)[number], action: "reset" | "delete") {
    if (!profile?.id || (role !== "hr" && role !== "super_admin") || !row.record?.id) {
      setManualMessage("Admin attendance action is not available for this record.");
      return;
    }

    const confirmationMessage = action === "reset"
      ? "Reset punch record for this staff on this date?"
      : "Delete this attendance record? This action cannot be undone.";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setManualMessage(null);

    try {
      const response = await fetch("/api/attendance/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          recordId: row.record.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setManualMessage(String(result?.error ?? "Unable to update attendance record."));
        return;
      }

      setManualMessage(String(result?.message ?? "Attendance record updated."));
      setActiveManualRecordId(null);
      setManualAttendanceForm(emptyManualAttendanceForm);
      router.refresh();
    } catch (error) {
      setManualMessage(error instanceof Error ? error.message : "Unable to update attendance record.");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !canManageSettings) {
      setSettingsMessage("Attendance settings are restricted to HR and super admin.");
      return;
    }

    setIsSavingSettings(true);
    setSettingsMessage(null);

    const payload = {
      branch_id: settingsForm.branch_id || null,
      grace_minutes: Number(settingsForm.grace_minutes || 10),
      allow_early_check_in_minutes: Number(settingsForm.allow_early_check_in_minutes || 0),
      auto_absent_after_minutes: Number(settingsForm.auto_absent_after_minutes || 60),
      early_leave_grace_minutes: Number(settingsForm.early_leave_grace_minutes || 10),
      require_note_for_late: settingsForm.require_note_for_late,
      require_note_for_adjustment: settingsForm.require_note_for_adjustment,
    };

    const query = settingsForm.id
      ? supabase.from("attendance_settings").update(payload).eq("id", settingsForm.id)
      : supabase.from("attendance_settings").insert(payload);

    const { error: saveError } = await query;
    setIsSavingSettings(false);

    if (saveError) {
      setSettingsMessage(saveError.message);
      return;
    }

    setSettingsMessage("Attendance settings saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load attendance data" description={error} /> : null}

      {showPersonalAttendanceSection ? (
        <FormSection
          title="Today attendance"
          description="Punch in, punch out, and review your scheduled shift linked to today's roster."
        >
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,#ffffff_0%,#eef9f8_55%,#f8fcfc_100%)] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-[var(--foreground)]">{String(currentStaff?.full_name ?? profile?.full_name ?? "Staff attendance")}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{activeBranchName} · {formatDate(today)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge value={todayStatus} />
                  {todayLateMinutes > 0 ? <MinuteAlertBadge tone="late" text={`${todayLateMinutes} min late`} /> : null}
                  {todayEarlyLeaveMinutes > 0 ? <MinuteAlertBadge tone="early" text={`${todayEarlyLeaveMinutes} min early leave`} /> : null}
                </div>
              </div>

              {!todayRoster ? (
                <div className="mt-4 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Roster belum diset untuk hari ini.
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-white/85 px-5 py-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Current or next shift</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{getShiftName(activeRoster, activeShiftTemplate)}</p>
                </div>
                <div className="rounded-3xl bg-white/85 px-5 py-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Scheduled hours</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{formatMinutesAsHours(todayScheduleDetails.netMinutes)}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {formatShortTime(todayAttendance?.scheduled_start ?? todayScheduledStart)} - {formatShortTime(todayAttendance?.scheduled_end ?? todayScheduledEnd)}
                  </p>
                </div>
                <div className="rounded-3xl bg-white/85 px-5 py-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Check in</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{formatShortTime(todayAttendance?.check_in_at)}</p>
                </div>
                <div className="rounded-3xl bg-white/85 px-5 py-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Check out</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{formatShortTime(todayAttendance?.check_out_at)}</p>
                </div>
                <div className="rounded-3xl bg-white/85 px-5 py-5 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Location verification</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {todayAttendance?.check_in_at ? <StatusBadge value={getLocationStatusLabel(todayAttendance?.check_in_location_status)} /> : null}
                    {todayAttendance?.check_out_at ? <StatusBadge value={getLocationStatusLabel(todayAttendance?.check_out_location_status)} /> : null}
                    {todayAttendance?.check_in_is_offsite || todayAttendance?.check_out_is_offsite ? <StatusBadge value="offsite" /> : null}
                  </div>
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                    {todayAttendance?.check_out_at
                      ? getLocationStatusMessage(todayAttendance?.check_out_location_status)
                      : todayAttendance?.check_in_at
                        ? getLocationStatusMessage(todayAttendance?.check_in_location_status)
                        : "Location is captured only when you punch in or punch out."}
                  </p>
                  {todayAttendance?.check_out_at && todayAttendance?.check_out_distance_meters !== null && todayAttendance?.check_out_distance_meters !== undefined ? (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">Distance from clinic: {Math.round(Number(todayAttendance.check_out_distance_meters))}m</p>
                  ) : todayAttendance?.check_in_at && todayAttendance?.check_in_distance_meters !== null && todayAttendance?.check_in_distance_meters !== undefined ? (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">Distance from clinic: {Math.round(Number(todayAttendance.check_in_distance_meters))}m</p>
                  ) : null}
                  {todayAttendance?.offsite_note ? (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">Offsite note: {String(todayAttendance.offsite_note)}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => handlePunch("in")}
                  disabled={isPunching}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto"
                >
                  <LogIn className="h-4 w-4" />
                  {isPunching ? "Saving..." : "Punch In"}
                </button>
                <button
                  type="button"
                  onClick={() => handlePunch("out")}
                  disabled={isPunching || !todayAttendance?.check_in_at}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60 sm:w-auto"
                >
                  <LogOut className="h-4 w-4" />
                  Punch Out
                </button>
              </div>
              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-white/85 px-4 py-4">
                <label className="flex items-center gap-3 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={isOffsitePunch} onChange={(event) => setIsOffsitePunch(event.target.checked)} />
                  Offsite / External Duty
                </label>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">Location is captured only when you punch in or punch out.</p>
                {isOffsitePunch ? (
                  <textarea
                    value={offsiteNote}
                    onChange={(event) => setOffsiteNote(event.target.value)}
                    rows={3}
                    placeholder="Program khatan, meeting luar, training"
                    className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
                    required
                  />
                ) : null}
              </div>
              {message ? <p className="mt-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
            </div>

            <FormSection title="Request correction" description="Use this if you forgot to punch, punched the wrong time, or need HR/manager review.">
              <form className="space-y-4" onSubmit={handleSubmitAdjustment}>
                <select value={adjustmentForm.request_type} onChange={(event) => setAdjustmentForm((current) => ({ ...current, request_type: event.target.value }))} className={inputClass}>
                  <option value="forgot_punch_in">Forgot punch in</option>
                  <option value="forgot_punch_out">Forgot punch out</option>
                  <option value="wrong_punch_time">Wrong punch time</option>
                </select>
                <input type="datetime-local" value={adjustmentForm.requested_check_in_at} onChange={(event) => setAdjustmentForm((current) => ({ ...current, requested_check_in_at: event.target.value }))} className={inputClass} />
                <input type="datetime-local" value={adjustmentForm.requested_check_out_at} onChange={(event) => setAdjustmentForm((current) => ({ ...current, requested_check_out_at: event.target.value }))} className={inputClass} />
                <textarea value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="Explain what needs to be corrected" className={textareaClass} required />
                {adjustmentMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{adjustmentMessage}</p> : null}
                <button type="submit" disabled={isSavingAdjustment} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70">
                  <Edit3 className="h-4 w-4" />
                  {isSavingAdjustment ? "Saving..." : "Request Correction"}
                </button>
              </form>
            </FormSection>
          </div>
        </FormSection>
      ) : showManagementOverview || role === "operation" ? (
        <FormSection
          title={role === "operation" ? "Attendance Snapshot" : "Attendance Management Overview"}
          description={role === "operation" ? "Lihat snapshot attendance dan board kehadiran staff secara read-only." : "Pantau kehadiran staff, kelewatan, punch tidak lengkap, dan pembetulan attendance."}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Present Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-800">{boardCounts.present}</p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Late Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-orange-800">{boardCounts.late}</p>
            </div>
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Absent Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-800">{boardCounts.absent}</p>
            </div>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Incomplete Punch</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-800">{boardCounts.incomplete}</p>
            </div>
          </div>
        </FormSection>
      ) : canUsePersonalPunch ? null : (
        <EmptyState title="Complete your staff profile first" description="Attendance punch controls need a linked staff record before they can be used." />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        {showPersonalAttendanceSection ? (
        <FormSection title="Attendance history" description="Your last 14 days of attendance, shift schedule, and any correction requests.">
          {personalHistory.length ? (
            <div className="space-y-3">
              {personalHistory.map((entry) => {
                const status = entry.attendanceRow
                  ? computeAttendanceStatus(entry.attendanceRow, graceMinutes)
                  : entry.correction
                    ? normalizeString(entry.correction.status) === "pending"
                      ? "pending_review"
                      : String(entry.correction.status ?? "pending_review")
                    : "not_punched_in";
                return (
                  <article key={entry.date} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-[var(--foreground)]">{formatDate(entry.date)}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          {getShiftName(entry.rosterRow, entry.template)} · {formatShortTime(entry.attendanceRow?.scheduled_start ?? buildScheduledDateTime(entry.rosterRow, entry.template, "start"))} - {formatShortTime(entry.attendanceRow?.scheduled_end ?? buildScheduledDateTime(entry.rosterRow, entry.template, "end"))}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Scheduled hours: {formatMinutesAsHours(entry.scheduledNetMinutes)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge value={status} />
                        {entry.correction ? <StatusBadge value={String(entry.correction.status ?? "pending")} /> : null}
                        {entry.earlyLeaveMinutes > 0 ? <MinuteAlertBadge tone="early" text={`${entry.earlyLeaveMinutes} min early leave`} /> : null}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)] md:grid-cols-2">
                      <p><span className="font-semibold">Check in:</span> {formatShortTime(entry.attendanceRow?.check_in_at)}</p>
                      <p><span className="font-semibold">Check out:</span> {formatShortTime(entry.attendanceRow?.check_out_at)}</p>
                      <p><span className="font-semibold">Late minutes:</span> {String(entry.attendanceRow?.late_minutes ?? computeLateMinutes(entry.attendanceRow?.check_in_at, entry.attendanceRow?.scheduled_start, graceMinutes))}</p>
                      <p><span className="font-semibold">Early leave:</span> {entry.earlyLeaveMinutes > 0 ? `${entry.earlyLeaveMinutes} min` : "-"}</p>
                      <p><span className="font-semibold">Scheduled hours:</span> {formatMinutesAsHours(entry.scheduledNetMinutes)}</p>
                      <p><span className="font-semibold">Correction status:</span> {String(entry.correction?.status ?? "-")}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Belum ada rekod attendance" description="Attendance history will appear after your first punch in and punch out." />
          )}
        </FormSection>
        ) : (
          <FormSection title="Attendance Management Overview" description="Pantau kehadiran staff, kelewatan, punch tidak lengkap, dan pembetulan attendance.">
            <div className="space-y-3">
              <div className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-sm font-semibold text-[var(--foreground)]">Today attendance scope</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  {role === "hr"
                    ? "HR boleh memantau semua cawangan, semak pembetulan, dan kemas kini rekod attendance bila perlu."
                    : role === "operation"
                      ? "Operation melihat attendance snapshot dan board secara read-only, dengan punch peribadi hanya jika akaun mempunyai linked staff row."
                      : "Super admin boleh melihat gambaran global attendance, kelewatan, punch tidak lengkap, dan risiko absent."}
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-sm font-semibold text-[var(--foreground)]">Pending corrections</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{pendingAdjustments.length} request sedang menunggu semakan.</p>
              </div>
            </div>
          </FormSection>
        )}

        <FormSection title={role === "branch_pic" ? "Today attendance board" : role === "super_admin" || role === "hr" ? "Today attendance board" : "Attendance board"} description="Review roster attendance by date, identify late or missing punches, and monitor correction requests.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</label>
              <select
                value={boardBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                className={inputClass}
                disabled={role === "staff" || role === "branch_pic"}
              >
                {canViewAllBranches ? <option value="all">All visible branches</option> : null}
                {selectedBranchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Date</label>
              <input type="date" value={selectedBoardDate} onChange={(event) => setSelectedBoardDate(event.target.value)} className={inputClass} />
            </div>
            <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Summary</p>
              <p className="mt-2 font-semibold">{boardRows.length} rostered staff</p>
              <p className="mt-1 text-[var(--muted-foreground)]">
                {boardCounts.late} late · {boardCounts.incomplete} incomplete · {boardCounts.absent} absent · {boardCounts.notPunchedIn} not punched in · {boardCounts.outsideLocation} outside location
              </p>
            </div>
          </div>

          {(role === "branch_pic" || role === "hr" || role === "super_admin" || role === "operation") ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Present Today</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-800">{boardCounts.present}</p>
              </div>
              <div className="rounded-[24px] border border-orange-200 bg-orange-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Late Today</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-orange-800">{boardCounts.late}</p>
              </div>
              <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Absent Today</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-800">{boardCounts.absent}</p>
              </div>
              <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Incomplete Punch</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-800">{boardCounts.incomplete}</p>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Outside Location Punches</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">{boardCounts.outsideLocation}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {boardRows.length ? (
              boardRows.map((row) => {
                const adminRecordId = String(row.record?.id ?? "").trim();

                return (
                  <article key={String(row.rosterRow.id ?? row.member?.id ?? row.record?.id)} className={cn("rounded-[24px] border px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]", getBoardStatusTone(row.status))}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-[var(--foreground)]">{String(row.member?.full_name ?? row.rosterRow.staff_id ?? "Unknown User")}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{getBranchName(row.rosterRow.branch_id ?? row.member?.branch_id)} · {getShiftName(row.rosterRow, row.template)} · {formatShortTime(row.scheduledStart)} - {formatShortTime(row.scheduledEnd)} · {formatMinutesAsHours(row.scheduledNetMinutes)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={row.status} />
                      {row.lateMinutes > 0 ? <MinuteAlertBadge tone="late" text={`${row.lateMinutes} min late`} /> : null}
                      {row.earlyLeaveMinutes > 0 ? <MinuteAlertBadge tone="early" text={`${row.earlyLeaveMinutes} min early leave`} /> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)] md:grid-cols-2">
                    <p><span className="font-semibold">Check in:</span> {formatShortTime(row.record?.check_in_at)}</p>
                    <p><span className="font-semibold">Check out:</span> {formatShortTime(row.record?.check_out_at)}</p>
                    <p><span className="font-semibold">Branch:</span> {getBranchName(row.rosterRow.branch_id ?? row.member?.branch_id)}</p>
                    <p><span className="font-semibold">Late minutes:</span> {row.lateMinutes}</p>
                    <p><span className="font-semibold">Early leave minutes:</span> {row.earlyLeaveMinutes || "-"}</p>
                    <p><span className="font-semibold">Check in distance:</span> {row.checkInDistanceMeters > 0 ? `${Math.round(row.checkInDistanceMeters)}m` : "-"}</p>
                    <p><span className="font-semibold">Check out distance:</span> {row.checkOutDistanceMeters > 0 ? `${Math.round(row.checkOutDistanceMeters)}m` : "-"}</p>
                    <p><span className="font-semibold">Check in IP:</span> {row.checkInIp || "-"}</p>
                    <p><span className="font-semibold">Check out IP:</span> {row.checkOutIp || "-"}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--foreground)]">Check In:</span>
                      <StatusBadge value={getLocationStatusLabel(row.checkInLocationStatus)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--foreground)]">Check Out:</span>
                      <StatusBadge value={getLocationStatusLabel(row.checkOutLocationStatus)} />
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                    <p>Check in GPS: {row.checkInLatitude && row.checkInLongitude ? `${row.checkInLatitude}, ${row.checkInLongitude}` : "-"}</p>
                    <p>Check out GPS: {row.checkOutLatitude && row.checkOutLongitude ? `${row.checkOutLatitude}, ${row.checkOutLongitude}` : "-"}</p>
                    <p>Legacy IP audit: {row.checkInIp || "-"} / {row.checkOutIp || "-"}</p>
                  </div>

                  {role === "super_admin" || role === "hr" ? (
                    <div className="mt-4 space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-[var(--foreground)]">Manual attendance update</p>
                        <button type="button" onClick={() => startManualUpdate(row)} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                          <Edit3 className="h-4 w-4" />
                          Edit record
                        </button>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)]">Admin reset/delete tools are for testing or correction only.</p>

                      {adminRecordId ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-4">
                          <p className="text-sm font-semibold text-[var(--foreground)]">Admin actions</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Gunakan dengan berhati-hati untuk correction atau testing sahaja.</p>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button type="button" onClick={() => handleAdminRecordAction(row, "reset")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700 sm:w-auto">
                              <RefreshCw className="h-4 w-4" />
                              Reset Punch Record
                            </button>
                            <button type="button" onClick={() => handleAdminRecordAction(row, "delete")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 sm:w-auto">
                              <XCircle className="h-4 w-4" />
                              Delete Test Record
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {activeManualRecordId === String(row.record?.id ?? row.rosterRow.id ?? row.member?.id ?? "") ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <input type="datetime-local" value={manualAttendanceForm.check_in_at} onChange={(event) => setManualAttendanceForm((current) => ({ ...current, check_in_at: event.target.value }))} className={inputClass} />
                          <input type="datetime-local" value={manualAttendanceForm.check_out_at} onChange={(event) => setManualAttendanceForm((current) => ({ ...current, check_out_at: event.target.value }))} className={inputClass} />
                          {manualMessage ? <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--foreground)] md:col-span-2">{manualMessage}</p> : null}
                          <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <button type="button" onClick={() => saveManualAttendance(row)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white sm:w-auto">
                              <Save className="h-4 w-4" />
                              Save attendance
                            </button>
                            <button type="button" onClick={() => { setActiveManualRecordId(null); setManualAttendanceForm(emptyManualAttendanceForm); }} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                              Cancel
                            </button>
                          </div>
                          {adminRecordId ? (
                            <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
                              <p className="text-sm font-semibold text-[var(--foreground)]">Admin actions</p>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                <button type="button" onClick={() => handleAdminRecordAction(row, "reset")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-700 sm:w-auto">
                                  <RefreshCw className="h-4 w-4" />
                                  Reset Punch Record
                                </button>
                                <button type="button" onClick={() => handleAdminRecordAction(row, "delete")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 sm:w-auto">
                                  <XCircle className="h-4 w-4" />
                                  Delete Test Record
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </article>
                );
              })
            ) : (
              <EmptyState title="Roster belum diset" description="Tiada staff roster untuk tarikh dan cawangan yang dipilih." />
            )}
          </div>
        </FormSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <FormSection title="Pending adjustment requests" description="Review correction requests for missed or incorrect punches.">
          {pendingAdjustments.length ? (
            <div className="space-y-3">
              {pendingAdjustments.map((row) => (
                <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-semibold text-[var(--foreground)]">{getStaffName(row.staff_id)}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{String(row.request_type ?? "correction").replaceAll("_", " ")} · {getBranchName(row.branch_id)}</p>
                    </div>
                    <StatusBadge value={String(row.status ?? "pending")} />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)]">
                    <p><span className="font-semibold">Requested check in:</span> {formatDateTime(row.requested_check_in_at)}</p>
                    <p><span className="font-semibold">Requested check out:</span> {formatDateTime(row.requested_check_out_at)}</p>
                    <p><span className="font-semibold">Reason:</span> {String(row.reason ?? "-")}</p>
                  </div>
                  {canReviewAdjustments ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button type="button" onClick={() => handleAdjustmentDecision(row, "approved")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 sm:w-auto">
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </button>
                      <button type="button" onClick={() => handleAdjustmentDecision(row, "rejected")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 sm:w-auto">
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="Tiada pembetulan pending" description="Attendance correction requests that need review will appear here." />
          )}
          {adjustmentMessage ? <p className="mt-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{adjustmentMessage}</p> : null}
        </FormSection>

        {canManageSettings ? (
          <FormSection title="Attendance Settings" description="Set branch grace periods and simple attendance guardrails.">
            <form className="space-y-4" onSubmit={saveSettings}>
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
                <select
                  value={settingsForm.branch_id}
                  onChange={(event) => {
                    setSettingsForm((current) => ({ ...current, branch_id: event.target.value }));
                    loadSettings(event.target.value);
                  }}
                  className={inputClass}
                >
                  <option value="">Global default</option>
                  {branchRows.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Grace Minutes</span>
                  <input value={settingsForm.grace_minutes} onChange={(event) => setSettingsForm((current) => ({ ...current, grace_minutes: event.target.value }))} placeholder="10" className={inputClass} />
                  <p className="text-xs text-[var(--muted-foreground)]">Late status starts after scheduled check-in plus this grace period.</p>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Allow Early Check-In Minutes</span>
                  <input value={settingsForm.allow_early_check_in_minutes} onChange={(event) => setSettingsForm((current) => ({ ...current, allow_early_check_in_minutes: event.target.value }))} placeholder="0" className={inputClass} />
                  <p className="text-xs text-[var(--muted-foreground)]">How many minutes before shift start staff may punch in early.</p>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Auto Absent After Minutes</span>
                  <input value={settingsForm.auto_absent_after_minutes} onChange={(event) => setSettingsForm((current) => ({ ...current, auto_absent_after_minutes: event.target.value }))} placeholder="60" className={inputClass} />
                  <p className="text-xs text-[var(--muted-foreground)]">If roster exists and there is still no punch after this threshold, status becomes absent.</p>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Early Leave Grace Minutes</span>
                  <input value={settingsForm.early_leave_grace_minutes} onChange={(event) => setSettingsForm((current) => ({ ...current, early_leave_grace_minutes: event.target.value }))} placeholder="10" className={inputClass} />
                  <p className="text-xs text-[var(--muted-foreground)]">Staff will be flagged as early leave if punch out is earlier than scheduled end minus this grace period.</p>
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={settingsForm.require_note_for_late} onChange={(event) => setSettingsForm((current) => ({ ...current, require_note_for_late: event.target.checked }))} />
                Require note for late
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={settingsForm.require_note_for_adjustment} onChange={(event) => setSettingsForm((current) => ({ ...current, require_note_for_adjustment: event.target.checked }))} />
                Require note for adjustment
              </label>
              {branchSettingsSelection ? (
                <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  Editing existing settings for {getBranchName(branchSettingsSelection.branch_id)}.
                </div>
              ) : null}
              {settingsMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{settingsMessage}</p> : null}
              <button type="submit" disabled={isSavingSettings} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto">
                <Save className="h-4 w-4" />
                {isSavingSettings ? "Saving..." : "Save settings"}
              </button>
            </form>
          </FormSection>
        ) : (
          <FormSection title="Attendance Settings" description="Branch-level attendance rules are maintained by HR and super admin.">
            <div className="space-y-3">
              <div className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <p className="text-sm font-semibold text-[var(--foreground)]">Current branch grace</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{graceMinutes} minutes grace for late calculation.</p>
              </div>
              <EmptyState title="Settings read only" description="This role can review attendance settings but cannot edit them." />
            </div>
          </FormSection>
        )}

        {canViewBranchGps ? (
          <FormSection
            title="Branch GPS Settings"
            description={canManageBranchGps ? "GPS verification checks whether staff punch in/out within the branch radius." : "Operation boleh melihat tetapan GPS cawangan secara read-only."}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
                  <select
                    value={locationFilterBranchId}
                    onChange={(event) => setLocationFilterBranchId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="all">All branches</option>
                    {branchRows.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Configured branches</p>
                  <p className="mt-2 text-2xl font-semibold">{filteredBranchLocationRows.filter((row) => row.latitude !== null && row.longitude !== null).length}</p>
                </div>
              </div>

              {canManageBranchGps ? (
                <form className="space-y-4 rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/55 p-4" onSubmit={saveBranchLocation}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
                      <select
                        value={locationForm.branch_id}
                        onChange={(event) => setLocationForm((current) => ({ ...current, branch_id: event.target.value }))}
                        className={inputClass}
                        required
                      >
                        <option value="">Select branch</option>
                        {branchRows.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Radius in meters</span>
                      <input
                        value={locationForm.gps_radius_meters}
                        onChange={(event) => setLocationForm((current) => ({ ...current, gps_radius_meters: event.target.value }))}
                        placeholder="30"
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Latitude</span>
                      <input
                        value={locationForm.latitude}
                        onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))}
                        placeholder="5.123456"
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Longitude</span>
                      <input
                        value={locationForm.longitude}
                        onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))}
                        placeholder="116.123456"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]">
                    <input
                      type="checkbox"
                      checked={locationForm.is_active}
                      onChange={(event) => setLocationForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    Active
                  </label>
                  {locationMessage ? <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--foreground)]">{locationMessage}</p> : null}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="submit" disabled={isSavingLocation} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto">
                      <Save className="h-4 w-4" />
                      {isSavingLocation ? "Saving..." : "Save GPS Settings"}
                    </button>
                    {locationForm.branch_id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLocationForm(emptyLocationForm);
                          setLocationMessage(null);
                        }}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto"
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}

              <div className="space-y-3">
                {filteredBranchLocationRows.map((branch) => (
                  <article key={branch.id} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-[var(--foreground)]">{branch.name}</p>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          {branch.latitude !== null && branch.longitude !== null
                            ? `${branch.latitude}, ${branch.longitude}`
                            : "GPS belum diset"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge value={branch.latitude !== null && branch.longitude !== null ? "verified_location" : "location_unavailable"} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-[var(--muted-foreground)]">Radius: {Number(branch.gps_radius_meters ?? 30) || 30}m</p>
                    {canManageBranchGps ? (
                      <div className="mt-4">
                        <button type="button" onClick={() => startEditBranchLocation(branch)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-muted)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                          <Edit3 className="h-4 w-4" />
                          Edit GPS
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </FormSection>
        ) : null}

        {canViewNetworkIps ? (
          <FormSection
            title="Legacy IP Audit Settings"
            description={canManageNetworkIps ? "IP disimpan untuk audit lama sahaja. GPS location verification kini menjadi verifikasi utama attendance." : "Operation boleh melihat tetapan IP audit lama secara read-only."}
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
                  <select
                    value={networkFilterBranchId}
                    onChange={(event) => setNetworkFilterBranchId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="all">All branches</option>
                    {branchRows.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Active networks</p>
                  <p className="mt-2 text-2xl font-semibold">{filteredNetworkRows.filter((row) => row.is_active !== false && normalizeString(row.status) !== "inactive").length}</p>
                </div>
              </div>

              {canManageNetworkIps ? (
                <form className="space-y-4 rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/55 p-4" onSubmit={saveNetworkRow}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
                      <select
                        value={networkForm.branch_id}
                        onChange={(event) => setNetworkForm((current) => ({ ...current, branch_id: event.target.value }))}
                        className={inputClass}
                        required
                      >
                        <option value="">Select branch</option>
                        {branchRows.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">IP Address</span>
                      <input
                        value={networkForm.ip_address}
                        onChange={(event) => setNetworkForm((current) => ({ ...current, ip_address: event.target.value }))}
                        placeholder="203.0.113.10"
                        className={inputClass}
                        required
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Label</span>
                      <input
                        value={networkForm.label}
                        onChange={(event) => setNetworkForm((current) => ({ ...current, label: event.target.value }))}
                        placeholder="Main clinic WiFi"
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Notes</span>
                      <input
                        value={networkForm.notes}
                        onChange={(event) => setNetworkForm((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Reception counter network"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)]">
                    <input
                      type="checkbox"
                      checked={networkForm.is_active}
                      onChange={(event) => setNetworkForm((current) => ({ ...current, is_active: event.target.checked }))}
                    />
                    Active network IP
                  </label>
                  {networkMessage ? <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[var(--foreground)]">{networkMessage}</p> : null}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="submit" disabled={isSavingNetwork} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto">
                      <Save className="h-4 w-4" />
                      {isSavingNetwork ? "Saving..." : networkForm.id ? "Update IP" : "Add IP"}
                    </button>
                    {networkForm.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNetworkForm(emptyNetworkForm);
                          setNetworkMessage(null);
                        }}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto"
                      >
                        Cancel Edit
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}

              <div className="space-y-3">
                {filteredNetworkRows.length ? (
                  filteredNetworkRows.map((row) => {
                    const isActive = row.is_active !== false && normalizeString(row.status) !== "inactive";
                    return (
                      <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-base font-semibold text-[var(--foreground)]">{String(row.label ?? row.ip_address ?? "Clinic network")}</p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{getBranchName(row.branch_id)} · {String(row.ip_address ?? "-")}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge value={isActive ? "active" : "closed"} />
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-[var(--muted-foreground)]">{String(row.notes ?? "No notes")}</p>
                        {canManageNetworkIps ? (
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button type="button" onClick={() => startEditNetworkRow(row)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-muted)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                              <Edit3 className="h-4 w-4" />
                              Edit
                            </button>
                            {isActive ? (
                              <button type="button" onClick={() => deactivateNetworkRow(row)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 sm:w-auto">
                                <XCircle className="h-4 w-4" />
                                Deactivate
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <EmptyState title="Tiada IP rangkaian diset" description="Tambah IP rangkaian klinik untuk mula semak punch secara soft verification." />
                )}
              </div>
            </div>
          </FormSection>
        ) : null}
      </div>
    </div>
  );
}

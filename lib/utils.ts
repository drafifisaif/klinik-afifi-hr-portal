import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { TableRow } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTitleFromPath(pathname: string) {
  if (!pathname || pathname === "/") {
    return "Dashboard";
  }

  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("-", " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ");
}

export function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export function toLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function deriveColumns(rows: Record<string, unknown>[], preferred: string[] = []) {
  const firstRow = rows[0];

  if (!firstRow) {
    return preferred.map((key) => ({ key, label: toLabel(key) }));
  }

  const keys = Object.keys(firstRow);
  const orderedKeys = [
    ...preferred.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !preferred.includes(key)),
  ].slice(0, 6);

  return orderedKeys.map((key) => ({ key, label: toLabel(key) }));
}

export function isStatusLikeKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("status") || normalized.includes("state");
}

export function normalizeString(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function formatDate(value: unknown) {
  if (!value) {
    return "-";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: unknown) {
  if (!value) {
    return "-";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateInput(value: unknown) {
  if (!value) {
    return "";
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function getMalaysiaDateString(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

export function getMalaysiaDateTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function getMalaysiaDateTimeLocalInput(date = new Date()) {
  const parts = getMalaysiaDateTimeParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

interface BreakInterval {
  start: string;
  end: string;
}

function parseDateOnly(dateString: string) {
  const [year, month, day] = String(dateString).split("-").map(Number);
  return new Date(Date.UTC(year || 1970, Math.max((month || 1) - 1, 0), day || 1));
}

function addDaysToDateString(dateString: string, days: number) {
  const date = parseDateOnly(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getMalaysiaWeekday(dateString: string) {
  const date = parseDateOnly(dateString);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
  }).format(date);
}

function parseClockToMinutes(value: string) {
  const raw = String(value ?? "").trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return null;
  }

  const [hours, minutes] = raw.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function normalizeBranchCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function getBranchBreaks(branchCode: string, rosterDate: string) {
  const normalizedCode = normalizeBranchCode(branchCode);
  const weekday = getMalaysiaWeekday(rosterDate);
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  if (normalizedCode === "PUTATAN") {
    return isWeekend
      ? [{ start: "13:00", end: "14:00" }]
      : [
          { start: "12:00", end: "14:00" },
          { start: "17:00", end: "18:00" },
        ];
  }

  if (normalizedCode === "PAPAR") {
    return [
      { start: "13:00", end: "14:00" },
      { start: "17:00", end: "19:00" },
    ];
  }

  if (normalizedCode === "KINABATANGAN") {
    return [{ start: "13:00", end: "14:00" }];
  }

  return [] as BreakInterval[];
}

export function calculateNetScheduledMinutesDetails({
  branchCode,
  rosterDate,
  startTime,
  endTime,
}: {
  branchCode: string;
  rosterDate: string;
  startTime: unknown;
  endTime: unknown;
}) {
  const shiftStart = parseClockToMinutes(String(startTime ?? ""));
  const shiftEnd = parseClockToMinutes(String(endTime ?? ""));

  if (shiftStart === null || shiftEnd === null || !rosterDate) {
    return {
      grossMinutes: 0,
      breakMinutes: 0,
      netMinutes: 0,
    };
  }

  const overnight = shiftEnd <= shiftStart;
  const grossMinutes = overnight ? (24 * 60) - shiftStart + shiftEnd : shiftEnd - shiftStart;
  const shiftEndMinutes = shiftStart + grossMinutes;

  const daysToInspect = overnight ? [0, 1] : [0];
  let breakMinutes = 0;

  daysToInspect.forEach((dayOffset) => {
    const effectiveDate = addDaysToDateString(rosterDate, dayOffset);
    const breakIntervals = getBranchBreaks(branchCode, effectiveDate);

    breakIntervals.forEach((interval) => {
      const breakStart = parseClockToMinutes(interval.start);
      const breakEnd = parseClockToMinutes(interval.end);
      if (breakStart === null || breakEnd === null || breakEnd <= breakStart) {
        return;
      }

      const intervalStart = breakStart + dayOffset * 24 * 60;
      const intervalEnd = breakEnd + dayOffset * 24 * 60;
      const overlap = Math.max(0, Math.min(shiftEndMinutes, intervalEnd) - Math.max(shiftStart, intervalStart));
      breakMinutes += overlap;
    });
  });

  return {
    grossMinutes,
    breakMinutes,
    netMinutes: Math.max(grossMinutes - breakMinutes, 0),
  };
}

export function calculateNetScheduledHours({
  branchCode,
  rosterDate,
  startTime,
  endTime,
}: {
  branchCode: string;
  rosterDate: string;
  startTime: unknown;
  endTime: unknown;
}) {
  const details = calculateNetScheduledMinutesDetails({
    branchCode,
    rosterDate,
    startTime,
    endTime,
  });

  return details.netMinutes / 60;
}

export function formatMinutesAsHours(minutes: number) {
  if (minutes <= 0) {
    return "0h";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!remainder) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

export function calculateDistanceMeters(
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(firstLatitude))
      * Math.cos(toRadians(secondLatitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c);
}

export function daysUntil(dateValue: unknown) {
  if (!dateValue) {
    return null;
  }

  const target = new Date(String(dateValue));

  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function mapRowsWithId(rows: TableRow[]) {
  return rows.map<TableRow>((row, index) => ({
    ...row,
    id: row.id ?? `${row.created_at ?? row.file_url ?? row.document_name ?? index}`,
  }));
}

export function matchesBranch(row: TableRow, branchId?: string | null) {
  if (!branchId) {
    return true;
  }

  return String(row.branch_id ?? "") === branchId;
}

export function getFilename(path: unknown) {
  if (!path) {
    return "-";
  }

  const value = String(path);
  const parts = value.split("/");
  return parts[parts.length - 1] || value;
}

export function calculateLeaveDays(startDate: string, endDate: string, halfDay: boolean) {
  if (!startDate || !endDate) {
    return 0;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return halfDay ? 0.5 : dayCount;
}

export function sanitizeFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatCountdown(days: number | null) {
  if (days === null) {
    return "-";
  }

  if (days < 0) {
    return `${Math.abs(days)}d ago`;
  }

  if (days === 0) {
    return "Today";
  }

  return `${days}d left`;
}

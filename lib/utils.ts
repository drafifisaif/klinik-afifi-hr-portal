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

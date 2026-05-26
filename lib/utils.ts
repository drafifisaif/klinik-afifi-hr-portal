import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

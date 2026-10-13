import { addDaysToDateString } from "@/lib/utils";

export interface PortalDateRange { start: string; end: string }

export function isPortalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizePortalRanges(value: unknown): PortalDateRange[] {
  if (!Array.isArray(value) || !value.length || value.length > 4) throw new Error("Choose between one and four date ranges.");
  const ranges = value.map((range) => {
    if (!range || !isPortalDate(range.start) || !isPortalDate(range.end)
      || range.start > range.end || range.end > addDaysToDateString(range.start, 369)) {
      throw new Error("Choose a valid date range of up to 370 days.");
    }
    return { start: range.start as string, end: range.end as string };
  }).sort((a, b) => a.start.localeCompare(b.start));
  const merged: PortalDateRange[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= addDaysToDateString(previous.end, 1)) {
      previous.end = previous.end > range.end ? previous.end : range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function portalRangeQuery(ranges: PortalDateRange[]) {
  return new URLSearchParams({ ranges: JSON.stringify(normalizePortalRanges(ranges)) }).toString();
}

export function parsePortalRangeQuery(params: URLSearchParams) {
  const raw = params.get("ranges") ?? "";
  if (raw.length > 1024) throw new Error("Invalid date ranges.");
  return normalizePortalRanges(JSON.parse(raw));
}

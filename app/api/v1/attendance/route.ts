import { NextResponse } from "next/server";

import { apiV1Error, apiV1PageParams, apiV1PageResponse, authenticateApiV1 } from "@/lib/api-v1-auth";
import { canAccessRoute } from "@/lib/navigation";
import { normalizePortalRanges } from "@/lib/portal-date-range";
import { createAdminClient } from "@/lib/supabase/admin";

const ATTENDANCE_FIELDS = "id,staff_id,branch_id,attendance_date,check_in_at,check_out_at,status,late_minutes,scheduled_start,scheduled_end,check_in_location_status,check_out_location_status";

export async function GET(request: Request) {
  const auth = await authenticateApiV1(request);
  if (auth.error) return auth.error;
  const { supabase, role, staff, profile } = auth.context;
  if (!canAccessRoute(role, "attendance")) return apiV1Error("forbidden", "Your portal role cannot access attendance.", 403);

  const url = new URL(request.url);
  const page = apiV1PageParams(url);
  if (!page) return apiV1Error("invalid_pagination", "Use page 1–10000 and per_page 1–100.", 400);
  let ranges;
  try {
    const raw = url.searchParams.get("ranges");
    if (raw && raw.length > 1024) throw new Error("Too long");
    ranges = normalizePortalRanges(raw ? JSON.parse(raw) : [{ start: url.searchParams.get("from"), end: url.searchParams.get("to") }]);
  } catch {
    return apiV1Error("invalid_date_range", "Provide from and to dates (YYYY-MM-DD), within a maximum 370-day range.", 400);
  }

  const dateFilter = ranges.map(({ start, end }) => `and(attendance_date.gte.${start},attendance_date.lte.${end})`).join(",");
  const scope = role === "staff"
    ? { column: "staff_id", value: String(staff?.id ?? "") }
    : role === "branch_pic"
      ? { column: "branch_id", value: String(staff?.branch_id ?? profile.branch_id ?? "") }
      : null;
  if (scope && !scope.value) return NextResponse.json(apiV1PageResponse([], page.page, page.perPage, 0), { headers: { "Cache-Control": "private, no-store" } });

  const client = scope ? createAdminClient() ?? supabase : supabase;
  let query = client.from("attendance_records").select(ATTENDANCE_FIELDS, { count: "exact" }).or(dateFilter)
    .order("attendance_date", { ascending: false }).order("id").range(page.from, page.to);
  if (scope) query = query.eq(scope.column, scope.value);

  const { data, count, error } = await query;
  if (error) return apiV1Error("query_failed", "Could not load attendance records.", 500);
  return NextResponse.json(apiV1PageResponse(data ?? [], page.page, page.perPage, count), { headers: { "Cache-Control": "private, no-store" } });
}

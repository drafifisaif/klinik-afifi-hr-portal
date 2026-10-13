import { NextResponse } from "next/server";

import { apiV1Error, apiV1PageParams, apiV1PageResponse, authenticateApiV1 } from "@/lib/api-v1-auth";
import { canAccessRoute } from "@/lib/navigation";
import { normalizePortalRanges } from "@/lib/portal-date-range";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableRow } from "@/lib/types";

const ROSTER_FIELDS = "id,staff_id,branch_id,roster_date,shift_template_id,custom_start_time,custom_end_time,role_on_shift,is_published";

export async function GET(request: Request) {
  const auth = await authenticateApiV1(request);
  if (auth.error) return auth.error;
  const { supabase, role, staff, profile } = auth.context;
  if (!canAccessRoute(role, "roster")) return apiV1Error("forbidden", "Your portal role cannot access the roster.", 403);

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

  const dateFilter = ranges.map(({ start, end }) => `and(roster_date.gte.${start},roster_date.lte.${end})`).join(",");
  const scope = role === "staff"
    ? { column: "staff_id", value: String(staff?.id ?? "") }
    : role === "branch_pic"
      ? { column: "branch_id", value: String(staff?.branch_id ?? profile.branch_id ?? "") }
      : null;
  if (scope && !scope.value) return NextResponse.json(apiV1PageResponse([], page.page, page.perPage, 0), { headers: { "Cache-Control": "private, no-store" } });

  const client = scope ? createAdminClient() ?? supabase : supabase;
  let query = client.from("rosters").select(ROSTER_FIELDS, { count: "exact" }).or(dateFilter)
    .order("roster_date").order("created_at", { ascending: false }).order("id").range(page.from, page.to);
  if (scope) query = query.eq(scope.column, scope.value);

  const { data, count, error } = await query;
  if (error) return apiV1Error("query_failed", "Could not load roster records.", 500);
  return NextResponse.json(apiV1PageResponse((data ?? []) as TableRow[], page.page, page.perPage, count), { headers: { "Cache-Control": "private, no-store" } });
}

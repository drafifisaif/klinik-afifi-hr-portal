import { NextResponse } from "next/server";

import { apiV1Error, apiV1PageParams, apiV1PageResponse, authenticateApiV1 } from "@/lib/api-v1-auth";
import { canAccessRoute } from "@/lib/navigation";

const STAFF_FIELDS = "id,profile_id,branch_id,full_name,email,position,department,status";

export async function GET(request: Request) {
  const auth = await authenticateApiV1(request);
  if (auth.error) return auth.error;
  const { supabase, role, staff, profile } = auth.context;
  if (!canAccessRoute(role, "staff")) return apiV1Error("forbidden", "Your portal role cannot access the staff directory.", 403);

  const url = new URL(request.url);
  const page = apiV1PageParams(url);
  if (!page) return apiV1Error("invalid_pagination", "Use page 1–10000 and per_page 1–100.", 400);

  let query = supabase.from("staff").select(STAFF_FIELDS, { count: "exact" }).order("id").range(page.from, page.to);
  if (role === "branch_pic") {
    const branchId = String(staff?.branch_id ?? profile.branch_id ?? "").trim();
    if (!branchId) return NextResponse.json(apiV1PageResponse([], page.page, page.perPage, 0), { headers: { "Cache-Control": "private, no-store" } });
    query = query.eq("branch_id", branchId);
  }

  const { data, count, error } = await query;
  if (error) return apiV1Error("query_failed", "Could not load the staff directory.", 500);
  return NextResponse.json(apiV1PageResponse(data ?? [], page.page, page.perPage, count), { headers: { "Cache-Control": "private, no-store" } });
}

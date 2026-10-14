import { NextResponse } from "next/server";

import { authenticateApiV1, apiV1Error } from "@/lib/api-v1-auth";
import { fetchPagedRows } from "@/lib/paged-query";
import { buildOwnerSummary } from "@/lib/owner-summary";

export async function GET(request: Request) {
  const auth = await authenticateApiV1(request);
  if (auth.error) return auth.error;
  const { supabase, role, profile } = auth.context;
  if (role !== "super_admin") return apiV1Error("forbidden", "The owner summary is restricted to super admin accounts.", 403);

  const [staffResult, branchResult, feedbackResult] = await Promise.all([
    fetchPagedRows((from, to) => supabase.from("staff").select("id,profile_id,status,created_at").order("id").range(from, to)),
    fetchPagedRows((from, to) => supabase.from("branches").select("id").order("id").range(from, to)),
    fetchPagedRows((from, to) => supabase.from("feedbacks").select("id,status,priority,assigned_to").or("priority.eq.urgent,status.eq.escalated").order("id").range(from, to)),
  ]);

  if (staffResult.error || branchResult.error || feedbackResult.error) {
    return apiV1Error("query_failed", "Could not load the owner summary.", 500);
  }

  const ownerRows = feedbackResult.rows.map((row) => ({
    status: row.status,
    priority: row.priority,
    assigned_to_owner: row.assigned_to === profile.id,
  }));

  return NextResponse.json({ data: buildOwnerSummary({
    staffRows: staffResult.rows,
    branchRows: branchResult.rows,
    feedbackRows: ownerRows,
  }) }, { headers: { "Cache-Control": "private, no-store" } });
}

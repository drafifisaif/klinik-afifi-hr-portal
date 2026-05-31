import { NextResponse } from "next/server";

import { getCurrentUserContext, syncStaffProfileBranch } from "@/lib/workflows";

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context.supabase || !context.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (context.role !== "hr" && context.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    staffId?: string;
    branchId?: string | null;
  } | null;

  const staffId = String(body?.staffId ?? "").trim();
  if (!staffId) {
    return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
  }

  const branchId = typeof body?.branchId === "string" ? body.branchId.trim() : body?.branchId ?? null;

  if (typeof body?.branchId !== "undefined") {
    const { error: staffUpdateError } = await context.supabase
      .from("staff")
      .update({
        branch_id: branchId || null,
      })
      .eq("id", staffId);

    if (staffUpdateError) {
      return NextResponse.json({ error: staffUpdateError.message }, { status: 400 });
    }
  }

  const syncResult = await syncStaffProfileBranch(context.supabase, staffId);
  if (!syncResult.success) {
    return NextResponse.json({ error: syncResult.error ?? "Unable to sync branch." }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    staffId,
    profileId: syncResult.profileId,
    branchId: syncResult.branchId,
  });
}

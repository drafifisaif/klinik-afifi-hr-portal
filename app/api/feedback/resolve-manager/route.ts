import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const managerRoles = ["hr", "operation"] as const;

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in before sending feedback." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { targetType?: unknown } | null;
  const targetType = String(body?.targetType ?? "").trim().toLowerCase();
  if (!managerRoles.includes(targetType as (typeof managerRoles)[number])) {
    return NextResponse.json({ error: "Choose HR or Operation as the feedback recipient." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Feedback routing is not configured. Please contact HR." }, { status: 503 });
  }

  const [{ data: callerProfile, error: profileError }, { data: callerStaff, error: staffError }] = await Promise.all([
    admin.from("profiles").select("id,role").eq("id", user.id).maybeSingle(),
    admin.from("staff").select("id,status").eq("profile_id", user.id).maybeSingle(),
  ]);

  if (profileError || staffError) {
    console.error("[feedback-manager-resolution] Could not validate sender.");
    return NextResponse.json({ error: "Could not verify your staff account. Please try again." }, { status: 500 });
  }

  if (
    !callerProfile ||
    !["staff", "branch_pic"].includes(String(callerProfile.role ?? "")) ||
    String(callerStaff?.status ?? "").toLowerCase() !== "active"
  ) {
    return NextResponse.json({ error: "An active linked staff account is required to send feedback." }, { status: 403 });
  }

  const { data: managerProfiles, error: managerProfilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", targetType);

  if (managerProfilesError) {
    console.error("[feedback-manager-resolution] Could not find manager profiles.");
    return NextResponse.json({ error: "Could not find the selected manager. Please try again." }, { status: 500 });
  }

  const profileIds = (managerProfiles ?? []).map((profile) => String(profile.id ?? "")).filter(Boolean);
  if (!profileIds.length) {
    return NextResponse.json({ error: "No manager account is configured for this recipient." }, { status: 409 });
  }

  const { data: activeManagerRows, error: activeStaffError } = await admin
    .from("staff")
    .select("profile_id")
    .in("profile_id", profileIds)
    .eq("status", "active");

  if (activeStaffError) {
    console.error("[feedback-manager-resolution] Could not verify active manager staff rows.");
    return NextResponse.json({ error: "Could not verify the selected manager. Please try again." }, { status: 500 });
  }

  const activeManagerIds = [...new Set((activeManagerRows ?? []).map((row) => String(row.profile_id ?? "")).filter(Boolean))];
  if (activeManagerIds.length !== 1) {
    return NextResponse.json({
      error: activeManagerIds.length
        ? "More than one active manager is configured. Please contact HR before sending feedback."
        : "No active manager account is configured. Please contact HR before sending feedback.",
    }, { status: 409 });
  }

  return NextResponse.json({ success: true, managerProfileId: activeManagerIds[0] });
}

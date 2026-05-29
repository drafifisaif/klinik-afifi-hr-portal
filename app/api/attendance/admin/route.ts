import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? "");

  if (role !== "hr" && role !== "super_admin") {
    return NextResponse.json({ error: "Only HR and super admin can manage admin attendance tools." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: "reset" | "delete";
    recordId?: string;
  } | null;

  const action = body?.action;
  const recordId = String(body?.recordId ?? "").trim();

  if (!recordId || (action !== "reset" && action !== "delete")) {
    return NextResponse.json({ error: "Invalid admin attendance action." }, { status: 400 });
  }

  if (action === "delete") {
    const { error } = await supabase.from("attendance_records").delete().eq("id", recordId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Attendance record deleted." });
  }

  const { error } = await supabase
    .from("attendance_records")
    .update({
      check_in_at: null,
      check_out_at: null,
      check_in_note: null,
      check_out_note: null,
      check_in_ip: null,
      check_out_ip: null,
      check_in_network_status: null,
      check_out_network_status: null,
      status: "pending_review",
      late_minutes: 0,
      early_leave_minutes: 0,
    })
    .eq("id", recordId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: "Punch record reset." });
}

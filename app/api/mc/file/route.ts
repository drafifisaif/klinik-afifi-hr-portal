import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/workflows";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeString } from "@/lib/utils";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();

  if (!context.user || !context.profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const leaveRequestId = String(url.searchParams.get("id") ?? "").trim();

  if (!leaveRequestId) {
    return NextResponse.json({ error: "MC file id is required." }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const client = adminClient ?? context.supabase;

  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { data: leaveRow, error: leaveError } = await client
    .from("leave_requests")
    .select("id, profile_id, staff_id, branch_id, leave_type, attachment_url")
    .eq("id", leaveRequestId)
    .maybeSingle();

  if (leaveError) {
    return NextResponse.json({ error: leaveError.message }, { status: 500 });
  }

  if (!leaveRow) {
    return NextResponse.json({ error: "MC record not found." }, { status: 404 });
  }

  if (normalizeString(leaveRow.leave_type) !== "medical_leave") {
    return NextResponse.json({ error: "Requested file is not an MC attachment." }, { status: 400 });
  }

  const isHr = context.role === "hr" || context.role === "super_admin";
  const isOwner =
    String(leaveRow.profile_id ?? "") === String(context.profile.id ?? "") ||
    String(leaveRow.staff_id ?? "") === String(context.staff?.id ?? "");

  if (!isHr && !isOwner) {
    return NextResponse.json({ error: "You do not have permission to open this MC file." }, { status: 403 });
  }

  const storagePath = String(leaveRow.attachment_url ?? "").trim();
  if (!storagePath) {
    return NextResponse.json({ error: "MC file path is missing." }, { status: 404 });
  }

  const { data: signedData, error: signedError } = await client
    .storage
    .from("mc-uploads")
    .createSignedUrl(storagePath, 300);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: "Unable to open MC file." }, { status: 500 });
  }

  return NextResponse.json({ url: signedData.signedUrl });
}

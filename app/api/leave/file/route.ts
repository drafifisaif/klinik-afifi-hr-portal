import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/workflows";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeString } from "@/lib/utils";

const LEAVE_ATTACHMENT_BUCKET = "leave-attachments";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();

  if (!context.user || !context.profile) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const leaveRequestId = String(url.searchParams.get("id") ?? "").trim();

  if (!leaveRequestId) {
    return NextResponse.json({ error: "Leave file id is required." }, { status: 400 });
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
    return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
  }

  const isHr = context.role === "hr" || context.role === "super_admin";
  const isBranchPic = context.role === "branch_pic" && String(leaveRow.branch_id ?? "") === String(context.staff?.branch_id ?? context.profile.branch_id ?? "");
  const isOwner =
    String(leaveRow.profile_id ?? "") === String(context.profile.id ?? "") ||
    String(leaveRow.staff_id ?? "") === String(context.staff?.id ?? "");

  if (!isHr && !isBranchPic && !isOwner) {
    return NextResponse.json({ error: "You do not have permission to open this leave form." }, { status: 403 });
  }

  const storagePath = String(leaveRow.attachment_url ?? "").trim();
  if (!storagePath) {
    return NextResponse.json({ error: "No attachment." }, { status: 404 });
  }

  const preferredBucket =
    normalizeString(leaveRow.leave_type) === "medical_leave" && storagePath.startsWith("mc/")
      ? "mc-uploads"
      : LEAVE_ATTACHMENT_BUCKET;

  const { data: signedData, error: signedError } = await client.storage
    .from(preferredBucket)
    .createSignedUrl(storagePath, 300);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: "Unable to open leave form." }, { status: 500 });
  }

  return NextResponse.json({ url: signedData.signedUrl });
}

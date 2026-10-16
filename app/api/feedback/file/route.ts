import { NextResponse } from "next/server";

import { canViewFeedbackAttachment, FEEDBACK_ATTACHMENT_BUCKET, getFeedbackAttachments, isFeedbackAttachmentPath, safeFeedbackFilename } from "@/lib/feedback-attachments";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/workflows";
import type { TableRow } from "@/lib/types";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();
  if (!context.user || !context.profile || !context.supabase) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const feedbackId = String(url.searchParams.get("id") ?? "").trim();
  const path = String(url.searchParams.get("path") ?? "").trim();
  if (!feedbackId || !path || feedbackId.length > 100 || path.length > 500) {
    return NextResponse.json({ error: "Feedback file is required." }, { status: 400 });
  }

  const { data, error } = await context.supabase.from("feedbacks").select("*").eq("id", feedbackId).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load feedback." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Feedback not found." }, { status: 404 });

  const feedback = data as TableRow;
  const staffId = String(context.staff?.id ?? "");
  const canView = canViewFeedbackAttachment(feedback, {
    role: context.role,
    profile: context.profile,
    staffId,
    branchId: String(context.staff?.branch_id ?? context.profile.branch_id ?? ""),
  });

  if (!canView) return NextResponse.json({ error: "You cannot open this feedback file." }, { status: 403 });

  const attachment = getFeedbackAttachments(feedback.attachments).find((item) => item.path === path);
  if (!attachment || !isFeedbackAttachmentPath(path, String(feedback.submitted_by ?? ""))) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Attachment access is not configured." }, { status: 503 });
  }

  const { data: signed, error: signedError } = await adminClient.storage
    .from(FEEDBACK_ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60, { download: safeFeedbackFilename(attachment.name) });
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Unable to open attachment." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}

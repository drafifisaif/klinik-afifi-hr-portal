import { NextResponse } from "next/server";

import { filterFeedbackForManageView, getOperationVisibleFeedback } from "@/lib/data";
import { triggerFeedbackEmailNotifications, type FeedbackEmailEvent } from "@/lib/feedback-email";
import { sendFeedbackNotificationToMake } from "@/lib/make-notification";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const body = (await request.json().catch(() => null)) as {
    feedbackId?: string;
    eventType?: FeedbackEmailEvent;
    commentText?: string | null;
  } | null;

  const feedbackId = String(body?.feedbackId ?? "").trim();
  const eventType = body?.eventType;

  if (!feedbackId || !eventType || !["feedback_new", "feedback_assignment", "feedback_reply"].includes(eventType)) {
    return NextResponse.json({ error: "Invalid feedback notification payload." }, { status: 400 });
  }

  try {
    const [{ data: profile }, { data: staff }, { data: feedback }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("staff").select("*").eq("profile_id", user.id).maybeSingle(),
      supabase.from("feedbacks").select("*").eq("id", feedbackId).maybeSingle(),
    ]);

    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
    }

    const role = String(profile?.role ?? "");
    const canAccessFeedback =
      role === "hr" ||
      role === "super_admin" ||
      (role === "operation"
        ? getOperationVisibleFeedback([feedback], user.id).length > 0
        : role === "branch_pic"
          ? filterFeedbackForManageView(
              [feedback],
              "branch_pic",
              profile ?? null,
              user.id,
              String(staff?.id ?? "") || undefined,
              String(staff?.branch_id ?? profile?.branch_id ?? "") || undefined,
            ).length > 0
          : String(feedback.submitted_by ?? "") === user.id ||
            String(feedback.assigned_to ?? "") === user.id ||
            (String(feedback.target_type ?? "") === "staff" && String(feedback.target_staff_id ?? "") === String(staff?.id ?? "")));

    if (!canAccessFeedback) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const result = await triggerFeedbackEmailNotifications({
      feedbackId,
      eventType,
      actorProfileId: user.id,
      commentText: body?.commentText ?? null,
    });

    const eligibleRecipients = (result.results ?? []).filter(
      (recipient) => recipient.emailStatus === "sent" && recipient.staffId,
    );
    const staffIds = [...new Set(eligibleRecipients.map((recipient) => recipient.staffId as string))];
    const adminClient = createAdminClient();
    const submitterProfileId = String(feedback.submitted_by ?? "").trim();
    const [submitterProfileResult, submitterStaffResult] = adminClient && submitterProfileId
      ? await Promise.all([
          adminClient.from("profiles").select("full_name,email").eq("id", submitterProfileId).maybeSingle(),
          adminClient.from("staff").select("full_name,email").eq("profile_id", submitterProfileId).maybeSingle(),
        ])
      : [{ data: null, error: null }, { data: null, error: null }];
    const senderName = eventType === "feedback_reply"
      ? String(staff?.full_name ?? profile?.full_name ?? staff?.email ?? profile?.email ?? "Staf Portal HR")
      : String(
          submitterStaffResult.data?.full_name ??
          submitterProfileResult.data?.full_name ??
          submitterStaffResult.data?.email ??
          submitterProfileResult.data?.email ??
          "Staf Portal HR",
        );
    const feedbackContent = eventType === "feedback_reply"
      ? String(body?.commentText ?? "").trim()
      : String(feedback.message ?? "").trim();
    const staffResult = adminClient && staffIds.length
      ? await adminClient.from("staff").select("id,profile_id,phone,position").in("id", staffIds)
      : { data: [], error: null };
    if (staffResult.error) {
      console.error("[make-notifications] Could not resolve recipient phone numbers.");
    }

    const staffById = new Map((staffResult.data ?? []).map((row) => [String(row.id), row]));
    const makeResults = await Promise.all(eligibleRecipients.flatMap((recipient) => {
      const staffRow = staffById.get(String(recipient.staffId));
      const recipientPhone = String(staffRow?.phone ?? "").replace(/[^\d+]/g, "");
      if (!recipientPhone) return [];
      return [sendFeedbackNotificationToMake({
        eventType,
        feedbackId,
        targetType: String(feedback.target_type ?? "") || null,
        targetStaffId: String(feedback.target_staff_id ?? "") || null,
        assignedTo: String(feedback.assigned_to ?? "") || null,
        assignedDepartment: String(feedback.assigned_department ?? "") || null,
        branchId: String(feedback.branch_id ?? "") || null,
        recipientStaffId: String(recipient.staffId),
        recipientProfileId: recipient.profileId,
        recipientRole: String(staffRow?.position ?? "") || null,
        recipientPhone,
        senderName,
        feedbackTitle: String(feedback.title ?? "").trim() || null,
        feedbackContent,
      })];
    }));

    return NextResponse.json({
      success: true,
      sent: result.counts?.emailsSent ?? 0,
      suppressed: result.counts?.emailsSuppressed ?? 0,
      failed: result.counts?.emailsFailed ?? 0,
      noEmail: result.counts?.noEmail ?? 0,
      skipped: result.skipped ?? false,
      makeWebhookConfigured: makeResults.some((item) => item.configured),
      makeWebhookDelivered: makeResults.some((item) => item.delivered),
      results: result.results ?? [],
    });
  } catch (error) {
    console.error("[feedback-email]", error);
    return NextResponse.json({
      success: false,
      error: "Feedback email delivery failed.",
    });
  }
}

import { NextResponse } from "next/server";

import { filterFeedbackForManageView, getOperationVisibleFeedback } from "@/lib/data";
import { triggerFeedbackEmailNotifications } from "@/lib/feedback-email";
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
    eventType?: "feedback_new" | "feedback_assignment" | "feedback_reply";
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

    return NextResponse.json({
      success: true,
      sent: result.sent ?? 0,
      skipped: result.skipped ?? false,
    });
  } catch (error) {
    console.error("[feedback-email]", error);
    return NextResponse.json({
      success: false,
      error: "Feedback email delivery failed.",
    });
  }
}

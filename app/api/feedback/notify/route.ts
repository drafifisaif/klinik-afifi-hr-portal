import { NextResponse } from "next/server";

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

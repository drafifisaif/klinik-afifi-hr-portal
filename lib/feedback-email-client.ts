export async function triggerFeedbackEmailNotification(options: {
  feedbackId: string;
  eventType: "feedback_new" | "feedback_assignment" | "feedback_reply";
  commentText?: string | null;
}) {
  try {
    await fetch("/api/feedback/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });
  } catch {
    // Email delivery is best-effort. The feedback workflow itself should continue safely.
  }
}

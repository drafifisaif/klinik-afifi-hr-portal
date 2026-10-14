export type MakeFeedbackNotification = {
  eventType: "feedback_new" | "feedback_assignment" | "feedback_reply";
  feedbackId: string;
  targetType: string | null;
  targetStaffId: string | null;
  assignedTo: string | null;
  assignedDepartment: string | null;
  branchId: string | null;
  recipientStaffId: string;
  recipientProfileId: string | null;
  recipientRole: string | null;
  recipientPhone: string;
  senderName: string;
  feedbackTitle: string | null;
  feedbackContent: string;
};

export async function sendFeedbackNotificationToMake(payload: MakeFeedbackNotification) {
  const webhookUrl = process.env.MAKE_HR_NOTIFICATIONS_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return { configured: false, delivered: false };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    console.error("[make-notifications] Webhook URL is invalid.");
    return { configured: true, delivered: false };
  }

  if (parsedUrl.protocol !== "https:") {
    console.error("[make-notifications] Webhook URL must use HTTPS.");
    return { configured: true, delivered: false };
  }

  try {
    const eventLabel = payload.eventType === "feedback_new"
      ? "Feedback baharu"
      : payload.eventType === "feedback_assignment"
        ? "Kemaskini assignment feedback"
        : "Balasan feedback";
    const message = [
      eventLabel,
      `Dihantar oleh: ${payload.senderName}`,
      payload.feedbackTitle ? `Tajuk: ${payload.feedbackTitle}` : null,
      "Kandungan penuh:",
      payload.feedbackContent || "(Tiada kandungan)",
      "",
      "Notifikasi emel sudah dihantar. Sila semak emel dan HR Portal.",
    ].filter((line): line is string => line !== null).join("\n");

    const response = await fetch(parsedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "klinik_afifi_hr_portal",
        ...payload,
        message,
        portalUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[make-notifications] Webhook returned HTTP ${response.status}.`);
      return { configured: true, delivered: false };
    }

    return { configured: true, delivered: true };
  } catch {
    console.error("[make-notifications] Webhook delivery failed.");
    return { configured: true, delivered: false };
  }
}

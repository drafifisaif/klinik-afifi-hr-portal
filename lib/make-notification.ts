export type MakeFeedbackNotification = {
  eventType: "feedback_new" | "feedback_assignment" | "feedback_reply";
  feedbackId: string;
  recipientPhone: string;
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
    const portalUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || null;
    const message = [
      payload.eventType === "feedback_new"
        ? "Feedback baharu. E-mel notifikasi sudah dihantar."
        : payload.eventType === "feedback_assignment"
          ? "Feedback dikemas kini. E-mel notifikasi sudah dihantar."
          : "Balasan feedback baharu. E-mel notifikasi sudah dihantar.",
      portalUrl ? `Butiran: ${portalUrl}/feedback/manage` : "Sila semak HR Portal untuk butiran.",
    ].join(" ");

    const response = await fetch(parsedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "klinik_afifi_hr_portal",
        eventType: payload.eventType,
        feedbackId: payload.feedbackId,
        recipientPhone: payload.recipientPhone,
        message,
        portalUrl,
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

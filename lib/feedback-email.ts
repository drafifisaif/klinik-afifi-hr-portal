import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, TableRow, UserRole } from "@/lib/types";
import { formatDateTime, normalizeString } from "@/lib/utils";

export type FeedbackEmailEvent = "feedback_new" | "feedback_assignment" | "feedback_reply";

export type FeedbackEmailLogStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "suppressed"
  | "not_sent_no_email"
  | "skipped_duplicate";

export interface FeedbackEmailAttemptResult {
  staffId: string | null;
  profileId: string | null;
  staffName: string;
  email: string | null;
  feedbackId: string;
  taskCreated: boolean;
  notificationCreated: boolean;
  notificationStatus: "created" | "failed";
  emailStatus: FeedbackEmailLogStatus;
  resendEmailId: string | null;
  errorMessage: string | null;
  logCreated: boolean;
}

interface FeedbackRecipient {
  staffId: string | null;
  profileId: string | null;
  email: string | null;
  role: string;
  fullName: string;
  branchId: string | null;
}

function isOperationalCategory(value: unknown) {
  const normalized = normalizeString(value);
  return ["operation", "facility", "roster", "maintenance", "equipment"].includes(normalized);
}

function isBranchIssue(feedback: TableRow) {
  return Boolean(
    String(feedback.branch_id ?? "").trim() &&
      (normalizeString(feedback.target_type) === "operation" ||
        normalizeString(feedback.assigned_department) === "operation" ||
        isOperationalCategory(feedback.category)),
  );
}

function isActiveStaffStatus(value: unknown) {
  const normalized = normalizeString(value);
  return !normalized || !["inactive", "resigned"].includes(normalized);
}

function getFeedbackUrlForRole(role: string) {
  return ["hr", "operation", "super_admin"].includes(normalizeString(role))
    ? "/feedback/manage"
    : "/feedback";
}

function getRecipientSubmitterName(feedback: TableRow, submitter: FeedbackRecipient | null, recipientRole: string) {
  if (feedback.is_anonymous === true && ["branch_pic", "staff"].includes(normalizeString(recipientRole))) {
    return "Anonymous Staff";
  }

  return submitter?.fullName || submitter?.email || "Unknown User";
}

function getRecipientSubmitterRole(submitter: FeedbackRecipient | null) {
  return submitter?.role ? submitter.role.replaceAll("_", " ") : "";
}

function getEmailSubject(eventType: FeedbackEmailEvent) {
  if (eventType === "feedback_reply") {
    return "[HR Portal] Balasan Tugasan / Feedback";
  }

  return "[HR Portal] Tugasan / Feedback Baru";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailBody(options: {
  eventType: FeedbackEmailEvent;
  appUrl: string;
  branchName: string;
  feedback: TableRow;
  previewText: string;
  recipientRole: string;
  recipientName: string;
  submitter: FeedbackRecipient | null;
  actorName?: string | null;
}) {
  const title = String(options.feedback.title ?? "Feedback");
  const submitterName = getRecipientSubmitterName(options.feedback, options.submitter, options.recipientRole);
  const submitterRole = getRecipientSubmitterRole(options.submitter);
  const viewPath = getFeedbackUrlForRole(options.recipientRole);
  const href = `${options.appUrl.replace(/\/$/, "")}${viewPath}`;
  const submittedBy = submitterRole ? `${submitterName} · ${submitterRole}` : submitterName;
  const expectedAction = String(options.feedback.expected_action ?? "Sila login ke HR Portal dan semak tugasan ini.").trim();
  const intro =
    options.eventType === "feedback_reply"
      ? "Anda mempunyai balasan baharu untuk tugasan / feedback anda di HR Portal."
      : "Anda mempunyai Tugasan / Feedback baru di HR Portal.";

  const html = `
    <div style="background:#f5f8f7;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9ebe7;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 28px 16px;background:linear-gradient(135deg,#f3fbf9 0%,#ebf7f4 100%);border-bottom:1px solid #d9ebe7;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4b6470;">Klinik Afifi HR Portal</p>
          <h1 style="margin:0;font-size:24px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#425466;">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:24px 28px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#0f172a;">Salam ${escapeHtml(options.recipientName || "staff")},</p>
          <div style="border:1px solid #d7e6e2;background:#f8fbfb;border-radius:18px;padding:16px 18px;font-size:14px;line-height:1.8;color:#334155;">
            <div><strong>Branch:</strong> ${escapeHtml(options.branchName)}</div>
            <div><strong>Status:</strong> ${escapeHtml(String(options.feedback.status ?? "new").replaceAll("_", " "))}</div>
            <div><strong>Priority:</strong> ${escapeHtml(String(options.feedback.priority ?? "normal"))}</div>
            <div><strong>Daripada:</strong> ${escapeHtml(submittedBy)}</div>
            ${options.actorName ? `<div><strong>Dikemas kini oleh:</strong> ${escapeHtml(options.actorName)}</div>` : ""}
            <div><strong>Tarikh:</strong> ${escapeHtml(formatDateTime(options.feedback.created_at ?? options.feedback.updated_at))}</div>
          </div>
          <div style="margin-top:18px;border:1px solid #d7ece8;background:#eef8f6;border-radius:18px;padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#54706f;">Ringkasan mesej</p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#0f172a;">${escapeHtml(options.previewText)}</p>
          </div>
          <div style="margin-top:18px;border:1px solid #e9efe9;background:#fbfdfb;border-radius:18px;padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#54706f;">Tindakan</p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#0f172a;">${escapeHtml(expectedAction)}</p>
          </div>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:600;">Buka Tugasan / Feedback</a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  const text = [
    "Klinik Afifi HR Portal",
    "",
    intro,
    "",
    `Tajuk: ${title}`,
    `Branch: ${options.branchName}`,
    `Status: ${String(options.feedback.status ?? "new").replaceAll("_", " ")}`,
    `Priority: ${String(options.feedback.priority ?? "normal")}`,
    `Daripada: ${submittedBy}`,
    ...(options.actorName ? [`Dikemas kini oleh: ${options.actorName}`] : []),
    `Tarikh: ${formatDateTime(options.feedback.created_at ?? options.feedback.updated_at)}`,
    "",
    `Mesej: ${options.previewText}`,
    `Tindakan: ${expectedAction}`,
    "",
    `Link: ${href}`,
  ].join("\n");

  return { html, text };
}

async function ensureFeedbackEmailLogTableAvailable(supabase: NonNullable<ReturnType<typeof createAdminClient>>) {
  const probe = await supabase.from("feedback_email_logs").select("id").limit(1);
  return !probe.error;
}

function classifyEmailError(message: string): FeedbackEmailLogStatus {
  const lowered = message.toLowerCase();
  if (lowered.includes("suppressed") || lowered.includes("suppression")) {
    return "suppressed";
  }
  return "failed";
}

async function sendResendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_EMAIL_FROM;

  if (!apiKey || !from) {
    return {
      ok: false as const,
      skipped: true as const,
      status: "failed" as FeedbackEmailLogStatus,
      resendEmailId: null,
      errorMessage: "Missing RESEND_API_KEY or FEEDBACK_EMAIL_FROM.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; name?: string; error?: { message?: string; name?: string } }
    | null;

  if (!response.ok) {
    const details = String(payload?.message ?? payload?.error?.message ?? response.statusText).trim();
    return {
      ok: false as const,
      skipped: false as const,
      status: classifyEmailError(details),
      resendEmailId: null,
      errorMessage: `Resend request failed (${response.status}): ${details || response.statusText}`,
    };
  }

  return {
    ok: true as const,
    skipped: false as const,
    status: "sent" as FeedbackEmailLogStatus,
    resendEmailId: String(payload?.id ?? "").trim() || null,
    errorMessage: null,
  };
}

async function writeFeedbackEmailLog(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  logTableAvailable: boolean,
  payload: TableRow,
) {
  if (!logTableAvailable) {
    return false;
  }

  const { error } = await supabase.from("feedback_email_logs").insert(payload);
  if (error) {
    console.error("[feedback-email-log] insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return false;
  }

  return true;
}

async function createInAppNotification(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  recipient: FeedbackRecipient,
  feedback: TableRow,
  message: string,
) {
  if (!recipient.profileId) {
    return false;
  }

  const { error } = await supabase.from("notifications").insert({
    recipient_profile_id: recipient.profileId,
    recipient_email: recipient.email,
    title: "Tugasan / Feedback Baru",
    message,
    type: "feedback_new",
    related_table: "feedbacks",
    related_id: feedback.id,
    email_status: "pending",
    is_read: false,
  });

  if (error) {
    console.error("[feedback-notification] insert failed", {
      feedbackId: feedback.id,
      recipientProfileId: recipient.profileId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return false;
  }

  return true;
}

async function collectFeedbackRecipients(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  feedback: TableRow,
  eventType: FeedbackEmailEvent,
  actorProfileId?: string | null,
) {
  const branchId = String(feedback.branch_id ?? "").trim();
  const submittedBy = String(feedback.submitted_by ?? "").trim();
  const assignedTo = String(feedback.assigned_to ?? "").trim();
  const targetStaffId = String(feedback.target_staff_id ?? "").trim();

  const [targetStaffResult, submitterStaffResult, allStaffResult, branchResult] = await Promise.all([
    targetStaffId ? supabase.from("staff").select("*").eq("id", targetStaffId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    submittedBy ? supabase.from("staff").select("*").eq("profile_id", submittedBy).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("staff").select("*"),
    branchId ? supabase.from("branches").select("*").eq("id", branchId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const profileRoleQueries: string[] = [];
  if (["hr", "portal_system"].includes(normalizeString(feedback.target_type)) || eventType === "feedback_assignment") {
    profileRoleQueries.push("hr");
  }
  if (normalizeString(feedback.target_type) === "operation" || normalizeString(feedback.assigned_department) === "operation" || eventType === "feedback_assignment") {
    profileRoleQueries.push("operation");
  }
  if (isBranchIssue(feedback) && branchId) {
    profileRoleQueries.push("branch_pic");
  }

  const roleList = Array.from(new Set(profileRoleQueries));
  const { data: roleProfiles, error: roleProfileError } = roleList.length
    ? await supabase.from("profiles").select("*").in("role", roleList as UserRole[])
    : { data: [], error: null };

  if (roleProfileError) {
    throw new Error(roleProfileError.message);
  }

  const extraProfileIds = Array.from(
    new Set(
      [
        submittedBy,
        assignedTo,
        String(targetStaffResult.data?.profile_id ?? ""),
        String(actorProfileId ?? ""),
      ].filter(Boolean),
    ),
  );

  const { data: extraProfiles, error: extraProfileError } = extraProfileIds.length
    ? await supabase.from("profiles").select("*").in("id", extraProfileIds)
    : { data: [], error: null };

  if (extraProfileError) {
    throw new Error(extraProfileError.message);
  }

  const profiles = [...(roleProfiles ?? []), ...(extraProfiles ?? [])] as Profile[];
  const profileMap = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const staffRows = (allStaffResult.data ?? []) as TableRow[];
  const staffByProfileId = new Map(
    staffRows
      .filter((row) => String(row.profile_id ?? "").trim())
      .map((row) => [String(row.profile_id), row]),
  );

  const branchName = String(branchResult.data?.name ?? branchResult.data?.branch_name ?? "No branch");
  const submitterProfile = profileMap.get(submittedBy) ?? null;
  const actorProfile = profileMap.get(String(actorProfileId ?? "").trim()) ?? null;
  const submitterStaff = submitterStaffResult.data ?? staffByProfileId.get(submittedBy) ?? null;
  const submitterIdentity: FeedbackRecipient | null = submitterProfile
    ? {
        profileId: String(submitterProfile.id),
        staffId: String(submitterStaff?.id ?? "") || null,
        email: String(submitterStaff?.email ?? submitterProfile.email ?? "").trim() || null,
        role: String(submitterProfile.role ?? submitterStaff?.position ?? "").trim(),
        fullName: String(submitterProfile.full_name ?? submitterProfile.email ?? submitterStaff?.full_name ?? "Unknown User"),
        branchId: String(submitterProfile.branch_id ?? submitterStaff?.branch_id ?? "") || null,
      }
    : submitterStaff
      ? {
          profileId: String(submitterStaff.profile_id ?? "") || null,
          staffId: String(submitterStaff.id ?? "") || null,
          email: String(submitterStaff.email ?? "").trim() || null,
          role: String(submitterStaff.position ?? "").trim(),
          fullName: String(submitterStaff.full_name ?? submitterStaff.email ?? "Unknown User"),
          branchId: String(submitterStaff.branch_id ?? "") || null,
        }
      : null;

  const recipientMap = new Map<string, FeedbackRecipient>();

  function addRecipient(profile: Profile | null | undefined) {
    if (!profile?.id) {
      return;
    }

    const linkedStaff = staffByProfileId.get(String(profile.id));
    if (!isActiveStaffStatus(linkedStaff?.status)) {
      return;
    }

    const email = String(linkedStaff?.email ?? profile.email ?? "").trim() || null;
    recipientMap.set(String(profile.id), {
      profileId: String(profile.id),
      staffId: String(linkedStaff?.id ?? "") || null,
      email,
      role: String(profile.role ?? linkedStaff?.position ?? "").trim(),
      fullName: String(linkedStaff?.full_name ?? profile.full_name ?? profile.email ?? "Unknown User"),
      branchId: String(linkedStaff?.branch_id ?? profile.branch_id ?? "") || null,
    });
  }

  const targetType = normalizeString(feedback.target_type);

  if (targetType === "hr" || targetType === "portal_system") {
    (roleProfiles ?? [])
      .filter((profile) => normalizeString(profile.role) === "hr")
      .forEach((profile) => addRecipient(profile as Profile));
  }

  if (targetType === "operation" || normalizeString(feedback.assigned_department) === "operation") {
    (roleProfiles ?? [])
      .filter((profile) => normalizeString(profile.role) === "operation")
      .forEach((profile) => addRecipient(profile as Profile));
  }

  if (targetType === "staff" && targetStaffResult.data?.profile_id) {
    addRecipient(profileMap.get(String(targetStaffResult.data.profile_id)) ?? null);
  }

  if (assignedTo) {
    addRecipient(profileMap.get(assignedTo) ?? null);
  }

  if (isBranchIssue(feedback) && branchId) {
    (roleProfiles ?? [])
      .filter((profile) => normalizeString(profile.role) === "branch_pic" && String(profile.branch_id ?? "") === branchId)
      .forEach((profile) => addRecipient(profile as Profile));
  }

  if (eventType === "feedback_reply" || eventType === "feedback_assignment") {
    addRecipient(profileMap.get(submittedBy) ?? null);
  }

  if (eventType === "feedback_reply") {
    const actorId = String(actorProfileId ?? "").trim();
    if (actorId) {
      recipientMap.delete(actorId);
    }
  }

  if (eventType === "feedback_new" && submittedBy) {
    recipientMap.delete(submittedBy);
  }

  const recipients = [...recipientMap.values()].filter((recipient, index, current) => {
    const key = `${String(recipient.profileId ?? "")}:${String(recipient.email ?? "").trim().toLowerCase()}`;
    return current.findIndex((item) => `${String(item.profileId ?? "")}:${String(item.email ?? "").trim().toLowerCase()}` === key) === index;
  });

  return {
    recipients,
    branchName,
    submitterIdentity,
    actorName: String(actorProfile?.full_name ?? actorProfile?.email ?? "").trim() || null,
  };
}

export async function deliverFeedbackNotifications(options: {
  feedbackId: string;
  eventType: FeedbackEmailEvent;
  actorProfileId?: string | null;
  commentText?: string | null;
  createInAppNotification?: boolean;
  taskCreated?: boolean;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    return {
      success: false as const,
      skipped: true as const,
      reason: "Missing admin client or service role key.",
      results: [] as FeedbackEmailAttemptResult[],
      counts: {
        emailsSent: 0,
        emailsSuppressed: 0,
        emailsFailed: 0,
        noEmail: 0,
        notificationsCreated: 0,
      },
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return {
      success: false as const,
      skipped: true as const,
      reason: "Missing NEXT_PUBLIC_APP_URL.",
      results: [] as FeedbackEmailAttemptResult[],
      counts: {
        emailsSent: 0,
        emailsSuppressed: 0,
        emailsFailed: 0,
        noEmail: 0,
        notificationsCreated: 0,
      },
    };
  }

  const { data: feedback, error: feedbackError } = await supabase
    .from("feedbacks")
    .select("*")
    .eq("id", options.feedbackId)
    .maybeSingle();

  if (feedbackError || !feedback) {
    throw new Error(feedbackError?.message ?? "Feedback not found for email notification.");
  }

  const logTableAvailable = await ensureFeedbackEmailLogTableAvailable(supabase);
  const subject = getEmailSubject(options.eventType);
  const previewText =
    options.eventType === "feedback_reply" && String(options.commentText ?? "").trim()
      ? String(options.commentText ?? "").trim()
      : String(feedback.message ?? "").trim();

  const { recipients, branchName, submitterIdentity, actorName } = await collectFeedbackRecipients(
    supabase,
    feedback as TableRow,
    options.eventType,
    options.actorProfileId ?? null,
  );

  const results: FeedbackEmailAttemptResult[] = [];
  let emailsSent = 0;
  let emailsSuppressed = 0;
  let emailsFailed = 0;
  let noEmail = 0;
  let notificationsCreated = 0;

  for (const recipient of recipients) {
    const notificationCreated = options.createInAppNotification === false
      ? false
      : await createInAppNotification(
          supabase,
          recipient,
          feedback as TableRow,
          "Anda mempunyai tugasan baru daripada Admin Operasi atau HR. Sila semak di halaman Tugasan / Feedback untuk Anda.",
        );

    if (notificationCreated) {
      notificationsCreated += 1;
    }

    if (!recipient.email) {
      const logCreated = await writeFeedbackEmailLog(supabase, logTableAvailable, {
        feedback_id: feedback.id,
        target_staff_id: recipient.staffId,
        target_profile_id: recipient.profileId,
        recipient_email: null,
        email_subject: subject,
        email_status: "not_sent_no_email",
        resend_email_id: null,
        error_message: "No valid email found for the target staff.",
        sent_at: null,
      });

      noEmail += 1;
      results.push({
        staffId: recipient.staffId,
        profileId: recipient.profileId,
        staffName: recipient.fullName,
        email: null,
        feedbackId: String(feedback.id ?? ""),
        taskCreated: options.taskCreated ?? false,
        notificationCreated,
        notificationStatus: notificationCreated ? "created" : "failed",
        emailStatus: "not_sent_no_email",
        resendEmailId: null,
        errorMessage: "No valid email found for the target staff.",
        logCreated,
      });
      continue;
    }

    const body = buildEmailBody({
      eventType: options.eventType,
      appUrl,
      branchName,
      feedback: feedback as TableRow,
      previewText,
      recipientRole: recipient.role,
      recipientName: recipient.fullName,
      submitter: submitterIdentity,
      actorName,
    });

    const sendResult = await sendResendEmail({
      to: recipient.email,
      subject,
      html: body.html,
      text: body.text,
    });

    const sentAt = sendResult.ok ? new Date().toISOString() : null;
    const logCreated = await writeFeedbackEmailLog(supabase, logTableAvailable, {
      feedback_id: feedback.id,
      target_staff_id: recipient.staffId,
      target_profile_id: recipient.profileId,
      recipient_email: recipient.email,
      email_subject: subject,
      email_status: sendResult.status,
      resend_email_id: sendResult.resendEmailId,
      error_message: sendResult.errorMessage,
      sent_at: sentAt,
    });

    if (sendResult.status === "sent") {
      emailsSent += 1;
    } else if (sendResult.status === "suppressed") {
      emailsSuppressed += 1;
    } else {
      emailsFailed += 1;
    }

    results.push({
      staffId: recipient.staffId,
      profileId: recipient.profileId,
      staffName: recipient.fullName,
      email: recipient.email,
      feedbackId: String(feedback.id ?? ""),
      taskCreated: options.taskCreated ?? false,
      notificationCreated,
      notificationStatus: notificationCreated ? "created" : "failed",
      emailStatus: sendResult.status,
      resendEmailId: sendResult.resendEmailId,
      errorMessage: sendResult.errorMessage,
      logCreated,
    });
  }

  return {
    success: true as const,
    skipped: false as const,
    results,
    counts: {
      emailsSent,
      emailsSuppressed,
      emailsFailed,
      noEmail,
      notificationsCreated,
    },
  };
}

export async function triggerFeedbackEmailNotifications(options: {
  feedbackId: string;
  eventType: FeedbackEmailEvent;
  actorProfileId?: string | null;
  commentText?: string | null;
}) {
  return deliverFeedbackNotifications({
    ...options,
    createInAppNotification: false,
    taskCreated: false,
  });
}

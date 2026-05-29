import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, TableRow, UserRole } from "@/lib/types";
import { formatDateTime, normalizeString } from "@/lib/utils";

type FeedbackEmailEvent = "feedback_new" | "feedback_assignment" | "feedback_reply";

type FeedbackRecipient = {
  profileId: string;
  email: string;
  role: string;
  fullName: string;
  branchId: string | null;
};

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

function getEmailSubject(eventType: FeedbackEmailEvent, title: string) {
  if (eventType === "feedback_reply") {
    return `[Klinik Afifi HR] Feedback reply: ${title}`;
  }

  if (eventType === "feedback_assignment") {
    return `[Klinik Afifi HR] Feedback assigned: ${title}`;
  }

  return `[Klinik Afifi HR] New feedback: ${title}`;
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
  submitter: FeedbackRecipient | null;
}) {
  const title = String(options.feedback.title ?? "Feedback");
  const submitterName = getRecipientSubmitterName(options.feedback, options.submitter, options.recipientRole);
  const submitterRole = getRecipientSubmitterRole(options.submitter);
  const viewPath = getFeedbackUrlForRole(options.recipientRole);
  const href = `${options.appUrl.replace(/\/$/, "")}${viewPath}`;
  const submittedBy = submitterRole ? `${submitterName} · ${submitterRole}` : submitterName;
  const intro =
    options.eventType === "feedback_reply"
      ? "A new reply was added to a feedback thread that needs your attention."
      : options.eventType === "feedback_assignment"
        ? "A feedback item was assigned or updated in the workflow."
        : "A new feedback item was submitted in Klinik Afifi HR Portal.";

  const html = `
    <div style="background:#f5f8f7;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9ebe7;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 28px 16px;background:linear-gradient(135deg,#f3fbf9 0%,#ebf7f4 100%);border-bottom:1px solid #d9ebe7;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4b6470;">Klinik Afifi HR Portal</p>
          <h1 style="margin:0;font-size:24px;line-height:1.3;color:#0f172a;">${escapeHtml(title)}</h1>
          <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#425466;">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:24px 28px;">
          <div style="border:1px solid #d7e6e2;background:#f8fbfb;border-radius:18px;padding:16px 18px;font-size:14px;line-height:1.8;color:#334155;">
            <div><strong>Branch:</strong> ${escapeHtml(options.branchName)}</div>
            <div><strong>Status:</strong> ${escapeHtml(String(options.feedback.status ?? "new").replaceAll("_", " "))}</div>
            <div><strong>Priority:</strong> ${escapeHtml(String(options.feedback.priority ?? "normal"))}</div>
            <div><strong>Submitted by:</strong> ${escapeHtml(submittedBy)}</div>
            <div><strong>Submitted:</strong> ${escapeHtml(formatDateTime(options.feedback.created_at))}</div>
          </div>
          <div style="margin-top:18px;border:1px solid #d7ece8;background:#eef8f6;border-radius:18px;padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#54706f;">Message preview</p>
            <p style="margin:0;font-size:15px;line-height:1.7;color:#0f172a;">${escapeHtml(options.previewText)}</p>
          </div>
          <div style="margin-top:24px;">
            <a href="${escapeHtml(href)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:600;">Open Feedback</a>
          </div>
        </div>
      </div>
    </div>
  `.trim();

  const text = [
    "Klinik Afifi HR Portal",
    "",
    title,
    intro,
    "",
    `Branch: ${options.branchName}`,
    `Status: ${String(options.feedback.status ?? "new").replaceAll("_", " ")}`,
    `Priority: ${String(options.feedback.priority ?? "normal")}`,
    `Submitted by: ${submittedBy}`,
    `Submitted: ${formatDateTime(options.feedback.created_at)}`,
    "",
    `Message preview: ${options.previewText}`,
    "",
    `Open feedback: ${href}`,
  ].join("\n");

  return { html, text };
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
    return { ok: false as const, skipped: true as const };
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

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend request failed (${response.status}): ${details || response.statusText}`);
  }

  return { ok: true as const, skipped: false as const };
}

export async function triggerFeedbackEmailNotifications(options: {
  feedbackId: string;
  eventType: FeedbackEmailEvent;
  actorProfileId?: string | null;
  commentText?: string | null;
}) {
  const supabase = createAdminClient();

  if (!supabase) {
    return { success: false as const, skipped: true as const, reason: "Missing admin client or service role key." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { success: false as const, skipped: true as const, reason: "Missing NEXT_PUBLIC_APP_URL." };
  }

  const { data: feedback, error: feedbackError } = await supabase
    .from("feedbacks")
    .select("*")
    .eq("id", options.feedbackId)
    .maybeSingle();

  if (feedbackError || !feedback) {
    throw new Error(feedbackError?.message ?? "Feedback not found for email notification.");
  }

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
  if (["hr", "portal_system"].includes(normalizeString(feedback.target_type)) || options.eventType === "feedback_assignment") {
    profileRoleQueries.push("hr");
  }
  if (normalizeString(feedback.target_type) === "operation" || normalizeString(feedback.assigned_department) === "operation" || options.eventType === "feedback_assignment") {
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
        String(options.actorProfileId ?? ""),
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
  const submitterStaff = submitterStaffResult.data ?? staffByProfileId.get(submittedBy) ?? null;
  const submitterIdentity: FeedbackRecipient | null = submitterProfile
    ? {
        profileId: String(submitterProfile.id),
        email: String(submitterProfile.email ?? submitterStaff?.email ?? "").trim(),
        role: String(submitterProfile.role ?? submitterStaff?.position ?? "").trim(),
        fullName: String(submitterProfile.full_name ?? submitterProfile.email ?? submitterStaff?.full_name ?? "Unknown User"),
        branchId: String(submitterProfile.branch_id ?? submitterStaff?.branch_id ?? "") || null,
      }
    : submitterStaff
      ? {
          profileId: String(submitterStaff.profile_id ?? ""),
          email: String(submitterStaff.email ?? "").trim(),
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
    const email = String(profile.email ?? linkedStaff?.email ?? "").trim();
    if (!email) {
      return;
    }

    if (!isActiveStaffStatus(linkedStaff?.status)) {
      return;
    }

    recipientMap.set(String(profile.id), {
      profileId: String(profile.id),
      email,
      role: String(profile.role ?? linkedStaff?.position ?? "").trim(),
      fullName: String(profile.full_name ?? profile.email ?? linkedStaff?.full_name ?? "Unknown User"),
      branchId: String(profile.branch_id ?? linkedStaff?.branch_id ?? "") || null,
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

  if (options.eventType === "feedback_reply" || options.eventType === "feedback_assignment") {
    addRecipient(profileMap.get(submittedBy) ?? null);
  }

  if (options.eventType === "feedback_reply") {
    const actorProfileId = String(options.actorProfileId ?? "").trim();
    if (actorProfileId) {
      recipientMap.delete(actorProfileId);
    }
  }

  if (options.eventType === "feedback_new" && submittedBy) {
    recipientMap.delete(submittedBy);
  }

  const recipients = [...recipientMap.values()].filter((recipient, index, current) => {
    const email = recipient.email.trim().toLowerCase();
    return current.findIndex((item) => item.email.trim().toLowerCase() === email) === index;
  });
  const subject = getEmailSubject(options.eventType, String(feedback.title ?? "Feedback"));
  const previewText =
    options.eventType === "feedback_reply" && String(options.commentText ?? "").trim()
      ? String(options.commentText ?? "").trim()
      : String(feedback.message ?? "").trim();

  let sent = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      const body = buildEmailBody({
        eventType: options.eventType,
        appUrl,
        branchName,
        feedback,
        previewText,
        recipientRole: recipient.role,
        submitter: submitterIdentity,
      });

      const result = await sendResendEmail({
        to: recipient.email,
        subject,
        html: body.html,
        text: body.text,
      });

      if (!result.skipped) {
        sent += 1;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown email error";
      errors.push(`${recipient.email}: ${reason}`);
    }
  }

  return {
    success: true as const,
    sent,
    errors,
    skipped: false as const,
  };
}

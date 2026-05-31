"use client";

import { FormEvent, useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { triggerFeedbackEmailNotification } from "@/lib/feedback-email-client";
import { createClient } from "@/lib/supabase/client";
import { insertNotificationRows, resolveFeedbackNotificationRecipients } from "@/lib/notification-helpers";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { cn, formatDateTime, mapRowsWithId, normalizeString } from "@/lib/utils";

interface FeedbackWorkflowPageProps {
  assignedRows: TableRow[];
  submittedRows: TableRow[];
  commentRows: TableRow[];
  staffRows: TableRow[];
  profileRows: Profile[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

function getTargetOptions(role: UserRole) {
  if (role === "operation") {
    return ["staff", "hr", "portal_system"];
  }

  if (role === "hr") {
    return ["staff", "operation", "portal_system"];
  }

  return ["hr", "operation", "portal_system"];
}

function getCommentRoleTone(role: string) {
  const normalized = normalizeString(role);

  if (normalized === "hr" || normalized === "super_admin") {
    return "border-sky-200 bg-sky-50/80";
  }

  if (normalized === "operation") {
    return "border-amber-200 bg-amber-50/80";
  }

  if (normalized === "branch_pic") {
    return "border-teal-200 bg-teal-50/80";
  }

  return "border-slate-200 bg-slate-50/90";
}

function getFeedbackCardTone(status: string, priority: string) {
  const normalizedStatus = normalizeString(status);
  const normalizedPriority = normalizeString(priority);

  if (normalizedPriority === "urgent") {
    return "border-rose-200 bg-rose-50/75";
  }

  if (["resolved", "closed"].includes(normalizedStatus)) {
    return "border-emerald-200 bg-emerald-50/75";
  }

  if (["new", "pending", "assigned", "in_progress"].includes(normalizedStatus)) {
    return "border-amber-200 bg-amber-50/75";
  }

  return "border-[var(--border)] bg-white";
}

export function FeedbackWorkflowPage({ assignedRows, submittedRows, commentRows, staffRows, profileRows, branches, role, profile, currentStaff, error }: FeedbackWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [localComments, setLocalComments] = useState<TableRow[]>(commentRows);
  const [form, setForm] = useState({
    title: "",
    category: "general",
    message: "",
    target_type: getTargetOptions(role)[0] ?? "hr",
    target_staff_id: "",
    portal_area: "",
    expected_action: "",
    priority: "normal",
    is_anonymous: false,
  });

  const feedbackForMe = useMemo(() => mapRowsWithId(assignedRows), [assignedRows]);
  const submittedFeedback = useMemo(() => mapRowsWithId(submittedRows), [submittedRows]);
  const targetOptions = getTargetOptions(role);

  function getComments(feedbackId: string) {
    return localComments
      .filter((row) => String(row.feedback_id ?? "") === feedbackId)
      .sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")));
  }

  function getStaffName(staffId: unknown) {
    return staffRows.find((row) => String(row.id ?? "") === String(staffId ?? ""))?.full_name as string | undefined;
  }

  function getStaffBranchName(staffId: unknown) {
    const targetStaff = staffRows.find((row) => String(row.id ?? "") === String(staffId ?? ""));
    return branches.find((branch) => branch.id === String(targetStaff?.branch_id ?? ""))?.name;
  }

  function getBranchName(branchId: unknown) {
    return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "No branch";
  }

  function getSubmitterMeta(row: TableRow) {
    const submitterProfile = profileRows.find((item) => String(item.id ?? "") === String(row.submitted_by ?? ""));
    const submitterStaffByProfileId = staffRows.find((staff) => String(staff.profile_id ?? "") === String(row.submitted_by ?? ""));
    const submitterStaffByStaffId = staffRows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""));
    const submitterStaff = submitterStaffByProfileId ?? submitterStaffByStaffId ?? null;

    return {
      name: String(submitterProfile?.full_name ?? submitterProfile?.email ?? submitterStaff?.full_name ?? "Unknown User"),
      position: String(submitterProfile?.role ?? submitterStaff?.position ?? "").trim(),
      branchName: getBranchName(submitterStaff?.branch_id ?? submitterProfile?.branch_id ?? null),
    };
  }

  function getCommenterMeta(row: TableRow) {
    const commenterProfile = profileRows.find((item) => String(item.id ?? "") === String(row.comment_by ?? ""));
    const commenterStaffByProfileId = staffRows.find((staff) => String(staff.profile_id ?? "") === String(row.comment_by ?? ""));
    const commenterStaffByStaffId = staffRows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""));
    const commenterStaff = commenterStaffByProfileId ?? commenterStaffByStaffId ?? null;

    return {
      name: String(commenterProfile?.full_name ?? commenterProfile?.email ?? commenterStaff?.full_name ?? "Unknown User"),
      role: String(commenterProfile?.role ?? commenterStaff?.position ?? "").trim(),
    };
  }

  function getAssignedFeedbackBadge(row: TableRow) {
    if (String(row.assigned_to ?? "") === String(profile?.id ?? "")) {
      return "Assigned to you";
    }

    if (String(row.target_type ?? "") === "staff" && String(row.target_staff_id ?? "") === String(currentStaff?.id ?? "")) {
      return "Targeted to you";
    }

    return "For your attention";
  }

  async function addComment(event: FormEvent<HTMLFormElement>, feedback: TableRow) {
    event.preventDefault();

    if (!supabase || !profile?.id) {
      setCommentMessage("Unable to add comment right now.");
      return;
    }

    const value = commentDrafts[String(feedback.id)]?.trim();

    if (!value) {
      setCommentMessage("Write a comment before submitting.");
      return;
    }

    const payload = {
      feedback_id: feedback.id,
      comment_by: profile.id,
      comment: value,
      is_internal: false,
    };

    const { data, error: insertError } = await supabase
      .from("feedback_comments")
      .insert(payload)
      .select("*")
      .single();

    if (insertError) {
      setCommentMessage(insertError.message);
      return;
    }

    const recipients = await resolveFeedbackNotificationRecipients(supabase, {
      targetType: String(feedback.target_type ?? ""),
      targetStaffId: String(feedback.target_staff_id ?? "") || null,
      submitterProfileId: String(feedback.submitted_by ?? "") || null,
      assignedTo: String(feedback.assigned_to ?? "") || null,
      sourceProfile: profile,
    });

    await insertNotificationRows(
      supabase,
      recipients.map((recipient) => ({
        recipient_profile_id: recipient.profile_id,
        recipient_email: recipient.email,
        title: `Feedback reply: ${String(feedback.title ?? "Feedback")}`,
        message: value,
        type: "feedback_reply",
        related_table: "feedbacks",
        related_id: feedback.id,
        email_status: "pending",
        is_read: false,
      })),
    );

    await triggerFeedbackEmailNotification({
      feedbackId: String(feedback.id ?? ""),
      eventType: "feedback_reply",
      commentText: value,
    });

    setLocalComments((current) => [...current, data as TableRow]);
    setCommentDrafts((current) => ({ ...current, [String(feedback.id)]: "" }));
    setCommentMessage("Reply added.");
    router.refresh();
  }

  function renderCommentThread(feedback: TableRow) {
    const comments = getComments(String(feedback.id));

    return (
      <div className="mt-5 space-y-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Conversation</p>
          {comments.length ? (
            comments.map((comment) => {
              const commenter = getCommenterMeta(comment);
              return (
                <div key={String(comment.id ?? `${feedback.id}-${comment.created_at}`)} className={cn("rounded-2xl border px-4 py-4", getCommentRoleTone(commenter.role))}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {commenter.name}
                      {commenter.role ? ` · ${commenter.role}` : ""}
                    </p>
                    {commenter.role ? <StatusBadge value={commenter.role.replaceAll("_", " ")} /> : null}
                    {comment.is_internal === true ? <StatusBadge value="Internal" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDateTime(comment.created_at)}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{String(comment.comment ?? "-")}</p>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">No replies yet.</p>
          )}
        </div>
        <form className="space-y-3" onSubmit={(event) => addComment(event, feedback)}>
          <textarea
            value={commentDrafts[String(feedback.id)] ?? ""}
            onChange={(event) => setCommentDrafts((current) => ({ ...current, [String(feedback.id)]: event.target.value }))}
            rows={3}
            placeholder="Write a reply"
            className={textareaClass}
          />
          <button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 sm:w-auto">
            Reply
          </button>
        </form>
      </div>
    );
  }

  function renderMessageCard(messageValue: unknown) {
    return (
      <div className="mt-4 rounded-3xl border border-teal-100/80 bg-[linear-gradient(135deg,#f2fbfa_0%,#ecf8f6_100%)] px-5 py-5">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Feedback Message</p>
        <p className="mt-3 text-base leading-7 text-[var(--foreground)]">{String(messageValue ?? "-")}</p>
      </div>
    );
  }

  function renderMetadataSummary(content: string) {
    return (
      <div className="mt-4 rounded-3xl border border-teal-100/80 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-700">
        {content}
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !profile?.id || !currentStaff) {
      setMessage("A linked staff profile is required before feedback can be submitted.");
      return;
    }

    if (form.target_type === "staff" && !form.target_staff_id) {
      setMessage("Target staff not selected.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const payload = {
      title: form.title,
      category: form.category,
      message: form.message,
      target_type: form.target_type,
      target_staff_id: form.target_type === "staff" ? form.target_staff_id || null : null,
      portal_area: form.target_type === "portal_system" ? form.portal_area || null : null,
      expected_action: form.expected_action || null,
      priority: form.priority,
      is_anonymous: form.is_anonymous,
      submitted_by: profile.id,
      staff_id: currentStaff.id,
      branch_id: currentStaff.branch_id ?? profile.branch_id ?? null,
      source_type: role,
      status: "new",
    };

    const { data, error: insertError } = await supabase
      .from("feedbacks")
      .insert(payload)
      .select("id")
      .single();

    if (insertError) {
      setIsSubmitting(false);
      setMessage(insertError.message);
      return;
    }

    const recipients = await resolveFeedbackNotificationRecipients(supabase, {
      targetType: form.target_type,
      targetStaffId: form.target_staff_id || null,
      submitterProfileId: profile.id,
      sourceProfile: profile,
    });

    await insertNotificationRows(
      supabase,
      recipients.map((recipient) => ({
        recipient_profile_id: recipient.profile_id,
        recipient_email: recipient.email,
        title: `New feedback: ${form.title}`,
        message: form.message,
        type: "feedback_new",
        related_table: "feedbacks",
        related_id: data.id,
        email_status: "pending",
        is_read: false,
      })),
    );

    await triggerFeedbackEmailNotification({
      feedbackId: String(data.id ?? ""),
      eventType: "feedback_new",
    });

    setIsSubmitting(false);
    setMessage("Feedback submitted.");
    setForm({
      title: "",
      category: "general",
      message: "",
      target_type: targetOptions[0] ?? "hr",
      target_staff_id: "",
      portal_area: "",
      expected_action: "",
      priority: "normal",
      is_anonymous: false,
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load feedback data" description={error} /> : null}
      {commentMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{commentMessage}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <FormSection title="Submit feedback" description="Route feedback to HR, operations, a specific staff member, or the portal system queue.">
          {currentStaff ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Title" className={inputClass} required />
              <div className="grid gap-4 sm:grid-cols-2">
                <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className={inputClass} required />
                <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className={inputClass}>
                  {[
                    "low",
                    "normal",
                    "high",
                    "urgent",
                  ].map((priority) => (
                    <option key={priority} value={priority}>
                      {priority === "normal" ? "Normal" : priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <select value={form.target_type} onChange={(event) => setForm((current) => ({ ...current, target_type: event.target.value, target_staff_id: "", portal_area: "" }))} className={inputClass}>
                {targetOptions.map((option) => (
                  <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
                ))}
              </select>
              {form.target_type === "staff" ? (
                <select value={form.target_staff_id} onChange={(event) => setForm((current) => ({ ...current, target_staff_id: event.target.value }))} className={inputClass} required>
                  <option value="">Select target staff</option>
                  {staffRows.map((row) => (
                    <option key={String(row.id)} value={String(row.id ?? "")}>{String(row.full_name ?? row.email ?? row.id)}</option>
                  ))}
                </select>
              ) : null}
              {form.target_type === "portal_system" ? (
                <input value={form.portal_area} onChange={(event) => setForm((current) => ({ ...current, portal_area: event.target.value }))} placeholder="Portal area" className={inputClass} required />
              ) : null}
              <input value={form.expected_action} onChange={(event) => setForm((current) => ({ ...current, expected_action: event.target.value }))} placeholder="Expected action" className={inputClass} />
              <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} rows={5} placeholder="Describe the feedback" className={textareaClass} required />
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={form.is_anonymous} onChange={(event) => setForm((current) => ({ ...current, is_anonymous: event.target.checked }))} />
                Submit anonymously to viewers where supported
              </label>
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto">
                <MessageSquarePlus className="h-4 w-4" />
                {isSubmitting ? "Submitting..." : "Submit feedback"}
              </button>
            </form>
          ) : (
            <EmptyState title="Complete your staff profile first" description="A linked staff row is required before feedback can be submitted." />
          )}
        </FormSection>

        <div className="space-y-6">
          <FormSection title="Feedback Untuk Saya" description="Maklum balas yang ditujukan terus kepada anda atau telah diassign kepada akaun anda.">
            {feedbackForMe.length ? (
              <div className="space-y-4">
                {feedbackForMe.map((row) => (
                  <article key={String(row.id)} className={cn("rounded-3xl border px-5 py-5", getFeedbackCardTone(String(row.status ?? "new"), String(row.priority ?? "normal")))}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{String(row.title ?? row.subject ?? "Untitled feedback")}</h3>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                          {(() => {
                            const submitter = getSubmitterMeta(row);
                            return `From: ${submitter.name} · ${submitter.position} · ${submitter.branchName} · ${formatDateTime(row.created_at)}`;
                          })()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={getAssignedFeedbackBadge(row)} />
                        <StatusBadge value={String(row.status ?? "new")} />
                        <StatusBadge value={String(row.priority ?? "normal")} />
                      </div>
                    </div>
                    {renderMessageCard(row.message)}
                    {renderMetadataSummary(
                      `${getAssignedFeedbackBadge(row)} · Priority: ${String(row.priority ?? "normal").replaceAll("_", " ")} · Expected action: ${String(row.expected_action ?? "-")} · Target branch: ${getBranchName(row.branch_id)} · Submitted: ${formatDateTime(row.created_at)}`,
                    )}
                    {renderCommentThread(row)}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Tiada feedback untuk anda" description="Belum ada feedback yang ditujukan terus kepada anda buat masa ini." />
            )}
          </FormSection>

          <FormSection title="My submitted feedback" description="Track what you submitted, where it was routed, and the current workflow status.">
          {submittedFeedback.length ? (
            <div className="space-y-4">
              {submittedFeedback.map((row) => (
                <article key={String(row.id)} className={cn("rounded-3xl border px-5 py-5", getFeedbackCardTone(String(row.status ?? "new"), String(row.priority ?? "normal")))}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{String(row.title ?? row.subject ?? "Untitled feedback")}</h3>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{String(row.category ?? "general")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value="submitted" />
                      <StatusBadge value={String(row.status ?? "new")} />
                    </div>
                  </div>
                  {renderMessageCard(row.message)}
                  {renderMetadataSummary(
                    [
                      `Priority: ${String(row.priority ?? "normal").replaceAll("_", " ")}`,
                      `Target: ${String(row.target_type ?? "-").replaceAll("_", " ")}${String(row.target_type ?? "") === "staff" ? ` → ${getStaffName(row.target_staff_id) ?? "Target staff not selected"}` : ""}`,
                      `Expected action: ${String(row.expected_action ?? "-")}`,
                      `Target branch: ${String(row.target_type ?? "") === "staff" ? getStaffBranchName(row.target_staff_id) ?? "No branch" : getBranchName(row.branch_id)}`,
                      `Submitted: ${formatDateTime(row.created_at)}`,
                    ].join(" · "),
                  )}
                  {renderCommentThread(row)}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No feedback history yet" description="Submitted feedback will appear here after your first workflow submission." />
          )}
        </FormSection>
        </div>
      </div>
    </div>
  );
}

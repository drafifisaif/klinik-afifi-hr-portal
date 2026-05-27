"use client";

import { FormEvent, useMemo, useState } from "react";
import { ArrowRightCircle, MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { filterFeedbackForManageView } from "@/lib/data";
import { insertNotificationRows, resolveFeedbackNotificationRecipients } from "@/lib/notification-helpers";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { formatDateTime, mapRowsWithId } from "@/lib/utils";

interface FeedbackManageWorkflowPageProps {
  feedbackRows: TableRow[];
  commentRows: TableRow[];
  staffRows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  error?: string | null;
}

const inputClass =
  "h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function FeedbackManageWorkflowPage({ feedbackRows, commentRows, staffRows, branches, role, profile, currentStaff, error }: FeedbackManageWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { assigned_department: string; assigned_to: string; status: string }>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const scopedFeedback = useMemo(
    () =>
      filterFeedbackForManageView(
        mapRowsWithId(feedbackRows),
        role,
        profile,
        profile?.id ?? "",
        String(currentStaff?.id ?? "") || undefined,
      ),
    [feedbackRows, role, profile, currentStaff?.id],
  );

  function getComments(feedbackId: string) {
    return commentRows.filter((row) => String(row.feedback_id ?? "") === feedbackId);
  }

  function getSubmitter(feedback: TableRow) {
    return staffRows.find((row) => String(row.id ?? "") === String(feedback.staff_id ?? ""));
  }

  function getTargetStaff(feedback: TableRow) {
    return staffRows.find((row) => String(row.id ?? "") === String(feedback.target_staff_id ?? ""));
  }

  function canShowSubmitterIdentity(feedback: TableRow) {
    if (feedback.is_anonymous !== true) {
      return true;
    }

    if (role === "branch_pic") {
      return false;
    }

    return role === "hr" || role === "super_admin";
  }

  function getBranchName(branchId: unknown) {
    return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "Unknown Branch";
  }

  async function saveAssignment(feedback: TableRow) {
    if (!supabase || !profile?.id) {
      setMessage("Unable to update feedback right now.");
      return;
    }

    const draft = assignmentDrafts[String(feedback.id)] ?? {
      assigned_department: String(feedback.assigned_department ?? ""),
      assigned_to: String(feedback.assigned_to ?? ""),
      status: String(feedback.status ?? "assigned"),
    };

    const updatePayload = {
      assigned_department: draft.assigned_department || null,
      assigned_to: draft.assigned_to || null,
      assigned_by: profile.id,
      assigned_at: new Date().toISOString(),
      status: draft.status,
    };

    const { error: updateError } = await supabase
      .from("feedbacks")
      .update(updatePayload)
      .eq("id", feedback.id);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    const recipients = await resolveFeedbackNotificationRecipients(supabase, {
      targetType: String(feedback.target_type ?? ""),
      targetStaffId: String(feedback.target_staff_id ?? "") || null,
      submitterProfileId: String(feedback.submitted_by ?? "") || null,
      assignedTo: draft.assigned_to || null,
      sourceProfile: profile,
    });

    await insertNotificationRows(
      supabase,
      recipients.map((recipient) => ({
        recipient_profile_id: recipient.profile_id,
        recipient_email: recipient.email,
        title: `Feedback status updated: ${String(feedback.title ?? "Feedback")}`,
        message: `Status changed to ${draft.status.replaceAll("_", " ")}`,
        type: "feedback_status_update",
        related_table: "feedbacks",
        related_id: feedback.id,
        email_status: "pending",
        is_read: false,
      })),
    );

    setMessage("Feedback assignment updated.");
    router.refresh();
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
      profile_id: profile.id,
      staff_id: currentStaff?.id ?? null,
      message: value,
    };

    const { error: insertError } = await supabase.from("feedback_comments").insert(payload);

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

    setCommentMessage("Comment added.");
    setCommentDrafts((current) => ({ ...current, [String(feedback.id)]: "" }));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load feedback workflow" description={error} /> : null}
      {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
      {commentMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{commentMessage}</p> : null}

      <FormSection title="Feedback workflow" description="Assign, update, and reply to feedback using the real workflow tables.">
        {scopedFeedback.length ? (
          <div className="space-y-5">
            {scopedFeedback.map((feedback) => {
              const comments = getComments(String(feedback.id));
              const submitter = getSubmitter(feedback);
              const targetStaff = getTargetStaff(feedback);
              const showIdentity = canShowSubmitterIdentity(feedback);
              const draft = assignmentDrafts[String(feedback.id)] ?? {
                assigned_department: String(feedback.assigned_department ?? ""),
                assigned_to: String(feedback.assigned_to ?? ""),
                status: String(feedback.status ?? "new"),
              };

              return (
                <article key={String(feedback.id)} className="rounded-[28px] border border-[var(--border)] bg-white p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">{String(feedback.title ?? feedback.subject ?? "Untitled feedback")}</h3>
                        <StatusBadge value={String(feedback.status ?? "new")} />
                        {feedback.is_anonymous === true ? <StatusBadge value="Anonymous" /> : null}
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Submitted By</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">
                            {showIdentity ? String(submitter?.full_name ?? "Unknown Staff") : "Anonymous"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">
                            {showIdentity ? getBranchName(submitter?.branch_id ?? feedback.branch_id) : "Hidden"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Role / Position</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">
                            {showIdentity ? String(submitter?.position ?? submitter?.department ?? "Unknown Role") : "Hidden"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Submitted At</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">{formatDateTime(feedback.created_at)}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                        {String(feedback.category ?? "general")} · target {String(feedback.target_type ?? "-").replaceAll("_", " ")}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Target</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">{String(feedback.target_type ?? "-").replaceAll("_", " ")}</p>
                        </div>
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Target Staff</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">
                            {String(feedback.target_type ?? "") === "staff"
                              ? String(feedback.target_staff_id ?? "").trim()
                                ? String(targetStaff?.full_name ?? "Unknown Staff")
                                : "Target staff not selected"
                              : "-"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Target Branch</p>
                          <p className="mt-2 font-semibold text-[var(--foreground)]">
                            {String(feedback.target_type ?? "") === "staff"
                              ? String(feedback.target_staff_id ?? "").trim()
                                ? getBranchName(targetStaff?.branch_id ?? feedback.branch_id)
                                : "Target staff not selected"
                              : "-"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{String(feedback.message ?? "-")}</p>
                    </div>
                    <div className="grid gap-3 lg:min-w-[280px]">
                      <input value={draft.assigned_department} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [String(feedback.id)]: { ...draft, assigned_department: event.target.value } }))} placeholder="Assigned department" className={inputClass} />
                      <select value={draft.assigned_to} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [String(feedback.id)]: { ...draft, assigned_to: event.target.value } }))} className={inputClass}>
                        <option value="">Assign to user (optional)</option>
                        {staffRows.map((row) => (
                          <option key={String(row.profile_id ?? row.id)} value={String(row.profile_id ?? row.id ?? "")}>{String(row.full_name ?? row.email ?? row.id)}</option>
                        ))}
                      </select>
                      <select value={draft.status} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [String(feedback.id)]: { ...draft, status: event.target.value } }))} className={inputClass}>
                        {[
                          "new",
                          "assigned",
                          "in_progress",
                          "need_more_info",
                          "resolved",
                          "closed",
                        ].map((status) => (
                          <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => saveAssignment(feedback)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10">
                        <ArrowRightCircle className="h-4 w-4" />
                        Save workflow
                      </button>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Comments {showIdentity ? `· ${String(submitter?.full_name ?? "Unknown Staff")}` : "· Anonymous"}
                      </h4>
                      {comments.length ? (
                        comments.map((comment) => (
                          <div key={String(comment.id ?? `${feedback.id}-${comment.created_at}`)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4">
                            <p className="text-sm text-[var(--foreground)]">{String(comment.message ?? comment.comment ?? "-")}</p>
                            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{formatDateTime(comment.created_at)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--muted-foreground)]">No comments yet.</p>
                      )}
                    </div>
                    <form className="space-y-3" onSubmit={(event) => addComment(event, feedback)}>
                      <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Add reply</h4>
                      <textarea value={commentDrafts[String(feedback.id)] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [String(feedback.id)]: event.target.value }))} rows={4} placeholder="Write a feedback reply or internal comment" className={textareaClass} />
                      <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25">
                        <MessageSquareReply className="h-4 w-4" />
                        Add comment
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No feedback items available" description="Relevant feedback assignments and targeted items will appear here automatically." />
        )}
      </FormSection>
    </div>
  );
}

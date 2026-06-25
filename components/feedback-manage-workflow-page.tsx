"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { ArrowRightCircle, ChevronDown, MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { filterFeedbackForManageView } from "@/lib/data";
import { triggerFeedbackEmailNotification } from "@/lib/feedback-email-client";
import { insertNotificationRows, resolveFeedbackNotificationRecipients } from "@/lib/notification-helpers";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { cn, formatDateTime, mapRowsWithId, normalizeString } from "@/lib/utils";

interface FeedbackManageWorkflowPageProps {
  feedbackRows: TableRow[];
  commentRows: TableRow[];
  staffRows: TableRow[];
  profileRows: Profile[];
  assignmentProfiles: Profile[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  error?: string | null;
}

const inputClass =
  "h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

function getStatusPanelClass(status: string) {
  const normalized = normalizeString(status);

  if (normalized === "escalated") {
    return "border-rose-200 bg-rose-50/70";
  }

  if (["resolved", "closed"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50/60";
  }

  if (normalized === "need_more_info") {
    return "border-sky-200 bg-sky-50/70";
  }

  if (["new", "pending", "assigned", "in_progress"].includes(normalized)) {
    return "border-amber-200 bg-amber-50/70";
  }

  return "border-[var(--border)] bg-white";
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

export function FeedbackManageWorkflowPage({ feedbackRows, commentRows, staffRows, profileRows, assignmentProfiles, branches, role, profile, currentStaff, emptyStateTitle, emptyStateDescription, error }: FeedbackManageWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [commentMessage, setCommentMessage] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { assigned_department: string; assigned_to: string; status: string }>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [internalDrafts, setInternalDrafts] = useState<Record<string, boolean>>({});
  const [localComments, setLocalComments] = useState<TableRow[]>(commentRows);
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null);

  const scopedFeedback = useMemo(
    () =>
      filterFeedbackForManageView(
        mapRowsWithId(feedbackRows),
        role,
        profile,
        profile?.id ?? "",
        String(currentStaff?.id ?? "") || undefined,
        String(currentStaff?.branch_id ?? profile?.branch_id ?? "") || undefined,
      ),
    [feedbackRows, role, profile, currentStaff?.id, currentStaff?.branch_id],
  );

  const getBranchName = useCallback((branchId: unknown) => {
    return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "No branch";
  }, [branches]);

  const assignmentOptions = useMemo(() => {
    return assignmentProfiles
      .map((candidate) => {
        const linkedStaff = staffRows.find((row) => String(row.profile_id ?? "") === String(candidate.id ?? ""));
        const staffStatus = normalizeString(linkedStaff?.status);
        if (staffStatus === "inactive" || staffStatus === "resigned") {
          return null;
        }

        const candidateRole = normalizeString(candidate.role);
        if (!["staff", "branch_pic", "operation", "hr"].includes(candidateRole)) {
          return null;
        }

        const branchName = getBranchName(candidate.branch_id ?? linkedStaff?.branch_id ?? null);
        const fullName = String(candidate.full_name ?? linkedStaff?.full_name ?? candidate.email ?? "Unknown User");
        return {
          value: String(candidate.id),
          role: candidateRole,
          label: `${fullName} · ${candidateRole.replaceAll("_", " ")} · ${branchName}`,
        };
      })
      .filter((option): option is { value: string; role: string; label: string } => Boolean(option))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [assignmentProfiles, getBranchName, staffRows]);

  function getComments(feedbackId: string) {
    return localComments
      .filter((row) => String(row.feedback_id ?? "") === feedbackId)
      .sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")));
  }

  function getSubmitter(feedback: TableRow) {
    const submitterProfile = profileRows.find((item) => String(item.id ?? "") === String(feedback.submitted_by ?? ""));
    const submitterStaffByProfileId = staffRows.find((row) => String(row.profile_id ?? "") === String(feedback.submitted_by ?? ""));
    const submitterStaffByStaffId = staffRows.find((row) => String(row.id ?? "") === String(feedback.staff_id ?? ""));
    const submitterStaff = submitterStaffByProfileId ?? submitterStaffByStaffId ?? null;

    return {
      name: String(submitterProfile?.full_name ?? submitterProfile?.email ?? submitterStaff?.full_name ?? "Unknown User"),
      role: String(submitterProfile?.role ?? submitterStaff?.position ?? "").trim(),
      branchId: submitterStaff?.branch_id ?? submitterProfile?.branch_id ?? null,
    };
  }

  function getTargetStaff(feedback: TableRow) {
    return staffRows.find((row) => String(row.id ?? "") === String(feedback.target_staff_id ?? ""));
  }

  function getCommenter(comment: TableRow) {
    const commenterProfile = profileRows.find((item) => String(item.id ?? "") === String(comment.comment_by ?? ""));
    const commenterStaffByProfileId = staffRows.find((row) => String(row.profile_id ?? "") === String(comment.comment_by ?? ""));
    const commenterStaffByStaffId = staffRows.find((row) => String(row.id ?? "") === String(comment.staff_id ?? ""));
    const commenterStaff = commenterStaffByProfileId ?? commenterStaffByStaffId ?? null;

    return {
      name: String(commenterProfile?.full_name ?? commenterProfile?.email ?? commenterStaff?.full_name ?? "Unknown User"),
      role: String(commenterProfile?.role ?? commenterStaff?.position ?? "").trim(),
    };
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

  function getAssignedUserName(assignedTo: unknown) {
    const assignedProfile = assignmentProfiles.find((item) => String(item.id ?? "") === String(assignedTo ?? ""));
    const assignedStaff = staffRows.find((row) => String(row.profile_id ?? "") === String(assignedTo ?? ""));
    return String(assignedProfile?.full_name ?? assignedStaff?.full_name ?? assignedProfile?.email ?? "").trim();
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
        title: draft.status === "escalated"
          ? `Feedback escalated: ${String(feedback.title ?? "Feedback")}`
          : String(feedback.assigned_to ?? "") && String(feedback.assigned_to ?? "") !== draft.assigned_to
            ? `Feedback reassigned: ${String(feedback.title ?? "Feedback")}`
            : `Feedback assignment updated: ${String(feedback.title ?? "Feedback")}`,
        message: draft.status === "escalated"
          ? `Escalated to ${draft.assigned_department || "next team"}`
          : `Status changed to ${draft.status.replaceAll("_", " ")}`,
        type: "feedback_status_update",
        related_table: "feedbacks",
        related_id: feedback.id,
        email_status: "pending",
        is_read: false,
      })),
    );

    await triggerFeedbackEmailNotification({
      feedbackId: String(feedback.id ?? ""),
      eventType: "feedback_assignment",
    });

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
      comment_by: profile.id,
      comment: value,
      is_internal: internalDrafts[String(feedback.id)] === true,
    };

    const { data, error: insertError } = await supabase.from("feedback_comments").insert(payload).select("*").single();

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

    setCommentMessage("Comment added.");
    setLocalComments((current) => [...current, data as TableRow]);
    setCommentDrafts((current) => ({ ...current, [String(feedback.id)]: "" }));
    setInternalDrafts((current) => ({ ...current, [String(feedback.id)]: false }));
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
              const feedbackId = String(feedback.id ?? "");
              const comments = getComments(feedbackId);
              const submitter = getSubmitter(feedback);
              const targetStaff = getTargetStaff(feedback);
              const showIdentity = canShowSubmitterIdentity(feedback);
              const submitterSummary = showIdentity
                ? `${submitter.name}${submitter.role ? ` · ${submitter.role}` : ""} · ${getBranchName(submitter.branchId)}`
                : "Anonymous · Hidden · Hidden";
              const targetSummary = String(feedback.target_type ?? "") === "staff"
                ? String(feedback.target_staff_id ?? "").trim()
                  ? `${String(targetStaff?.full_name ?? "Unknown User")} · ${getBranchName(targetStaff?.branch_id ?? feedback.branch_id)}`
                  : "Target staff not selected"
                : String(feedback.target_type ?? "-").replaceAll("_", " ");
              const draft = assignmentDrafts[feedbackId] ?? {
                assigned_department: String(feedback.assigned_department ?? ""),
                assigned_to: String(feedback.assigned_to ?? ""),
                status: String(feedback.status ?? "new"),
              };
              const latestComment = comments[comments.length - 1] ?? null;
              const assignedUserName = getAssignedUserName(feedback.assigned_to);
              const lastUpdatedAt = String(latestComment?.created_at ?? feedback.updated_at ?? feedback.created_at ?? "");
              const isExpanded = expandedFeedbackId === feedbackId;

              return (
                <article
                  key={feedbackId}
                  className={cn(
                    "rounded-[28px] border shadow-[0_18px_45px_rgba(18,42,44,0.04)] transition duration-300",
                    getStatusPanelClass(String(feedback.status ?? "new")),
                    isExpanded && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedFeedbackId((current) => (current === feedbackId ? null : feedbackId))}
                    aria-expanded={isExpanded}
                    className="flex w-full items-start justify-between gap-4 rounded-[28px] px-5 py-5 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(18,42,44,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">{String(feedback.title ?? feedback.subject ?? "Untitled feedback")}</h3>
                        <StatusBadge value={String(feedback.status ?? "new")} />
                        {normalizeString(feedback.priority) ? <StatusBadge value={String(feedback.priority ?? "normal")} /> : null}
                        {feedback.is_anonymous === true ? <StatusBadge value="Anonymous" /> : null}
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-[var(--muted-foreground)] md:grid-cols-2 xl:grid-cols-3">
                        <p><span className="font-semibold text-[var(--foreground)]">Submitted by:</span> {submitterSummary}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Target / department:</span> {String(feedback.target_type ?? "-").replaceAll("_", " ")}{String(feedback.target_type ?? "") === "staff" ? ` → ${targetSummary}` : ` · ${String(feedback.assigned_department ?? "-").replaceAll("_", " ")}`}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Assigned user:</span> {assignedUserName || "Unassigned"}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Branch:</span> {getBranchName(feedback.branch_id)}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Submitted:</span> {formatDateTime(feedback.created_at)}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Last updated:</span> {formatDateTime(lastUpdatedAt)}</p>
                        <p><span className="font-semibold text-[var(--foreground)]">Replies:</span> {comments.length}</p>
                      </div>
                    </div>
                    <ChevronDown className={cn("mt-1 h-5 w-5 shrink-0 text-[var(--muted-foreground)] transition duration-300", isExpanded && "rotate-180")} />
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-white/70 px-5 pb-5 pt-5">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="rounded-3xl border border-teal-100/80 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600">
                            <p>
                              <span className="font-semibold text-slate-800">Submitted by:</span>{" "}
                              {submitterSummary}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold text-slate-800">Target:</span>{" "}
                              {String(feedback.target_type ?? "-").replaceAll("_", " ")}
                              {String(feedback.target_type ?? "") === "staff" ? ` → ${targetSummary}` : ""}
                            </p>
                            <p className="mt-1">
                              <span className="font-semibold text-slate-800">Submitted:</span>{" "}
                              {formatDateTime(feedback.created_at)}
                            </p>
                          </div>
                          <div className="mt-4 rounded-3xl border border-white/80 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(18,42,44,0.04)]">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Feedback Message</p>
                            <p className="mt-3 text-base leading-7 text-[var(--foreground)]">{String(feedback.message ?? "-")}</p>
                          </div>
                        </div>
                        <div className="grid gap-3 lg:min-w-[280px] lg:max-w-[300px]">
                          <select value={draft.assigned_department} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [feedbackId]: { ...draft, assigned_department: event.target.value } }))} className={inputClass}>
                            <option value="">Assigned department</option>
                            {["staff", "branch_pic", "operation", "hr"].map((department) => (
                              <option key={department} value={department}>{department.replaceAll("_", " ")}</option>
                            ))}
                          </select>
                          <select value={draft.assigned_to} onChange={(event) => {
                            const selectedProfileId = event.target.value;
                            const selectedOption = assignmentOptions.find((option) => option.value === selectedProfileId);
                            setAssignmentDrafts((current) => ({
                              ...current,
                              [feedbackId]: {
                                ...draft,
                                assigned_to: selectedProfileId,
                                assigned_department: selectedOption?.role ?? draft.assigned_department,
                              },
                            }));
                          }} className={inputClass}>
                            <option value="">Assign to user (optional)</option>
                            {assignmentOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <select value={draft.status} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [feedbackId]: { ...draft, status: event.target.value } }))} className={inputClass}>
                            {["new", "assigned", "in_progress", "need_more_info", "resolved", "closed", "escalated"].map((status) => (
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
                            Comments {showIdentity ? `· ${submitter.name}` : "· Anonymous"}
                          </h4>
                          {comments.length ? (
                            comments.map((comment) => {
                              const commenter = getCommenter(comment);
                              return (
                                <div key={String(comment.id ?? `${feedback.id}-${comment.created_at}`)} className={cn("rounded-2xl border px-4 py-4", getCommentRoleTone(commenter.role))}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-[var(--foreground)]">
                                      {commenter.role ? `${commenter.name} · ${commenter.role}` : commenter.name}
                                    </p>
                                    {commenter.role ? <StatusBadge value={commenter.role.replaceAll("_", " ")} /> : null}
                                    {comment.is_internal === true ? <StatusBadge value="Internal" /> : null}
                                  </div>
                                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">{formatDateTime(comment.created_at)}</p>
                                  <p className="mt-3 text-sm text-[var(--foreground)]">{String(comment.comment ?? "-")}</p>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-[var(--muted-foreground)]">No comments yet.</p>
                          )}
                        </div>
                        <form className="space-y-3" onSubmit={(event) => addComment(event, feedback)}>
                          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Add reply</h4>
                          <textarea value={commentDrafts[feedbackId] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [feedbackId]: event.target.value }))} rows={4} placeholder="Write a feedback reply or internal comment" className={textareaClass} />
                          {(role === "hr" || role === "operation" || role === "super_admin") ? (
                            <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                              <input
                                type="checkbox"
                                checked={internalDrafts[feedbackId] === true}
                                onChange={(event) => setInternalDrafts((current) => ({ ...current, [feedbackId]: event.target.checked }))}
                              />
                              Mark as internal comment
                            </label>
                          ) : null}
                          <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25">
                            <MessageSquareReply className="h-4 w-4" />
                            Add comment
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title={emptyStateTitle ?? "No feedback items available"} description={emptyStateDescription ?? "Relevant feedback assignments and targeted items will appear here automatically."} />
        )}
      </FormSection>
    </div>
  );
}

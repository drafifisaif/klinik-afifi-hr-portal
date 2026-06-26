"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, ExternalLink, Pencil, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { LeaveBalancePanel } from "@/components/leave-balance-panel";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { buildLeaveBalanceSummary, filterLeaveRequestsForRole } from "@/lib/data";
import type { BranchOption, LeaveBalanceSummary, Profile, TableRow, UserRole } from "@/lib/types";
import {
  calculateLeaveDays,
  cn,
  formatDate,
  formatDateInput,
  formatDateTime,
  getFilename,
  getMalaysiaDateString,
  mapRowsWithId,
  normalizeString,
  sanitizeFilename,
} from "@/lib/utils";

interface LeaveWorkflowPageProps {
  leaveRequests: TableRow[];
  entitlements: TableRow[];
  staffRows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  initialStatusFilter?: string | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

const collapsibleButtonClass =
  "flex w-full items-center justify-between gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-left transition duration-200 hover:-translate-y-[2px] hover:shadow-[0_18px_45px_rgba(18,42,44,0.08)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

const emptyLeaveForm = {
  leave_type: "annual_leave",
  start_date: "",
  end_date: "",
  half_day: false,
  reason: "",
  attachment_url: "",
};

const LEAVE_ATTACHMENT_BUCKET = "leave-attachments";
const LEAVE_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const MAX_LEAVE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function getEntitlementForStaff(rows: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  const matchedRows = rows.filter((row) => String(row.staff_id ?? "") === String(staffId));
  return matchedRows.sort((left, right) => Number(right.entitlement_year ?? 0) - Number(left.entitlement_year ?? 0))[0] ?? null;
}

export function LeaveWorkflowPage({
  leaveRequests,
  entitlements,
  staffRows,
  branches,
  role,
  profile,
  currentStaff,
  initialStatusFilter,
  error,
}: LeaveWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [entitlementMessage, setEntitlementMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEntitlementSaving, setIsEntitlementSaving] = useState(false);
  const [isOpeningAttachment, setIsOpeningAttachment] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [expandedLeaveId, setExpandedLeaveId] = useState<string | null>(null);
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState(false);
  const [isEntitlementSectionOpen, setIsEntitlementSectionOpen] = useState(false);
  const [leaveFormFile, setLeaveFormFile] = useState<File | null>(null);
  const [leaveFormError, setLeaveFormError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyLeaveForm);
  const [selectedStaffId, setSelectedStaffId] = useState(String(currentStaff?.id ?? staffRows[0]?.id ?? ""));
  const [entitlementForm, setEntitlementForm] = useState(() => {
    const currentEntitlement = getEntitlementForStaff(entitlements, String(currentStaff?.id ?? staffRows[0]?.id ?? ""));
    return {
      entitlement_year: String(currentEntitlement?.entitlement_year ?? new Date().getFullYear()),
      annual_leave_total: String(currentEntitlement?.annual_leave_total ?? 0),
      medical_leave_total: String(currentEntitlement?.medical_leave_total ?? 0),
      annual_leave_opening_used: String(currentEntitlement?.annual_leave_opening_used ?? 0),
      medical_leave_opening_used: String(currentEntitlement?.medical_leave_opening_used ?? 0),
      opening_balance_note: String(currentEntitlement?.opening_balance_note ?? ""),
      effective_from: String(currentEntitlement?.effective_from ?? ""),
      effective_to: String(currentEntitlement?.effective_to ?? ""),
    };
  });

  const canReview = role === "super_admin" || role === "hr" || role === "branch_pic";
  const canManageEntitlements = role === "super_admin" || role === "hr";
  const isHrView = role === "super_admin" || role === "hr";
  const isBranchPicView = role === "branch_pic";
  const scopedRows = useMemo(
    () =>
      filterLeaveRequestsForRole(
        mapRowsWithId(leaveRequests),
        role,
        profile,
        profile?.id ?? "",
        String(currentStaff?.id ?? "") || undefined,
        String(currentStaff?.branch_id ?? profile?.branch_id ?? "") || undefined,
      ),
    [leaveRequests, role, profile, currentStaff?.id, currentStaff?.branch_id],
  );

  const selectedStaff = staffRows.find((row) => String(row.id ?? "") === selectedStaffId) ?? currentStaff;
  const selectedEntitlement = getEntitlementForStaff(entitlements, String(selectedStaff?.id ?? ""));
  const selectedLeaveRows = leaveRequests.filter((row) => String(row.staff_id ?? "") === String(selectedStaff?.id ?? ""));
  const balanceSummary: LeaveBalanceSummary = buildLeaveBalanceSummary(selectedEntitlement, selectedLeaveRows);
  const totalDays = calculateLeaveDays(form.start_date, form.end_date, form.half_day);
  const ownRows = scopedRows.filter((row) => String(row.staff_id ?? "") === String(currentStaff?.id ?? ""));
  const reviewQueueRows = isBranchPicView
    ? scopedRows.filter((row) => String(row.staff_id ?? "") !== String(currentStaff?.id ?? ""))
    : scopedRows;
  const normalizedStatusFilter = normalizeString(initialStatusFilter);
  const filteredReviewRows = normalizedStatusFilter
    ? (isBranchPicView ? reviewQueueRows : scopedRows).filter((row) => normalizeString(row.status) === normalizedStatusFilter)
    : (isBranchPicView ? reviewQueueRows : scopedRows);
  const groupedReviewRows = useMemo(() => {
    const sourceRows = filteredReviewRows.slice();
    const weight = (status: string) => {
      const normalized = normalizeString(status);
      if (normalized === "pending") return 0;
      if (["approved", "resolved"].includes(normalized)) return 1;
      if (["rejected", "cancelled", "closed"].includes(normalized)) return 2;
      return 0;
    };

    return sourceRows.sort((left, right) => {
      const byStatus = weight(String(left.status ?? "")) - weight(String(right.status ?? ""));
      if (byStatus !== 0) {
        return byStatus;
      }

      const leftTime = new Date(String(left.updated_at ?? left.created_at ?? left.submitted_at ?? 0)).getTime();
      const rightTime = new Date(String(right.updated_at ?? right.created_at ?? right.submitted_at ?? 0)).getTime();
      return rightTime - leftTime;
    });
  }, [filteredReviewRows]);
  const pendingRows = groupedReviewRows.filter((row) => normalizeString(row.status) === "pending");
  const approvedRows = groupedReviewRows.filter((row) => ["approved", "resolved"].includes(normalizeString(row.status)));
  const archivedRows = groupedReviewRows.filter((row) =>
    ["rejected", "cancelled", "closed"].includes(normalizeString(row.status)),
  );

  useEffect(() => {
    if (editingLeaveId) {
      setIsCreateSectionOpen(true);
    }
  }, [editingLeaveId]);

  function getBranchName(branchId: unknown) {
    return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "No branch";
  }

  function getStaffName(staffId: unknown) {
    return String(staffRows.find((row) => String(row.id ?? "") === String(staffId ?? ""))?.full_name ?? staffId ?? "Unknown User");
  }

  function getBalanceForStaff(staffId: unknown) {
    const staffEntitlement = getEntitlementForStaff(entitlements, String(staffId ?? ""));
    const staffLeaveRows = leaveRequests.filter((row) => String(row.staff_id ?? "") === String(staffId ?? ""));
    return buildLeaveBalanceSummary(staffEntitlement, staffLeaveRows);
  }

  function resetLeaveForm() {
    setEditingLeaveId(null);
    setForm(emptyLeaveForm);
    setLeaveFormFile(null);
    setLeaveFormError(null);
  }

  function canEditOwnLeave(row: TableRow) {
    return String(row.staff_id ?? "") === String(currentStaff?.id ?? "") && normalizeString(row.status) === "pending";
  }

  function startEditLeave(row: TableRow) {
    if (!canEditOwnLeave(row)) {
      return;
    }

    setEditingLeaveId(String(row.id ?? ""));
    setExpandedLeaveId(String(row.id ?? ""));
    setForm({
      leave_type: String(row.leave_type ?? "annual_leave"),
      start_date: formatDateInput(row.start_date),
      end_date: formatDateInput(row.end_date),
      half_day: row.half_day === true,
      reason: String(row.reason ?? ""),
      attachment_url: String(row.attachment_url ?? ""),
    });
    setLeaveFormFile(null);
    setLeaveFormError(null);
    setMessage(null);
  }

  function validateLeaveFormFile(file: File | null) {
    if (!file) {
      return "Sila upload borang cuti sebelum menghantar permohonan.";
    }

    const validTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
    const fileName = String(file.name ?? "").toLowerCase();
    const hasValidExtension = [".pdf", ".jpg", ".jpeg", ".png"].some((extension) => fileName.endsWith(extension));

    if ((file.type && !validTypes.has(file.type)) || (!file.type && !hasValidExtension)) {
      return "Fail tidak sah. Sila upload PDF, JPG, JPEG, atau PNG sahaja.";
    }

    if (file.size > MAX_LEAVE_ATTACHMENT_BYTES) {
      return "Fail terlalu besar. Sila upload fail 5MB atau kurang.";
    }

    return null;
  }

  function handleLeaveFormFileChange(file: File | null) {
    setLeaveFormFile(file);
    setLeaveFormError(validateLeaveFormFile(file));
  }

  async function handleOpenAttachment(rowId: string) {
    setReviewMessage(null);
    setMessage(null);
    setIsOpeningAttachment(rowId);

    try {
      const response = await fetch(`/api/leave/file?id=${encodeURIComponent(rowId)}`, {
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.url) {
        setReviewMessage(String(result?.error ?? "Unable to open leave form."));
        return;
      }

      window.open(String(result.url), "_blank", "noopener,noreferrer");
    } catch {
      setReviewMessage("Unable to open leave form.");
    } finally {
      setIsOpeningAttachment(null);
    }
  }

  function renderInlineBalance(summary: LeaveBalanceSummary) {
    return (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/75 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Annual Leave</p>
          <div className="mt-3 grid gap-2 text-sm text-[var(--foreground)] sm:grid-cols-2">
            <p>Total: {summary.annual.total}</p>
            <p>Used: {summary.annual.openingUsed + summary.annual.portalUsed}</p>
            <p>Used Before Portal: {summary.annual.openingUsed}</p>
            <p>Remaining: {summary.annual.remaining}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white/75 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Medical Leave</p>
          <div className="mt-3 grid gap-2 text-sm text-[var(--foreground)] sm:grid-cols-2">
            <p>Total: {summary.medical.total}</p>
            <p>Used: {summary.medical.openingUsed + summary.medical.portalUsed}</p>
            <p>Used Before Portal: {summary.medical.openingUsed}</p>
            <p>Remaining: {summary.medical.remaining}</p>
          </div>
        </div>
      </div>
    );
  }

  function renderLeaveCards(rows: TableRow[], emptyTitle: string, emptyDescription: string, mode: "pending" | "approved" | "archived" | "personal" = "pending") {
    if (!rows.length) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
      <div className="space-y-4">
        {rows.map((row) => {
          const summary = getBalanceForStaff(row.staff_id);
          const normalizedStatus = normalizeString(row.status);
          const isExpanded = expandedLeaveId === String(row.id ?? "");
          const isApprovedView = mode === "approved";
          const isArchivedView = mode === "archived";
          const isPendingView = mode === "pending";
          const cardTone = isPendingView
            ? "border-amber-200 bg-amber-50/70"
            : isApprovedView
              ? "border-emerald-200 bg-emerald-50/45"
              : isArchivedView
                ? "border-slate-200 bg-slate-50/80"
                : ["approved", "resolved", "closed"].includes(normalizedStatus)
                  ? "border-emerald-200 bg-emerald-50/55"
                  : "border-[var(--border)] bg-white";
          const metaText = row.updated_at || row.created_at || row.submitted_at;
          const compactDateLabel =
            normalizedStatus === "approved" && row.reviewed_at
              ? `Approved ${formatDateTime(row.reviewed_at)}`
              : metaText
                ? `Updated ${formatDateTime(metaText)}`
                : null;

          return (
            <article
              key={String(row.id)}
              className={cn(
                "rounded-[28px] border p-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)] transition duration-200",
                cardTone,
                isExpanded ? "ring-2 ring-[var(--ring)]" : "hover:-translate-y-[2px] hover:shadow-[0_18px_45px_rgba(18,42,44,0.08)]",
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedLeaveId((current) => (current === String(row.id ?? "") ? null : String(row.id ?? "")))}
                aria-expanded={isExpanded}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={cn("font-semibold text-[var(--foreground)]", isApprovedView || isArchivedView ? "text-base" : "text-lg")}>
                      {getStaffName(row.staff_id)}
                    </h3>
                    <StatusBadge value={String(row.status ?? "pending")} />
                    {!isArchivedView ? (
                      <span className="inline-flex rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
                        {String(row.total_days ?? "-")} day(s)
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        row.attachment_url ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                      )}
                    >
                      {row.attachment_url ? "Form attached" : "No attachment"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    {String(row.leave_type ?? "-").replaceAll("_", " ")} · {formatDate(row.start_date)} - {formatDate(row.end_date)}
                  </p>
                  {!isApprovedView && !isArchivedView ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      <span>Branch: {getBranchName(row.branch_id)}</span>
                      <span>Submitted: {formatDateTime(row.created_at ?? row.submitted_at)}</span>
                      {compactDateLabel ? <span>{compactDateLabel}</span> : null}
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                      {compactDateLabel ? <span>{compactDateLabel}</span> : null}
                      {row.reviewed_by ? <span>Approved by: {getStaffName(row.reviewed_by)}</span> : null}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <ChevronDown className={cn("h-5 w-5 text-[var(--muted-foreground)] transition-transform", isExpanded ? "rotate-180" : "")} />
                </div>
              </button>

              {isExpanded ? (
                <>
                  <div className="mt-4 rounded-3xl border border-white/80 bg-white/80 px-5 py-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Request Details</p>
                    <div className="mt-3 grid gap-2 text-sm text-[var(--foreground)] md:grid-cols-2">
                      <p>Staff: {getStaffName(row.staff_id)}</p>
                      <p>Branch: {getBranchName(row.branch_id)}</p>
                      <p>Leave type: {String(row.leave_type ?? "-").replaceAll("_", " ")}</p>
                      <p>Days: {String(row.total_days ?? "-")}</p>
                      <p>Date range: {formatDate(row.start_date)} - {formatDate(row.end_date)}</p>
                      <p>Submitted: {formatDateTime(row.created_at ?? row.submitted_at)}</p>
                    </div>
                    <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Reason / Remarks</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{String(row.reason ?? "-")}</p>
                  </div>

                  <div className="mt-4 rounded-3xl border border-teal-100/80 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-700">
                    <p>
                      <span className="font-semibold text-slate-800">Workflow:</span> {String(row.status ?? "pending").replaceAll("_", " ")}
                    </p>
                    <p className="mt-1">
                      <span className="font-semibold text-slate-800">Reviewed:</span> {row.reviewed_at ? formatDateTime(row.reviewed_at) : "Pending review"}
                    </p>
                    {row.review_note ? (
                      <p className="mt-1">
                        <span className="font-semibold text-slate-800">Review note:</span> {String(row.review_note)}
                      </p>
                    ) : null}
                    {row.attachment_url ? (
                      <p className="mt-1">
                        <span className="font-semibold text-slate-800">Leave form:</span> {getFilename(row.attachment_url)}
                      </p>
                    ) : (
                      <p className="mt-1">
                        <span className="font-semibold text-slate-800">Leave form:</span> No attachment
                      </p>
                    )}
                  </div>

                  <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 px-5 py-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Leave Balance Summary</p>
                    {renderInlineBalance(summary)}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenAttachment(String(row.id))}
                      disabled={isOpeningAttachment === String(row.id) || !row.attachment_url}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-60"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {isOpeningAttachment === String(row.id) ? "Opening..." : row.attachment_url ? "View Leave Form" : "No attachment"}
                    </button>
                    {canEditOwnLeave(row) ? (
                      <button
                        type="button"
                        onClick={() => startEditLeave(row)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit leave
                      </button>
                    ) : null}
                    {canReview ? (
                      <>
                        {["pending", "approved", "rejected", "cancelled"].map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateLeaveStatus(String(row.id), status)}
                            className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                          >
                            {status.replaceAll("_", " ")}
                          </button>
                        ))}
                      </>
                    ) : null}
                  </div>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  async function handleLeaveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !currentStaff || !profile?.id) {
      setMessage("Your linked staff profile is required before submitting leave.");
      return;
    }

    if (!form.leave_type || !form.start_date || !form.end_date || totalDays <= 0 || !form.reason.trim()) {
      setMessage("Please complete all required leave request details before submitting.");
      return;
    }

    const fileValidationMessage = leaveFormFile ? validateLeaveFormFile(leaveFormFile) : form.attachment_url ? null : "Sila upload borang cuti sebelum menghantar permohonan.";
    if (fileValidationMessage) {
      setLeaveFormError(fileValidationMessage);
      setMessage(fileValidationMessage);
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setLeaveFormError(null);

    let uploadedPath = form.attachment_url || "";

    if (leaveFormFile) {
      const safeName = sanitizeFilename(leaveFormFile.name);
      const malaysiaDate = getMalaysiaDateString();
      const year = malaysiaDate.slice(0, 4);
      const filePath = `leave-requests/${currentStaff.id}/${year}/${Date.now()}-${safeName}`;
      const uploadResult = await supabase.storage.from(LEAVE_ATTACHMENT_BUCKET).upload(filePath, leaveFormFile, {
        upsert: false,
      });

      if (uploadResult.error) {
        setIsSubmitting(false);
        setMessage(uploadResult.error.message);
        return;
      }

      uploadedPath = filePath;
    }

    const payload = {
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      total_days: totalDays,
      half_day: form.half_day,
      reason: form.reason || null,
      attachment_url: uploadedPath,
      profile_id: profile.id,
      staff_id: currentStaff.id,
      branch_id: currentStaff.branch_id ?? profile.branch_id ?? null,
      status: "pending",
    };

    const query = editingLeaveId
      ? supabase
          .from("leave_requests")
          .update(payload)
          .eq("id", editingLeaveId)
          .eq("staff_id", currentStaff.id)
          .eq("status", "pending")
      : supabase.from("leave_requests").insert(payload);

    const { error: saveError } = await query;

    setIsSubmitting(false);

    if (saveError) {
      if (leaveFormFile && uploadedPath) {
        await supabase.storage.from(LEAVE_ATTACHMENT_BUCKET).remove([uploadedPath]).catch(() => undefined);
      }
      setMessage(saveError.message);
      return;
    }

    setMessage(editingLeaveId ? "Leave request updated." : "Leave request submitted.");
    resetLeaveForm();
    router.refresh();
  }

  async function updateLeaveStatus(rowId: string, status: string) {
    if (!supabase || !profile?.id) {
      setReviewMessage("Unable to review this request right now.");
      return;
    }

    const targetRow = scopedRows.find((row) => String(row.id ?? "") === rowId) ?? null;
    if (status === "approved" && !String(targetRow?.attachment_url ?? "").trim()) {
      setReviewMessage("Tidak boleh approve. Borang cuti belum diupload.");
      return;
    }

    const reviewNote = window.prompt("Add a review note (optional):", "") ?? "";

    const { error: updateError } = await supabase
      .from("leave_requests")
      .update({
        status,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote || null,
      })
      .eq("id", rowId);

    if (updateError) {
      setReviewMessage(updateError.message);
      return;
    }

    setReviewMessage(`Leave request ${status}.`);
    router.refresh();
  }

  async function saveEntitlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !selectedStaffId) {
      setEntitlementMessage("Select a staff member before saving entitlement.");
      return;
    }

    setIsEntitlementSaving(true);
    setEntitlementMessage(null);

    const payload = {
      staff_id: selectedStaffId,
      entitlement_year: Number(entitlementForm.entitlement_year),
      annual_leave_total: Number(entitlementForm.annual_leave_total || 0),
      medical_leave_total: Number(entitlementForm.medical_leave_total || 0),
      annual_leave_opening_used: Number(entitlementForm.annual_leave_opening_used || 0),
      medical_leave_opening_used: Number(entitlementForm.medical_leave_opening_used || 0),
      opening_balance_note: entitlementForm.opening_balance_note || null,
      effective_from: entitlementForm.effective_from || null,
      effective_to: entitlementForm.effective_to || null,
    };

    const existing = getEntitlementForStaff(entitlements, selectedStaffId);
    const query = existing?.id
      ? supabase.from("leave_entitlements").update(payload).eq("id", existing.id)
      : supabase.from("leave_entitlements").insert(payload);

    const { error: saveError } = await query;
    setIsEntitlementSaving(false);

    if (saveError) {
      setEntitlementMessage(saveError.message);
      return;
    }

    setEntitlementMessage("Leave entitlement saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load leave data" description={error} /> : null}
      {!isHrView ? <LeaveBalancePanel summary={balanceSummary} title="My Leave Balance" /> : null}

      <div className="space-y-6">
        <FormSection
          title={isHrView ? "Leave Request Queue" : isBranchPicView ? "Branch Leave Review Queue" : "My Leave Requests"}
          description={
            isHrView
              ? "Pantau permohonan cuti, semak status workflow, dan beri tindakan cepat kepada permohonan yang masih menunggu."
              : isBranchPicView
                ? "Semak permohonan cuti cawangan yang memerlukan tindakan anda."
                : "Pantau sejarah permohonan cuti dan status semakan anda."
          }
        >
          {reviewMessage ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{reviewMessage}</p> : null}

          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Pending Leave Requests</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Permohonan menunggu tindakan dipaparkan dahulu supaya lebih mudah diutamakan.</p>
              </div>
              {renderLeaveCards(
                pendingRows,
                normalizedStatusFilter ? "No items found for this filter." : "No pending leave requests.",
                normalizedStatusFilter ? "No items found for this filter." : "Pending leave requests that need action will appear here.",
                "pending",
              )}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Approved Leave Requests</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Permohonan yang sudah diluluskan dipaparkan dalam gaya yang lebih ringkas untuk audit dan rujukan.</p>
              </div>
              {renderLeaveCards(
                approvedRows,
                "No approved leave requests yet.",
                "Approved leave history will appear here once requests are reviewed.",
                "approved",
              )}
            </div>

            {archivedRows.length ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">Rejected / Cancelled Requests</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">Permohonan yang ditolak atau dibatalkan disimpan di bahagian bawah untuk rujukan.</p>
                </div>
                {renderLeaveCards(
                  archivedRows,
                  "No archived requests.",
                  "Rejected or cancelled requests will appear here.",
                  "archived",
                )}
              </div>
            ) : null}
          </div>
        </FormSection>

        {isBranchPicView ? (
          <FormSection title="My Leave History" description="Paparan ringkas untuk permohonan cuti peribadi anda sendiri.">
            {renderLeaveCards(
              ownRows,
              "No personal leave requests yet",
              "Your own leave submissions will appear here after your first request.",
              "personal",
            )}
          </FormSection>
        ) : null}

        <section className="space-y-4">
          <button
            type="button"
            className={collapsibleButtonClass}
            onClick={() => setIsCreateSectionOpen((current) => !current)}
            aria-expanded={isCreateSectionOpen}
          >
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">{editingLeaveId ? "Edit Leave Request" : "Create Leave Request"}</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {editingLeaveId ? "Update your pending leave request before it is reviewed." : "Expand to submit a new leave request with linked staff and branch information."}
              </p>
            </div>
            <ChevronDown className={cn("h-5 w-5 text-[var(--muted-foreground)] transition-transform", isCreateSectionOpen ? "rotate-180" : "")} />
          </button>

          {isCreateSectionOpen ? (
            <FormSection
              title={editingLeaveId ? "Edit leave request" : "Create leave request"}
              description={editingLeaveId ? "You can update your own pending leave request before it is reviewed." : "Submit real leave requests with linked profile, staff, and branch information."}
            >
              {currentStaff ? (
              <form className="space-y-4" onSubmit={handleLeaveSubmit}>
                <select value={form.leave_type} onChange={(event) => setForm((current) => ({ ...current, leave_type: event.target.value }))} className={inputClass}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="medical_leave">Medical Leave</option>
                  <option value="emergency_leave">Emergency Leave</option>
                  <option value="unpaid_leave">Unpaid Leave</option>
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} className={inputClass} required />
                  <input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} className={inputClass} required />
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={form.half_day} onChange={(event) => setForm((current) => ({ ...current, half_day: event.target.checked }))} />
                  Half day request
                </label>
                <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">Total days: {totalDays}</div>
                <FileUploadField
                  label="Upload Leave Form / Borang Cuti"
                  file={leaveFormFile}
                  storedPath={form.attachment_url || null}
                  onChange={handleLeaveFormFileChange}
                  accept={LEAVE_ATTACHMENT_ACCEPT}
                  required
                  error={leaveFormError}
                  helperText="Sila upload borang cuti yang telah lengkap diisi sebelum menghantar permohonan. Fail diterima: PDF, JPG, JPEG, PNG. Maksimum 5MB."
                />
                <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="Reason for leave" className={textareaClass} required />
                {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto">
                    {editingLeaveId ? <Save className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}
                    {isSubmitting ? "Saving..." : editingLeaveId ? "Update leave request" : "Submit leave request"}
                  </button>
                  {editingLeaveId ? (
                    <button type="button" onClick={resetLeaveForm} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                      <X className="h-4 w-4" />
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
              ) : (
                <EmptyState title="Complete your staff profile first" description="Your staff row is required before leave requests can be submitted." />
              )}
            </FormSection>
          ) : null}
        </section>

        {canManageEntitlements ? (
          <section className="space-y-4">
            <button
              type="button"
              className={collapsibleButtonClass}
              onClick={() => setIsEntitlementSectionOpen((current) => !current)}
              aria-expanded={isEntitlementSectionOpen}
            >
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Leave Entitlement Settings</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Expand to manage yearly leave allocation and opening balance settings for staff.</p>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-[var(--muted-foreground)] transition-transform", isEntitlementSectionOpen ? "rotate-180" : "")} />
            </button>

            {isEntitlementSectionOpen ? (
              <FormSection title="Leave Entitlement Settings" description="Set yearly leave balances for this staff member.">
                <form className="space-y-4" onSubmit={saveEntitlement}>
                <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card-muted)]/55 p-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Staff Member</span>
                      <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} className={inputClass}>
                        {staffRows.map((row) => (
                          <option key={String(row.id)} value={String(row.id ?? "")}>{String(row.full_name ?? row.email ?? row.id)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Entitlement Year</span>
                      <input value={entitlementForm.entitlement_year} onChange={(event) => setEntitlementForm((current) => ({ ...current, entitlement_year: event.target.value }))} placeholder="2026" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Annual Leave Days</span>
                      <input value={entitlementForm.annual_leave_total} onChange={(event) => setEntitlementForm((current) => ({ ...current, annual_leave_total: event.target.value }))} placeholder="14" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Medical Leave Days</span>
                      <input value={entitlementForm.medical_leave_total} onChange={(event) => setEntitlementForm((current) => ({ ...current, medical_leave_total: event.target.value }))} placeholder="8" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Carry Forward Days</span>
                      <input value={entitlementForm.annual_leave_opening_used} onChange={(event) => setEntitlementForm((current) => ({ ...current, annual_leave_opening_used: event.target.value }))} placeholder="2" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-[var(--foreground)]">Replacement Leave Days</span>
                      <input value={entitlementForm.medical_leave_opening_used} onChange={(event) => setEntitlementForm((current) => ({ ...current, medical_leave_opening_used: event.target.value }))} placeholder="0" className={inputClass} />
                    </label>
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/80 bg-white/70 p-4">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Date Settings</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-[var(--foreground)]">Effective From</span>
                        <input type="date" value={entitlementForm.effective_from} onChange={(event) => setEntitlementForm((current) => ({ ...current, effective_from: event.target.value }))} className={inputClass} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-[var(--foreground)]">Expiry Date</span>
                        <input type="date" value={entitlementForm.effective_to} onChange={(event) => setEntitlementForm((current) => ({ ...current, effective_to: event.target.value }))} className={inputClass} />
                      </label>
                    </div>
                  </div>

                  <label className="mt-5 block space-y-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Opening Balance Note</span>
                    <textarea value={entitlementForm.opening_balance_note} onChange={(event) => setEntitlementForm((current) => ({ ...current, opening_balance_note: event.target.value }))} rows={3} placeholder="Add context for yearly balance setup" className={textareaClass} />
                  </label>
                </div>
                {entitlementMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{entitlementMessage}</p> : null}
                <button type="submit" disabled={isEntitlementSaving} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto">
                  <Save className="h-4 w-4" />
                  {isEntitlementSaving ? "Saving..." : "Save entitlement"}
                </button>
                </form>
              </FormSection>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

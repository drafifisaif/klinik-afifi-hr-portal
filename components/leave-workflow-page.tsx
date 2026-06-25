"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarPlus, Pencil, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { LeaveBalancePanel } from "@/components/leave-balance-panel";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { buildLeaveBalanceSummary, filterLeaveRequestsForRole } from "@/lib/data";
import type { BranchOption, LeaveBalanceSummary, Profile, TableRow, UserRole } from "@/lib/types";
import { calculateLeaveDays, cn, formatDate, formatDateInput, formatDateTime, mapRowsWithId, normalizeString } from "@/lib/utils";

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

const emptyLeaveForm = {
  leave_type: "annual_leave",
  start_date: "",
  end_date: "",
  half_day: false,
  reason: "",
  attachment_url: "",
};

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
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
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
  }

  function canEditOwnLeave(row: TableRow) {
    return String(row.staff_id ?? "") === String(currentStaff?.id ?? "") && normalizeString(row.status) === "pending";
  }

  function startEditLeave(row: TableRow) {
    if (!canEditOwnLeave(row)) {
      return;
    }

    setEditingLeaveId(String(row.id ?? ""));
    setForm({
      leave_type: String(row.leave_type ?? "annual_leave"),
      start_date: formatDateInput(row.start_date),
      end_date: formatDateInput(row.end_date),
      half_day: row.half_day === true,
      reason: String(row.reason ?? ""),
      attachment_url: String(row.attachment_url ?? ""),
    });
    setMessage(null);
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

  function renderLeaveCards(rows: TableRow[], emptyTitle: string, emptyDescription: string) {
    if (!rows.length) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }

    return (
      <div className="space-y-4">
        {rows.map((row) => {
          const summary = getBalanceForStaff(row.staff_id);
          const normalizedStatus = normalizeString(row.status);
          const cardTone =
            ["approved", "resolved", "closed"].includes(normalizedStatus)
              ? "border-emerald-200 bg-emerald-50/55"
              : ["pending", "in_progress", "assigned", "rejected", "cancelled"].includes(normalizedStatus)
                ? "border-rose-200 bg-rose-50/60"
                : "border-[var(--border)] bg-white";

          return (
            <article key={String(row.id)} className={cn("rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(18,42,44,0.04)]", cardTone)}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">{getStaffName(row.staff_id)}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {getBranchName(row.branch_id)} · {String(row.leave_type ?? "-").replaceAll("_", " ")} · {formatDate(row.start_date)} - {formatDate(row.end_date)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={String(row.status ?? "pending")} />
                  <span className="inline-flex rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
                    {String(row.total_days ?? "-")} day(s)
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/80 bg-white/80 px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Reason</p>
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
                    <span className="font-semibold text-slate-800">Attachment path:</span> {String(row.attachment_url)}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 px-5 py-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Leave Balance Summary</p>
                {renderInlineBalance(summary)}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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

    setIsSubmitting(true);
    setMessage(null);

    const payload = {
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      total_days: totalDays,
      half_day: form.half_day,
      reason: form.reason || null,
      attachment_url: form.attachment_url || null,
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

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <FormSection
            title={isHrView ? "Leave Request Queue" : isBranchPicView ? "Branch Leave Review Queue" : "My Leave Requests"}
            description={
              isHrView
                ? "Pantau permohonan cuti, semak status workflow, dan semak baki cuti setiap staff terus dalam kad permohonan."
                : isBranchPicView
                  ? "Semak permohonan cuti cawangan yang memerlukan tindakan anda."
                  : "Pantau sejarah permohonan cuti dan status semakan anda."
            }
          >
            {reviewMessage ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{reviewMessage}</p> : null}
            {renderLeaveCards(
              filteredReviewRows,
              normalizedStatusFilter ? "No items found for this filter." : "No leave requests yet",
              normalizedStatusFilter ? "No items found for this filter." : "Submitted leave requests will appear here automatically.",
            )}
          </FormSection>

          {isBranchPicView ? (
            <FormSection title="My Leave History" description="Paparan ringkas untuk permohonan cuti peribadi anda sendiri.">
              {renderLeaveCards(
                ownRows,
                "No personal leave requests yet",
                "Your own leave submissions will appear here after your first request.",
              )}
            </FormSection>
          ) : null}
        </div>

        <div className="space-y-6">
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
                <input value={form.attachment_url} onChange={(event) => setForm((current) => ({ ...current, attachment_url: event.target.value }))} placeholder="Optional attachment path" className={inputClass} />
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

          {canManageEntitlements ? (
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
        </div>
      </div>
    </div>
  );
}

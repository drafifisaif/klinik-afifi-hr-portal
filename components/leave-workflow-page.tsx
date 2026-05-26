"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarPlus, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { LeaveBalancePanel } from "@/components/leave-balance-panel";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import { buildLeaveBalanceSummary, filterLeaveRequestsForRole } from "@/lib/data";
import type { LeaveBalanceSummary, Profile, TableRow, UserRole } from "@/lib/types";
import { calculateLeaveDays, formatDate, formatDateTime, mapRowsWithId } from "@/lib/utils";

interface LeaveWorkflowPageProps {
  leaveRequests: TableRow[];
  entitlements: TableRow[];
  staffRows: TableRow[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

function getEntitlementForStaff(rows: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  const staffRows = rows.filter((row) => String(row.staff_id ?? "") === String(staffId));
  return (
    staffRows.sort(
      (left, right) =>
        Number(right.entitlement_year ?? 0) - Number(left.entitlement_year ?? 0),
    )[0] ?? null
  );
}

export function LeaveWorkflowPage({
  leaveRequests,
  entitlements,
  staffRows,
  role,
  profile,
  currentStaff,
  error,
}: LeaveWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [entitlementMessage, setEntitlementMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEntitlementSaving, setIsEntitlementSaving] = useState(false);
  const [form, setForm] = useState({
    leave_type: "annual_leave",
    start_date: "",
    end_date: "",
    half_day: false,
    reason: "",
  });
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
  const scopedRows = useMemo(
    () =>
      filterLeaveRequestsForRole(
        mapRowsWithId(leaveRequests),
        role,
        profile,
        profile?.id ?? "",
        String(currentStaff?.id ?? "") || undefined,
      ),
    [leaveRequests, role, profile, currentStaff?.id],
  );

  const selectedStaff = staffRows.find((row) => String(row.id ?? "") === selectedStaffId) ?? currentStaff;
  const selectedEntitlement = getEntitlementForStaff(entitlements, String(selectedStaff?.id ?? ""));
  const selectedLeaveRows = leaveRequests.filter((row) => String(row.staff_id ?? "") === String(selectedStaff?.id ?? ""));
  const balanceSummary: LeaveBalanceSummary = buildLeaveBalanceSummary(selectedEntitlement, selectedLeaveRows);
  const totalDays = calculateLeaveDays(form.start_date, form.end_date, form.half_day);

  async function handleLeaveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !currentStaff || !profile?.id) {
      setMessage("Your linked staff profile is required before submitting leave.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const { error: insertError } = await supabase.from("leave_requests").insert({
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      total_days: totalDays,
      half_day: form.half_day,
      reason: form.reason || null,
      profile_id: profile.id,
      staff_id: currentStaff.id,
      branch_id: currentStaff.branch_id ?? profile.branch_id ?? null,
      status: "pending",
    });

    setIsSubmitting(false);

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("Leave request submitted.");
    setForm({ leave_type: "annual_leave", start_date: "", end_date: "", half_day: false, reason: "" });
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

      <LeaveBalancePanel summary={balanceSummary} title={selectedStaff ? `${String(selectedStaff.full_name ?? "Staff")} Leave Balance` : "Leave Balance"} />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <FormSection title="Leave requests" description="Real leave requests are stored in `leave_requests` and reviewed in-place.">
          {reviewMessage ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{reviewMessage}</p> : null}
          {scopedRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {[
                        "Staff",
                        "Type",
                        "Dates",
                        "Days",
                        "Status",
                        "Reviewed",
                        "Action",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {scopedRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staffRows.find((staffRow) => String(staffRow.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.leave_type ?? "-").replaceAll("_", " ")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.start_date)} - {formatDate(row.end_date)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.total_days ?? "-")}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "pending")} /></td>
                        <td className="px-4 py-4 text-xs text-[var(--muted-foreground)]">{row.reviewed_at ? `${formatDateTime(row.reviewed_at)}${row.review_note ? `\n${String(row.review_note)}` : ""}` : "-"}</td>
                        <td className="px-4 py-4 text-sm">
                          {canReview ? (
                            <div className="flex flex-wrap gap-2">
                              {[
                                "pending",
                                "approved",
                                "rejected",
                                "cancelled",
                              ].map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => updateLeaveStatus(String(row.id), status)}
                                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                                >
                                  {status.replaceAll("_", " ")}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">View only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No leave requests yet" description="Submitted leave requests will appear here automatically." />
          )}
        </FormSection>

        <div className="space-y-6">
          <FormSection title="Create leave request" description="Submit real leave requests with linked profile, staff, and branch information.">
            {currentStaff ? (
              <form className="space-y-4" onSubmit={handleLeaveSubmit}>
                <select value={form.leave_type} onChange={(event) => setForm((current) => ({ ...current, leave_type: event.target.value }))} className={inputClass}>
                  <option value="annual_leave">Annual Leave</option>
                  <option value="medical_leave">Medical Leave</option>
                  <option value="emergency_leave">Emergency Leave</option>
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
                <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="Reason for leave" className={textareaClass} required />
                {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
                <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                  <CalendarPlus className="h-4 w-4" />
                  {isSubmitting ? "Submitting..." : "Submit leave request"}
                </button>
              </form>
            ) : (
              <EmptyState title="Complete your staff profile first" description="Your staff row is required before leave requests can be submitted." />
            )}
          </FormSection>

          {canManageEntitlements ? (
            <FormSection title="Leave entitlement settings" description="HR and super admin can define annual and medical leave balances for each staff member.">
              <form className="space-y-4" onSubmit={saveEntitlement}>
                <select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)} className={inputClass}>
                  {staffRows.map((row) => (
                    <option key={String(row.id)} value={String(row.id ?? "")}>{String(row.full_name ?? row.email ?? row.id)}</option>
                  ))}
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input value={entitlementForm.entitlement_year} onChange={(event) => setEntitlementForm((current) => ({ ...current, entitlement_year: event.target.value }))} placeholder="Entitlement year" className={inputClass} />
                  <input value={entitlementForm.annual_leave_total} onChange={(event) => setEntitlementForm((current) => ({ ...current, annual_leave_total: event.target.value }))} placeholder="Annual leave total" className={inputClass} />
                  <input value={entitlementForm.medical_leave_total} onChange={(event) => setEntitlementForm((current) => ({ ...current, medical_leave_total: event.target.value }))} placeholder="Medical leave total" className={inputClass} />
                  <input value={entitlementForm.annual_leave_opening_used} onChange={(event) => setEntitlementForm((current) => ({ ...current, annual_leave_opening_used: event.target.value }))} placeholder="Annual leave used before portal" className={inputClass} />
                  <input value={entitlementForm.medical_leave_opening_used} onChange={(event) => setEntitlementForm((current) => ({ ...current, medical_leave_opening_used: event.target.value }))} placeholder="Medical leave used before portal" className={inputClass} />
                  <input type="date" value={entitlementForm.effective_from} onChange={(event) => setEntitlementForm((current) => ({ ...current, effective_from: event.target.value }))} className={inputClass} />
                  <input type="date" value={entitlementForm.effective_to} onChange={(event) => setEntitlementForm((current) => ({ ...current, effective_to: event.target.value }))} className={inputClass} />
                </div>
                <textarea value={entitlementForm.opening_balance_note} onChange={(event) => setEntitlementForm((current) => ({ ...current, opening_balance_note: event.target.value }))} rows={3} placeholder="Opening balance note" className={textareaClass} />
                {entitlementMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{entitlementMessage}</p> : null}
                <button type="submit" disabled={isEntitlementSaving} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70">
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

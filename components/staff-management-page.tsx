"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { LeaveBalancePanel } from "@/components/leave-balance-panel";
import { StatusBadge } from "@/components/status-badge";
import { buildLeaveBalanceSummary } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { formatDate, formatDateInput, mapRowsWithId } from "@/lib/utils";

interface StaffManagementPageProps {
  rows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  entitlements: TableRow[];
  leaveRequests: TableRow[];
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

const emptyStaffForm = {
  profile_id: "",
  full_name: "",
  ic_no: "",
  email: "",
  phone: "",
  position: "",
  department: "",
  branch_id: "",
  date_joined: "",
  status: "active",
  role: "staff",
};

function getEntitlementForStaff(rows: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  return rows
    .filter((row) => String(row.staff_id ?? "") === String(staffId))
    .sort((left, right) => Number(right.entitlement_year ?? 0) - Number(left.entitlement_year ?? 0))[0] ?? null;
}

export function StaffManagementPage({
  rows,
  branches,
  role,
  profile,
  currentStaff,
  entitlements,
  leaveRequests,
  error,
}: StaffManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyStaffForm);

  const canManageExtended = role === "super_admin" || role === "hr";
  const staffRows = useMemo(() => mapRowsWithId(rows), [rows]);

  const scopedRows = useMemo(() => {
    if (role === "staff") {
      return currentStaff ? staffRows.filter((row) => String(row.id ?? "") === String(currentStaff.id ?? "")) : [];
    }

    if (role === "branch_pic") {
      return staffRows.filter((row) => String(row.branch_id ?? "") === String(profile?.branch_id ?? ""));
    }

    return staffRows;
  }, [currentStaff, profile?.branch_id, role, staffRows]);

  const selectedStaff = scopedRows.find((row) => String(row.id ?? "") === editingId) ?? scopedRows[0] ?? currentStaff;
  const selectedEntitlement = getEntitlementForStaff(entitlements, String(selectedStaff?.id ?? ""));
  const selectedLeaveRows = leaveRequests.filter((row) => String(row.staff_id ?? "") === String(selectedStaff?.id ?? ""));
  const balanceSummary = buildLeaveBalanceSummary(selectedEntitlement, selectedLeaveRows);

  function scrollToForm() {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyStaffForm);
  }

  function startEdit(row: TableRow) {
    setEditingId(String(row.id ?? ""));
    setForm({
      profile_id: String(row.profile_id ?? ""),
      full_name: String(row.full_name ?? ""),
      ic_no: String(row.ic_no ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      position: String(row.position ?? ""),
      department: String(row.department ?? ""),
      branch_id: String(row.branch_id ?? ""),
      date_joined: formatDateInput(row.date_joined),
      status: String(row.status ?? "active"),
      role: String(row.role ?? profile?.role ?? "staff"),
    });
    setMessage(null);
    scrollToForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const payload = {
      full_name: form.full_name,
      ic_no: form.ic_no || null,
      email: form.email || null,
      phone: form.phone || null,
      position: canManageExtended ? form.position || null : null,
      department: canManageExtended ? form.department || null : null,
      branch_id: canManageExtended ? form.branch_id || null : null,
      date_joined: form.date_joined || null,
      status: canManageExtended ? form.status : "active",
      profile_id: form.profile_id || null,
    };

    const query = editingId
      ? supabase.from("staff").update(payload).eq("id", editingId)
      : supabase.from("staff").insert(payload);

    const { error: saveError } = await query;

    if (saveError) {
      setIsSubmitting(false);
      setMessage(saveError.message);
      return;
    }

    if (canManageExtended && form.profile_id) {
      const { error: profileError } = await supabase.from("profiles").update({ role: form.role }).eq("id", form.profile_id);

      if (profileError) {
        setIsSubmitting(false);
        setMessage(profileError.message);
        return;
      }
    }

    setIsSubmitting(false);
    setMessage(editingId ? "Staff record updated." : "Staff record created.");
    resetForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load staff data" description={error} /> : null}
      {selectedStaff ? <LeaveBalancePanel summary={balanceSummary} title={`${String(selectedStaff.full_name ?? "Staff")} Leave Balance`} /> : null}

      <FormSection
        title="Staff directory"
        description="Staff visibility respects role scope: all staff for HR and super admin, branch staff for branch PIC, and self for staff users."
      >
        {scopedRows.length ? (
          <>
            <div className="space-y-3 md:hidden">
              {scopedRows.map((row) => (
                <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--foreground)]">{String(row.full_name ?? row.email ?? "-")}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(row.email ?? "No email")}</p>
                    </div>
                    <StatusBadge value={String(row.status ?? "active")} />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)]">
                    <p><span className="font-semibold">IC No:</span> {String(row.ic_no ?? "-")}</p>
                    <p><span className="font-semibold">Position:</span> {String(row.position ?? row.department ?? "-")}</p>
                    <p><span className="font-semibold">Branch:</span> {branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</p>
                    <p><span className="font-semibold">Joined:</span> {formatDate(row.date_joined)}</p>
                  </div>
                  <button type="button" onClick={() => startEdit(row)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--foreground)]">
                    <Pencil className="h-3.5 w-3.5" />
                    {canManageExtended ? "Edit" : "View"}
                  </button>
                </article>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-[24px] border border-[var(--border)] md:block">
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-left">
                <thead className="bg-[var(--card-muted)]/70">
                  <tr>
                    {["Staff", "IC No", "Position", "Branch", "Joined", "Status", "Action"].map((label) => (
                      <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-white">
                  {scopedRows.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="px-4 py-4 text-sm">
                        <p className="font-semibold text-[var(--foreground)]">{String(row.full_name ?? "-")}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{String(row.email ?? "No email")}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.ic_no ?? "-")}</td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.position ?? row.department ?? "-")}</td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</td>
                      <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.date_joined)}</td>
                      <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "active")} /></td>
                      <td className="px-4 py-4 text-sm">
                        <button type="button" onClick={() => startEdit(row)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
                          <Pencil className="h-3.5 w-3.5" />
                          {canManageExtended ? "Edit" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </>
        ) : (
          <EmptyState title="No staff records available" description="Staff records will appear here once the linked staff rows exist in Supabase." />
        )}
      </FormSection>

      <div ref={formRef}>
        <FormSection title={editingId ? "Edit staff record" : "Add staff record"} description={canManageExtended ? "HR and super admin can edit organization fields and linked profile roles. The form is shown full width below for easier editing." : "This form is view-only for your allowed staff scope."}>
          {canManageExtended ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Full name" className={inputClass} required />
                <input value={form.ic_no} onChange={(event) => setForm((current) => ({ ...current, ic_no: event.target.value }))} placeholder="IC number" className={inputClass} />
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className={inputClass} />
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className={inputClass} />
                <input value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} placeholder="Position" className={inputClass} />
                <input value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} placeholder="Department" className={inputClass} />
                <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass}>
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <input type="date" value={form.date_joined} onChange={(event) => setForm((current) => ({ ...current, date_joined: event.target.value }))} className={inputClass} />
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                </select>
                <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className={inputClass}>
                  {["staff", "branch_pic", "operation", "hr", "super_admin"].map((roleName) => (
                    <option key={roleName} value={roleName}>{roleName.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto">
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isSubmitting ? "Saving..." : editingId ? "Update staff" : "Create staff"}
                </button>
                {editingId ? (
                  <button type="button" onClick={resetForm} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                    <RefreshCw className="h-4 w-4" />
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          ) : selectedStaff ? (
            <div className="space-y-3 rounded-3xl bg-[var(--card-muted)] px-5 py-5 text-sm text-[var(--foreground)]">
              <p><span className="font-semibold">Full name:</span> {String(selectedStaff.full_name ?? "-")}</p>
              <p><span className="font-semibold">Email:</span> {String(selectedStaff.email ?? "-")}</p>
              <p><span className="font-semibold">Phone:</span> {String(selectedStaff.phone ?? "-")}</p>
              <p><span className="font-semibold">Status:</span> {String(selectedStaff.status ?? "active")}</p>
            </div>
          ) : (
            <EmptyState title="No staff profile linked" description="Complete your staff profile from My Profile before this section can show record details." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

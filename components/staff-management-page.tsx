"use client";

import { FormEvent, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { formatDate, formatDateInput, mapRowsWithId } from "@/lib/utils";

interface StaffManagementPageProps {
  rows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const emptyStaffForm = {
  full_name: "",
  ic_no: "",
  email: "",
  phone: "",
  position: "",
  department: "",
  branch_id: "",
  date_joined: "",
  status: "active",
};

export function StaffManagementPage({ rows, branches, role, profile, error }: StaffManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyStaffForm);

  const canManage = role === "super_admin" || role === "hr";
  const staffRows = useMemo(() => mapRowsWithId(rows), [rows]);

  const scopedRows = useMemo(() => {
    if (role !== "branch_pic" || !profile?.branch_id) {
      return staffRows;
    }

    return staffRows.filter((row) => String(row.branch_id ?? "") === String(profile.branch_id));
  }, [profile?.branch_id, role, staffRows]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyStaffForm);
  }

  function startEdit(row: TableRow) {
    setEditingId(String(row.id ?? ""));
    setForm({
      full_name: String(row.full_name ?? ""),
      ic_no: String(row.ic_no ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      position: String(row.position ?? ""),
      department: String(row.department ?? ""),
      branch_id: String(row.branch_id ?? ""),
      date_joined: formatDateInput(row.date_joined),
      status: String(row.status ?? "active"),
    });
    setMessage(null);
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
      position: form.position || null,
      department: form.department || null,
      branch_id: form.branch_id || null,
      date_joined: form.date_joined || null,
      status: form.status,
    };

    const query = editingId
      ? supabase.from("staff").update(payload).eq("id", editingId)
      : supabase.from("staff").insert(payload);

    const { error: saveError } = await query;

    setIsSubmitting(false);

    if (saveError) {
      setMessage(saveError.message);
      return;
    }

    setMessage(editingId ? "Staff record updated." : "Staff record created.");
    resetForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load staff data" description={error} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <FormSection
          title="Staff directory"
          description="Active, inactive, and resigned staff records. Use status changes instead of hard delete."
        >
          {scopedRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {[
                        "Staff",
                        "IC No",
                        "Position",
                        "Branch",
                        "Joined",
                        "Status",
                        "Action",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          {label}
                        </th>
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
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
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
            <EmptyState title="No staff records yet" description="Staff records will appear here once rows exist in Supabase." />
          )}
        </FormSection>

        <FormSection
          title={editingId ? "Edit staff record" : "Add staff record"}
          description={canManage ? "Create or update core HR staff information." : "Only HR and super admin can manage staff records."}
        >
          {canManage ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="resigned">Resigned</option>
              </select>
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isSubmitting ? "Saving..." : editingId ? "Update staff" : "Create staff"}
                </button>
                {editingId ? (
                  <button type="button" onClick={resetForm} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]">
                    <RefreshCw className="h-4 w-4" />
                    Cancel edit
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <EmptyState title="View-only access" description="Your role can review staff records but cannot create or edit them." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

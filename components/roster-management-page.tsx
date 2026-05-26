"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarPlus, Filter } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, SelectOption, TableRow, UserRole } from "@/lib/types";
import { formatDate, mapRowsWithId } from "@/lib/utils";

interface RosterManagementPageProps {
  rosters: TableRow[];
  shiftTemplates: TableRow[];
  staff: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function RosterManagementPage({ rosters, shiftTemplates, staff, branches, role, profile, error }: RosterManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [branchFilter, setBranchFilter] = useState(profile?.branch_id ? String(profile.branch_id) : "all");
  const [dateFilter, setDateFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    branch_id: profile?.branch_id ? String(profile.branch_id) : "",
    shift_template_id: "",
    roster_date: "",
    is_published: "false",
  });

  const canManage = role === "super_admin" || role === "hr" || role === "branch_pic";
  const rosterRows = useMemo(() => mapRowsWithId(rosters), [rosters]);
  const scopedRows = useMemo(() => {
    if (role === "branch_pic" && profile?.branch_id) {
      return rosterRows.filter((row) => String(row.branch_id ?? "") === String(profile.branch_id));
    }

    return rosterRows;
  }, [profile?.branch_id, role, rosterRows]);

  const filteredRows = useMemo(() => {
    return scopedRows.filter((row) => {
      const matchesBranch = branchFilter === "all" || String(row.branch_id ?? "") === branchFilter;
      const matchesDate = !dateFilter || String(row.roster_date ?? row.date ?? "").slice(0, 10) === dateFilter;
      return matchesBranch && matchesDate;
    });
  }, [branchFilter, dateFilter, scopedRows]);

  const staffOptions = useMemo(() => {
    return staff
      .filter((row) => (form.branch_id ? String(row.branch_id ?? "") === form.branch_id : true))
      .map((row) => ({ value: String(row.id ?? ""), label: String(row.full_name ?? row.email ?? row.id) }))
      .filter((option) => option.value);
  }, [form.branch_id, staff]);

  const shiftOptions: SelectOption[] = useMemo(() => {
    return shiftTemplates.map((row) => ({
      value: String(row.id ?? ""),
      label: String(row.name ?? row.shift_name ?? row.title ?? row.id),
    }));
  }, [shiftTemplates]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const { error: saveError } = await supabase.from("rosters").insert({
      staff_id: form.staff_id,
      branch_id: form.branch_id || null,
      shift_template_id: form.shift_template_id || null,
      roster_date: form.roster_date,
      is_published: form.is_published === "true",
    });

    setIsSubmitting(false);

    if (saveError) {
      setMessage(saveError.message);
      return;
    }

    setMessage("Roster entry created.");
    setForm({
      staff_id: "",
      branch_id: profile?.branch_id ? String(profile.branch_id) : "",
      shift_template_id: "",
      roster_date: "",
      is_published: "false",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load roster data" description={error} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <FormSection title="Roster schedule" description="Filter by branch or date and review published roster assignments.">
          <div className="mb-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={inputClass}>
              <option value="all">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className={inputClass} />
            <button type="button" onClick={() => { setBranchFilter(profile?.branch_id ? String(profile.branch_id) : "all"); setDateFilter(""); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]">
              <Filter className="h-4 w-4" />
              Reset
            </button>
          </div>

          {filteredRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {[
                        "Staff",
                        "Shift",
                        "Date",
                        "Branch",
                        "Published",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {filteredRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{shiftTemplates.find((shift) => String(shift.id ?? "") === String(row.shift_template_id ?? ""))?.name as string ?? shiftTemplates.find((shift) => String(shift.id ?? "") === String(row.shift_template_id ?? ""))?.shift_name as string ?? String(row.shift_template_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.roster_date ?? row.date)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.is_published === true || row.published_status === true ? "published" : row.status ?? "draft")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No roster entries found" description="Adjust the filters or add the first roster entry for this branch." />
          )}
        </FormSection>

        <FormSection title="Add roster entry" description={canManage ? "Assign staff to a shift template and mark publish status." : "Your role has read-only roster access."}>
          {canManage ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value, staff_id: "" }))} className={inputClass} required>
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <select value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))} className={inputClass} required>
                <option value="">Select staff</option>
                {staffOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select value={form.shift_template_id} onChange={(event) => setForm((current) => ({ ...current, shift_template_id: event.target.value }))} className={inputClass} required>
                <option value="">Select shift template</option>
                {shiftOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input type="date" value={form.roster_date} onChange={(event) => setForm((current) => ({ ...current, roster_date: event.target.value }))} className={inputClass} required />
              <select value={form.is_published} onChange={(event) => setForm((current) => ({ ...current, is_published: event.target.value }))} className={inputClass}>
                <option value="false">Draft</option>
                <option value="true">Published</option>
              </select>
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                <CalendarPlus className="h-4 w-4" />
                {isSubmitting ? "Saving..." : "Add roster"}
              </button>
            </form>
          ) : (
            <EmptyState title="Read-only roster access" description="Operations can review schedules here, while branch PIC, HR, and super admin can manage them." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

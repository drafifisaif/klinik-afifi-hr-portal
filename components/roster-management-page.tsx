"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarPlus, Clock3, Filter, Layers3 } from "lucide-react";
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
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function RosterManagementPage({ rosters, shiftTemplates, staff, branches, role, profile, error }: RosterManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [branchFilter, setBranchFilter] = useState(profile?.branch_id ? String(profile.branch_id) : "all");
  const [dateFilter, setDateFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    branch_id: profile?.branch_id ? String(profile.branch_id) : "",
    shift_template_id: "",
    roster_date: "",
    is_published: "false",
  });
  const [templateForm, setTemplateForm] = useState({
    name: "",
    code: "",
    branch_id: profile?.branch_id ? String(profile.branch_id) : "",
    start_time: "",
    end_time: "",
    description: "",
    is_active: true,
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

  const scopedTemplates = useMemo(() => {
    return shiftTemplates.filter((row) => {
      if (role === "branch_pic") {
        return !row.branch_id || String(row.branch_id ?? "") === String(profile?.branch_id ?? "");
      }

      return true;
    });
  }, [profile?.branch_id, role, shiftTemplates]);

  const staffOptions = useMemo(() => {
    return staff
      .filter((row) => (form.branch_id ? String(row.branch_id ?? "") === form.branch_id : true))
      .map((row) => ({ value: String(row.id ?? ""), label: String(row.full_name ?? row.email ?? row.id) }))
      .filter((option) => option.value);
  }, [form.branch_id, staff]);

  const shiftOptions: SelectOption[] = useMemo(() => {
    return scopedTemplates
      .filter(
        (row) =>
          !row.branch_id ||
          String(row.branch_id ?? "") === String(form.branch_id || (profile?.branch_id ?? "")),
      )
      .map((row) => ({
        value: String(row.id ?? ""),
        label: `${String(row.name ?? row.shift_name ?? row.title ?? row.id)}${row.branch_id ? "" : " (Global)"}`,
      }));
  }, [form.branch_id, profile?.branch_id, scopedTemplates]);

  async function handleRosterSubmit(event: FormEvent<HTMLFormElement>) {
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

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setTemplateMessage("Supabase is not configured.");
      return;
    }

    setIsTemplateSaving(true);
    setTemplateMessage(null);

    const { error: saveError } = await supabase.from("shift_templates").insert({
      name: templateForm.name,
      code: templateForm.code || null,
      branch_id: templateForm.branch_id || null,
      start_time: templateForm.start_time || null,
      end_time: templateForm.end_time || null,
      description: templateForm.description || null,
      is_active: templateForm.is_active,
    });

    setIsTemplateSaving(false);

    if (saveError) {
      setTemplateMessage(saveError.message);
      return;
    }

    setTemplateMessage("Shift template created.");
    setTemplateForm({
      name: "",
      code: "",
      branch_id: profile?.branch_id ? String(profile.branch_id) : "",
      start_time: "",
      end_time: "",
      description: "",
      is_active: true,
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
                      {["Staff", "Shift", "Date", "Branch", "Published"].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {filteredRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{scopedTemplates.find((shift) => String(shift.id ?? "") === String(row.shift_template_id ?? ""))?.name as string ?? String(row.shift_template_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.roster_date ?? row.date)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.is_published === true ? "published" : row.status ?? "draft")} /></td>
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

        <div className="space-y-6">
          <FormSection title="Add roster entry" description={canManage ? "Branch PIC manages their own branch roster. HR and super admin can manage all branches." : "Your role has read-only roster access."}>
            {canManage ? (
              <form className="space-y-4" onSubmit={handleRosterSubmit}>
                <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value, staff_id: "", shift_template_id: "" }))} className={inputClass} required>
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

          <FormSection title="Create shift template" description={canManage ? "Branch PIC can create branch templates. HR and super admin can create global or branch-specific templates." : "Templates are view-only for this role."}>
            {canManage ? (
              <form className="space-y-4" onSubmit={handleTemplateSubmit}>
                <input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Template name" className={inputClass} required />
                <input value={templateForm.code} onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className={inputClass} />
                <select value={templateForm.branch_id} onChange={(event) => setTemplateForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass}>
                  <option value="">Global template</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input type="time" value={templateForm.start_time} onChange={(event) => setTemplateForm((current) => ({ ...current, start_time: event.target.value }))} className={inputClass} />
                  <input type="time" value={templateForm.end_time} onChange={(event) => setTemplateForm((current) => ({ ...current, end_time: event.target.value }))} className={inputClass} />
                </div>
                <textarea value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Description" className={textareaClass} />
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={templateForm.is_active} onChange={(event) => setTemplateForm((current) => ({ ...current, is_active: event.target.checked }))} /> Active template
                </label>
                {templateMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{templateMessage}</p> : null}
                <button type="submit" disabled={isTemplateSaving} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70">
                  <Layers3 className="h-4 w-4" />
                  {isTemplateSaving ? "Saving..." : "Create template"}
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {scopedTemplates.length ? scopedTemplates.map((template) => (
                  <div key={String(template.id ?? `${template.name}-${template.start_time}`)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
                    <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--accent)]" />{String(template.name ?? "Shift template")}</div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(template.start_time ?? "-")} - {String(template.end_time ?? "-")}</p>
                  </div>
                )) : <EmptyState title="No shift templates found" description="Templates will appear here once created by roster managers." />}
              </div>
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

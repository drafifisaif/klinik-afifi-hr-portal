"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { formatDate, mapRowsWithId } from "@/lib/utils";

interface HolidayManagementPageProps {
  rows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function HolidayManagementPage({ rows, branches, role, profile, error }: HolidayManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    holiday_name: "",
    holiday_date: "",
    branch_id: "",
    is_clinic_holiday: true,
    is_public_holiday: false,
    notes: "",
  });

  const canManage = role === "super_admin" || role === "hr";
  const holidayRows = useMemo(() => {
    const scoped = role === "branch_pic"
      ? rows.filter((row) => !row.branch_id || String(row.branch_id ?? "") === String(profile?.branch_id ?? ""))
      : rows;
    return mapRowsWithId(scoped);
  }, [profile?.branch_id, role, rows]);

  const upcoming = holidayRows.filter((row) => new Date(String(row.holiday_date ?? "")).getTime() >= new Date().setHours(0, 0, 0, 0));
  const past = holidayRows.filter((row) => new Date(String(row.holiday_date ?? "")).getTime() < new Date().setHours(0, 0, 0, 0));

  function startEdit(row: TableRow) {
    setEditingId(String(row.id));
    setForm({
      holiday_name: String(row.holiday_name ?? row.name ?? ""),
      holiday_date: String(row.holiday_date ?? "").slice(0, 10),
      branch_id: String(row.branch_id ?? ""),
      is_clinic_holiday: row.is_clinic_holiday !== false,
      is_public_holiday: row.is_public_holiday === true,
      notes: String(row.notes ?? ""),
    });
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
      holiday_name: form.holiday_name,
      holiday_date: form.holiday_date,
      branch_id: form.branch_id || null,
      is_clinic_holiday: form.is_clinic_holiday,
      is_public_holiday: form.is_public_holiday,
      notes: form.notes || null,
    };

    const query = editingId
      ? supabase.from("holidays").update(payload).eq("id", editingId)
      : supabase.from("holidays").insert(payload);

    const { error: saveError } = await query;
    setIsSubmitting(false);

    if (saveError) {
      setMessage(saveError.message);
      return;
    }

    setMessage(editingId ? "Holiday updated." : "Holiday created.");
    setEditingId(null);
    setForm({ holiday_name: "", holiday_date: "", branch_id: "", is_clinic_holiday: true, is_public_holiday: false, notes: "" });
    router.refresh();
  }

  async function deleteHoliday(id: string) {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const confirmed = window.confirm("Delete this holiday?");
    if (!confirmed) {
      return;
    }

    const { error: deleteError } = await supabase.from("holidays").delete().eq("id", id);

    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    setMessage("Holiday deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load holidays" description={error} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <FormSection title="Upcoming holidays" description="Shows global holidays and branch-specific holidays visible to the current user.">
            {upcoming.length ? (
              <div className="space-y-4">
                {upcoming.map((row) => (
                  <div key={String(row.id)} className="rounded-3xl border border-[var(--border)] bg-white px-5 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">{String(row.holiday_name ?? "Holiday")}</h3>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">{formatDate(row.holiday_date)} · {row.branch_id ? branches.find((branch) => branch.id === String(row.branch_id))?.name ?? String(row.branch_id) : "All branches"}</p>
                      </div>
                      {canManage ? (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => startEdit(row)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold text-[var(--foreground)]"><Pencil className="h-3.5 w-3.5" />Edit</button>
                          <button type="button" onClick={() => deleteHoliday(String(row.id))} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No upcoming holidays" description="Upcoming public and clinic holidays will appear here." />
            )}
          </FormSection>
          <FormSection title="Past holidays" description="Historical holidays remain visible for reference and auditing.">
            {past.length ? (
              <div className="space-y-3">
                {past.map((row) => (
                  <div key={String(row.id)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">{String(row.holiday_name ?? "Holiday")} · {formatDate(row.holiday_date)}</div>
                ))}
              </div>
            ) : (
              <EmptyState title="No past holidays yet" description="Past holidays will appear here once records exist." />
            )}
          </FormSection>
        </div>

        <FormSection title={editingId ? "Edit holiday" : "Add holiday"} description={canManage ? "HR and super admin can create, edit, and delete holiday records." : "This role can review holidays but cannot change them."}>
          {canManage ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <input value={form.holiday_name} onChange={(event) => setForm((current) => ({ ...current, holiday_name: event.target.value }))} placeholder="Holiday name" className={inputClass} required />
              <input type="date" value={form.holiday_date} onChange={(event) => setForm((current) => ({ ...current, holiday_date: event.target.value }))} className={inputClass} required />
              <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass}>
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={form.is_clinic_holiday} onChange={(event) => setForm((current) => ({ ...current, is_clinic_holiday: event.target.checked }))} /> Clinic holiday
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={form.is_public_holiday} onChange={(event) => setForm((current) => ({ ...current, is_public_holiday: event.target.checked }))} /> Public holiday
              </label>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} placeholder="Notes" className={textareaClass} />
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                <CalendarPlus className="h-4 w-4" />
                {isSubmitting ? "Saving..." : editingId ? "Update holiday" : "Add holiday"}
              </button>
            </form>
          ) : (
            <EmptyState title="Holiday management is read-only" description="This role can view holiday records but cannot create or edit them." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { TableRow } from "@/lib/types";
import { mapRowsWithId } from "@/lib/utils";

interface DocumentRequirementsPageProps {
  rows: TableRow[];
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function DocumentRequirementsPage({ rows, error }: DocumentRequirementsPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    role_name: "staff",
    document_name: "",
    is_required: "true",
    requires_expiry: "false",
    yearly_renewal: "false",
  });

  const requirementRows = useMemo(() => mapRowsWithId(rows), [rows]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const { error: saveError } = await supabase.from("document_requirements").insert({
      role_name: form.role_name,
      document_name: form.document_name,
      is_required: form.is_required === "true",
      requires_expiry: form.requires_expiry === "true",
      yearly_renewal: form.yearly_renewal === "true",
    });

    setIsSubmitting(false);

    if (saveError) {
      setMessage(saveError.message);
      return;
    }

    setMessage("Document requirement created.");
    setForm({
      role_name: "staff",
      document_name: "",
      is_required: "true",
      requires_expiry: "false",
      yearly_renewal: "false",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load requirements" description={error} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <FormSection title="Document requirements" description="Track which roles need which documents and whether renewals apply.">
          {requirementRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {[
                        "Role",
                        "Document",
                        "Required",
                        "Expiry",
                        "Yearly Renewal",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {requirementRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm capitalize text-[var(--foreground)]">{String(row.role_name ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_name ?? "-")}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={row.is_required ? "required" : "optional"} /></td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={row.requires_expiry ? "tracked" : "not required"} /></td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={row.yearly_renewal ? "yearly" : "as needed"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No requirements configured yet" description="Create the first requirement so staff compliance can be reviewed by role." />
          )}
        </FormSection>

        <FormSection title="Add requirement" description="Create requirement rules per role without changing staff records.">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <select value={form.role_name} onChange={(event) => setForm((current) => ({ ...current, role_name: event.target.value }))} className={inputClass}>
              {[
                "staff",
                "branch_pic",
                "operation",
                "hr",
                "super_admin",
              ].map((roleName) => (
                <option key={roleName} value={roleName}>{roleName.replaceAll("_", " ")}</option>
              ))}
            </select>
            <input value={form.document_name} onChange={(event) => setForm((current) => ({ ...current, document_name: event.target.value }))} placeholder="Document name" className={inputClass} required />
            <select value={form.is_required} onChange={(event) => setForm((current) => ({ ...current, is_required: event.target.value }))} className={inputClass}>
              <option value="true">Required</option>
              <option value="false">Optional</option>
            </select>
            <select value={form.requires_expiry} onChange={(event) => setForm((current) => ({ ...current, requires_expiry: event.target.value }))} className={inputClass}>
              <option value="false">No expiry tracking</option>
              <option value="true">Requires expiry</option>
            </select>
            <select value={form.yearly_renewal} onChange={(event) => setForm((current) => ({ ...current, yearly_renewal: event.target.value }))} className={inputClass}>
              <option value="false">No yearly renewal</option>
              <option value="true">Yearly renewal</option>
            </select>
            {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
            <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Add requirement"}
            </button>
          </form>
        </FormSection>
      </div>
    </div>
  );
}

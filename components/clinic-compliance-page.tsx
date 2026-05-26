"use client";

import { FormEvent, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { getFilename, mapRowsWithId, sanitizeFilename } from "@/lib/utils";

interface ClinicCompliancePageProps {
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

export function ClinicCompliancePage({ rows, branches, role, profile, error }: ClinicCompliancePageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    branch_id: String(profile?.branch_id ?? ""),
    category: "",
    document_name: "",
    document_year: String(new Date().getFullYear()),
    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  const canManage = role === "super_admin" || role === "hr";
  const scopedRows = useMemo(() => {
    const mapped = mapRowsWithId(rows);

    if (role === "branch_pic") {
      return mapped.filter((row) => !row.branch_id || String(row.branch_id ?? "") === String(profile?.branch_id ?? ""));
    }

    return mapped;
  }, [profile?.branch_id, role, rows]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !file || !profile?.id || !canManage) {
      setMessage("Only HR and super admin can upload clinic compliance documents.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const safeName = sanitizeFilename(file.name);
    const filePath = `clinic-compliance/${form.branch_id}/${form.document_year}-${safeName}`;
    const uploadResult = await supabase.storage.from("clinic-compliance").upload(filePath, file, {
      upsert: true,
    });

    if (uploadResult.error) {
      setIsSubmitting(false);
      setMessage(uploadResult.error.message);
      return;
    }

    const { error: insertError } = await supabase.from("clinic_compliance_documents").insert({
      branch_id: form.branch_id || null,
      category: form.category || null,
      document_name: form.document_name,
      document_year: Number(form.document_year || new Date().getFullYear()),
      file_url: filePath,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      status: "valid",
      notes: form.notes || null,
      uploaded_by: profile.id,
    });

    setIsSubmitting(false);

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("Clinic compliance document uploaded.");
    setFile(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load clinic compliance data" description={error} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <FormSection title="Clinic compliance documents" description="Private file paths are stored while compliance metadata remains searchable by branch and category.">
          {scopedRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {["Branch", "Category", "Document", "File", "Expiry", "Status"].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {scopedRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.category ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_name ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getFilename(row.file_url)}</td>
                        <td className="px-4 py-4 text-sm"><ExpiryBadge row={row} /></td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "valid")} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No clinic documents uploaded yet" description="Upload the first clinic compliance file to begin branch-level tracking." />
          )}
        </FormSection>

        <FormSection title="Upload clinic document" description={canManage ? "HR and super admin can upload and manage clinic compliance files." : "Operation is view-only, and branch PIC can review their branch if permitted by policy."}>
          {canManage ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass} required>
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Category" className={inputClass} required />
              <input value={form.document_name} onChange={(event) => setForm((current) => ({ ...current, document_name: event.target.value }))} placeholder="Document name" className={inputClass} required />
              <input value={form.document_year} onChange={(event) => setForm((current) => ({ ...current, document_year: event.target.value }))} placeholder="Document year" className={inputClass} />
              <div className="grid gap-4 sm:grid-cols-2">
                <input type="date" value={form.issue_date} onChange={(event) => setForm((current) => ({ ...current, issue_date: event.target.value }))} className={inputClass} />
                <input type="date" value={form.expiry_date} onChange={(event) => setForm((current) => ({ ...current, expiry_date: event.target.value }))} className={inputClass} />
              </div>
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" rows={4} className={textareaClass} />
              <FileUploadField label="Clinic compliance file" file={file} onChange={setFile} helperText="Files stay private. The app records only the storage path and filename for this batch." />
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                <FileUp className="h-4 w-4" />
                {isSubmitting ? "Uploading..." : "Upload document"}
              </button>
            </form>
          ) : (
            <EmptyState title="Upload not available" description="Only HR and super admin can upload clinic compliance files in this batch." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

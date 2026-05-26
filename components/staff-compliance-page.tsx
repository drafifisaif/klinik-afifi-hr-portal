"use client";

import { FormEvent, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, TableRow } from "@/lib/types";
import { formatDate, getFilename, mapRowsWithId } from "@/lib/utils";

interface StaffCompliancePageProps {
  documents: TableRow[];
  staff: TableRow[];
  branches: BranchOption[];
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function StaffCompliancePage({ documents, staff, branches, error }: StaffCompliancePageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    branch_id: "",
    document_name: "",
    document_type: "",
    document_year: "",
    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  const rows = useMemo(() => mapRowsWithId(documents), [documents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!file) {
      setMessage("Please choose a document file to upload.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const filePath = `staff/${form.staff_id || "unassigned"}/${Date.now()}-${file.name}`;
    const uploadResult = await supabase.storage.from("staff-compliance").upload(filePath, file, {
      upsert: true,
    });

    if (uploadResult.error) {
      setIsSubmitting(false);
      setMessage(uploadResult.error.message);
      return;
    }

    const { error: insertError } = await supabase.from("staff_documents").insert({
      staff_id: form.staff_id || null,
      branch_id: form.branch_id || null,
      document_name: form.document_name,
      document_type: form.document_type || null,
      document_year: form.document_year ? Number(form.document_year) : null,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      notes: form.notes || null,
      file_url: filePath,
    });

    setIsSubmitting(false);

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("Staff compliance document uploaded.");
    setFile(null);
    setForm({
      staff_id: "",
      branch_id: "",
      document_name: "",
      document_type: "",
      document_year: "",
      issue_date: "",
      expiry_date: "",
      notes: "",
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load staff compliance data" description={error} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <FormSection title="Uploaded staff documents" description="Uploaded files are stored privately. This view shows document metadata and filenames only.">
          {rows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {[
                        "Staff",
                        "Document",
                        "Type",
                        "File",
                        "Expiry",
                        "Status",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {rows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm">
                          <p className="font-semibold text-[var(--foreground)]">{String(row.document_name ?? "-")}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_type ?? row.category ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getFilename(row.file_url)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.expiry_date)}</td>
                        <td className="px-4 py-4 text-sm"><ExpiryBadge row={row} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No staff documents uploaded yet" description="Upload the first compliance file to start tracking expiry and requirements." />
          )}
        </FormSection>

        <FormSection title="Upload staff document" description="Store the private file path in `file_url` and keep the file in the `staff-compliance` bucket.">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <select value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))} className={inputClass} required>
              <option value="">Select staff</option>
              {staff.map((row) => (
                <option key={String(row.id)} value={String(row.id ?? "")}>{String(row.full_name ?? row.email ?? row.id)}</option>
              ))}
            </select>
            <select value={form.branch_id} onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass}>
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <input value={form.document_name} onChange={(event) => setForm((current) => ({ ...current, document_name: event.target.value }))} placeholder="Document name" className={inputClass} required />
            <input value={form.document_type} onChange={(event) => setForm((current) => ({ ...current, document_type: event.target.value }))} placeholder="Document type" className={inputClass} />
            <input value={form.document_year} onChange={(event) => setForm((current) => ({ ...current, document_year: event.target.value }))} placeholder="Document year" className={inputClass} />
            <div className="grid gap-4 sm:grid-cols-2">
              <input type="date" value={form.issue_date} onChange={(event) => setForm((current) => ({ ...current, issue_date: event.target.value }))} className={inputClass} />
              <input type="date" value={form.expiry_date} onChange={(event) => setForm((current) => ({ ...current, expiry_date: event.target.value }))} className={inputClass} />
            </div>
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" rows={4} className={textareaClass} />
            <FileUploadField label="Compliance file" file={file} onChange={setFile} helperText="Files remain private in Supabase Storage. Only the stored path is displayed in the app." />
            {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
            <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
              <FileUp className="h-4 w-4" />
              {isSubmitting ? "Uploading..." : "Upload document"}
            </button>
          </form>
        </FormSection>
      </div>
    </div>
  );
}

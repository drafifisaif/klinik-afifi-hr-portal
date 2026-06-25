"use client";

import { FormEvent, useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { getExpiryStatus } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { getFilename, mapRowsWithId, normalizeString, sanitizeFilename } from "@/lib/utils";

interface StaffCompliancePageProps {
  documents: TableRow[];
  staff: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  initialStatusFilter?: string | null;
  initialFilter?: string | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function StaffCompliancePage({ documents, staff, branches, role, profile, currentStaff, initialStatusFilter, initialFilter, error }: StaffCompliancePageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    staff_id: String(currentStaff?.id ?? ""),
    branch_id: String(currentStaff?.branch_id ?? profile?.branch_id ?? ""),
    document_name: "",
    document_type: "",
    document_year: String(new Date().getFullYear()),
    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  const canManageAll = role === "super_admin" || role === "hr";
  const canUploadOwn = role === "staff" && currentStaff?.id;
  const canReview = canManageAll;

  const rows = useMemo(() => {
    const mapped = mapRowsWithId(documents);

    if (canManageAll) {
      return mapped;
    }

    return mapped.filter((row) => String(row.staff_id ?? "") === String(currentStaff?.id ?? ""));
  }, [canManageAll, currentStaff?.id, documents]);
  const filteredRows = useMemo(() => {
    let nextRows = rows;
    const normalizedStatusFilter = normalizeString(initialStatusFilter);
    const normalizedFilter = normalizeString(initialFilter);

    if (normalizedStatusFilter === "pending") {
      nextRows = nextRows.filter((row) => normalizeString(row.status) === "pending_review");
    }

    if (normalizedFilter === "expiring_soon") {
      nextRows = nextRows.filter((row) => getExpiryStatus(row).label === "expiring_soon");
    }

    if (normalizedFilter === "expired") {
      nextRows = nextRows.filter((row) => getExpiryStatus(row).label === "expired");
    }

    if (normalizedFilter === "doctor_apc_mmc_risk") {
      nextRows = nextRows.filter((row) => {
        const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
        return (docText.includes("apc") || docText.includes("mmc")) && ["expiring_soon", "expired"].includes(getExpiryStatus(row).label);
      });
    }

    if (normalizedFilter === "juruxray_cme_risk") {
      nextRows = nextRows.filter((row) => {
        const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
        return (docText.includes("juruxray") || docText.includes("cme") || docText.includes("medical checkup")) && ["expiring_soon", "expired"].includes(getExpiryStatus(row).label);
      });
    }

    return nextRows;
  }, [initialFilter, initialStatusFilter, rows]);

  const availableStaff = canManageAll
    ? staff
    : staff.filter((row) => String(row.id ?? "") === String(currentStaff?.id ?? ""));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !file || !profile?.id) {
      setMessage("Choose a file and make sure your profile is available.");
      return;
    }

    if (!(canManageAll || canUploadOwn)) {
      setMessage("You do not have permission to upload this document.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const staffId = canManageAll ? form.staff_id : String(currentStaff?.id ?? "");
    const branchId = canManageAll ? form.branch_id : String(currentStaff?.branch_id ?? profile.branch_id ?? "");
    const safeName = sanitizeFilename(file.name);
    const filePath = `staff-compliance/${staffId}/${form.document_year}-${safeName}`;
    const uploadResult = await supabase.storage.from("staff-compliance").upload(filePath, file, {
      upsert: true,
    });

    if (uploadResult.error) {
      setIsSubmitting(false);
      setMessage(uploadResult.error.message);
      return;
    }

    const { error: insertError } = await supabase.from("staff_documents").insert({
      staff_id: staffId || null,
      branch_id: branchId || null,
      document_name: form.document_name,
      document_type: form.document_type || null,
      document_year: Number(form.document_year || new Date().getFullYear()),
      file_url: filePath,
      issue_date: form.issue_date || null,
      expiry_date: form.expiry_date || null,
      status: "pending_review",
      notes: form.notes || null,
      uploaded_by: profile.id,
    });

    setIsSubmitting(false);

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("Staff compliance document uploaded.");
    setFile(null);
    router.refresh();
  }

  async function updateStatus(documentId: string, status: string) {
    if (!supabase || !canReview) {
      return;
    }

    const { error: updateError } = await supabase
      .from("staff_documents")
      .update({ status })
      .eq("id", documentId);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    setMessage(`Document marked as ${status.replaceAll("_", " ")}.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load staff compliance data" description={error} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <FormSection title="Uploaded staff documents" description="Files remain private. This view shows metadata, filenames, expiry, and review status.">
          {filteredRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {["Staff", "Document", "Type", "File", "Expiry", "Status", "Review"].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {filteredRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm"><p className="font-semibold text-[var(--foreground)]">{String(row.document_name ?? "-")}</p><p className="text-xs text-[var(--muted-foreground)]">{branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}</p></td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_type ?? row.category ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getFilename(row.file_url)}</td>
                        <td className="px-4 py-4 text-sm"><ExpiryBadge row={row} /></td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.status ?? "pending_review")}</td>
                        <td className="px-4 py-4 text-sm">
                          {canReview ? (
                            <div className="flex flex-wrap gap-2">
                              {[
                                "pending_review",
                                "approved",
                                "rejected",
                                "expired",
                              ].map((status) => (
                                <button key={status} type="button" onClick={() => updateStatus(String(row.id), status)} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">{status.replaceAll("_", " ")}</button>
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
            <EmptyState title={initialStatusFilter || initialFilter ? "No items found for this filter." : "No staff documents uploaded yet"} description={initialStatusFilter || initialFilter ? "No items found for this filter." : "Upload the first compliance file to start tracking expiry and review status."} />
          )}
        </FormSection>

        <FormSection title="Upload staff document" description={canManageAll ? "HR and super admin can upload for any staff member." : canUploadOwn ? "You can upload your own staff compliance documents here." : "This role can only view document records."}>
          {canManageAll || canUploadOwn ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <select value={form.staff_id} onChange={(event) => setForm((current) => ({ ...current, staff_id: event.target.value }))} className={inputClass} required>
                <option value="">Select staff</option>
                {availableStaff.map((row) => (
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
              <FileUploadField label="Compliance file" file={file} onChange={setFile} helperText="Files remain private in Supabase Storage. Only the stored path and filename are shown in the app." />
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <button type="submit" disabled={isSubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                <FileUp className="h-4 w-4" />
                {isSubmitting ? "Uploading..." : "Upload document"}
              </button>
            </form>
          ) : (
            <EmptyState title="Upload not available" description="Only HR, super admin, or the owning staff member can upload staff compliance files." />
          )}
        </FormSection>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FileUp, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TableRow, UserRole } from "@/lib/types";
import { filterMcRequestsForRole } from "@/lib/data";
import { formatDate, formatDateTime, getFilename, getMalaysiaDateString, mapRowsWithId, sanitizeFilename } from "@/lib/utils";

interface McWorkflowPageProps {
  leaveRequests: TableRow[];
  currentStaff: TableRow | null;
  profile: Profile | null;
  role: UserRole;
  staffRows: TableRow[];
  initialStatusFilter?: string | null;
  error?: string | null;
}

const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

export function McWorkflowPage({ leaveRequests, currentStaff, profile, role, staffRows, initialStatusFilter, error }: McWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);

  const canUpload = role === "staff" || role === "branch_pic";
  const canReview = role === "super_admin" || role === "hr" || role === "branch_pic";
  const scopedRows = useMemo(
    () =>
      filterMcRequestsForRole(
        mapRowsWithId(leaveRequests),
        role,
        profile,
        profile?.id ?? "",
        String(currentStaff?.id ?? "") || undefined,
        String(currentStaff?.branch_id ?? profile?.branch_id ?? "") || undefined,
      ),
    [leaveRequests, role, profile, currentStaff?.id, currentStaff?.branch_id],
  );
  const filteredRows = useMemo(() => {
    const normalizedStatusFilter = String(initialStatusFilter ?? "").trim().toLowerCase();
    if (!normalizedStatusFilter) {
      return scopedRows;
    }

    return scopedRows.filter((row) => String(row.status ?? "").trim().toLowerCase() === normalizedStatusFilter);
  }, [initialStatusFilter, scopedRows]);

  function canViewMcFile(row: TableRow) {
    if (role === "hr" || role === "super_admin") {
      return true;
    }

    return (
      String(row.profile_id ?? "") === String(profile?.id ?? "") ||
      String(row.staff_id ?? "") === String(currentStaff?.id ?? "")
    );
  }

  async function handleViewMc(rowId: string) {
    setReviewMessage(null);
    setMessage(null);
    setOpeningFileId(rowId);

    try {
      const response = await fetch(`/api/mc/file?id=${encodeURIComponent(rowId)}`, {
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.url) {
        setReviewMessage(String(result?.error ?? "Unable to open MC file."));
        setOpeningFileId(null);
        return;
      }

      window.open(String(result.url), "_blank", "noopener,noreferrer");
    } catch {
      setReviewMessage("Unable to open MC file.");
    } finally {
      setOpeningFileId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !file || !profile?.id || !currentStaff) {
      setMessage("A linked staff profile and MC file are required.");
      return;
    }

    if (!currentStaff.id || !currentStaff.branch_id || String(currentStaff.profile_id ?? "") !== String(profile.id)) {
      setMessage("Staff profile is incomplete. Please complete your profile before uploading MC.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const safeName = sanitizeFilename(file.name);
    const datePrefix = getMalaysiaDateString();
    const filePath = `mc/${profile.id}/${datePrefix}-${safeName}`;
    const uploadResult = await supabase.storage.from("mc-uploads").upload(filePath, file, {
      upsert: true,
    });

    if (uploadResult.error) {
      setIsSubmitting(false);
      setMessage(uploadResult.error.message);
      return;
    }

    const { error: insertError } = await supabase.from("leave_requests").insert({
      leave_type: "medical_leave",
      profile_id: profile.id,
      staff_id: currentStaff.id,
      branch_id: currentStaff.branch_id,
      attachment_url: filePath,
      reason: reason || null,
      start_date: datePrefix,
      end_date: datePrefix,
      total_days: 1,
      status: "pending",
    });

    setIsSubmitting(false);

    if (insertError) {
      setMessage(insertError.message);
      return;
    }

    setMessage("MC uploaded and submitted for review.");
    setFile(null);
    setReason("");
    router.refresh();
  }

  async function handleReview(rowId: string, status: "approved" | "rejected") {
    if (!supabase || !profile?.id) {
      setReviewMessage("Unable to review this MC right now.");
      return;
    }

    const note = window.prompt("Add a review note (optional):", "") ?? "";
    const { error: updateError } = await supabase
      .from("leave_requests")
      .update({
        status,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        review_note: note || null,
      })
      .eq("id", rowId);

    if (updateError) {
      setReviewMessage(updateError.message);
      return;
    }

    setReviewMessage(`MC ${status}.`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load MC records" description={error} /> : null}
      <div className={canUpload ? "grid gap-6 xl:grid-cols-[1.2fr_0.8fr]" : "space-y-6"}>
        <FormSection title="MC submissions" description="Medical certificate requests are tracked as `medical_leave` leave requests with a private attachment path.">
          {reviewMessage ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{reviewMessage}</p> : null}
          {filteredRows.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {filteredRows.map((row) => (
                  <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--foreground)]">{staffRows.find((staffRow) => String(staffRow.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDate(row.start_date)}</p>
                      </div>
                      <StatusBadge value={String(row.status ?? "pending")} />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)]">
                      <p><span className="font-semibold">File:</span> {getFilename(row.attachment_url)}</p>
                      <p className="whitespace-pre-line text-xs text-[var(--muted-foreground)]"><span className="font-semibold text-[var(--foreground)]">Reviewed:</span> {row.reviewed_at ? `${formatDateTime(row.reviewed_at)}${row.review_note ? `\n${String(row.review_note)}` : ""}` : "-"}</p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      {canViewMcFile(row) ? (
                        <button type="button" onClick={() => handleViewMc(String(row.id))} disabled={openingFileId === String(row.id)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--foreground)] disabled:opacity-70">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {openingFileId === String(row.id) ? "Opening..." : "View MC"}
                        </button>
                      ) : null}
                      {canReview ? (
                        <>
                          <button type="button" onClick={() => handleReview(String(row.id), "approved")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button type="button" onClick={() => handleReview(String(row.id), "rejected")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700">
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">View only</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-[24px] border border-[var(--border)] md:block">
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {["Staff", "Date", "File", "Status", "Reviewed", "Action"].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {filteredRows.map((row) => (
                      <tr key={String(row.id)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{staffRows.find((staffRow) => String(staffRow.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.start_date)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getFilename(row.attachment_url)}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "pending")} /></td>
                        <td className="px-4 py-4 text-xs text-[var(--muted-foreground)]">{row.reviewed_at ? `${formatDateTime(row.reviewed_at)}${row.review_note ? `\n${String(row.review_note)}` : ""}` : "-"}</td>
                        <td className="px-4 py-4 text-sm">
                          {canReview ? (
                            <div className="flex flex-wrap gap-2">
                              {canViewMcFile(row) ? (
                                <button type="button" onClick={() => handleViewMc(String(row.id))} disabled={openingFileId === String(row.id)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-70">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {openingFileId === String(row.id) ? "Opening..." : "View MC"}
                                </button>
                              ) : null}
                              <button type="button" onClick={() => handleReview(String(row.id), "approved")} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button type="button" onClick={() => handleReview(String(row.id), "rejected")} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>
                          ) : canViewMcFile(row) ? (
                            <button type="button" onClick={() => handleViewMc(String(row.id))} disabled={openingFileId === String(row.id)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-70">
                              <ExternalLink className="h-3.5 w-3.5" />
                              {openingFileId === String(row.id) ? "Opening..." : "View MC"}
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
            </>
          ) : (
            <EmptyState title={initialStatusFilter ? "No items found for this filter." : "No MC submissions yet"} description={initialStatusFilter ? "No items found for this filter." : "Uploaded medical certificate requests will appear here once submitted."} />
          )}
        </FormSection>

        {canUpload ? (
          <FormSection title="Upload my MC" description="Only staff and branch PIC can submit their own MC in this batch.">
            {currentStaff ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <FileUploadField label="MC file" file={file} onChange={setFile} helperText="The uploaded file remains private in the `mc-uploads` bucket." />
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Optional note for the reviewer" className={textareaClass} />
                {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
                <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70">
                  <FileUp className="h-4 w-4" />
                  {isSubmitting ? "Uploading..." : "Submit MC"}
                </button>
              </form>
            ) : (
              <EmptyState title="Complete your staff profile first" description="A linked staff row is required before you can upload MC documents." />
            )}
          </FormSection>
        ) : null}
      </div>
    </div>
  );
}

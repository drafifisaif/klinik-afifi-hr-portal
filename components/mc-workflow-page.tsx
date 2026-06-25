"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FileUp, Search, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FileUploadField } from "@/components/file-upload-field";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { filterMcRequestsForRole } from "@/lib/data";
import {
  formatDate,
  formatMalaysiaDateTime,
  getFilename,
  getMalaysiaDateTimeParts,
  getMalaysiaDateString,
  mapRowsWithId,
  normalizeString,
  sanitizeFilename,
} from "@/lib/utils";

interface McWorkflowPageProps {
  leaveRequests: TableRow[];
  currentStaff: TableRow | null;
  profile: Profile | null;
  role: UserRole;
  staffRows: TableRow[];
  branchRows: TableRow[];
  profileRows: TableRow[];
  initialStatusFilter?: string | null;
  error?: string | null;
}

interface McHistorySummaryRow {
  staffId: string;
  staffName: string;
  email: string;
  branchName: string;
  totalApplications: number;
  totalApproved: number;
  totalRejected: number;
  totalApprovedDays: number;
  lastMcDate: string | null;
}

const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";

function startOfCurrentMonth() {
  const { year, month } = getMalaysiaDateTimeParts(new Date());
  return `${year}-${month}-01`;
}

function getBranchName(branches: BranchOption[], branchId: unknown) {
  return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "No branch";
}

function getStaffName(staffRows: TableRow[], staffId: unknown) {
  return String(staffRows.find((row) => String(row.id ?? "") === String(staffId ?? ""))?.full_name ?? staffId ?? "Unknown User");
}

function getStaffEmail(staffRows: TableRow[], profileRows: TableRow[], staffId: unknown) {
  const staffRow = staffRows.find((row) => String(row.id ?? "") === String(staffId ?? ""));
  const profileRow = profileRows.find((row) => String(row.id ?? "") === String(staffRow?.profile_id ?? ""));
  return String(staffRow?.email ?? profileRow?.email ?? "No email");
}

function getReviewerName(profileRows: TableRow[], reviewerId: unknown) {
  if (!reviewerId) {
    return "-";
  }

  const reviewer = profileRows.find((row) => String(row.id ?? "") === String(reviewerId ?? ""));
  return String(reviewer?.full_name ?? reviewer?.email ?? reviewerId);
}

function calculateTotalDays(row: TableRow) {
  const explicit = Number(row.total_days ?? 0);
  if (explicit > 0) {
    return explicit;
  }

  return 0;
}

export function McWorkflowPage({
  leaveRequests,
  currentStaff,
  profile,
  role,
  staffRows,
  branchRows,
  profileRows,
  initialStatusFilter,
  error,
}: McWorkflowPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState(String(initialStatusFilter ?? "all").trim().toLowerCase() || "all");
  const [selectedHistoryStaffId, setSelectedHistoryStaffId] = useState<string | null>(null);

  const canUpload = role === "staff" || role === "branch_pic";
  const canReview = role === "super_admin" || role === "hr" || role === "branch_pic";
  const branches = useMemo(
    () =>
      branchRows
        .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
        .filter((row) => row.id) as BranchOption[],
    [branchRows],
  );
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
  const pendingRows = useMemo(
    () => scopedRows.filter((row) => normalizeString(row.status) === "pending"),
    [scopedRows],
  );
  const normalizedSearch = normalizeString(searchValue);
  const historyRows = useMemo(() => {
    return scopedRows
      .filter((row) => {
        const status = normalizeString(row.status);
        if (historyStatusFilter !== "all" && status !== historyStatusFilter) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        const staffName = getStaffName(staffRows, row.staff_id);
        const staffEmail = getStaffEmail(staffRows, profileRows, row.staff_id);
        const branchName = getBranchName(branches, row.branch_id);
        const haystack = `${staffName} ${staffEmail} ${branchName}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((left, right) => String(right.start_date ?? right.created_at ?? "").localeCompare(String(left.start_date ?? left.created_at ?? "")));
  }, [branches, historyStatusFilter, normalizedSearch, profileRows, scopedRows, staffRows]);

  const historySummaryRows = useMemo(() => {
    const summaryMap = new Map<string, McHistorySummaryRow>();

    historyRows.forEach((row) => {
      const staffId = String(row.staff_id ?? "");
      if (!staffId) {
        return;
      }

      const current = summaryMap.get(staffId) ?? {
        staffId,
        staffName: getStaffName(staffRows, row.staff_id),
        email: getStaffEmail(staffRows, profileRows, row.staff_id),
        branchName: getBranchName(branches, row.branch_id),
        totalApplications: 0,
        totalApproved: 0,
        totalRejected: 0,
        totalApprovedDays: 0,
        lastMcDate: null,
      };

      current.totalApplications += 1;

      const status = normalizeString(row.status);
      if (status === "approved") {
        current.totalApproved += 1;
        current.totalApprovedDays += calculateTotalDays(row);
      }

      if (status === "rejected") {
        current.totalRejected += 1;
      }

      const rowDate = String(row.start_date ?? row.created_at ?? "");
      if (!current.lastMcDate || rowDate > current.lastMcDate) {
        current.lastMcDate = rowDate;
      }

      summaryMap.set(staffId, current);
    });

    return Array.from(summaryMap.values()).sort((left, right) => left.staffName.localeCompare(right.staffName));
  }, [branches, historyRows, profileRows, staffRows]);

  const selectedHistoryRows = useMemo(() => {
    return historyRows
      .filter((row) => String(row.staff_id ?? "") === String(selectedHistoryStaffId ?? ""))
      .sort((left, right) => String(right.start_date ?? right.created_at ?? "").localeCompare(String(left.start_date ?? left.created_at ?? "")));
  }, [historyRows, selectedHistoryStaffId]);

  const monthlyStats = useMemo(() => {
    const startOfMonth = startOfCurrentMonth();
    const pendingCount = pendingRows.length;
    const approvedThisMonth = scopedRows.filter((row) => normalizeString(row.status) === "approved" && String(row.reviewed_at ?? row.updated_at ?? "").localeCompare(startOfMonth) >= 0).length;
    const rejectedThisMonth = scopedRows.filter((row) => normalizeString(row.status) === "rejected" && String(row.reviewed_at ?? row.updated_at ?? "").localeCompare(startOfMonth) >= 0).length;
    const totalMcDaysThisMonth = scopedRows
      .filter((row) => normalizeString(row.status) === "approved" && String(row.start_date ?? "").localeCompare(startOfMonth.slice(0, 10)) >= 0)
      .reduce((total, row) => total + calculateTotalDays(row), 0);

    return {
      pendingCount,
      approvedThisMonth,
      rejectedThisMonth,
      totalMcDaysThisMonth,
    };
  }, [pendingRows.length, scopedRows]);

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
        <FormSection title="Pending MC Review" description="Pending medical certificate submissions that still need review.">
          {reviewMessage ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{reviewMessage}</p> : null}
          {pendingRows.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {pendingRows.map((row) => (
                  <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--foreground)]">{getStaffName(staffRows, row.staff_id)}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDate(row.start_date)}</p>
                      </div>
                      <StatusBadge value={String(row.status ?? "pending")} />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)]">
                      <p><span className="font-semibold">File:</span> {getFilename(row.attachment_url)}</p>
                      <p><span className="font-semibold">Reason:</span> {String(row.reason ?? "-")}</p>
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
                      ) : null}
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
                      {pendingRows.map((row) => (
                        <tr key={String(row.id)}>
                          <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getStaffName(staffRows, row.staff_id)}</td>
                          <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.start_date)}</td>
                          <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getFilename(row.attachment_url)}</td>
                          <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "pending")} /></td>
                          <td className="px-4 py-4 text-xs text-[var(--muted-foreground)]">{row.reviewed_at ? `${formatMalaysiaDateTime(row.reviewed_at)}${row.review_note ? `\n${String(row.review_note)}` : ""}` : "-"}</td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              {canViewMcFile(row) ? (
                                <button type="button" onClick={() => handleViewMc(String(row.id))} disabled={openingFileId === String(row.id)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-70">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {openingFileId === String(row.id) ? "Opening..." : "View MC"}
                                </button>
                              ) : null}
                              {canReview ? (
                                <>
                                  <button type="button" onClick={() => handleReview(String(row.id), "approved")} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Approve
                                  </button>
                                  <button type="button" onClick={() => handleReview(String(row.id), "rejected")} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                    <XCircle className="h-3.5 w-3.5" />
                                    Reject
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title={initialStatusFilter ? "No items found for this filter." : "No pending MC review"} description={initialStatusFilter ? "No items found for this filter." : "All pending MC submissions have been cleared for now."} />
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

      <FormSection title="MC History" description="Review historical MC applications by staff, check approval outcomes, and inspect the original attachment when needed.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pending MC</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-800">{monthlyStats.pendingCount}</p>
          </div>
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Approved This Month</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-800">{monthlyStats.approvedThisMonth}</p>
          </div>
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Rejected This Month</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-800">{monthlyStats.rejectedThisMonth}</p>
          </div>
          <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Total MC Days This Month</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-sky-800">{monthlyStats.totalMcDaysThisMonth}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Staff name, email, or branch"
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] pl-11 pr-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Filter</span>
            <select
              value={historyStatusFilter}
              onChange={(event) => setHistoryStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        <div className="mt-5">
          {historySummaryRows.length ? (
            <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-[var(--card-muted)]/70">
                    <tr>
                      {["Staff Name", "Branch", "Total MC Applications", "Total Approved MC", "Total Rejected MC", "Total MC Days", "Last MC Date", "View History"].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {historySummaryRows.map((row) => (
                      <tr key={row.staffId}>
                        <td className="px-4 py-4 text-sm">
                          <p className="font-semibold text-[var(--foreground)]">{row.staffName}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{row.email}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.branchName}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.totalApplications}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.totalApproved}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.totalRejected}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.totalApprovedDays}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.lastMcDate ? formatDate(row.lastMcDate) : "-"}</td>
                        <td className="px-4 py-4 text-sm">
                          <button type="button" onClick={() => setSelectedHistoryStaffId(row.staffId)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
                            <ExternalLink className="h-3.5 w-3.5" />
                            View History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState title="No items found for this filter." description="No items found for this filter." />
          )}
        </div>
      </FormSection>

      {selectedHistoryStaffId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_90px_rgba(10,20,20,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-[var(--foreground)]">{getStaffName(staffRows, selectedHistoryStaffId)} MC History</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Newest records first, including reviewer notes and original MC attachment.</p>
              </div>
              <button type="button" onClick={() => setSelectedHistoryStaffId(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 py-5">
              {selectedHistoryRows.length ? (
                <div className="space-y-4">
                  {selectedHistoryRows.map((row) => (
                    <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/45 px-5 py-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-base font-semibold text-[var(--foreground)]">{formatDate(row.start_date)}</p>
                          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            Leave period: {formatDate(row.start_date)} - {formatDate(row.end_date)} · {String(row.total_days ?? 0)} day(s)
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={String(row.status ?? "pending")} />
                          {canViewMcFile(row) ? (
                            <button type="button" onClick={() => handleViewMc(String(row.id))} disabled={openingFileId === String(row.id)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-70">
                              <ExternalLink className="h-3.5 w-3.5" />
                              {openingFileId === String(row.id) ? "Opening..." : "View MC attachment"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-[var(--foreground)] md:grid-cols-2">
                        <p><span className="font-semibold">HR reviewer:</span> {getReviewerName(profileRows, row.reviewed_by)}</p>
                        <p><span className="font-semibold">Review date:</span> {row.reviewed_at ? formatMalaysiaDateTime(row.reviewed_at) : "-"}</p>
                        <p className="md:col-span-2"><span className="font-semibold">Review remarks:</span> {String(row.review_note ?? "-")}</p>
                        <p className="md:col-span-2"><span className="font-semibold">MC file:</span> {getFilename(row.attachment_url)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState title="No MC history found" description="This staff member has no MC records for the current filter." />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

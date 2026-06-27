"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { buildLeaveBalanceSummary, getMissingStaffEditableProfileFields } from "@/lib/data";
import type { BulkImportPreviewRow } from "@/lib/staff-import";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { cn, formatDate, formatDateInput, mapRowsWithId } from "@/lib/utils";

interface StaffManagementPageProps {
  rows: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  currentStaff: TableRow | null;
  entitlements: TableRow[];
  leaveRequests: TableRow[];
  profileRows: TableRow[];
  initialProfileFilter?: string | null;
  error?: string | null;
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]";
const collapsibleButtonClass =
  "flex w-full items-center justify-between gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--card)] px-5 py-4 text-left transition duration-200 hover:-translate-y-[2px] hover:shadow-[0_18px_45px_rgba(18,42,44,0.08)] focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

const emptyStaffForm = {
  profile_id: "",
  full_name: "",
  ic_no: "",
  email: "",
  phone: "",
  position: "",
  department: "",
  branch_id: "",
  date_joined: "",
  status: "active",
  role: "staff",
};

function getEntitlementForStaff(rows: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  return rows
    .filter((row) => String(row.staff_id ?? "") === String(staffId))
    .sort((left, right) => Number(right.entitlement_year ?? 0) - Number(left.entitlement_year ?? 0))[0] ?? null;
}

export function StaffManagementPage({
  rows,
  branches,
  role,
  profile,
  currentStaff,
  entitlements,
  leaveRequests,
  profileRows,
  initialProfileFilter,
  error,
}: StaffManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const formRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [isCreatingImport, setIsCreatingImport] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bulkImportMessage, setBulkImportMessage] = useState<string | null>(null);
  const [bulkTaskMessage, setBulkTaskMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
  const [isAddRecordOpen, setIsAddRecordOpen] = useState(false);
  const [isProfileTaskConfirmOpen, setIsProfileTaskConfirmOpen] = useState(false);
  const [isSendingProfileTasks, setIsSendingProfileTasks] = useState(false);
  const [bulkImportInput, setBulkImportInput] = useState("");
  const [bulkImportRows, setBulkImportRows] = useState<BulkImportPreviewRow[]>([]);
  const [bulkImportSummary, setBulkImportSummary] = useState<Record<string, number> | null>(null);
  const [form, setForm] = useState(emptyStaffForm);

  const canManageExtended = role === "super_admin" || role === "hr";
  const canSendProfileCompletionTasks = role === "super_admin" || role === "hr";
  const staffRows = useMemo(() => mapRowsWithId(rows), [rows]);
  const linkedProfiles = useMemo(() => mapRowsWithId(profileRows), [profileRows]);
  const normalizedProfileFilter = String(initialProfileFilter ?? "").trim().toLowerCase();
  const isIncompleteProfileView = normalizedProfileFilter === "incomplete";

  const getLinkedProfileForStaff = useCallback(
    (row: TableRow) =>
      ((linkedProfiles.find((item) => String(item.id ?? "") === String(row.profile_id ?? "")) as Profile | undefined) ?? null),
    [linkedProfiles],
  );

  const getMissingProfileFieldsForStaff = useCallback(
    (row: TableRow) => getMissingStaffEditableProfileFields(getLinkedProfileForStaff(row), row),
    [getLinkedProfileForStaff],
  );

  function isActiveStaffRow(row: TableRow) {
    const normalizedStatus = String(row.status ?? "active").trim().toLowerCase();
    return normalizedStatus !== "inactive" && normalizedStatus !== "resigned";
  }

  const scopedRows = useMemo(() => {
    if (role === "staff") {
      return currentStaff ? staffRows.filter((row) => String(row.id ?? "") === String(currentStaff.id ?? "")) : [];
    }

    if (role === "branch_pic") {
      return staffRows.filter((row) => String(row.branch_id ?? "") === String(currentStaff?.branch_id ?? profile?.branch_id ?? ""));
    }

    return staffRows;
  }, [currentStaff, profile?.branch_id, role, staffRows]);

  const filteredRows = useMemo(() => {
    if (!isIncompleteProfileView) {
      return scopedRows;
    }

    return scopedRows.filter((row) => isActiveStaffRow(row) && getMissingProfileFieldsForStaff(row).length > 0);
  }, [getMissingProfileFieldsForStaff, isIncompleteProfileView, scopedRows]);

  const selectedStaff =
    filteredRows.find((row) => String(row.id ?? "") === editingId) ??
    filteredRows[0] ??
    (normalizedProfileFilter ? null : currentStaff);
  const groupedByBranch = useMemo(() => {
    const branchMap = new Map<string, { branchId: string; branchName: string; rows: TableRow[] }>();
    const branchNameForId = (branchId: string) => branches.find((branch) => branch.id === branchId)?.name ?? "No branch";

    for (const row of filteredRows) {
      const branchId = String(row.branch_id ?? "");
      const branchName = branchNameForId(branchId);
      const existing = branchMap.get(branchId || branchName) ?? {
        branchId,
        branchName,
        rows: [],
      };
      existing.rows.push(row);
      branchMap.set(branchId || branchName, existing);
    }

    const branchOrder = ["Putatan", "Papar", "Ranau", "Kinabatangan"];
    return Array.from(branchMap.values())
      .map((group) => ({
        ...group,
        rows: group.rows.slice().sort((left, right) => String(left.full_name ?? "").localeCompare(String(right.full_name ?? ""))),
      }))
      .sort((left, right) => {
        const leftIndex = branchOrder.indexOf(left.branchName);
        const rightIndex = branchOrder.indexOf(right.branchName);
        if (leftIndex !== -1 || rightIndex !== -1) {
          return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
        }
        return left.branchName.localeCompare(right.branchName);
      });
  }, [branches, filteredRows]);

  useEffect(() => {
    if (editingId) {
      setIsAddRecordOpen(true);
    }
  }, [editingId]);

  function scrollToForm() {
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function getBranchName(branchId: unknown) {
    return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? String(branchId ?? "-");
  }

  function getLeaveSummaryForStaff(staffId: unknown) {
    const staffIdString = String(staffId ?? "");
    const entitlement = getEntitlementForStaff(entitlements, staffIdString);
    const staffLeaveRows = leaveRequests.filter((row) => String(row.staff_id ?? "") === staffIdString);
    return buildLeaveBalanceSummary(entitlement, staffLeaveRows);
  }

  function renderBranchSummaryTable(rowsForBranch: TableRow[]) {
    if (!rowsForBranch.length) {
      return <EmptyState title="No active staff in this branch" description="Active staff will appear here once branch-linked staff records are available." />;
    }

    return (
      <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)] text-left">
            <thead className="bg-[var(--card-muted)]/70">
              <tr>
                {["Staff", "Role", "AL Total", "AL Balance", "MC Total", "MC Balance", "Unpaid Leave Used", "Emergency Leave Used"].map((label) => (
                  <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-white">
              {rowsForBranch.map((row) => {
                const summary = getLeaveSummaryForStaff(row.id);
                const lowAnnualBalance = summary.annual.remaining <= 3;

                return (
                  <tr key={String(row.id ?? "")}>
                    <td className="px-4 py-4 text-sm">
                      <p className="font-semibold text-[var(--foreground)]">{String(row.full_name ?? row.email ?? "-")}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{String(row.email ?? "No email")}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.position ?? row.department ?? "-")}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{summary.annual.total}</td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 font-semibold",
                          lowAnnualBalance ? "bg-amber-100 text-amber-800" : "bg-[var(--card-muted)] text-[var(--foreground)]",
                        )}
                      >
                        {summary.annual.remaining}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{summary.medical.total}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{summary.medical.remaining}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{summary.unpaid.used}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{summary.emergency.used}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderMissingFieldsText(row: TableRow) {
    const missingFields = getMissingProfileFieldsForStaff(row);
    return missingFields.length ? missingFields.join(", ") : "Complete";
  }

  function renderDirectoryCards(rowsForBranch: TableRow[]) {
    return (
      <>
        <div className="space-y-3 md:hidden">
          {rowsForBranch.map((row) => (
            <article key={String(row.id)} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--foreground)]">{String(row.full_name ?? row.email ?? "-")}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(row.email ?? "No email")}</p>
                </div>
                <StatusBadge value={String(row.status ?? "active")} />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-[var(--foreground)]">
                <p><span className="font-semibold">IC No:</span> {String(row.ic_no ?? "-")}</p>
                <p><span className="font-semibold">Position:</span> {String(row.position ?? row.department ?? "-")}</p>
                <p><span className="font-semibold">Branch:</span> {getBranchName(row.branch_id)}</p>
                <p><span className="font-semibold">Joined:</span> {formatDate(row.date_joined)}</p>
                {isIncompleteProfileView ? (
                  <>
                    <p><span className="font-semibold">Profile completion:</span> Incomplete</p>
                    <p><span className="font-semibold">Missing fields:</span> {renderMissingFieldsText(row)}</p>
                  </>
                ) : null}
              </div>
              <button type="button" onClick={() => startEdit(row)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--foreground)]">
                <Pencil className="h-3.5 w-3.5" />
                {canManageExtended ? "Edit" : "View"}
              </button>
            </article>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[24px] border border-[var(--border)] md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-left">
              <thead className="bg-[var(--card-muted)]/70">
                <tr>
                  {[
                    "Staff",
                    "IC No",
                    "Position",
                    "Branch",
                    ...(isIncompleteProfileView ? ["Missing Fields", "Profile Status"] : []),
                    "Joined",
                    "Status",
                    "Action",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-white">
                {rowsForBranch.map((row) => (
                  <tr key={String(row.id)}>
                    <td className="px-4 py-4 text-sm">
                      <p className="font-semibold text-[var(--foreground)]">{String(row.full_name ?? "-")}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{String(row.email ?? "No email")}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.ic_no ?? "-")}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.position ?? row.department ?? "-")}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{getBranchName(row.branch_id)}</td>
                    {isIncompleteProfileView ? (
                      <>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{renderMissingFieldsText(row)}</td>
                        <td className="px-4 py-4 text-sm"><StatusBadge value="Incomplete" /></td>
                      </>
                    ) : null}
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.date_joined)}</td>
                    <td className="px-4 py-4 text-sm"><StatusBadge value={String(row.status ?? "active")} /></td>
                    <td className="px-4 py-4 text-sm">
                      <button type="button" onClick={() => startEdit(row)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
                        <Pencil className="h-3.5 w-3.5" />
                        {canManageExtended ? "Edit" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyStaffForm);
  }

  function startEdit(row: TableRow) {
    const linkedProfile = linkedProfiles.find((item) => String(item.id ?? "") === String(row.profile_id ?? "")) ?? null;
    const operationalBranchId = String(row.branch_id ?? linkedProfile?.branch_id ?? "");
    setEditingId(String(row.id ?? ""));
    setForm({
      profile_id: String(row.profile_id ?? ""),
      full_name: String(row.full_name ?? ""),
      ic_no: String(row.ic_no ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      position: String(row.position ?? ""),
      department: String(row.department ?? ""),
      branch_id: operationalBranchId,
      date_joined: formatDateInput(row.date_joined),
      status: String(row.status ?? "active"),
      role: String(linkedProfile?.role ?? row.role ?? profile?.role ?? "staff"),
    });
    if (
      canManageExtended &&
      linkedProfile &&
      String(row.branch_id ?? "") &&
      String(linkedProfile.branch_id ?? "") &&
      String(row.branch_id ?? "") !== String(linkedProfile.branch_id ?? "")
    ) {
      setMessage("Branch mismatch detected. Using staff branch as the operational source and syncing both records on save.");
    } else {
      setMessage(null);
    }
    scrollToForm();
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
      position: canManageExtended ? form.position || null : null,
      department: canManageExtended ? form.department || null : null,
      branch_id: canManageExtended ? form.branch_id || null : null,
      date_joined: form.date_joined || null,
      status: canManageExtended ? form.status : "active",
      profile_id: form.profile_id || null,
    };

    const query = editingId
      ? supabase.from("staff").update(payload).eq("id", editingId).select("id, profile_id").single()
      : supabase.from("staff").insert(payload).select("id, profile_id").single();

    const { data: savedStaff, error: saveError } = await query;

    if (saveError) {
      setIsSubmitting(false);
      setMessage(saveError.message);
      return;
    }

    if (canManageExtended && form.profile_id) {
      const profileUpdatePayload = {
        role: form.role,
      };

      const { error: profileError } = await supabase.from("profiles").update(profileUpdatePayload).eq("id", form.profile_id);

      if (profileError) {
        setIsSubmitting(false);
        setMessage(profileError.message);
        return;
      }
    }

    const savedStaffId = String(savedStaff?.id ?? editingId ?? "").trim();
    const savedProfileId = String(savedStaff?.profile_id ?? form.profile_id ?? "").trim();

    if (canManageExtended && savedStaffId) {
      const syncResponse = await fetch("/api/staff/branch-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staffId: savedStaffId,
          branchId: form.branch_id || null,
        }),
      });

      const syncResult = await syncResponse.json().catch(() => null);
      if (!syncResponse.ok) {
        setIsSubmitting(false);
        setMessage(String(syncResult?.error ?? "Branch sync failed."));
        return;
      }
    } else if (canManageExtended && form.branch_id && !savedProfileId) {
      setIsSubmitting(false);
      setMessage("Staff branch saved, but linked profile is missing so profile branch could not be synced.");
      return;
    }

    setIsSubmitting(false);
    setMessage(editingId ? "Staff record updated." : "Staff record created.");
    resetForm();
    router.refresh();
  }

  async function handlePreviewImport() {
    setIsPreviewingImport(true);
    setBulkImportMessage(null);

    try {
      const response = await fetch("/api/staff/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "preview",
          rawInput: bulkImportInput,
        }),
      });

      const result = await response.json();
      setIsPreviewingImport(false);

      if (!response.ok) {
        setBulkImportMessage(String(result?.error ?? "Unable to preview bulk import."));
        setBulkImportRows([]);
        setBulkImportSummary(null);
        return;
      }

      setBulkImportRows((result?.rows ?? []) as BulkImportPreviewRow[]);
      setBulkImportSummary((result?.summary ?? null) as Record<string, number> | null);
      setBulkImportMessage("Preview ready. Semak branch, email, dan duplicate sebelum create users.");
    } catch (error) {
      setIsPreviewingImport(false);
      setBulkImportMessage(error instanceof Error ? error.message : "Unable to preview bulk import.");
    }
  }

  async function handleCreateImport() {
    setIsCreatingImport(true);
    setBulkImportMessage(null);

    try {
      const response = await fetch("/api/staff/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          rawInput: bulkImportInput,
        }),
      });

      const result = await response.json();
      setIsCreatingImport(false);

      if (!response.ok) {
        setBulkImportMessage(String(result?.error ?? "Unable to create staff users."));
        return;
      }

      setBulkImportRows((result?.rows ?? []) as BulkImportPreviewRow[]);
      setBulkImportSummary((result?.summary ?? null) as Record<string, number> | null);
      setBulkImportMessage("Bulk staff import finished. Temporary passwords are shown once below for created users.");
      router.refresh();
    } catch (error) {
      setIsCreatingImport(false);
      setBulkImportMessage(error instanceof Error ? error.message : "Unable to create staff users.");
    }
  }

  async function handleSendProfileCompletionTasks() {
    const targetStaffIds = filteredRows
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);

    if (!targetStaffIds.length) {
      setBulkTaskMessage("No incomplete staff profiles are currently available to receive a task.");
      setIsProfileTaskConfirmOpen(false);
      return;
    }

    setIsSendingProfileTasks(true);
    setBulkTaskMessage(null);

    try {
      const response = await fetch("/api/staff/profile-completion-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          staffIds: targetStaffIds,
        }),
      });

      const result = await response.json().catch(() => null);
      setIsSendingProfileTasks(false);
      setIsProfileTaskConfirmOpen(false);

      if (!response.ok) {
        setBulkTaskMessage(String(result?.error ?? "Unable to send profile completion tasks."));
        return;
      }

      setBulkTaskMessage(
        `Profile completion tasks checked for ${Number(result?.totalIncomplete ?? 0)} incomplete staff. Created: ${Number(result?.created ?? 0)}, skipped existing: ${Number(result?.skippedExisting ?? 0)}, failed: ${Number(result?.failed ?? 0)}.`,
      );
      router.refresh();
    } catch (error) {
      setIsSendingProfileTasks(false);
      setIsProfileTaskConfirmOpen(false);
      setBulkTaskMessage(error instanceof Error ? error.message : "Unable to send profile completion tasks.");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load staff data" description={error} /> : null}
      <FormSection
        title="Staff Summary by Branch"
        description="Lihat ringkasan aktif staff mengikut cawangan dahulu, termasuk baki cuti dan penggunaan emergency / unpaid leave."
      >
        <div className="space-y-6">
          {groupedByBranch.length ? (
            groupedByBranch.map((group) => (
              <section key={group.branchId || group.branchName} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">{group.branchName}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{group.rows.length} active staff</p>
                  </div>
                </div>
                {renderBranchSummaryTable(group.rows)}
              </section>
            ))
          ) : (
            <EmptyState title="No staff summary available" description="Active staff summaries will appear here once staff records are available in scope." />
          )}
        </div>
      </FormSection>

      <FormSection
        title="Staff Directory by Branch"
        description={isIncompleteProfileView ? "Review active staff profiles that are still missing staff-editable details, then send one profile completion task to everyone who still needs it." : "Staff visibility respects role scope: all staff for HR and super admin, branch staff for branch PIC, and self for staff users."}
      >
        {isIncompleteProfileView && canSendProfileCompletionTasks ? (
          <div className="mb-5 rounded-[28px] border border-amber-200 bg-amber-50/70 px-5 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Incomplete staff profiles</h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {filteredRows.length} active staff still need profile updates. Duplicate open profile-completion tasks will be skipped automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileTaskConfirmOpen(true)}
                disabled={!filteredRows.length}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-60"
              >
                Hantar Tugasan Lengkapkan Profil
              </button>
            </div>
            {bulkTaskMessage ? <p className="mt-4 rounded-2xl bg-white/80 px-4 py-3 text-sm text-[var(--foreground)]">{bulkTaskMessage}</p> : null}
          </div>
        ) : null}
        {groupedByBranch.length ? (
          <div className="space-y-6">
            {groupedByBranch.map((group) => (
              <section key={`directory-${group.branchId || group.branchName}`} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">{group.branchName}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{group.rows.length} staff in directory</p>
                  </div>
                </div>
                {renderDirectoryCards(group.rows)}
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title={String(initialProfileFilter ?? "").trim().toLowerCase() === "incomplete" ? "No items found for this filter." : "No staff records available"} description={String(initialProfileFilter ?? "").trim().toLowerCase() === "incomplete" ? "No items found for this filter." : "Staff records will appear here once the linked staff rows exist in Supabase."} />
        )}
      </FormSection>

      {canManageExtended ? (
        <section className="space-y-4">
          <button
            type="button"
            className={collapsibleButtonClass}
            onClick={() => setIsBulkAddOpen((current) => !current)}
            aria-expanded={isBulkAddOpen}
          >
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Bulk Add Staff</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">Expand when you need to preview and create multiple staff users in one batch.</p>
            </div>
            <ChevronDown className={cn("h-5 w-5 text-[var(--muted-foreground)] transition-transform", isBulkAddOpen ? "rotate-180" : "")} />
          </button>

          {isBulkAddOpen ? (
            <FormSection
              title="Bulk Add Staff"
              description="Tampal senarai staff mengikut branch, preview dulu, kemudian cipta akaun staff secara batch."
            >
              <div className="space-y-5">
                <textarea
                  value={bulkImportInput}
                  onChange={(event) => setBulkImportInput(event.target.value)}
                  rows={10}
                  placeholder={`Putatan\nJaiah, zulhijiah96@gmail.com\nShaza, nurshazanie.mohdjanini@yahoo.com\nAisah, azney1976@gmail.com\n\nRanau\nDr Izyan, izyan242@gmail.com\nDr Rizuwan, mr.rizuwan92@gmail.com\nSaleha, salehakaranau@gmail.com`}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button type="button" onClick={handlePreviewImport} disabled={isPreviewingImport || !bulkImportInput.trim()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto">
                    <RefreshCw className="h-4 w-4" />
                    {isPreviewingImport ? "Previewing..." : "Preview Import"}
                  </button>
                  <button type="button" onClick={handleCreateImport} disabled={isCreatingImport || !bulkImportRows.some((row) => row.state === "ready")} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto">
                    <Plus className="h-4 w-4" />
                    {isCreatingImport ? "Creating..." : "Create Staff Users"}
                  </button>
                </div>

                {bulkImportSummary ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {Object.entries(bulkImportSummary).map(([key, value]) => (
                      <div key={key} className="rounded-[24px] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{key.replaceAll("_", " ")}</p>
                        <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {bulkImportMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{bulkImportMessage}</p> : null}

                {bulkImportRows.length ? (
                  <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[var(--border)] text-left">
                        <thead className="bg-[var(--card-muted)]/70">
                          <tr>
                            {["Branch", "Name", "Email", "Role", "Position", "Status", "Result"].map((label) => (
                              <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)] bg-white">
                          {bulkImportRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.branch || "-"}</td>
                              <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.name}</td>
                              <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                                <div className="space-y-1">
                                  <p>{row.email}</p>
                                  {row.tempPassword ? <p className="text-xs text-amber-700">Temp password: {row.tempPassword}</p> : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.role}</td>
                              <td className="px-4 py-4 text-sm text-[var(--foreground)]">{row.position}</td>
                              <td className="px-4 py-4 text-sm"><StatusBadge value={row.status} /></td>
                              <td className="px-4 py-4 text-sm">
                                <div className="space-y-2">
                                  <StatusBadge value={row.state} />
                                  <p className="text-xs text-[var(--muted-foreground)]">{row.reason || "-"}</p>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </FormSection>
          ) : null}
        </section>
      ) : null}

      <div ref={formRef}>
        <section className="space-y-4">
          <button
            type="button"
            className={collapsibleButtonClass}
            onClick={() => setIsAddRecordOpen((current) => !current)}
            aria-expanded={isAddRecordOpen}
          >
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">{editingId ? "Edit Staff Record" : "Add Staff Record"}</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {canManageExtended ? "Expand when you need to add or update staff records and linked organization details." : "Expand to view your allowed staff record details."}
              </p>
            </div>
            <ChevronDown className={cn("h-5 w-5 text-[var(--muted-foreground)] transition-transform", isAddRecordOpen ? "rotate-180" : "")} />
          </button>

          {isAddRecordOpen ? (
            <FormSection title={editingId ? "Edit staff record" : "Add staff record"} description={canManageExtended ? "HR and super admin can edit organization fields and linked profile roles. The form is shown full width below for easier editing." : "This form is view-only for your allowed staff scope."}>
              {canManageExtended ? (
                <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="resigned">Resigned</option>
                </select>
                <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className={inputClass}>
                  {["staff", "branch_pic", "operation", "hr", "super_admin"].map((roleName) => (
                    <option key={roleName} value={roleName}>{roleName.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>
              {message ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button type="submit" disabled={isSubmitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto">
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {isSubmitting ? "Saving..." : editingId ? "Update staff" : "Create staff"}
                </button>
                {editingId ? (
                  <button type="button" onClick={resetForm} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
                    <RefreshCw className="h-4 w-4" />
                    Cancel edit
                  </button>
                ) : null}
              </div>
                </form>
              ) : selectedStaff ? (
                <div className="space-y-3 rounded-3xl bg-[var(--card-muted)] px-5 py-5 text-sm text-[var(--foreground)]">
                  <p><span className="font-semibold">Full name:</span> {String(selectedStaff.full_name ?? "-")}</p>
                  <p><span className="font-semibold">Email:</span> {String(selectedStaff.email ?? "-")}</p>
                  <p><span className="font-semibold">Phone:</span> {String(selectedStaff.phone ?? "-")}</p>
                  <p><span className="font-semibold">Status:</span> {String(selectedStaff.status ?? "active")}</p>
                </div>
              ) : (
                <EmptyState title="No staff profile linked" description="Complete your staff profile from My Profile before this section can show record details." />
              )}
            </FormSection>
          ) : null}
        </section>
      </div>

      {isProfileTaskConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-[var(--border)] bg-white p-6 shadow-[0_30px_80px_rgba(15,31,32,0.2)]">
            <h3 className="text-xl font-semibold text-[var(--foreground)]">Hantar tugasan lengkapkan profil kepada semua staff yang profil belum lengkap?</h3>
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              This will target {filteredRows.length} active incomplete staff profiles. Any open or pending profile completion task that already exists for the same staff will be skipped automatically.
            </p>
            <div className="mt-5 rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
              <p><span className="font-semibold">Affected staff:</span> {filteredRows.length}</p>
              <p className="mt-2"><span className="font-semibold">Duplicate handling:</span> Existing unresolved profile completion tasks will not be created again.</p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsProfileTaskConfirmOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendProfileCompletionTasks}
                disabled={isSendingProfileTasks}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70"
              >
                {isSendingProfileTasks ? "Sending..." : "Send Task"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Layers3,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { formatDate, mapRowsWithId, normalizeString } from "@/lib/utils";

interface RosterManagementPageProps {
  rosters: TableRow[];
  shiftTemplates: TableRow[];
  staff: TableRow[];
  branches: BranchOption[];
  role: UserRole;
  profile: Profile | null;
  error?: string | null;
}

interface DraftRow {
  localId: string;
  id?: string;
  staff_id: string;
  shift_template_id: string;
  custom_start_time: string;
  custom_end_time: string;
  notes: string;
  role_on_shift: "doctor" | "staff";
}

const inputClass =
  "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)] disabled:cursor-not-allowed disabled:opacity-70";
const textareaClass =
  "w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)] disabled:cursor-not-allowed disabled:opacity-70";

const doctorKeywords = ["doctor", "doktor", "dr", "locum", "lokum"];

function createDraftRow(roleOnShift: "doctor" | "staff"): DraftRow {
  return {
    localId: `${roleOnShift}-${Math.random().toString(36).slice(2, 10)}`,
    staff_id: "",
    shift_template_id: "",
    custom_start_time: "",
    custom_end_time: "",
    notes: "",
    role_on_shift: roleOnShift,
  };
}

function isActiveStaff(row: TableRow) {
  const status = normalizeString(row.status);
  return status === "" || status === "active";
}

function isDoctorPosition(position: unknown) {
  const normalized = normalizeString(position);
  return doctorKeywords.some((keyword) => normalized.includes(keyword));
}

function inferRoleOnShift(row: TableRow, staffRow?: TableRow | null): "doctor" | "staff" {
  const explicit = normalizeString(row.role_on_shift);
  if (explicit === "doctor" || explicit === "staff") {
    return explicit;
  }

  return isDoctorPosition(staffRow?.position ?? row.position) ? "doctor" : "staff";
}

function formatTimeRange(start: unknown, end: unknown) {
  const startValue = String(start ?? "").slice(0, 5);
  const endValue = String(end ?? "").slice(0, 5);

  if (!startValue && !endValue) {
    return "-";
  }

  return `${startValue || "-"} - ${endValue || "-"}`;
}

function buildBranchOptions(branches: BranchOption[], profile: Profile | null, role: UserRole) {
  if (role === "branch_pic" && profile?.branch_id) {
    return branches.filter((branch) => branch.id === String(profile.branch_id));
  }

  return branches;
}

export function RosterManagementPage({ rosters, shiftTemplates, staff, branches, role, profile, error }: RosterManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const canManage = role === "super_admin" || role === "hr" || role === "branch_pic";
  const branchOptions = useMemo(() => buildBranchOptions(branches, profile, role), [branches, profile, role]);
  const defaultBranchId = role === "branch_pic"
    ? String(profile?.branch_id ?? branchOptions[0]?.id ?? "")
    : String(branchOptions[0]?.id ?? "");
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranchId);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPublished, setIsPublished] = useState("false");
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [doctorRows, setDoctorRows] = useState<DraftRow[]>([]);
  const [staffRows, setStaffRows] = useState<DraftRow[]>([]);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    code: "",
    branch_id: defaultBranchId,
    start_time: "",
    end_time: "",
    description: "",
    is_active: true,
  });

  const rosterRows = useMemo(() => mapRowsWithId(rosters), [rosters]);
  const scopedRosterRows = useMemo(() => {
    if (role === "branch_pic" && profile?.branch_id) {
      return rosterRows.filter((row) => String(row.branch_id ?? "") === String(profile.branch_id));
    }

    return rosterRows;
  }, [profile?.branch_id, role, rosterRows]);

  const scopedTemplates = useMemo(() => {
    return shiftTemplates.filter((row) => {
      if (normalizeString(row.is_active) === "false" || row.is_active === false) {
        return false;
      }

      if (role === "branch_pic") {
        return !row.branch_id || String(row.branch_id ?? "") === String(profile?.branch_id ?? "");
      }

      return true;
    });
  }, [profile?.branch_id, role, shiftTemplates]);

  const activeBranchStaff = useMemo(() => {
    return staff.filter((row) => {
      const branchMatch = selectedBranchId ? String(row.branch_id ?? "") === selectedBranchId : true;
      return branchMatch && isActiveStaff(row);
    });
  }, [selectedBranchId, staff]);

  const doctorStaffOptions = useMemo(() => {
    return activeBranchStaff.filter((row) => isDoctorPosition(row.position));
  }, [activeBranchStaff]);

  const nonDoctorStaffOptions = useMemo(() => {
    return activeBranchStaff.filter((row) => !isDoctorPosition(row.position));
  }, [activeBranchStaff]);

  const availableShiftTemplates = useMemo(() => {
    return scopedTemplates.filter(
      (row) => !row.branch_id || String(row.branch_id ?? "") === String(selectedBranchId || ""),
    );
  }, [scopedTemplates, selectedBranchId]);

  const existingDailyRows = useMemo(() => {
    if (!selectedBranchId || !selectedDate) {
      return [];
    }

    return scopedRosterRows.filter(
      (row) =>
        String(row.branch_id ?? "") === selectedBranchId &&
        String(row.roster_date ?? row.date ?? "").slice(0, 10) === selectedDate,
    );
  }, [scopedRosterRows, selectedBranchId, selectedDate]);

  const readOnlyDoctorRows = useMemo(() => {
    return existingDailyRows.filter((row) => {
      const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
      return inferRoleOnShift(row, staffRow) === "doctor";
    });
  }, [existingDailyRows, staff]);

  const readOnlyStaffRows = useMemo(() => {
    return existingDailyRows.filter((row) => {
      const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
      return inferRoleOnShift(row, staffRow) === "staff";
    });
  }, [existingDailyRows, staff]);

  const duplicateStaffIds = useMemo(() => {
    const ids = [...doctorRows, ...staffRows]
      .map((row) => row.staff_id)
      .filter(Boolean);

    return [...new Set(ids.filter((staffId, index) => ids.indexOf(staffId) !== index))];
  }, [doctorRows, staffRows]);

  useEffect(() => {
    if (role === "branch_pic" && profile?.branch_id) {
      setSelectedBranchId(String(profile.branch_id));
      setTemplateForm((current) => ({ ...current, branch_id: String(profile.branch_id) }));
    }
  }, [profile?.branch_id, role]);

  useEffect(() => {
    const nextDoctors: DraftRow[] = [];
    const nextStaff: DraftRow[] = [];

    existingDailyRows.forEach((row) => {
      const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
      const roleOnShift = inferRoleOnShift(row, staffRow);
      const template = availableShiftTemplates.find(
        (item) => String(item.id ?? "") === String(row.shift_template_id ?? ""),
      );
      const draft: DraftRow = {
        localId: `existing-${String(row.id ?? Math.random())}`,
        id: String(row.id ?? ""),
        staff_id: String(row.staff_id ?? ""),
        shift_template_id: String(row.shift_template_id ?? ""),
        custom_start_time: String(row.custom_start_time ?? template?.start_time ?? "").slice(0, 5),
        custom_end_time: String(row.custom_end_time ?? template?.end_time ?? "").slice(0, 5),
        notes: String(row.notes ?? ""),
        role_on_shift: roleOnShift,
      };

      if (roleOnShift === "doctor") {
        nextDoctors.push(draft);
      } else {
        nextStaff.push(draft);
      }
    });

    setDoctorRows(nextDoctors);
    setStaffRows(nextStaff);
    setIsPublished(existingDailyRows.some((row) => row.is_published === true) ? "true" : "false");
    setMessage(null);
    setWarning(null);
  }, [availableShiftTemplates, existingDailyRows, staff]);

  useEffect(() => {
    if (duplicateStaffIds.length) {
      setWarning("Duplicate staff detected in this daily roster. Remove duplicates before saving.");
    } else {
      setWarning(null);
    }
  }, [duplicateStaffIds]);

  function addRow(roleOnShift: "doctor" | "staff") {
    const setter = roleOnShift === "doctor" ? setDoctorRows : setStaffRows;
    setter((current) => [...current, createDraftRow(roleOnShift)]);
  }

  function updateRow(roleOnShift: "doctor" | "staff", localId: string, updates: Partial<DraftRow>) {
    const setter = roleOnShift === "doctor" ? setDoctorRows : setStaffRows;

    setter((current) =>
      current.map((row) => {
        if (row.localId !== localId) {
          return row;
        }

        const nextRow = { ...row, ...updates };

        if (updates.shift_template_id) {
          const template = availableShiftTemplates.find(
            (item) => String(item.id ?? "") === String(updates.shift_template_id),
          );
          nextRow.custom_start_time = String(template?.start_time ?? "").slice(0, 5);
          nextRow.custom_end_time = String(template?.end_time ?? "").slice(0, 5);
        }

        return nextRow;
      }),
    );
  }

  function removeRow(roleOnShift: "doctor" | "staff", localId: string) {
    const setter = roleOnShift === "doctor" ? setDoctorRows : setStaffRows;
    setter((current) => current.filter((row) => row.localId !== localId));
  }

  async function handleSaveDailyRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    if (!selectedBranchId || !selectedDate) {
      setMessage("Select a branch and date before saving the daily roster.");
      return;
    }

    if (duplicateStaffIds.length) {
      setMessage("Please remove duplicate staff rows before saving.");
      return;
    }

    const submittedRows = [...doctorRows, ...staffRows].filter((row) => row.staff_id || row.shift_template_id || row.notes);

    const incompleteRow = submittedRows.find((row) => !row.staff_id || !row.shift_template_id);
    if (incompleteRow) {
      setMessage("Each roster row needs both staff and shift selected before saving.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const existingById = new Map(existingDailyRows.map((row) => [String(row.id ?? ""), row]));
    const submittedExistingIds = submittedRows.map((row) => row.id).filter(Boolean) as string[];
    const idsToDelete = existingDailyRows
      .map((row) => String(row.id ?? ""))
      .filter((id) => id && !submittedExistingIds.includes(id));

    if (idsToDelete.length) {
      const { error: deleteError } = await supabase.from("rosters").delete().in("id", idsToDelete);
      if (deleteError) {
        setIsSaving(false);
        setMessage(deleteError.message);
        return;
      }
    }

    const rowsToUpdate = submittedRows.filter((row) => row.id);
    const rowsToInsert = submittedRows.filter((row) => !row.id);

    if (rowsToUpdate.length) {
      const updateResults = await Promise.all(
        rowsToUpdate.map((row) =>
          supabase
            .from("rosters")
            .update({
              branch_id: selectedBranchId,
              staff_id: row.staff_id,
              shift_template_id: row.shift_template_id,
              roster_date: selectedDate,
              custom_start_time: row.custom_start_time || null,
              custom_end_time: row.custom_end_time || null,
              role_on_shift: row.role_on_shift,
              notes: row.notes || null,
              is_published: isPublished === "true",
            })
            .eq("id", row.id),
        ),
      );

      const failed = updateResults.find((result) => result.error);
      if (failed?.error) {
        setIsSaving(false);
        setMessage(failed.error.message);
        return;
      }
    }

    if (rowsToInsert.length) {
      const payload = rowsToInsert.map((row) => ({
        branch_id: selectedBranchId,
        staff_id: row.staff_id,
        shift_template_id: row.shift_template_id,
        roster_date: selectedDate,
        custom_start_time: row.custom_start_time || null,
        custom_end_time: row.custom_end_time || null,
        role_on_shift: row.role_on_shift,
        notes: row.notes || null,
        is_published: isPublished === "true",
        created_by: profile?.id ?? null,
      }));

      const { error: insertError } = await supabase.from("rosters").insert(payload);
      if (insertError) {
        setIsSaving(false);
        setMessage(insertError.message);
        return;
      }
    }

    if (!submittedRows.length && existingById.size) {
      setMessage("Daily roster cleared for the selected branch and date.");
    } else {
      setMessage("Daily roster saved successfully.");
    }

    setIsSaving(false);
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
      branch_id: role === "branch_pic" ? String(profile?.branch_id ?? "") : selectedBranchId,
      start_time: "",
      end_time: "",
      description: "",
      is_active: true,
    });
    router.refresh();
  }

  function renderDraftRows(title: string, roleOnShift: "doctor" | "staff", rows: DraftRow[], staffOptions: TableRow[]) {
    return (
      <div className="space-y-4 rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {roleOnShift === "doctor"
                ? "Doctor and locum assignments for the selected branch and date."
                : "Support staff assignments for the selected branch and date."}
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => addRow(roleOnShift)}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)]"
            >
              <Plus className="h-4 w-4" />
              {roleOnShift === "doctor" ? "Add Doctor" : "Add Staff"}
            </button>
          ) : null}
        </div>

        {rows.length ? (
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div key={row.localId} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 p-4 xl:grid-cols-[1.1fr_1fr_0.7fr_0.7fr_1.2fr_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    {roleOnShift === "doctor" ? `Doctor ${index + 1}` : `Staff ${index + 1}`}
                  </label>
                  <select
                    value={row.staff_id}
                    onChange={(event) => updateRow(roleOnShift, row.localId, { staff_id: event.target.value })}
                    className={inputClass}
                    disabled={!canManage}
                  >
                    <option value="">Select staff</option>
                    {staffOptions.map((member) => (
                      <option key={String(member.id ?? "")} value={String(member.id ?? "")}>
                        {String(member.full_name ?? member.email ?? member.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Shift</label>
                  <select
                    value={row.shift_template_id}
                    onChange={(event) => updateRow(roleOnShift, row.localId, { shift_template_id: event.target.value })}
                    className={inputClass}
                    disabled={!canManage}
                  >
                    <option value="">Select shift</option>
                    {availableShiftTemplates.map((template) => (
                      <option key={String(template.id ?? "")} value={String(template.id ?? "")}>
                        {String(template.name ?? template.code ?? template.id)}
                        {template.branch_id ? "" : " (Global)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Start</label>
                  <input
                    type="time"
                    value={row.custom_start_time}
                    onChange={(event) => updateRow(roleOnShift, row.localId, { custom_start_time: event.target.value })}
                    className={inputClass}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">End</label>
                  <input
                    type="time"
                    value={row.custom_end_time}
                    onChange={(event) => updateRow(roleOnShift, row.localId, { custom_end_time: event.target.value })}
                    className={inputClass}
                    disabled={!canManage}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Notes</label>
                  <textarea
                    value={row.notes}
                    onChange={(event) => updateRow(roleOnShift, row.localId, { notes: event.target.value })}
                    rows={2}
                    placeholder="Notes for this shift"
                    className={textareaClass}
                    disabled={!canManage}
                  />
                </div>
                <div className="flex items-end">
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => removeRow(roleOnShift, row.localId)}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 xl:w-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={`No ${roleOnShift} rows yet`}
            description={canManage ? "Add the first row to start building the daily roster." : "No assignments found for this section on the selected day."}
          />
        )}
      </div>
    );
  }

  function renderReadOnlyRows(title: string, icon: typeof Stethoscope, rows: TableRow[]) {
    const Icon = icon;

    return (
      <div className="space-y-4 rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-[var(--accent)]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">Assignments for {formatDate(selectedDate)}</p>
          </div>
        </div>

        {rows.length ? (
          <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)] text-left">
                <thead className="bg-[var(--card-muted)]/70">
                  <tr>
                    {["Staff", "Shift", "Time", "Notes", "Status"].map((label) => (
                      <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-white">
                  {rows.map((row) => {
                    const member = staff.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
                    const template = availableShiftTemplates.find(
                      (item) => String(item.id ?? "") === String(row.shift_template_id ?? ""),
                    ) ?? shiftTemplates.find((item) => String(item.id ?? "") === String(row.shift_template_id ?? ""));

                    return (
                      <tr key={String(row.id ?? `${row.staff_id}-${row.shift_template_id}`)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(member?.full_name ?? row.staff_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(template?.name ?? row.shift_template_id ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatTimeRange(row.custom_start_time ?? template?.start_time, row.custom_end_time ?? template?.end_time)}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.notes ?? "-")}</td>
                        <td className="px-4 py-4 text-sm">
                          <StatusBadge value={String(row.is_published === true ? "published" : row.status ?? "draft")} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyState title={`No ${title.toLowerCase()} yet`} description="No roster rows found for this branch and date." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load roster data" description={error} /> : null}

      <FormSection
        title="Daily roster builder"
        description="Select a branch and date to load the clinic schedule, then build doctor and staff coverage quickly for the whole day."
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</label>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              className={inputClass}
              disabled={role === "branch_pic"}
            >
              <option value="">Select branch</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Date</label>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Publish</label>
            <select value={isPublished} onChange={(event) => setIsPublished(event.target.value)} className={inputClass} disabled={!canManage}>
              <option value="false">Draft</option>
              <option value="true">Published</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
            <div className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-[var(--accent)]" />Selected date</div>
            <p className="mt-2 text-[var(--muted-foreground)]">{selectedDate ? formatDate(selectedDate) : "Choose a date"}</p>
          </div>
          <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
            <div className="flex items-center gap-2 font-semibold"><Stethoscope className="h-4 w-4 text-[var(--accent)]" />Doctors available</div>
            <p className="mt-2 text-[var(--muted-foreground)]">{doctorStaffOptions.length} active doctor or locum staff</p>
          </div>
          <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
            <div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-[var(--accent)]" />Support staff available</div>
            <p className="mt-2 text-[var(--muted-foreground)]">{nonDoctorStaffOptions.length} active non-doctor staff</p>
          </div>
        </div>

        {message ? <p className="mt-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
        {warning ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {warning}
          </p>
        ) : null}
      </FormSection>

      {canManage ? (
        <form className="space-y-6" onSubmit={handleSaveDailyRoster}>
          {renderDraftRows("Doktor Bertugas", "doctor", doctorRows, doctorStaffOptions)}
          {renderDraftRows("Staff Bertugas", "staff", staffRows, nonDoctorStaffOptions)}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => addRow("doctor")}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]"
            >
              <Plus className="h-4 w-4" />
              Add Doctor
            </button>
            <button
              type="button"
              onClick={() => addRow("staff")}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]"
            >
              <Plus className="h-4 w-4" />
              Add Staff
            </button>
            <button
              type="submit"
              disabled={isSaving || !selectedBranchId || !selectedDate}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Daily Roster"}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {renderReadOnlyRows("Doktor Bertugas", Stethoscope, readOnlyDoctorRows)}
          {renderReadOnlyRows("Staff Bertugas", Users, readOnlyStaffRows)}
        </div>
      )}

      <FormSection
        title="Manage Shift Templates"
        description={canManage ? "Create branch or global shift templates without leaving the roster page." : "Existing active shift templates available for the selected branch."}
      >
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            {availableShiftTemplates.length ? (
              availableShiftTemplates.map((template) => (
                <div key={String(template.id ?? `${template.name}-${template.start_time}`)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock3 className="h-4 w-4 text-[var(--accent)]" />
                    {String(template.name ?? template.code ?? "Shift template")}
                    {!template.branch_id ? <span className="text-xs text-[var(--muted-foreground)]">Global</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatTimeRange(template.start_time, template.end_time)}</p>
                  <p className="mt-2 text-xs text-[var(--muted-foreground)]">{String(template.description ?? "No description")}</p>
                </div>
              ))
            ) : (
              <EmptyState title="No shift templates found" description="Create a shift template first so the daily builder can auto-fill start and end times." />
            )}
          </div>

          {canManage ? (
            <form className="space-y-4" onSubmit={handleTemplateSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Template name" className={inputClass} required />
                <input value={templateForm.code} onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className={inputClass} />
              </div>
              <select
                value={templateForm.branch_id}
                onChange={(event) => setTemplateForm((current) => ({ ...current, branch_id: event.target.value }))}
                className={inputClass}
                disabled={role === "branch_pic"}
              >
                <option value="">Global template</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <div className="grid gap-4 sm:grid-cols-2">
                <input type="time" value={templateForm.start_time} onChange={(event) => setTemplateForm((current) => ({ ...current, start_time: event.target.value }))} className={inputClass} />
                <input type="time" value={templateForm.end_time} onChange={(event) => setTemplateForm((current) => ({ ...current, end_time: event.target.value }))} className={inputClass} />
              </div>
              <textarea value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Description" className={textareaClass} />
              <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={templateForm.is_active} onChange={(event) => setTemplateForm((current) => ({ ...current, is_active: event.target.checked }))} />
                Active template
              </label>
              {templateMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{templateMessage}</p> : null}
              <button type="submit" disabled={isTemplateSaving} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70">
                <Layers3 className="h-4 w-4" />
                {isTemplateSaving ? "Saving..." : "Create shift template"}
              </button>
            </form>
          ) : null}
        </div>
      </FormSection>
    </div>
  );
}

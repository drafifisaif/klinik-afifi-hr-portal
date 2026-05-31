"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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
  currentStaff: TableRow | null;
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

function compareRosterRows(left: TableRow, right: TableRow, staffRows: TableRow[]) {
  const leftStaff = staffRows.find((item) => String(item.id ?? "") === String(left.staff_id ?? ""));
  const rightStaff = staffRows.find((item) => String(item.id ?? "") === String(right.staff_id ?? ""));
  const leftRoleWeight = inferRoleOnShift(left, leftStaff) === "doctor" ? 0 : 1;
  const rightRoleWeight = inferRoleOnShift(right, rightStaff) === "doctor" ? 0 : 1;

  if (leftRoleWeight !== rightRoleWeight) {
    return leftRoleWeight - rightRoleWeight;
  }

  const leftStart = String(left.custom_start_time ?? "").slice(0, 5);
  const rightStart = String(right.custom_start_time ?? "").slice(0, 5);
  if (leftStart !== rightStart) {
    return leftStart.localeCompare(rightStart);
  }

  const leftName = String(leftStaff?.full_name ?? "");
  const rightName = String(rightStaff?.full_name ?? "");
  return leftName.localeCompare(rightName);
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildWeekRange(offsetWeeks = 0) {
  const today = new Date();
  const weekStart = startOfWeek(today);
  const targetStart = addDays(weekStart, offsetWeeks * 7);
  const targetEnd = addDays(targetStart, 6);

  return {
    start: toDateInput(targetStart),
    end: toDateInput(targetEnd),
  };
}

function buildNext14DayRange() {
  const today = new Date();
  const end = addDays(today, 13);
  return {
    start: toDateInput(today),
    end: toDateInput(end),
  };
}

function enumerateDates(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    return [] as string[];
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [] as string[];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    dates.push(toDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getVisibleBranchOptions(branches: BranchOption[], profile: Profile | null, currentStaff: TableRow | null, role: UserRole) {
  const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
  if ((role === "staff" || role === "branch_pic") && scopedBranchId) {
    return branches.filter((branch) => branch.id === scopedBranchId);
  }

  return branches;
}

function getDefaultViewerBranchId(profile: Profile | null, currentStaff: TableRow | null, role: UserRole, branchOptions: BranchOption[]) {
  const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
  if ((role === "staff" || role === "branch_pic") && scopedBranchId) {
    return scopedBranchId;
  }

  if (role === "operation" && scopedBranchId) {
    return scopedBranchId;
  }

  if (role === "hr" || role === "super_admin" || role === "operation") {
    return "all";
  }

  return String(branchOptions[0]?.id ?? "");
}

function getDefaultBuilderBranchId(profile: Profile | null, currentStaff: TableRow | null, role: UserRole, branchOptions: BranchOption[]) {
  const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
  if (role === "branch_pic" && scopedBranchId) {
    return scopedBranchId;
  }

  return String(branchOptions[0]?.id ?? "");
}

export function RosterManagementPage({ rosters, shiftTemplates, staff, branches, role, profile, currentStaff, error }: RosterManagementPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const canManage = role === "super_admin" || role === "hr" || role === "branch_pic";
  const viewerBranchOptions = useMemo(() => getVisibleBranchOptions(branches, profile, currentStaff, role), [branches, currentStaff, profile, role]);
  const builderBranchOptions = useMemo(
    () => {
      const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
      return role === "branch_pic" && scopedBranchId
        ? branches.filter((branch) => branch.id === scopedBranchId)
        : branches;
    },
    [branches, currentStaff, profile, role],
  );
  const defaultViewerBranchId = getDefaultViewerBranchId(profile, currentStaff, role, viewerBranchOptions);
  const defaultBuilderBranchId = getDefaultBuilderBranchId(profile, currentStaff, role, builderBranchOptions);
  const [viewerBranchId, setViewerBranchId] = useState(defaultViewerBranchId);
  const [builderBranchId, setBuilderBranchId] = useState(defaultBuilderBranchId);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [viewerRange, setViewerRange] = useState(buildNext14DayRange());
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
    branch_id: defaultBuilderBranchId,
    start_time: "",
    end_time: "",
    description: "",
    is_active: true,
  });

  const rosterRows = useMemo(() => mapRowsWithId(rosters), [rosters]);
  const scopedRosterRows = useMemo(() => {
    const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
    if (role === "staff" || role === "branch_pic") {
      if (!scopedBranchId) {
        return [];
      }

      return rosterRows.filter((row) => String(row.branch_id ?? "") === scopedBranchId);
    }

    return rosterRows;
  }, [currentStaff, profile?.branch_id, role, rosterRows]);

  const scopedTemplates = useMemo(() => {
    const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
    return shiftTemplates.filter((row) => {
      if (normalizeString(row.is_active) === "false" || row.is_active === false) {
        return false;
      }

      if (role === "branch_pic" && scopedBranchId) {
        return !row.branch_id || String(row.branch_id ?? "") === scopedBranchId;
      }

      return true;
    });
  }, [currentStaff?.branch_id, profile?.branch_id, role, shiftTemplates]);

  const activeBuilderStaff = useMemo(() => {
    return staff.filter((row) => {
      const branchMatch = builderBranchId ? String(row.branch_id ?? "") === builderBranchId : true;
      return branchMatch && isActiveStaff(row);
    });
  }, [builderBranchId, staff]);

  const doctorStaffOptions = useMemo(() => activeBuilderStaff.filter((row) => isDoctorPosition(row.position)), [activeBuilderStaff]);
  const nonDoctorStaffOptions = useMemo(() => activeBuilderStaff.filter((row) => !isDoctorPosition(row.position)), [activeBuilderStaff]);

  const availableShiftTemplates = useMemo(() => {
    return scopedTemplates.filter(
      (row) => !row.branch_id || String(row.branch_id ?? "") === String(builderBranchId || ""),
    );
  }, [builderBranchId, scopedTemplates]);

  const existingDailyRows = useMemo(() => {
    if (!builderBranchId || !selectedDate) {
      return [];
    }

    return scopedRosterRows.filter(
      (row) =>
        String(row.branch_id ?? "") === builderBranchId &&
        String(row.roster_date ?? row.date ?? "").slice(0, 10) === selectedDate,
    );
  }, [builderBranchId, scopedRosterRows, selectedDate]);

  const duplicateStaffIds = useMemo(() => {
    const ids = [...doctorRows, ...staffRows].map((row) => row.staff_id).filter(Boolean);
    return [...new Set(ids.filter((staffId, index) => ids.indexOf(staffId) !== index))];
  }, [doctorRows, staffRows]);

  const viewerDates = useMemo(() => enumerateDates(viewerRange.start, viewerRange.end), [viewerRange.end, viewerRange.start]);
  const visibleViewerRows = useMemo(() => {
    return scopedRosterRows.filter((row) => {
      const rosterDate = String(row.roster_date ?? row.date ?? "").slice(0, 10);
      if (!viewerDates.includes(rosterDate)) {
        return false;
      }

      if (viewerBranchId === "all") {
        return true;
      }

      return String(row.branch_id ?? "") === viewerBranchId;
    });
  }, [scopedRosterRows, viewerBranchId, viewerDates]);

  const viewerGroups = useMemo(() => {
    return viewerDates.map((date) => {
      const dateRows = visibleViewerRows
        .filter((row) => String(row.roster_date ?? row.date ?? "").slice(0, 10) === date)
        .sort((left, right) => compareRosterRows(left, right, staff));
      const doctors = dateRows.filter((row) => {
        const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
        return inferRoleOnShift(row, staffRow) === "doctor";
      });
      const support = dateRows.filter((row) => {
        const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
        return inferRoleOnShift(row, staffRow) === "staff";
      });

      return {
        date,
        doctors,
        support,
        teamRows: dateRows,
        myShiftRows: currentStaff ? dateRows.filter((row) => String(row.staff_id ?? "") === String(currentStaff.id ?? "")) : [],
      };
    });
  }, [currentStaff, staff, viewerDates, visibleViewerRows]);

  useEffect(() => {
    const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
    if ((role === "staff" || role === "branch_pic") && scopedBranchId) {
      setViewerBranchId(scopedBranchId);
      setBuilderBranchId(scopedBranchId);
      setTemplateForm((current) => ({ ...current, branch_id: scopedBranchId }));
    }
  }, [currentStaff, profile?.branch_id, role]);

  useEffect(() => {
    const scopedBranchId = String(currentStaff?.branch_id ?? profile?.branch_id ?? "");
    if (role === "operation" && scopedBranchId) {
      setViewerBranchId((current) => current || scopedBranchId);
    }
  }, [currentStaff?.branch_id, profile?.branch_id, role]);

  useEffect(() => {
    const nextDoctors: DraftRow[] = [];
    const nextStaffRows: DraftRow[] = [];

    existingDailyRows.forEach((row) => {
      const staffRow = staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""));
      const roleOnShift = inferRoleOnShift(row, staffRow);
      const template = availableShiftTemplates.find(
        (item) => String(item.id ?? "") === String(row.shift_template_id ?? ""),
      ) ?? shiftTemplates.find((item) => String(item.id ?? "") === String(row.shift_template_id ?? ""));
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
        nextStaffRows.push(draft);
      }
    });

    setDoctorRows(nextDoctors);
    setStaffRows(nextStaffRows);
    setIsPublished(existingDailyRows.some((row) => row.is_published === true) ? "true" : "false");
    setMessage(null);
    setWarning(null);
  }, [availableShiftTemplates, existingDailyRows, staff, shiftTemplates]);

  useEffect(() => {
    if (duplicateStaffIds.length) {
      setWarning("Duplicate staff detected in this daily roster. Remove duplicates before saving.");
    } else {
      setWarning(null);
    }
  }, [duplicateStaffIds]);

  function setQuickRange(type: "previous_week" | "this_week" | "next_week" | "next_14_days") {
    if (type === "previous_week") {
      setViewerRange(buildWeekRange(-1));
      return;
    }

    if (type === "this_week") {
      setViewerRange(buildWeekRange(0));
      return;
    }

    if (type === "next_week") {
      setViewerRange(buildWeekRange(1));
      return;
    }

    setViewerRange(buildNext14DayRange());
  }

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
          ) ?? shiftTemplates.find((item) => String(item.id ?? "") === String(updates.shift_template_id));
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

    if (!builderBranchId || !selectedDate) {
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
              branch_id: builderBranchId,
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
        branch_id: builderBranchId,
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

    setMessage(!submittedRows.length && existingById.size ? "Daily roster cleared for the selected branch and date." : "Daily roster saved successfully.");
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
      branch_id: role === "branch_pic" ? String(currentStaff?.branch_id ?? profile?.branch_id ?? "") : builderBranchId,
      start_time: "",
      end_time: "",
      description: "",
      is_active: true,
    });
    router.refresh();
  }

  function getRosterRoleLabel(row: TableRow, member?: TableRow | null) {
    const explicitRole = normalizeString(row.role_on_shift);
    if (explicitRole === "doctor") {
      return "Doctor";
    }

    if (explicitRole === "staff") {
      return String(member?.position ?? "Staff");
    }

    if (member?.position) {
      return String(member.position);
    }

    return inferRoleOnShift(row, member) === "doctor" ? "Doctor" : "Staff";
  }

  function renderRosterList(rows: TableRow[], emptyMessage: string, options?: { showYouBadge?: boolean }) {
    if (!rows.length) {
      return <p className="text-sm text-[var(--muted-foreground)]">{emptyMessage}</p>;
    }

    return (
      <div className="space-y-3">
        {rows.map((row) => {
          const member = staff.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
          const template = shiftTemplates.find((item) => String(item.id ?? "") === String(row.shift_template_id ?? ""));
          const branchName = branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-");
          const isYou = String(row.staff_id ?? "") === String(currentStaff?.id ?? "");

          return (
            <div key={String(row.id ?? `${row.staff_id}-${row.shift_template_id}-${row.roster_date}`)} className="rounded-2xl border border-[var(--border)] bg-white px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{String(member?.full_name ?? row.staff_id ?? "Unknown staff")}</p>
                    {options?.showYouBadge && isYou ? <StatusBadge value="You" /> : null}
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">{getRosterRoleLabel(row, member)}</p>
                </div>
                <StatusBadge value={String(row.is_published === true ? "published" : row.status ?? "draft")} />
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)] sm:grid-cols-2 xl:grid-cols-3">
                <p>Branch: {branchName}</p>
                <p>Shift: {String(template?.name ?? row.shift_template_id ?? "Shift not linked")}</p>
                <p>Time: {formatTimeRange(row.custom_start_time ?? template?.start_time, row.custom_end_time ?? template?.end_time)}</p>
              </div>
              {row.notes ? <p className="mt-3 text-sm text-[var(--foreground)]">Notes: {String(row.notes)}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDraftRows(title: string, roleOnShift: "doctor" | "staff", rows: DraftRow[], staffOptions: TableRow[]) {
    return (
      <div className="space-y-4 rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {roleOnShift === "doctor" ? "Doctor and locum assignments for the selected branch and date." : "Support staff assignments for the selected branch and date."}
            </p>
          </div>
          <button type="button" onClick={() => addRow(roleOnShift)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto">
            <Plus className="h-4 w-4" />
            {roleOnShift === "doctor" ? "Add Doctor" : "Add Staff"}
          </button>
        </div>

        {rows.length ? (
          <div className="space-y-4">
            {rows.map((row, index) => (
              <div key={row.localId} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 p-4 xl:grid-cols-[1.1fr_1fr_0.7fr_0.7fr_1.2fr_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{roleOnShift === "doctor" ? `Doctor ${index + 1}` : `Staff ${index + 1}`}</label>
                  <select value={row.staff_id} onChange={(event) => updateRow(roleOnShift, row.localId, { staff_id: event.target.value })} className={inputClass}>
                    <option value="">Select staff</option>
                    {staffOptions.map((member) => (
                      <option key={String(member.id ?? "")} value={String(member.id ?? "")}>{String(member.full_name ?? member.email ?? member.id)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Shift</label>
                  <select value={row.shift_template_id} onChange={(event) => updateRow(roleOnShift, row.localId, { shift_template_id: event.target.value })} className={inputClass}>
                    <option value="">Select shift</option>
                    {availableShiftTemplates.map((template) => (
                      <option key={String(template.id ?? "")} value={String(template.id ?? "")}>{String(template.name ?? template.code ?? template.id)}{template.branch_id ? "" : " (Global)"}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Start</label>
                  <input type="time" value={row.custom_start_time} onChange={(event) => updateRow(roleOnShift, row.localId, { custom_start_time: event.target.value })} className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">End</label>
                  <input type="time" value={row.custom_end_time} onChange={(event) => updateRow(roleOnShift, row.localId, { custom_end_time: event.target.value })} className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Notes</label>
                  <textarea value={row.notes} onChange={(event) => updateRow(roleOnShift, row.localId, { notes: event.target.value })} rows={2} placeholder="Notes for this shift" className={textareaClass} />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => removeRow(roleOnShift, row.localId)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 xl:w-auto">
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={`No ${roleOnShift} rows yet`} description="Add the first row to start building the daily roster." />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load roster data" description={error} /> : null}

      <FormSection title="Roster viewer" description="Scan current and upcoming clinic coverage by branch and date range so teams can plan leave and coordinate support safely.">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</label>
            <select value={viewerBranchId} onChange={(event) => setViewerBranchId(event.target.value)} className={inputClass} disabled={(role === "staff" || role === "branch_pic") && Boolean(currentStaff?.branch_id ?? profile?.branch_id)}>
              {(role === "hr" || role === "super_admin" || role === "operation") ? <option value="all">All visible branches</option> : null}
              {viewerBranchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Start date</label>
            <input type="date" value={viewerRange.start} onChange={(event) => setViewerRange((current) => ({ ...current, start: event.target.value }))} className={inputClass} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">End date</label>
            <input type="date" value={viewerRange.end} onChange={(event) => setViewerRange((current) => ({ ...current, end: event.target.value }))} className={inputClass} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
          <button type="button" onClick={() => setQuickRange("previous_week")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><ChevronLeft className="h-4 w-4" />Previous Week</button>
          <button type="button" onClick={() => setQuickRange("this_week")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><CalendarDays className="h-4 w-4" />This Week</button>
          <button type="button" onClick={() => setQuickRange("next_week")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><ChevronRight className="h-4 w-4" />Next Week</button>
          <button type="button" onClick={() => setQuickRange("next_14_days")} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><CalendarDays className="h-4 w-4" />Next 14 Days</button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {viewerGroups.length ? viewerGroups.map((group) => {
            const branchLabel = viewerBranchId === "all" ? "All visible branches" : branches.find((branch) => branch.id === viewerBranchId)?.name ?? "Selected branch";

            return (
              <article key={group.date} className="rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">{formatDate(group.date)}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{branchLabel}</p>
                  </div>
                  <span className="rounded-2xl bg-[var(--card-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{group.doctors.length + group.support.length} shifts</span>
                </div>

                {role === "staff" ? (
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Clock3 className="h-4 w-4 text-[var(--accent)]" />
                        My Shift
                      </div>
                      {renderRosterList(group.myShiftRows, "Tiada roster sendiri untuk tarikh ini.", { showYouBadge: true })}
                    </div>
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                        <Users className="h-4 w-4 text-[var(--accent)]" />
                        Team On Duty
                      </div>
                      {renderRosterList(group.teamRows, "Tiada senarai team bertugas untuk tarikh ini.", { showYouBadge: true })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Stethoscope className="h-4 w-4 text-[var(--accent)]" />Doktor Bertugas</div>
                      {renderRosterList(group.doctors, "No roster set")}
                    </div>
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Users className="h-4 w-4 text-[var(--accent)]" />Staff Bertugas</div>
                      {renderRosterList(group.support, "No roster set")}
                    </div>
                  </div>
                )}
              </article>
            );
          }) : <EmptyState title="No dates available" description="Choose a valid start and end date to view roster coverage." />}
        </div>
      </FormSection>

      {canManage ? (
        <>
          <FormSection title="Daily roster builder" description="Keep the fast daily builder for branch managers and HR while using the viewer above to scan wider date ranges.">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</label>
                <select value={builderBranchId} onChange={(event) => { setBuilderBranchId(event.target.value); setTemplateForm((current) => ({ ...current, branch_id: event.target.value })); }} className={inputClass} disabled={role === "branch_pic"}>
                  <option value="">Select branch</option>
                  {builderBranchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Roster date</label>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Publish</label>
                <select value={isPublished} onChange={(event) => setIsPublished(event.target.value)} className={inputClass}>
                  <option value="false">Draft</option>
                  <option value="true">Published</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]"><div className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-[var(--accent)]" />Builder date</div><p className="mt-2 text-[var(--muted-foreground)]">{selectedDate ? formatDate(selectedDate) : "Choose a date"}</p></div>
              <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]"><div className="flex items-center gap-2 font-semibold"><Stethoscope className="h-4 w-4 text-[var(--accent)]" />Doctors available</div><p className="mt-2 text-[var(--muted-foreground)]">{doctorStaffOptions.length} active doctor or locum staff</p></div>
              <div className="rounded-3xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]"><div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-[var(--accent)]" />Support staff available</div><p className="mt-2 text-[var(--muted-foreground)]">{nonDoctorStaffOptions.length} active non-doctor staff</p></div>
            </div>

            {message ? <p className="mt-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
            {warning ? <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{warning}</p> : null}
          </FormSection>

          <form className="space-y-6" onSubmit={handleSaveDailyRoster}>
            {renderDraftRows("Doktor Bertugas", "doctor", doctorRows, doctorStaffOptions)}
            {renderDraftRows("Staff Bertugas", "staff", staffRows, nonDoctorStaffOptions)}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button type="button" onClick={() => addRow("doctor")} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><Plus className="h-4 w-4" />Add Doctor</button>
              <button type="button" onClick={() => addRow("staff")} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)] sm:w-auto"><Plus className="h-4 w-4" />Add Staff</button>
              <button type="submit" disabled={isSaving || !builderBranchId || !selectedDate} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:opacity-70 sm:w-auto"><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Daily Roster"}</button>
            </div>
          </form>

          <FormSection title="Manage Shift Templates" description="Create branch or global shift templates without leaving the roster page.">
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                {availableShiftTemplates.length ? availableShiftTemplates.map((template) => (
                  <div key={String(template.id ?? `${template.name}-${template.start_time}`)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
                    <div className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 text-[var(--accent)]" />{String(template.name ?? template.code ?? "Shift template")}{!template.branch_id ? <span className="text-xs text-[var(--muted-foreground)]">Global</span> : null}</div>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatTimeRange(template.start_time, template.end_time)}</p>
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">{String(template.description ?? "No description")}</p>
                  </div>
                )) : <EmptyState title="No shift templates found" description="Create a shift template first so the daily builder can auto-fill start and end times." />}
              </div>

              <form className="space-y-4" onSubmit={handleTemplateSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Template name" className={inputClass} required />
                  <input value={templateForm.code} onChange={(event) => setTemplateForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className={inputClass} />
                </div>
                <select value={templateForm.branch_id} onChange={(event) => setTemplateForm((current) => ({ ...current, branch_id: event.target.value }))} className={inputClass} disabled={role === "branch_pic"}>
                  <option value="">Global template</option>
                  {builderBranchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input type="time" value={templateForm.start_time} onChange={(event) => setTemplateForm((current) => ({ ...current, start_time: event.target.value }))} className={inputClass} />
                  <input type="time" value={templateForm.end_time} onChange={(event) => setTemplateForm((current) => ({ ...current, end_time: event.target.value }))} className={inputClass} />
                </div>
                <textarea value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Description" className={textareaClass} />
                <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)]"><input type="checkbox" checked={templateForm.is_active} onChange={(event) => setTemplateForm((current) => ({ ...current, is_active: event.target.checked }))} />Active template</label>
                {templateMessage ? <p className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{templateMessage}</p> : null}
                <button type="submit" disabled={isTemplateSaving} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 disabled:opacity-70 sm:w-auto"><Layers3 className="h-4 w-4" />{isTemplateSaving ? "Saving..." : "Create shift template"}</button>
              </form>
            </div>
          </FormSection>
        </>
      ) : null}
    </div>
  );
}

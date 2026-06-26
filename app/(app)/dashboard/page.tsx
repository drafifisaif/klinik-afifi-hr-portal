import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BriefcaseMedical,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ChevronRight,
  ClipboardList,
  FileBadge,
  FileSearch,
  FileText,
  MessageSquareMore,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { LeaveBalancePanel } from "@/components/leave-balance-panel";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { requireRouteAccess } from "@/lib/auth";
import {
  buildLeaveBalanceSummary,
  getMissingStaffEditableProfileFields,
  countExpiringRows,
  countUnreadNotifications,
  filterExpiringRows,
  getNextHoliday,
  getExpiryStatus,
  getOperationVisibleFeedback,
  isStaffEditableProfileIncomplete,
} from "@/lib/data";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { cn, daysUntil, formatCountdown, formatDate, formatDateTime, getMalaysiaDateString, getMalaysiaHour, normalizeString } from "@/lib/utils";

interface RowQueryResult {
  rows: TableRow[];
  error: string | null;
}

interface CountQueryResult {
  count: number;
  error: string | null;
}

interface DashboardContextLike {
  role: UserRole;
  profile: Profile | null;
  staff: TableRow | null;
  user: { id: string; email?: string | null } | null;
}

interface NotificationWidgetProps {
  rows: TableRow[];
  unreadCount: number;
  error?: string | null;
}

interface DashboardAction {
  href: string;
  label: string;
  helper: string;
}

interface AttendanceSnapshotRow {
  id: string;
  staffName: string;
  branchId: string;
  branchName: string;
  status: string;
  lateMinutes: number;
  checkInLocationStatus: string;
  checkOutLocationStatus: string;
  shiftLabel: string;
  checkInAt: string | null;
  checkOutAt: string | null;
}

function greetingByTime() {
  const hour = getMalaysiaHour();

  if (hour >= 5 && hour < 12) {
    return "Selamat pagi";
  }

  if (hour >= 12 && hour < 14) {
    return "Selamat tengah hari";
  }

  if (hour >= 14 && hour < 19) {
    return "Selamat petang";
  }

  return "Selamat malam";
}

function toBranchOptions(rows: TableRow[]) {
  return rows
    .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
    .filter((row) => row.id) as BranchOption[];
}

function getBranchName(branches: BranchOption[], branchId?: string | null) {
  return branches.find((branch) => branch.id === String(branchId ?? ""))?.name ?? "Cawangan belum ditetapkan";
}

function isStaffRecordIncomplete(row: TableRow) {
  const required = [row.full_name, row.phone, row.position, row.department, row.branch_id];
  return required.some((value) => !String(value ?? "").trim());
}

function isDoctorLike(row: TableRow) {
  const value = normalizeString(row.position);
  return ["doctor", "doktor", "dr", "locum", "lokum"].some((keyword) => value.includes(keyword));
}

function inferRoleOnShift(row: TableRow, staffRow?: TableRow | null) {
  const explicit = normalizeString(row.role_on_shift);
  if (explicit === "doctor" || explicit === "staff") {
    return explicit;
  }

  return isDoctorLike(staffRow ?? row) ? "doctor" : "staff";
}

function getTimeRange(row: TableRow, shiftTemplates: TableRow[]) {
  const template = shiftTemplates.find((item) => String(item.id ?? "") === String(row.shift_template_id ?? ""));
  const start = String(row.custom_start_time ?? template?.start_time ?? "").slice(0, 5);
  const end = String(row.custom_end_time ?? template?.end_time ?? "").slice(0, 5);

  if (!start && !end) {
    return "Masa belum diset";
  }

  return `${start || "-"} - ${end || "-"}`;
}

function getShiftName(row: TableRow, shiftTemplates: TableRow[]) {
  const template = shiftTemplates.find((item) => String(item.id ?? "") === String(row.shift_template_id ?? ""));
  return String(template?.name ?? row.shift_template_id ?? "Shift belum diset");
}

function formatLeaveTypeLabel(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replaceAll("_", " ");

  if (!normalized) {
    return "Leave";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNextPersonalShift(rosters: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  const today = getMalaysiaDateString();
  return rosters
    .filter(
      (row) =>
        String(row.staff_id ?? "") === String(staffId) &&
        String(row.roster_date ?? row.date ?? "") >= today,
    )
    .sort((left, right) => String(left.roster_date ?? left.date ?? "").localeCompare(String(right.roster_date ?? right.date ?? "")))[0] ?? null;
}

function getStartOfWeek() {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function countResolvedThisWeek(feedbacks: TableRow[]) {
  const startOfWeek = getStartOfWeek().toISOString();
  return feedbacks.filter((row) => {
    const status = normalizeString(row.status);
    const resolvedAt = String(row.updated_at ?? row.reviewed_at ?? row.created_at ?? "");
    return ["resolved", "closed"].includes(status) && resolvedAt >= startOfWeek;
  }).length;
}

function countValue(value: string | number) {
  return typeof value === "number" ? value : Number(value) || 0;
}

function isPendingLeaveStatus(row: TableRow) {
  return normalizeString(row.status) === "pending";
}

function isBranchOperationalIssue(row: TableRow, branchId: string) {
  if (String(row.branch_id ?? "") !== branchId) {
    return false;
  }

  if (row.is_anonymous === true) {
    return false;
  }

  const targetType = normalizeString(row.target_type);
  if (targetType === "hr" || targetType === "staff") {
    return false;
  }

  const category = normalizeString(row.category);
  const assignedDepartment = normalizeString(row.assigned_department);
  const haystack = [
    row.category,
    row.title,
    row.message,
    row.portal_area,
    row.expected_action,
    row.assigned_department,
    row.target_type,
  ]
    .map((value) => normalizeString(value))
    .join(" ");

  const operationalKeywords = [
    "operation",
    "facility",
    "maintenance",
    "roster",
    "shift",
    "equipment",
    "branch task",
    "branch operation",
    "clinic issue",
  ];

  const sensitiveKeywords = [
    "disciplinary",
    "discipline",
    "staff complaint",
    "complaint staff",
    "harassment",
    "bully",
    "bullying",
    "misconduct",
    "hr sensitive",
  ];

  if (sensitiveKeywords.some((keyword) => haystack.includes(keyword))) {
    return false;
  }

  const operationCategoryMatches = ["operation", "facility", "roster", "maintenance", "equipment"].includes(category);
  const operationRoutingMatches = targetType === "operation" || assignedDepartment === "operation";
  const operationKeywordMatches = operationalKeywords.some((keyword) => haystack.includes(keyword));

  return operationCategoryMatches || operationRoutingMatches || operationKeywordMatches;
}

function isFeedbackForCurrentStaff(row: TableRow, staffId: string, profileId: string) {
  const targetedToCurrentStaff =
    normalizeString(row.target_type) === "staff" &&
    staffId &&
    String(row.target_staff_id ?? "") === staffId;
  const assignedToCurrentProfile = profileId && String(row.assigned_to ?? "") === profileId;

  return targetedToCurrentStaff || assignedToCurrentProfile;
}

function dedupeRowsById(rows: TableRow[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = String(row.id ?? `${row.title ?? row.created_at}-${row.staff_id ?? ""}`);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function combineDateAndTime(date: string, timeValue?: string | null) {
  const time = String(timeValue ?? "").trim().slice(0, 5);
  if (!date || !time) {
    return null;
  }

  return `${date}T${time}:00`;
}

function parseIso(value: unknown, referenceDate?: Date | null) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hours, minutes, seconds = "00"] = text.split(":");
    const base = referenceDate ? new Date(referenceDate) : new Date();
    base.setHours(Number(hours), Number(minutes), Number(seconds), 0);
    return Number.isNaN(base.getTime()) ? null : base;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeAttendanceLateMinutes(checkInAt: unknown, scheduledStart: unknown, graceMinutes: number) {
  const checkIn = parseIso(checkInAt);
  const scheduled = parseIso(scheduledStart, checkIn);

  if (!checkIn || !scheduled) {
    return 0;
  }

  return Math.max(0, Math.round((checkIn.getTime() - scheduled.getTime()) / 60000) - graceMinutes);
}

function computeAttendanceStatus(row: TableRow | null, graceMinutes: number) {
  if (!row) {
    return "not_punched_in";
  }

  const lateMinutes = Number(row.late_minutes ?? computeAttendanceLateMinutes(row.check_in_at, row.scheduled_start, graceMinutes));
  if (row.check_in_at && row.check_out_at) {
    return lateMinutes > 0 ? "late" : "present";
  }

  if (row.check_in_at) {
    return lateMinutes > 0 ? "late" : "incomplete";
  }

  return "not_punched_in";
}

function isApprovedLeaveForDate(row: TableRow, date: string) {
  if (normalizeString(row.status) !== "approved") {
    return false;
  }

  const start = String(row.start_date ?? "").slice(0, 10);
  const end = String(row.end_date ?? "").slice(0, 10);
  return Boolean(start && end && start <= date && end >= date);
}

function buildAttendanceSnapshotRows({
  rosterRows,
  attendanceRows,
  settingRows,
  staffRows,
  shiftTemplateRows,
  leaveRows,
  branches,
  date,
  branchScope = "all",
}: {
  rosterRows: TableRow[];
  attendanceRows: TableRow[];
  settingRows: TableRow[];
  staffRows: TableRow[];
  shiftTemplateRows: TableRow[];
  leaveRows: TableRow[];
  branches: BranchOption[];
  date: string;
  branchScope?: string;
}) {
  return rosterRows
    .filter((row) => {
      const rosterDate = String(row.roster_date ?? row.date ?? "").slice(0, 10);
      if (rosterDate !== date) {
        return false;
      }

      return branchScope === "all" ? true : String(row.branch_id ?? "") === branchScope;
    })
    .map<AttendanceSnapshotRow>((rosterRow) => {
      const staffRow = staffRows.find((item) => String(item.id ?? "") === String(rosterRow.staff_id ?? ""));
      const attendanceRow = attendanceRows.find(
        (item) =>
          String(item.staff_id ?? "") === String(rosterRow.staff_id ?? "") &&
          String(item.attendance_date ?? item.created_at ?? "").slice(0, 10) === date,
      ) ?? null;
      const branchId = String(rosterRow.branch_id ?? staffRow?.branch_id ?? "");
      const branchName = getBranchName(branches, branchId);
      const branchSetting = settingRows.find((item) => String(item.branch_id ?? "") === branchId)
        ?? settingRows.find((item) => !String(item.branch_id ?? "").trim())
        ?? null;
      const graceMinutes = Number(branchSetting?.grace_minutes ?? 10) || 10;
      const autoAbsentAfterMinutes = Number(branchSetting?.auto_absent_after_minutes ?? 60) || 60;
      const scheduledStart = attendanceRow?.scheduled_start
        ?? combineDateAndTime(
          String(rosterRow.roster_date ?? rosterRow.date ?? ""),
          String(rosterRow.custom_start_time ?? ""),
        );
      const leaveRow = leaveRows.find(
        (item) => String(item.staff_id ?? "") === String(rosterRow.staff_id ?? "") && isApprovedLeaveForDate(item, date),
      ) ?? null;
      const lateMinutes = Number(attendanceRow?.late_minutes ?? computeAttendanceLateMinutes(attendanceRow?.check_in_at, scheduledStart, graceMinutes));

      let status = leaveRow
        ? normalizeString(leaveRow.leave_type) === "medical_leave"
          ? "mc"
          : "on_leave"
        : computeAttendanceStatus(attendanceRow, graceMinutes);

      const scheduledStartDate = parseIso(scheduledStart);
      const malaysiaToday = getMalaysiaDateString();
      const isToday = date === malaysiaToday;
      const now = new Date();

      if (!leaveRow && !attendanceRow && scheduledStartDate) {
        if (date < malaysiaToday) {
          status = "absent";
        } else if (isToday && now.getTime() > scheduledStartDate.getTime() + autoAbsentAfterMinutes * 60000) {
          status = "absent";
        }
      }

      return {
        id: String(rosterRow.id ?? `${rosterRow.staff_id}-${date}`),
        staffName: String(staffRow?.full_name ?? rosterRow.staff_id ?? "Unknown User"),
        branchId,
        branchName,
        status,
        lateMinutes,
        checkInLocationStatus: String(attendanceRow?.check_in_location_status ?? "location_unavailable"),
        checkOutLocationStatus: String(attendanceRow?.check_out_location_status ?? "location_unavailable"),
        shiftLabel: `${getShiftName(rosterRow, shiftTemplateRows)} · ${getTimeRange(rosterRow, shiftTemplateRows)}`,
        checkInAt: attendanceRow?.check_in_at ? String(attendanceRow.check_in_at) : null,
        checkOutAt: attendanceRow?.check_out_at ? String(attendanceRow.check_out_at) : null,
      };
    });
}

function getAttendanceStatusTone(status: string) {
  const normalized = normalizeString(status);
  if (normalized === "present") {
    return "border-emerald-200 bg-emerald-50/70";
  }
  if (normalized === "late") {
    return "border-orange-200 bg-orange-50/80";
  }
  if (normalized === "absent") {
    return "border-rose-200 bg-rose-50/80";
  }
  if (normalized === "incomplete") {
    return "border-amber-200 bg-amber-50/80";
  }
  if (normalized === "not_punched_in") {
    return "border-slate-200 bg-slate-50/85";
  }
  return "border-sky-200 bg-sky-50/80";
}

async function queryRows(executor: () => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<RowQueryResult> {
  try {
    const { data, error } = await executor();
    return {
      rows: (data ?? []) as TableRow[],
      error: error?.message ?? null,
    };
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : "Unable to load dashboard data.",
    };
  }
}

async function queryCount(executor: () => PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<CountQueryResult> {
  try {
    const { count, error } = await executor();
    return {
      count: count ?? 0,
      error: error?.message ?? null,
    };
  } catch (error) {
    return {
      count: 0,
      error: error instanceof Error ? error.message : "Unable to load count.",
    };
  }
}

async function queryProfilesByIds(supabase: SupabaseClient, ids: string[]): Promise<RowQueryResult> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

  if (!uniqueIds.length) {
    return { rows: [], error: null };
  }

  return queryRows(() => supabase.from("profiles").select("*").in("id", uniqueIds));
}

async function getSignedAvatarUrl(supabase: SupabaseClient, path?: string | null) {
  const storagePath = String(path ?? "").trim();

  if (!storagePath) {
    return null;
  }

  const { data } = await supabase.storage.from("profile-pictures").createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

function PartialDataNotice({ errors }: { errors: Array<string | null | undefined> }) {
  const message = errors.find(Boolean);

  if (!message) {
    return null;
  }

  return (
    <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
      Sebahagian data dashboard belum dapat dimuatkan sekarang. {message}
    </div>
  );
}

function HeroCard({
  title,
  branch,
  position,
  avatarUrl,
}: {
  title: string;
  branch: string;
  position: string;
  avatarUrl?: string | null;
}) {
  const name = title.split(",").slice(1).join(",").trim() || title;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "KA";

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,#EAF8F6_0%,#FFFFFF_55%,#F5F3FF_100%)] p-5 shadow-[0_20px_55px_rgba(18,42,44,0.08)] sm:p-7">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="text-center lg:text-left">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">{title}</h2>
          <div className="mt-6 flex items-center justify-center gap-5 lg:justify-start">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={name} width={104} height={104} className="h-24 w-24 rounded-[30px] object-cover shadow-[0_16px_36px_rgba(18,42,44,0.12)] sm:h-24 sm:w-24" unoptimized />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-[30px] bg-white/90 text-2xl font-semibold text-[var(--accent)] shadow-[0_16px_36px_rgba(18,42,44,0.12)] sm:h-24 sm:w-24">
                {initials}
              </div>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-white/80 bg-white/80 px-5 py-5 sm:hidden">
            <div className="space-y-3 text-center">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Branch</p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{branch}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Position</p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{position}</p>
              </div>
            </div>
          </div>
          <div className="hidden rounded-3xl border border-white/80 bg-white/80 px-5 py-5 sm:block">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Branch</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{branch}</p>
          </div>
          <div className="hidden rounded-3xl border border-white/80 bg-white/80 px-5 py-5 sm:block">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Position</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{position}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickActions({ title, actions }: { title: string; actions: DashboardAction[] }) {
  return (
    <FormSection title={title} description="Akses cepat ke workflow yang paling kerap digunakan hari ini.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Link key={action.href + action.label} href={action.href} className="group rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/65 px-5 py-5 transition hover:border-[var(--accent)] hover:bg-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-[var(--foreground)]">{action.label}</p>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">{action.helper}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-[var(--accent)] transition group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </FormSection>
  );
}

function DashboardList({ title, description, items, emptyTitle, emptyDescription }: { title: string; description: string; items: React.ReactNode[]; emptyTitle: string; emptyDescription: string }) {
  return (
    <FormSection title={title} description={description}>
      {items.length ? <div className="space-y-4">{items}</div> : <EmptyState title={emptyTitle} description={emptyDescription} />}
    </FormSection>
  );
}

function TodayAttendanceSnapshot({
  title,
  description,
  rows,
  branches,
  selectedBranchId = "all",
  selectedDate = getMalaysiaDateString(),
  pendingCorrectionsCount = 0,
  interactive = false,
}: {
  title: string;
  description: string;
  rows: AttendanceSnapshotRow[];
  branches?: BranchOption[];
  selectedBranchId?: string;
  selectedDate?: string;
  pendingCorrectionsCount?: number;
  interactive?: boolean;
}) {
  const counters = {
    present: rows.filter((row) => row.status === "present").length,
    late: rows.filter((row) => row.status === "late").length,
    absent: rows.filter((row) => row.status === "absent").length,
    incomplete: rows.filter((row) => row.status === "incomplete").length,
    notPunchedIn: rows.filter((row) => row.status === "not_punched_in").length,
    outsideLocation: rows.filter((row) => row.checkInLocationStatus === "outside_location" || row.checkOutLocationStatus === "outside_location").length,
  };
  const urgentRows = rows
    .filter((row) => ["late", "absent", "incomplete"].includes(normalizeString(row.status)))
    .sort((left, right) => {
      const rank = { absent: 0, incomplete: 1, late: 2 } as Record<string, number>;
      return (rank[normalizeString(left.status)] ?? 9) - (rank[normalizeString(right.status)] ?? 9);
    })
    .slice(0, 5);

  function buildAttendanceHref(filter?: string) {
    const params = new URLSearchParams();
    if (selectedBranchId && selectedBranchId !== "all") {
      params.set("branch", selectedBranchId);
    }
    if (selectedDate) {
      params.set("date", selectedDate);
    }
    if (filter === "pending_corrections") {
      params.set("section", "pending_corrections");
    } else if (filter && filter !== "all") {
      params.set("filter", filter);
    }
    const query = params.toString();
    return query ? `/attendance?${query}` : "/attendance";
  }

  function renderSnapshotCard({
    label,
    count,
    toneClass,
    filter,
  }: {
    label: string;
    count: number;
    toneClass: string;
    filter: string;
  }) {
    const cardClass = cn(
      "h-full rounded-[24px] border px-4 py-4",
      toneClass,
      interactive ? "cursor-pointer transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(18,42,44,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white" : "",
    );

    const content = (
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{count}</p>
      </div>
    );

    if (!interactive) {
      return content;
    }

    return (
      <Link href={buildAttendanceHref(filter)} className="block rounded-[24px] focus-visible:outline-none">
        {content}
      </Link>
    );
  }

  return (
    <FormSection
      title={title}
      description={description}
      className="overflow-visible"
    >
      {interactive ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {renderSnapshotCard({ label: "Present Today", count: counters.present, toneClass: "border-emerald-200 bg-emerald-50/70 text-emerald-800", filter: "present" })}
            {renderSnapshotCard({ label: "Late Today", count: counters.late, toneClass: "border-orange-200 bg-orange-50/80 text-orange-800", filter: "late" })}
            {renderSnapshotCard({ label: "Absent Today", count: counters.absent, toneClass: "border-rose-200 bg-rose-50/80 text-rose-800", filter: "absent" })}
            {renderSnapshotCard({ label: "Incomplete Punch", count: counters.incomplete, toneClass: "border-amber-200 bg-amber-50/80 text-amber-800", filter: "incomplete" })}
            {renderSnapshotCard({ label: "Outside Location", count: counters.outsideLocation, toneClass: "border-orange-200 bg-orange-50/75 text-orange-800", filter: "outside_location" })}
            {renderSnapshotCard({ label: "Pending Corrections", count: pendingCorrectionsCount, toneClass: "border-slate-200 bg-slate-50/85 text-slate-800", filter: "pending_corrections" })}
          </div>

          <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/45 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Snapshot controls</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Adjust branch and date for the attendance snapshot, then open the detailed attendance board only when needed.</p>
              </div>
              <form className="grid gap-3 md:grid-cols-3" action="/dashboard">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Branch</span>
                  <select name="attendance_branch" defaultValue={selectedBranchId} className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none">
                    <option value="all">All branches</option>
                    {branches?.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Date</span>
                  <input type="date" name="attendance_date" defaultValue={selectedDate} className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-[var(--foreground)] outline-none" />
                </label>
                <button type="submit" className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white">
                  Apply
                </button>
              </form>
            </div>

            <div id="hr-pending-corrections" className="mt-6 rounded-[22px] border border-[var(--border)] bg-white/80 px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Pending correction handling</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{pendingCorrectionsCount} correction request sedang menunggu semakan HR.</p>
                </div>
                <Link href={buildAttendanceHref("pending_corrections")} className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white">
                  Open Attendance Board
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Present Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-800">{counters.present}</p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Late Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-orange-800">{counters.late}</p>
            </div>
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">Absent Today</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-800">{counters.absent}</p>
            </div>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Incomplete Punch</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-amber-800">{counters.incomplete}</p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">Not Punched In</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">{counters.notPunchedIn}</p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/75 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Outside Location Punches</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-orange-800">{counters.outsideLocation}</p>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">Urgent alerts</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Lewat, absent, dan punch tidak lengkap untuk tindakan cepat hari ini.</p>
              </div>
              <Link href="/attendance" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white sm:w-auto">
                <Clock3 className="h-4 w-4" />
                Open Attendance Board
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {urgentRows.length ? (
                urgentRows.map((row) => (
                  <div key={row.id} className={cn("flex flex-col gap-3 rounded-[22px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between", getAttendanceStatusTone(row.status))}>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">{row.staffName}</p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{row.branchName}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge value={row.status} />
                      {row.lateMinutes > 0 ? <StatusBadge value={`${row.lateMinutes} min late`} /> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-white/80 px-4 py-5 text-sm text-[var(--muted-foreground)]">
                  Tiada alert attendance yang mendesak untuk hari ini.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </FormSection>
  );
}

function NotificationWidget({ rows, unreadCount, error }: NotificationWidgetProps) {
  return (
    <FormSection title="Notifikasi Terkini" description={`Jumlah belum dibaca: ${unreadCount}`}>
      {error ? (
        <EmptyState title="Notifikasi belum dapat dimuatkan" description={error} />
      ) : rows.length ? (
        <div className="space-y-4">
          {rows.slice(0, 5).map((row) => (
            <Link key={String(row.id ?? row.created_at)} href="/notifications" className="block rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/60 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{String(row.title ?? "Notifikasi")}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDateTime(row.created_at)}</p>
                  <p className="mt-3 text-sm text-[var(--foreground)]">{String(row.message ?? "-")}</p>
                </div>
                <StatusBadge value={row.is_read === true ? "read" : "unread"} />
              </div>
            </Link>
          ))}
          <Link href="/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
            Buka semua notifikasi
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <EmptyState title="Tiada notifikasi baru" description="Semua notifikasi penting akan muncul di sini sebaik sahaja ada kemas kini baru." />
      )}
    </FormSection>
  );
}

function HolidayWidget({ holiday }: { holiday: TableRow | null }) {
  return (
    <FormSection title="Next Clinic Holiday" description="Cuti seterusnya yang relevan untuk cawangan anda.">
      {holiday ? (
        <div className="rounded-3xl border border-violet-100 bg-violet-50/65 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-[var(--foreground)]">{String(holiday.holiday_name ?? "Cuti akan datang")}</p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{formatDate(holiday.holiday_date)}</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[var(--accent)]">
              {formatCountdown(daysUntil(holiday.holiday_date))}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="Tiada cuti akan datang" description="Jadual cuti klinik akan muncul di sini bila rekod sudah diset." />
      )}
    </FormSection>
  );
}

function PendingLeaveApplicationsWidget({ rows }: { rows: TableRow[] }) {
  return (
    <FormSection title="My Pending Leave Applications" description="Permohonan cuti anda yang masih menunggu semakan HR.">
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const hasAttachment = Boolean(String(row.attachment_url ?? "").trim());
            const submittedAt = String(row.created_at ?? row.submitted_at ?? "");
            const reasonPreview = String(row.reason ?? row.remarks ?? "").trim();
            const dayLabel = `${Number(row.total_days ?? 0) || 0} day${Number(row.total_days ?? 0) === 1 ? "" : "s"}`;

            return (
              <Link
                key={String(row.id ?? `${row.leave_type}-${row.created_at}`)}
                href="/leave?status=pending"
                className="block rounded-3xl border border-amber-200 bg-amber-50/82 px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-950">{formatLeaveTypeLabel(row.leave_type)}</p>
                    <p className="mt-1 text-sm text-amber-900">
                      {formatDate(row.start_date)}
                      {String(row.end_date ?? "") !== String(row.start_date ?? "") ? ` - ${formatDate(row.end_date)}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-amber-800">
                      <span className="rounded-full bg-white/80 px-3 py-1">{dayLabel}</span>
                      <span className="rounded-full bg-white/80 px-3 py-1">{hasAttachment ? "Form uploaded" : "Form missing"}</span>
                      {submittedAt ? <span className="rounded-full bg-white/80 px-3 py-1">Submitted {formatDate(submittedAt)}</span> : null}
                    </div>
                    {reasonPreview ? (
                      <p className="mt-3 line-clamp-2 text-sm text-amber-900/90">{reasonPreview}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <StatusBadge value="pending" />
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                      View leave request
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-[#FFF7D6] px-4 py-4 text-sm text-[var(--muted-foreground)]">
          Tiada permohonan cuti yang masih pending.
        </div>
      )}
    </FormSection>
  );
}

function RosterPreview({ title, description, rows, staffRows, shiftTemplates, focusStaffId, branches }: { title: string; description: string; rows: TableRow[]; staffRows: TableRow[]; shiftTemplates: TableRow[]; focusStaffId?: string | null; branches: BranchOption[] }) {
  const groupedRows = rows.reduce<Record<string, { doctors: TableRow[]; staff: TableRow[] }>>((groups, row) => {
    const rosterDate = String(row.roster_date ?? row.date ?? "");
    const staff = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
    const roleOnShift = inferRoleOnShift(row, staff);

    if (!groups[rosterDate]) {
      groups[rosterDate] = { doctors: [], staff: [] };
    }

    if (roleOnShift === "doctor") {
      groups[rosterDate].doctors.push(row);
    } else {
      groups[rosterDate].staff.push(row);
    }

    return groups;
  }, {});

  const orderedDates = Object.keys(groupedRows)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 7);

  function renderRosterItems(items: TableRow[], emptyLabel: string) {
    if (!items.length) {
      return <p className="text-sm text-[var(--muted-foreground)]">{emptyLabel}</p>;
    }

    return (
      <div className="space-y-3">
        {items.map((row) => {
          const staff = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
          const isOwnShift = focusStaffId && String(row.staff_id ?? "") === String(focusStaffId);

          return (
            <div key={String(row.id ?? `${row.staff_id}-${row.shift_template_id}`)} className="rounded-2xl bg-[var(--card-muted)] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{String(staff?.full_name ?? row.staff_id ?? "-")}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{String(staff?.position ?? "Tidak ditetapkan")}</p>
                </div>
                {isOwnShift ? <StatusBadge value="Own Shift" /> : null}
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)] sm:grid-cols-2">
                <p>Shift: {getShiftName(row, shiftTemplates)}</p>
                <p>Time: {getTimeRange(row, shiftTemplates)}</p>
              </div>
              {row.notes ? <p className="mt-3 text-sm text-[var(--foreground)]">Notes: {String(row.notes)}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <FormSection title={title} description={description}>
      {orderedDates.length ? (
        <div className="space-y-4">
          {orderedDates.map((date) => {
            const dateGroup = groupedRows[date];
            return (
              <div key={date} className="rounded-3xl border border-[var(--border)] bg-white px-5 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-[var(--foreground)]">{formatDate(date)}</p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{getBranchName(branches, String(dateGroup.doctors[0]?.branch_id ?? dateGroup.staff[0]?.branch_id ?? ""))}</p>
                  </div>
                  <div className="rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]">
                    {dateGroup.doctors.length + dateGroup.staff.length} assignment
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Stethoscope className="h-4 w-4 text-[var(--accent)]" />
                      Doktor Bertugas
                    </div>
                    {renderRosterItems(dateGroup.doctors, "Tiada doktor diset untuk tarikh ini.")}
                  </div>
                  <div>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Users className="h-4 w-4 text-[var(--accent)]" />
                      Staff Bertugas
                    </div>
                    {renderRosterItems(dateGroup.staff, "Tiada staff diset untuk tarikh ini.")}
                  </div>
                </div>
              </div>
            );
          })}
          <Link href="/roster" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
            Buka paparan roster penuh
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <EmptyState title="Roster belum diset untuk minggu ini" description="Bila jadual sudah dibuat, anda akan nampak susunan shift di sini." />
      )}
    </FormSection>
  );
}

function renderLeaveQueueItem(row: TableRow, staffRows: TableRow[]) {
  const staff = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
  return (
    <div key={String(row.id ?? `${row.staff_id}-${row.created_at}`)} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{String(staff?.full_name ?? row.staff_id ?? "Staff")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{String(row.leave_type ?? "leave").replaceAll("_", " ")} · {formatDate(row.start_date)} - {formatDate(row.end_date)}</p>
        </div>
        <StatusBadge value={String(row.status ?? "pending")} />
      </div>
    </div>
  );
}

function renderFeedbackItem(
  row: TableRow,
  staffRows: TableRow[],
  profileRows: Profile[] = [],
  options?: { currentStaffId?: string | null; currentProfileId?: string | null },
) {
  const submitterProfile = profileRows.find((item) => String(item.id ?? "") === String(row.submitted_by ?? ""));
  const submitterStaffByProfileId = staffRows.find((item) => String(item.profile_id ?? "") === String(row.submitted_by ?? ""));
  const submitterStaffByStaffId = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
  const submitterStaff = submitterStaffByProfileId ?? submitterStaffByStaffId ?? null;
  const submitterName = String(submitterProfile?.full_name ?? submitterProfile?.email ?? submitterStaff?.full_name ?? "Unknown User");
  const submitterRole = String(submitterProfile?.role ?? submitterStaff?.position ?? "").trim();
  const label =
    options?.currentStaffId && String(row.target_staff_id ?? "") === String(options.currentStaffId) && normalizeString(row.target_type) === "staff"
      ? "Targeted to you"
      : options?.currentProfileId && String(row.assigned_to ?? "") === String(options.currentProfileId)
        ? "Assigned to you"
        : null;
  const normalizedStatus = normalizeString(row.status);
  const normalizedPriority = normalizeString(row.priority);
  const panelClass =
    normalizedPriority === "urgent"
      ? "border-rose-200 bg-rose-50/75"
      : ["resolved", "closed"].includes(normalizedStatus)
        ? "border-emerald-200 bg-emerald-50/75"
        : ["new", "pending", "assigned", "in_progress"].includes(normalizedStatus)
          ? "border-amber-200 bg-amber-50/75"
          : "border-[var(--border)] bg-[var(--card-muted)]/55";

  return (
    <div key={String(row.id ?? `${row.title}-${row.created_at}`)} className={cn("rounded-3xl border px-5 py-4", panelClass)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-[var(--foreground)]">{String(row.title ?? row.subject ?? "Feedback")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            From: {submitterName}
            {submitterRole ? ` · ${submitterRole}` : ""}
            {" · "}
            {formatDateTime(row.created_at)}
          </p>
          <p className="mt-3 text-sm text-[var(--foreground)]">{String(row.message ?? "-")}</p>
          {label ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]">{label}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {label ? <StatusBadge value={label} /> : null}
          <StatusBadge value={String(row.status ?? "new")} />
          <StatusBadge value={String(row.priority ?? "normal")} />
        </div>
      </div>
    </div>
  );
}

async function loadStaffDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const branchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");
  const staffId = String(context.staff?.id ?? "");
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const today = getMalaysiaDateString();
  const inSevenDays = new Date();
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const [notifications, holidays, rosters, shiftTemplates, leaveRows, entitlementRows, branchStaffRows, feedbackRows, staffDirectoryRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
    queryRows(() => supabase.from("rosters").select("*").eq("branch_id", branchId).gte("roster_date", today).lte("roster_date", getMalaysiaDateString(inSevenDays)).order("roster_date", { ascending: true }).limit(120)),
    queryRows(() => supabase.from("shift_templates").select("*").limit(120)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("staff_id", staffId).limit(200)),
    queryRows(() => supabase.from("leave_entitlements").select("*").eq("staff_id", staffId).order("entitlement_year", { ascending: false }).limit(5)),
    queryRows(() => supabase.from("staff").select("*").eq("branch_id", branchId).limit(200)),
    queryRows(() => supabase.from("feedbacks").select("*").eq("target_staff_id", staffId).in("status", ["new", "assigned", "in_progress", "need_more_info"]).order("created_at", { ascending: false }).limit(40)),
    queryRows(() => supabase.from("staff").select("*").limit(400)),
  ]);
  const feedbackForMe = dedupeRowsById(feedbackRows.rows.filter((row) => isFeedbackForCurrentStaff(row, staffId, profileId)));
  const profileRows = await queryProfilesByIds(
    supabase,
    feedbackForMe.map((row) => String(row.submitted_by ?? "")),
  );

  const nextShift = getNextPersonalShift(rosters.rows, staffId);
  const latestEntitlement = entitlementRows.rows[0] ?? null;
  const leaveBalance = buildLeaveBalanceSummary(latestEntitlement, leaveRows.rows);
  const pendingLeaveApplications = leaveRows.rows
    .filter((row) => isPendingLeaveStatus(row))
    .sort((left, right) => String(right.updated_at ?? right.created_at ?? "").localeCompare(String(left.updated_at ?? left.created_at ?? "")));
  const avatarUrl = await getSignedAvatarUrl(supabase, String(context.profile?.avatar_url ?? ""));
  const missingProfileFields = getMissingStaffEditableProfileFields(context.profile, context.staff);
  const nextApprovedAnnualLeave = [...leaveRows.rows]
    .filter((row) => normalizeString(row.status) === "approved" && normalizeString(row.leave_type) === "annual_leave" && String(row.start_date ?? "").slice(0, 10) >= today)
    .sort((left, right) => String(left.start_date ?? "").localeCompare(String(right.start_date ?? "")))[0] ?? null;

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, holidays.error, rosters.error, shiftTemplates.error, leaveRows.error, entitlementRows.error, branchStaffRows.error, feedbackRows.error, profileRows.error, staffDirectoryRows.error]} />
      <HeroCard
        title={`${greetingByTime()}, ${String(context.staff?.full_name ?? context.profile?.full_name ?? "Warga Klinik Afifi")}`}
        branch={getBranchName(branches, branchId)}
        position={String(context.staff?.position ?? "Jawatan belum ditetapkan")}
        avatarUrl={avatarUrl}
      />

      {isStaffEditableProfileIncomplete(context.profile, context.staff) ? (
        <FormSection title="Profil Belum Lengkap" description="Lengkapkan maklumat peribadi supaya urusan cuti, MC, dan komunikasi HR berjalan lebih lancar.">
          <div className="flex flex-col gap-4 rounded-3xl border border-rose-200 bg-[#FFF1F2] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex w-fit rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                Action needed
              </span>
              <p className="text-sm text-rose-900">
                Maklumat belum lengkap: {missingProfileFields.join(", ")}.
              </p>
            </div>
            <Link href="/settings" className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-foreground)]">
              Buka My Profile
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </FormSection>
      ) : null}

      <div className="space-y-6">
        <FormSection title="Next Shift" description="Shift seterusnya yang telah dijadualkan untuk anda.">
          {nextShift ? (
            <div className="rounded-3xl border border-[#d5e9e6] bg-white px-5 py-5">
              <p className="text-lg font-semibold text-[var(--foreground)]">{formatDate(nextShift.roster_date)}</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{getShiftName(nextShift, shiftTemplates.rows)} · {getTimeRange(nextShift, shiftTemplates.rows)}</p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">{getBranchName(branches, String(nextShift.branch_id ?? branchId))}</p>
            </div>
          ) : (
            <EmptyState title="No shift scheduled yet" description="Shift seterusnya akan muncul di sini bila roster sudah diset." />
          )}
        </FormSection>
        <LeaveBalancePanel summary={leaveBalance} hideHeader compactAnnualRemainingOnly />
        <PendingLeaveApplicationsWidget rows={pendingLeaveApplications} />
        <FormSection title="Next Approved Annual Leave" description="Cuti tahunan yang telah diluluskan dan akan datang.">
          {nextApprovedAnnualLeave ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 px-5 py-5">
              <p className="text-lg font-semibold text-[var(--foreground)]">{formatDate(nextApprovedAnnualLeave.start_date)}{String(nextApprovedAnnualLeave.end_date ?? "") !== String(nextApprovedAnnualLeave.start_date ?? "") ? ` - ${formatDate(nextApprovedAnnualLeave.end_date)}` : ""}</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{Number(nextApprovedAnnualLeave.total_days ?? 0) || 0} day(s)</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge value="approved" />
                {nextApprovedAnnualLeave.reviewed_by ? <span className="text-sm text-[var(--muted-foreground)]">Approved by {String(nextApprovedAnnualLeave.reviewed_by)}</span> : null}
              </div>
            </div>
          ) : (
            <EmptyState title="No approved annual leave upcoming." description="Approved annual leave akan muncul di sini bila sudah diluluskan." />
          )}
        </FormSection>
      </div>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/leave", label: "Apply Leave", helper: "Mohon cuti terus dari portal" },
          { href: "/mc", label: "Upload MC", helper: "Hantar MC untuk semakan" },
          { href: "/feedback", label: "Submit Feedback", helper: "Laporkan isu atau cadangan" },
          { href: "/roster", label: "View Roster", helper: "Lihat jadual kerja 7 hari" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-1">
        <DashboardList
          title="Tugasan / Feedback untuk Anda"
          description="Maklum balas atau Tugasan yang ditujukan terus kepada Anda dari Admin Operasi atau HR"
          items={feedbackForMe.slice(0, 5).map((row) => renderFeedbackItem(row, staffDirectoryRows.rows, profileRows.rows as Profile[], { currentStaffId: staffId, currentProfileId: profileId }))}
          emptyTitle="Tiada feedback untuk anda"
          emptyDescription="Belum ada feedback yang disasarkan terus kepada anda buat masa ini."
        />
      </div>
    </div>
  );
}

async function loadBranchPicDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const branchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");
  const staffId = String(context.staff?.id ?? "");
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const today = getMalaysiaDateString();
  const inSevenDays = new Date();
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const [notifications, holidays, personalLeaveRows, entitlementRows, ownRosterRows, branchRosterRows, branchLeaveRows, feedbackRows, branchStaffRows, shiftTemplates, staffDirectoryRows, attendanceRows, attendanceSettingsRows, branchLeaveScopeRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("staff_id", staffId).limit(200)),
    queryRows(() => supabase.from("leave_entitlements").select("*").eq("staff_id", staffId).order("entitlement_year", { ascending: false }).limit(5)),
    queryRows(() => supabase.from("rosters").select("*").eq("staff_id", staffId).gte("roster_date", today).lte("roster_date", getMalaysiaDateString(inSevenDays)).order("roster_date", { ascending: true }).limit(20)),
    queryRows(() => supabase.from("rosters").select("*").eq("branch_id", branchId).gte("roster_date", today).lte("roster_date", getMalaysiaDateString(inSevenDays)).order("roster_date", { ascending: true }).limit(200)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("branch_id", branchId).eq("status", "pending").limit(80)),
    queryRows(() => supabase.from("feedbacks").select("*").in("status", ["new", "assigned", "in_progress", "need_more_info"]).order("created_at", { ascending: false }).limit(200)),
    queryRows(() => supabase.from("staff").select("*").eq("branch_id", branchId).limit(200)),
    queryRows(() => supabase.from("shift_templates").select("*").limit(120)),
    queryRows(() => supabase.from("staff").select("*").limit(400)),
    queryRows(() => supabase.from("attendance_records").select("*").eq("branch_id", branchId).gte("attendance_date", today).limit(200)),
    queryRows(() => supabase.from("attendance_settings").select("*").limit(120)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("branch_id", branchId).limit(200)),
  ]);

  const leaveBalance = buildLeaveBalanceSummary(entitlementRows.rows[0] ?? null, personalLeaveRows.rows);
  const nextHoliday = getNextHoliday(holidays.rows, branchId);
  const avatarUrl = await getSignedAvatarUrl(supabase, String(context.profile?.avatar_url ?? ""));
  const todayBranchRows = branchRosterRows.rows.filter((row) => String(row.roster_date ?? row.date ?? "").slice(0, 10) === today);
  const attendanceSnapshotRows = buildAttendanceSnapshotRows({
    rosterRows: branchRosterRows.rows,
    attendanceRows: attendanceRows.rows,
    settingRows: attendanceSettingsRows.rows,
    staffRows: branchStaffRows.rows,
    shiftTemplateRows: shiftTemplates.rows,
    leaveRows: branchLeaveScopeRows.rows,
    branches,
    date: today,
    branchScope: branchId,
  });
  const todayDoctors = todayBranchRows.filter((row) => inferRoleOnShift(row, branchStaffRows.rows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""))) === "doctor").length;
  const todaySupport = todayBranchRows.filter((row) => inferRoleOnShift(row, branchStaffRows.rows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""))) === "staff").length;
  const incompleteProfiles = branchStaffRows.rows.filter(isStaffRecordIncomplete);
  const branchOperationalIssues = dedupeRowsById(feedbackRows.rows.filter((row) => isBranchOperationalIssue(row, branchId)));
  const feedbackForMe = dedupeRowsById(feedbackRows.rows.filter((row) => isFeedbackForCurrentStaff(row, staffId, profileId)));
  const profileRows = await queryProfilesByIds(
    supabase,
    [...branchOperationalIssues, ...feedbackForMe].map((row) => String(row.submitted_by ?? "")),
  );

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, holidays.error, personalLeaveRows.error, entitlementRows.error, ownRosterRows.error, branchRosterRows.error, branchLeaveRows.error, feedbackRows.error, branchStaffRows.error, shiftTemplates.error, profileRows.error, staffDirectoryRows.error, attendanceRows.error, attendanceSettingsRows.error, branchLeaveScopeRows.error]} />
      <HeroCard
        title={`${greetingByTime()}, ${String(context.staff?.full_name ?? context.profile?.full_name ?? "Branch PIC")}`}
        branch={getBranchName(branches, branchId)}
        position={String(context.staff?.position ?? "Branch PIC")}
        avatarUrl={avatarUrl}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <LeaveBalancePanel summary={leaveBalance} title="My Leave dan MC Balance" />
        <FormSection title="My Notifications" description="Notifikasi peribadi dan operasi yang perlukan tindakan cepat.">
          <NotificationWidget rows={notifications.rows.slice(0, 5)} unreadCount={countUnreadNotifications(notifications.rows, profileId)} error={notifications.error} />
        </FormSection>
      </div>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/leave", label: "Apply Leave", helper: "Mohon cuti peribadi" },
          { href: "/mc", label: "Upload MC", helper: "Hantar MC sendiri" },
          { href: "/roster", label: "Manage Roster", helper: "Semak dan kemas kini roster cawangan" },
          { href: "/feedback/manage", label: "View Branch Issues", helper: "Lihat isu operasi cawangan yang relevan" },
          { href: "/staff", label: "View Branch Staff", helper: "Semak rekod staff cawangan" },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Today Branch Roster" value={todayBranchRows.length} description="Jumlah assignment roster cawangan hari ini." icon={CalendarClock} />
        <StatCard title="Today Doctors On Duty" value={todayDoctors} description="Bilangan doktor atau locum yang bertugas hari ini." icon={Stethoscope} />
        <StatCard title="Today Staff On Duty" value={todaySupport} description="Bilangan support staff yang bertugas hari ini." icon={Users} />
        <StatCard title="Pending Leave Requests" value={branchLeaveRows.rows.length} description="Permohonan cuti cawangan yang masih menunggu semakan." icon={ClipboardList} tone={countValue(branchLeaveRows.rows.length) > 0 ? "alert" : "neutral"} />
        <StatCard title="Feedback Untuk Saya" value={feedbackForMe.length} description="Feedback yang ditujukan terus kepada anda atau telah diassign ke akaun anda." icon={MessageSquareMore} tone={countValue(feedbackForMe.length) > 0 ? "alert" : "neutral"} />
        <StatCard title="Branch Operational Issues" value={branchOperationalIssues.length} description="Isu operasi cawangan yang relevan untuk tindakan atau pemantauan anda." icon={MessageSquareMore} tone={countValue(branchOperationalIssues.length) > 0 ? "alert" : "neutral"} />
        <StatCard title="Incomplete Staff Profiles" value={incompleteProfiles.length} description="Rekod staff cawangan yang masih perlukan kemaskini penting." icon={UserRound} tone={countValue(incompleteProfiles.length) > 0 ? "alert" : "neutral"} />
      </section>

      <TodayAttendanceSnapshot
        title="Today Attendance Snapshot"
        description="Ringkasan kehadiran staff cawangan anda hari ini, termasuk lewat, absent, dan punch tidak lengkap."
        rows={attendanceSnapshotRows}
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <RosterPreview title="Upcoming Branch Roster" description="Jadual 7 hari terdekat untuk cawangan anda, termasuk shift sendiri jika sudah diset." rows={branchRosterRows.rows} staffRows={branchStaffRows.rows} shiftTemplates={shiftTemplates.rows} focusStaffId={staffId} branches={branches} />
        <HolidayWidget holiday={nextHoliday} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardList
          title="Leave Review Queue"
          description="Permohonan cuti cawangan yang masih menunggu tindakan anda atau HR."
          items={branchLeaveRows.rows.slice(0, 5).map((row) => renderLeaveQueueItem(row, branchStaffRows.rows))}
          emptyTitle="Tiada cuti pending"
          emptyDescription="Bagus, semua permohonan cuti cawangan sudah ditangani buat masa ini."
        />
        <DashboardList
          title="Feedback Untuk Saya"
          description="Maklum balas yang disasarkan terus kepada staff account anda atau telah diassign kepada anda."
          items={feedbackForMe.slice(0, 5).map((row) => renderFeedbackItem(row, staffDirectoryRows.rows, profileRows.rows as Profile[], { currentStaffId: staffId, currentProfileId: profileId }))}
          emptyTitle="Tiada feedback untuk anda"
          emptyDescription="Belum ada feedback yang ditujukan terus kepada anda buat masa ini."
        />
        <DashboardList
          title="Branch Operational Issues"
          description="Hanya isu operasi, facility, roster, equipment, atau tugasan cawangan dari branch anda dipaparkan di sini."
          items={branchOperationalIssues.slice(0, 5).map((row) => renderFeedbackItem(row, staffDirectoryRows.rows, profileRows.rows as Profile[]))}
          emptyTitle="Tiada isu operasi cawangan"
          emptyDescription="Tiada isu operasi cawangan yang relevan untuk dipantau sekarang."
        />
      </div>
    </div>
  );
}

async function loadHrDashboard(
  supabase: SupabaseClient,
  context: DashboardContextLike,
  branches: BranchOption[],
  options?: {
    attendanceBranchId?: string;
    attendanceDate?: string;
  },
) {
  const attendanceDate = options?.attendanceDate || getMalaysiaDateString();
  const attendanceBranchId = options?.attendanceBranchId || "all";
  const [leaveRows, staffDocs, feedbackRows, staffRows, attendanceRows, rosterRows, attendanceSettingsRows, adjustmentRows] = await Promise.all([
    queryRows(() => supabase.from("leave_requests").select("*").limit(300)),
    queryRows(() => supabase.from("staff_documents").select("*").limit(320)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(250)),
    queryRows(() => supabase.from("staff").select("*").limit(300)),
    queryRows(() => supabase.from("attendance_records").select("*").eq("attendance_date", attendanceDate).limit(300)),
    queryRows(() => supabase.from("rosters").select("*").eq("roster_date", attendanceDate).limit(300)),
    queryRows(() => supabase.from("attendance_settings").select("*").limit(120)),
    queryRows(() => supabase.from("attendance_adjustments").select("*").eq("status", "pending").limit(120)),
  ]);

  const pendingLeave = leaveRows.rows.filter(isPendingLeaveStatus);
  const pendingMc = pendingLeave.filter((row) => normalizeString(row.leave_type) === "medical_leave" || Boolean(row.attachment_url));
  const pendingDocReview = staffDocs.rows.filter((row) => normalizeString(row.status) === "pending_review");
  const incompleteProfiles = staffRows.rows.filter(isStaffRecordIncomplete);
  const hrFeedback = feedbackRows.rows.filter((row) => {
    const status = normalizeString(row.status);
    const targetType = normalizeString(row.target_type);
    const assignedDepartment = normalizeString(row.assigned_department);
    return status === "new" && (targetType === "hr" || assignedDepartment === "hr");
  });
  const expiringDocs = filterExpiringRows(staffDocs.rows);
  const expiringSoonDocs = staffDocs.rows.filter((row) => getExpiryStatus(row).label === "expiring_soon");
  const expiredDocs = staffDocs.rows.filter((row) => getExpiryStatus(row).label === "expired");
  const doctorApc = expiringDocs.filter((row) => {
    const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
    return docText.includes("apc") || docText.includes("mmc");
  });
  const juruxrayDocs = expiringDocs.filter((row) => {
    const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
    return docText.includes("juruxray") || docText.includes("cme") || docText.includes("medical checkup");
  });
  const attendanceSnapshotRows = buildAttendanceSnapshotRows({
    rosterRows: rosterRows.rows,
    attendanceRows: attendanceRows.rows,
    settingRows: attendanceSettingsRows.rows,
    staffRows: staffRows.rows,
    shiftTemplateRows: [],
    leaveRows: leaveRows.rows,
    branches,
    date: attendanceDate,
    branchScope: attendanceBranchId,
  });
  const pendingCorrections = adjustmentRows.rows.filter((row) =>
    attendanceBranchId === "all" ? true : String(row.branch_id ?? "") === attendanceBranchId,
  );

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[leaveRows.error, staffDocs.error, feedbackRows.error, staffRows.error, attendanceRows.error, rosterRows.error, attendanceSettingsRows.error, adjustmentRows.error]} />
      <PageHeader title="HR Operations Dashboard" description="Operational command centre for attendance, approvals, staff compliance and daily HR activities." />

      <TodayAttendanceSnapshot
        title="Today's Attendance Snapshot"
        description="See who is working today, who is absent, who is late, and drill into the attendance list without leaving the dashboard."
        rows={attendanceSnapshotRows}
        branches={branches}
        selectedBranchId={attendanceBranchId}
        selectedDate={attendanceDate}
        pendingCorrectionsCount={pendingCorrections.length}
        interactive
      />

      <FormSection title="HR Action Queue" description="Approvals and people tasks that need immediate HR attention today.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Pending Leave" value={pendingLeave.length} description="Permohonan cuti menunggu semakan." icon={ClipboardList} tone={pendingLeave.length > 0 ? "alert" : "success"} href="/leave?status=pending" />
          <StatCard title="Pending MC Review" value={pendingMc.length} description="MC atau medical leave yang belum ditutup." icon={Upload} tone={pendingMc.length > 0 ? "alert" : "success"} href="/mc?status=pending" />
          <StatCard title="Pending Staff Document Review" value={pendingDocReview.length} description="Dokumen staff yang masih perlu review." icon={FileBadge} tone={pendingDocReview.length > 0 ? "alert" : "success"} href="/staff-compliance?status=pending" />
          <StatCard title="Incomplete Staff Profiles" value={incompleteProfiles.length} description="Rekod staff yang masih belum lengkap." icon={UserRound} tone={incompleteProfiles.length > 0 ? "alert" : "success"} href="/staff?profile=incomplete" />
          <StatCard title="New HR Feedback" value={hrFeedback.length} description="Feedback baru yang perlukan perhatian HR." icon={MessageSquareMore} tone={hrFeedback.length > 0 ? "alert" : "success"} href="/feedback/manage?status=new&department=hr" />
        </div>
      </FormSection>

      <FormSection title="Compliance Monitoring" description="Monitor staff and clinic compliance documents before they expire.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Staff Docs Expiring Soon" value={expiringSoonDocs.length} description="Dokumen staff hampir tamat tempoh." icon={FileSearch} tone={expiringSoonDocs.length > 0 ? "alert" : "success"} href="/staff-compliance?filter=expiring_soon" />
          <StatCard title="Expired Staff Docs" value={expiredDocs.length} description="Dokumen staff yang telah tamat tempoh." icon={ShieldAlert} tone={expiredDocs.length > 0 ? "alert" : "success"} href="/staff-compliance?filter=expired" />
          <StatCard title="Doctor APC/MMC Risk" value={doctorApc.length} description="Dokumen APC atau MMC doktor yang hampir tamat tempoh." icon={Stethoscope} tone={doctorApc.length > 0 ? "alert" : "success"} href="/staff-compliance?filter=doctor_apc_mmc_risk" />
          <StatCard title="Jururxay / CME Risk" value={juruxrayDocs.length} description="Jururxay, CME, atau medical checkup yang hampir tamat tempoh." icon={ShieldCheck} tone={juruxrayDocs.length > 0 ? "alert" : "success"} href="/staff-compliance?filter=juruxray_cme_risk" />
        </div>
      </FormSection>
    </div>
  );
}

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function loadOperationDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const branchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");
  const startOfWeek = getStartOfWeek().toISOString();
  const [notifications, feedbackRows, commentRows, attendanceRows, rosterRows, attendanceSettingsRows, staffRows, leaveRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(280)),
    queryRows(() => supabase.from("feedback_comments").select("*").order("created_at", { ascending: false }).limit(120)),
    queryRows(() => supabase.from("attendance_records").select("*").gte("attendance_date", getMalaysiaDateString()).limit(300)),
    queryRows(() => supabase.from("rosters").select("*").eq("roster_date", getMalaysiaDateString()).limit(300)),
    queryRows(() => supabase.from("attendance_settings").select("*").limit(120)),
    queryRows(() => supabase.from("staff").select("*").limit(300)),
    queryRows(() => supabase.from("leave_requests").select("*").limit(300)),
  ]);

  const operationVisibleFeedback = getOperationVisibleFeedback(feedbackRows.rows, profileId);
  const assignedIssues = operationVisibleFeedback.filter(
    (row) =>
      String(row.assigned_to ?? "") === profileId ||
      normalizeString(row.target_type) === "operation" ||
      normalizeString(row.assigned_department) === "operation",
  );
  const openIssues = operationVisibleFeedback.filter((row) => ["new", "assigned", "in_progress", "need_more_info", "escalated"].includes(normalizeString(row.status)));
  const urgentIssues = operationVisibleFeedback.filter((row) => (["high", "urgent"].includes(normalizeString(row.priority)) || normalizeString(row.status) === "escalated") && !["resolved", "closed"].includes(normalizeString(row.status)));
  const resolvedThisWeek = countResolvedThisWeek(assignedIssues);
  const portalIssues = operationVisibleFeedback.filter((row) => normalizeString(row.target_type) === "portal_system" || normalizeString(row.category) === "system");
  const operationFeedbackIds = new Set(operationVisibleFeedback.map((row) => String(row.id ?? "")));
  const recentReplies = commentRows.rows.filter((row) => operationFeedbackIds.has(String(row.feedback_id ?? "")) && String(row.created_at ?? "") >= startOfWeek);
  const attendanceSnapshotRows = buildAttendanceSnapshotRows({
    rosterRows: rosterRows.rows,
    attendanceRows: attendanceRows.rows,
    settingRows: attendanceSettingsRows.rows,
    staffRows: staffRows.rows,
    shiftTemplateRows: [],
    leaveRows: leaveRows.rows,
    branches,
    date: getMalaysiaDateString(),
    branchScope: branchId || "all",
  });

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, feedbackRows.error, commentRows.error, attendanceRows.error, rosterRows.error, attendanceSettingsRows.error, staffRows.error, leaveRows.error]} />
      <PageHeader title="Operation Dashboard" description="Dashboard operasi yang fokus pada isu, reply queue, dan perkara urgent tanpa mengganggu anda dengan metrik HR yang tidak berkaitan." />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Assigned Feedback" value={assignedIssues.length} description="Jumlah feedback operational yang kini berada dalam aliran operation." icon={MessageSquareMore} tone={assignedIssues.length > 0 ? "alert" : "neutral"} />
        <StatCard title="Open Operation Issues" value={openIssues.length} description="Isu aktif yang masih perlukan susulan." icon={ClipboardList} tone={openIssues.length > 0 ? "alert" : "neutral"} />
        <StatCard title="Resolved This Week" value={resolvedThisWeek} description="Jumlah isu yang ditutup minggu ini." icon={CheckCircle2} tone={resolvedThisWeek > 0 ? "success" : "neutral"} />
        <StatCard title="Urgent / Escalated" value={urgentIssues.length} description="Isu keutamaan tinggi yang perlu didahulukan." icon={ShieldAlert} tone={urgentIssues.length > 0 ? "alert" : "neutral"} />
        <StatCard title="Portal System Issues" value={portalIssues.length} description="Feedback portal system yang singgah di aliran operation." icon={FileText} tone={portalIssues.length > 0 ? "warning" : "neutral"} />
      </section>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/feedback/manage", label: "View Assigned Feedback", helper: "Semak isu yang perlu diurus sekarang" },
          { href: "/feedback/manage", label: "Reply Feedback", helper: "Balas dan kemas kini status isu" },
          { href: "/attendance", label: "Open Attendance Board", helper: "Lihat snapshot kehadiran secara read-only" },
          { href: "/roster", label: "View Roster", helper: "Semak roster secara read-only" },
          { href: "/clinic-compliance", label: "Clinic Compliance", helper: "Lihat dokumen klinik jika dibenarkan" },
        ]}
      />

      <TodayAttendanceSnapshot
        title="Today Attendance Snapshot"
        description="Ringkasan kehadiran yang boleh dilihat operation untuk memantau staff lewat, absent, atau punch tidak lengkap."
        rows={attendanceSnapshotRows}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardList title="Assigned Issue Queue" description="Queue isu yang masih aktif untuk operation." items={openIssues.slice(0, 5).map((row) => renderFeedbackItem(row, []))} emptyTitle="Tiada isu aktif" emptyDescription="Bagus, tiada isu operation yang sedang terbuka sekarang." />
        <DashboardList title="Urgent Feedback" description="Maklum balas atau issue keutamaan tinggi." items={urgentIssues.slice(0, 5).map((row) => renderFeedbackItem(row, []))} emptyTitle="Tiada feedback urgent" emptyDescription="Tiada isu urgent yang perlu dipercepatkan sekarang." />
        <DashboardList
          title="Recent Replies"
          description="Perbualan atau balasan terbaru minggu ini supaya context sentiasa segar."
          items={recentReplies.slice(0, 5).map((row) => (
            <div key={String(row.id ?? row.created_at)} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Feedback #{String(row.feedback_id ?? "-")}</p>
              <p className="mt-2 text-sm text-[var(--foreground)]">{String(row.message ?? row.comment ?? "-")}</p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">{formatDateTime(row.created_at)}</p>
            </div>
          ))}
          emptyTitle="Tiada reply terbaru"
          emptyDescription="Belum ada reply baru minggu ini untuk operation review."
        />
        <NotificationWidget rows={notifications.rows.slice(0, 5)} unreadCount={countUnreadNotifications(notifications.rows, profileId)} error={notifications.error} />
      </div>
    </div>
  );
}

async function loadSuperAdminDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const [notifications, staffCount, branchCount, staffRows, leaveRows, feedbackRows, staffDocs, clinicDocs, holidays, attendanceRows, rosterRows, attendanceSettingsRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryCount(() => supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active")),
    queryCount(() => supabase.from("branches").select("id", { count: "exact", head: true })),
    queryRows(() => supabase.from("staff").select("*").limit(400)),
    queryRows(() => supabase.from("leave_requests").select("*").limit(400)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(320)),
    queryRows(() => supabase.from("staff_documents").select("*").limit(320)),
    queryRows(() => supabase.from("clinic_compliance_documents").select("*").limit(240)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
    queryRows(() => supabase.from("attendance_records").select("*").gte("attendance_date", getMalaysiaDateString()).limit(400)),
    queryRows(() => supabase.from("rosters").select("*").eq("roster_date", getMalaysiaDateString()).limit(400)),
    queryRows(() => supabase.from("attendance_settings").select("*").limit(120)),
  ]);

  const pendingLeave = leaveRows.rows.filter(isPendingLeaveStatus).length;
  const openIssues = feedbackRows.rows.filter((row) => !["resolved", "closed"].includes(normalizeString(row.status))).length;
  const complianceSoon = countExpiringRows(staffDocs.rows) + countExpiringRows(clinicDocs.rows);
  const nextHoliday = getNextHoliday(holidays.rows, null);
  const incompleteProfiles = staffRows.rows.filter(isStaffRecordIncomplete).length;
  const attendanceSnapshotRows = buildAttendanceSnapshotRows({
    rosterRows: rosterRows.rows,
    attendanceRows: attendanceRows.rows,
    settingRows: attendanceSettingsRows.rows,
    staffRows: staffRows.rows,
    shiftTemplateRows: [],
    leaveRows: leaveRows.rows,
    branches,
    date: getMalaysiaDateString(),
    branchScope: "all",
  });
  const branchIssueSummary = branches.map((branch) => ({
    branch,
    openIssues: feedbackRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && !["resolved", "closed"].includes(normalizeString(row.status))).length,
    pendingLeave: leaveRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && isPendingLeaveStatus(row)).length,
    activeStaff: staffRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && normalizeString(row.status) !== "resigned").length,
  })).filter((item) => item.activeStaff || item.pendingLeave || item.openIssues);

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, staffCount.error, branchCount.error, staffRows.error, leaveRows.error, feedbackRows.error, staffDocs.error, clinicDocs.error, holidays.error, attendanceRows.error, rosterRows.error, attendanceSettingsRows.error]} />
      <PageHeader title="Super Admin Dashboard" description="Gambaran keseluruhan rentas cawangan yang ringkas tetapi bermakna, supaya anda boleh nampak risiko, isu terbuka, dan tumpuan pasukan tanpa tenggelam dalam terlalu banyak detail harian." />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Active Staff" value={staffCount.count} description="Jumlah staff aktif di seluruh rangkaian klinik." icon={Users} />
        <StatCard title="Total Branches" value={branchCount.count} description="Jumlah cawangan yang sedang dipantau." icon={BriefcaseMedical} />
        <StatCard title="Pending Leave Approvals" value={pendingLeave} description="Jumlah permohonan cuti yang masih terbuka." icon={ClipboardList} tone={pendingLeave > 0 ? "alert" : "neutral"} />
        <StatCard title="Open Feedback / Issues" value={openIssues} description="Jumlah isu rentas cawangan yang belum ditutup." icon={MessageSquareMore} tone={openIssues > 0 ? "alert" : "neutral"} />
        <StatCard title="Compliance Expiring Soon" value={complianceSoon} description="Gabungan dokumen staff dan klinik yang hampir tamat tempoh." icon={FileSearch} tone={complianceSoon > 0 ? "warning" : "neutral"} />
        <StatCard title="Next Clinic Holiday" value={nextHoliday ? formatCountdown(daysUntil(nextHoliday.holiday_date)) : "-"} description={nextHoliday ? `${String(nextHoliday.holiday_name ?? "Cuti akan datang")} pada ${formatDate(nextHoliday.holiday_date)}` : "Belum ada cuti akan datang yang direkodkan."} icon={CalendarDays} />
      </section>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/staff", label: "Staff", helper: "Semak direktori dan status staff" },
          { href: "/leave", label: "Leave", helper: "Pantau approval queue" },
          { href: "/attendance", label: "Open Attendance Board", helper: "Pantau kehadiran semua cawangan hari ini" },
          { href: "/feedback/manage", label: "Feedback", helper: "Lihat isu rentas pasukan" },
          { href: "/roster", label: "Roster", helper: "Semak jadual cawangan" },
          { href: "/staff-compliance", label: "Staff Compliance", helper: "Pantau dokumen staff" },
          { href: "/clinic-compliance", label: "Clinic Compliance", helper: "Pantau risiko dokumen klinik" },
          { href: "/holidays", label: "Holidays", helper: "Urus cuti klinik dan awam" },
        ]}
      />

      <TodayAttendanceSnapshot
        title="Today Attendance Snapshot"
        description="Gambaran global attendance hari ini untuk kenal pasti absent, punch tidak lengkap, dan staff yang lewat."
        rows={attendanceSnapshotRows}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardList
          title="Cross-Branch Issue Summary"
          description="Ringkasan isu terbuka dan cuti pending mengikut cawangan."
          items={branchIssueSummary.slice(0, 6).map((item) => (
            <div key={item.branch.id} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">{item.branch.name}</p>
              <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)] sm:grid-cols-3">
                <p>Staff: {item.activeStaff}</p>
                <p>Pending leave: {item.pendingLeave}</p>
                <p>Open issues: {item.openIssues}</p>
              </div>
            </div>
          ))}
          emptyTitle="Tiada isu rentas cawangan"
          emptyDescription="Semua cawangan nampak stabil buat masa ini."
        />
        <DashboardList
          title="Compliance Risk Summary"
          description="Risiko compliance yang patut diberi perhatian awal."
          items={[
            <div key="staff-risk" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Staff documents expiring soon</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{countExpiringRows(staffDocs.rows)} item</p></div>,
            <div key="clinic-risk" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Clinic documents expiring soon</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{countExpiringRows(clinicDocs.rows)} item</p></div>,
            <div key="profile-risk" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Incomplete staff profiles</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{incompleteProfiles} record</p></div>,
          ]}
          emptyTitle="Tiada risiko compliance besar"
          emptyDescription="Semua indikator compliance nampak terkawal sekarang."
        />
        <DashboardList
          title="HR Summary"
          description="Ringkasan queue yang biasanya jatuh kepada HR."
          items={[
            <div key="hr-summary" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Pending leave</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{pendingLeave} permohonan</p></div>,
            <div key="hr-docs" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Pending staff document review</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{staffDocs.rows.filter((row) => normalizeString(row.status) === "pending_review").length} item</p></div>,
          ]}
          emptyTitle="Tiada ringkasan HR"
          emptyDescription="Data HR belum mencukupi untuk dipaparkan sekarang."
        />
        <DashboardList
          title="Operation Summary"
          description="Isu terbuka, urgent, dan queue operasi secara global."
          items={[
            <div key="op-open" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Open operation issues</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{feedbackRows.rows.filter((row) => normalizeString(row.target_type) === "operation" && !["resolved", "closed"].includes(normalizeString(row.status))).length} issue</p></div>,
            <div key="op-urgent" className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4"><p className="text-sm font-semibold text-[var(--foreground)]">Urgent issues</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">{feedbackRows.rows.filter((row) => ["high", "urgent"].includes(normalizeString(row.priority)) && !["resolved", "closed"].includes(normalizeString(row.status))).length} issue</p></div>,
          ]}
          emptyTitle="Tiada ringkasan operation"
          emptyDescription="Tiada isu operation untuk dipaparkan sekarang."
        />
      </div>

      <NotificationWidget rows={notifications.rows.slice(0, 5)} unreadCount={countUnreadNotifications(notifications.rows, profileId)} error={notifications.error} />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireRouteAccess("dashboard");

  if (!context.user || context.unauthorized || !context.supabase) {
    return (
      <EmptyState
        title="Dashboard access unavailable"
        description="Sign in with a valid portal account to view dashboard content."
      />
    );
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const branchRows = await queryRows(() => context.supabase!.from("branches").select("*").limit(100));
  const branches = toBranchOptions(branchRows.rows);

  let content: React.ReactNode;

  if (context.role === "staff") {
    content = await loadStaffDashboard(context.supabase, context, branches);
  } else if (context.role === "branch_pic") {
    content = await loadBranchPicDashboard(context.supabase, context, branches);
  } else if (context.role === "hr") {
    content = await loadHrDashboard(context.supabase, context, branches, {
      attendanceBranchId: getSearchParamValue(resolvedSearchParams.attendance_branch) ?? "all",
      attendanceDate: getSearchParamValue(resolvedSearchParams.attendance_date) ?? getMalaysiaDateString(),
    });
  } else if (context.role === "operation") {
    content = await loadOperationDashboard(context.supabase, context, branches);
  } else {
    content = await loadSuperAdminDashboard(context.supabase, context, branches);
  }

  return <div className="space-y-6">{content}</div>;
}

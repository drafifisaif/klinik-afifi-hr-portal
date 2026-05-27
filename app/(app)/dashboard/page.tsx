import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BriefcaseMedical,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
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
  countExpiringRows,
  countUnreadNotifications,
  filterExpiringRows,
  getNextHoliday,
  getExpiryStatus,
} from "@/lib/data";
import type { BranchOption, Profile, TableRow, UserRole } from "@/lib/types";
import { daysUntil, formatCountdown, formatDate, formatDateTime, normalizeString } from "@/lib/utils";

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

function greetingByTime() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Selamat pagi";
  }

  if (hour < 18) {
    return "Selamat tengah hari";
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

function isProfileIncomplete(profile: Profile | null, staff: TableRow | null) {
  if (!profile || !staff) {
    return true;
  }

  const personalFields = [
    staff.full_name,
    staff.ic_no,
    staff.phone,
    staff.email ?? profile.email,
    staff.address,
    staff.emergency_contact_name,
    staff.emergency_contact_phone,
  ];

  return personalFields.some((value) => !String(value ?? "").trim());
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

function getNextPersonalShift(rosters: TableRow[], staffId?: string | null) {
  if (!staffId) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
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
  subtitle,
  branch,
  position,
  nextShift,
}: {
  title: string;
  subtitle: string;
  branch: string;
  position: string;
  nextShift?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-white/80 bg-[linear-gradient(135deg,#ffffff_0%,#eef9f8_55%,#f8fcfc_100%)] p-7 shadow-[0_20px_55px_rgba(18,42,44,0.08)]">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">{greetingByTime()}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{subtitle}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-white/80 px-5 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Branch</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{branch}</p>
          </div>
          <div className="rounded-3xl bg-white/80 px-5 py-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Position</p>
            <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{position}</p>
          </div>
          <div className="rounded-3xl bg-white/80 px-5 py-5 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Next Shift</p>
            <div className="mt-2 text-sm text-[var(--foreground)]">{nextShift ?? "Roster belum diset untuk shift seterusnya."}</div>
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
        <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5">
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
  options?: { currentStaffId?: string | null; currentProfileId?: string | null },
) {
  const staff = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
  const label =
    options?.currentStaffId && String(row.target_staff_id ?? "") === String(options.currentStaffId) && normalizeString(row.target_type) === "staff"
      ? "Targeted to you"
      : options?.currentProfileId && String(row.assigned_to ?? "") === String(options.currentProfileId)
        ? "Assigned to you"
        : null;

  return (
    <div key={String(row.id ?? `${row.title}-${row.created_at}`)} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{String(row.title ?? row.subject ?? "Feedback")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{String(staff?.full_name ?? row.target_type ?? "-")} · {formatDateTime(row.created_at)}</p>
          <p className="mt-3 text-sm text-[var(--foreground)]">{String(row.message ?? "-")}</p>
          {label ? <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">{label}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge value={String(row.status ?? "new")} />
          <StatusBadge value={String(row.priority ?? "normal")} />
        </div>
      </div>
    </div>
  );
}

function renderStaffProfileItem(row: TableRow, branches: BranchOption[]) {
  return (
    <div key={String(row.id ?? row.profile_id ?? row.created_at)} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
      <p className="text-sm font-semibold text-[var(--foreground)]">{String(row.full_name ?? row.email ?? row.id ?? "Staff")}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{getBranchName(branches, String(row.branch_id ?? ""))} · {String(row.position ?? "Jawatan belum ditetapkan")}</p>
    </div>
  );
}

function renderComplianceItem(row: TableRow, staffRows: TableRow[]) {
  const staff = staffRows.find((item) => String(item.id ?? "") === String(row.staff_id ?? ""));
  const expiryStatus = getExpiryStatus(row);
  return (
    <div key={String(row.id ?? `${row.staff_id}-${row.document_name}`)} className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{String(row.document_name ?? "Dokumen")}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{String(staff?.full_name ?? row.staff_id ?? "-")} · {formatDate(row.expiry_date)}</p>
        </div>
        <StatusBadge value={expiryStatus.label.replaceAll("_", " ")} />
      </div>
    </div>
  );
}

async function loadStaffDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const branchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");
  const staffId = String(context.staff?.id ?? "");
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date();
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const [notifications, holidays, rosters, shiftTemplates, leaveRows, entitlementRows, branchStaffRows, feedbackRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
    queryRows(() => supabase.from("rosters").select("*").eq("branch_id", branchId).gte("roster_date", today).lte("roster_date", inSevenDays.toISOString().slice(0, 10)).order("roster_date", { ascending: true }).limit(120)),
    queryRows(() => supabase.from("shift_templates").select("*").limit(120)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("staff_id", staffId).limit(200)),
    queryRows(() => supabase.from("leave_entitlements").select("*").eq("staff_id", staffId).order("entitlement_year", { ascending: false }).limit(5)),
    queryRows(() => supabase.from("staff").select("*").eq("branch_id", branchId).limit(200)),
    queryRows(() => supabase.from("feedbacks").select("*").eq("target_staff_id", staffId).in("status", ["new", "assigned", "in_progress", "need_more_info"]).order("created_at", { ascending: false }).limit(40)),
  ]);

  const nextHoliday = getNextHoliday(holidays.rows, branchId);
  const nextShift = getNextPersonalShift(rosters.rows, staffId);
  const latestEntitlement = entitlementRows.rows[0] ?? null;
  const leaveBalance = buildLeaveBalanceSummary(latestEntitlement, leaveRows.rows);
  const feedbackForMe = dedupeRowsById(feedbackRows.rows.filter((row) => isFeedbackForCurrentStaff(row, staffId, profileId)));

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, holidays.error, rosters.error, shiftTemplates.error, leaveRows.error, entitlementRows.error, branchStaffRows.error, feedbackRows.error]} />
      <HeroCard
        title={`${greetingByTime()}, ${String(context.staff?.full_name ?? context.profile?.full_name ?? "Warga Klinik Afifi")}`}
        subtitle="Ruang kerja peribadi anda memudahkan semakan roster, cuti, MC, dan notifikasi penting tanpa gangguan metrik global yang tidak berkaitan."
        branch={getBranchName(branches, branchId)}
        position={String(context.staff?.position ?? "Jawatan belum ditetapkan")}
        nextShift={nextShift ? `${formatDate(nextShift.roster_date)} · ${getShiftName(nextShift, shiftTemplates.rows)} · ${getTimeRange(nextShift, shiftTemplates.rows)}` : undefined}
      />

      {isProfileIncomplete(context.profile, context.staff) ? (
        <FormSection title="Profil Belum Lengkap" description="Lengkapkan maklumat peribadi supaya urusan cuti, MC, dan komunikasi HR berjalan lebih lancar.">
          <div className="flex flex-col gap-4 rounded-3xl bg-[var(--card-muted)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--foreground)]">Beberapa maklumat wajib masih belum diisi. Kemaskini profil anda sekarang.</p>
            <Link href="/settings" className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-foreground)]">
              Buka My Profile
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </FormSection>
      ) : null}

      <LeaveBalancePanel summary={leaveBalance} title="Ringkasan Leave dan MC" />

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/leave", label: "Apply Leave", helper: "Mohon cuti terus dari portal" },
          { href: "/mc", label: "Upload MC", helper: "Hantar MC untuk semakan" },
          { href: "/feedback", label: "Submit Feedback", helper: "Laporkan isu atau cadangan" },
          { href: "/roster", label: "View Roster", helper: "Lihat jadual kerja 7 hari" },
        ]}
      />

      <RosterPreview
        title="Upcoming Roster"
        description="Paparan 7 hari terdekat untuk cawangan anda, dengan shift anda sendiri ditanda supaya lebih mudah merancang cuti."
        rows={rosters.rows}
        staffRows={branchStaffRows.rows}
        shiftTemplates={shiftTemplates.rows}
        focusStaffId={staffId}
        branches={branches}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardList
          title="Feedback Untuk Saya"
          description="Maklum balas yang ditujukan terus kepada akaun staff anda supaya tindakan susulan lebih jelas."
          items={feedbackForMe.slice(0, 5).map((row) => renderFeedbackItem(row, branchStaffRows.rows, { currentStaffId: staffId, currentProfileId: profileId }))}
          emptyTitle="Tiada feedback untuk anda"
          emptyDescription="Belum ada feedback yang disasarkan terus kepada anda buat masa ini."
        />
        <NotificationWidget rows={notifications.rows.slice(0, 5)} unreadCount={countUnreadNotifications(notifications.rows, profileId)} error={notifications.error} />
        <HolidayWidget holiday={nextHoliday} />
      </div>
    </div>
  );
}

async function loadBranchPicDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const branchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");
  const staffId = String(context.staff?.id ?? "");
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = new Date();
  inSevenDays.setDate(inSevenDays.getDate() + 7);

  const [notifications, holidays, personalLeaveRows, entitlementRows, ownRosterRows, branchRosterRows, branchLeaveRows, branchFeedbackRows, branchStaffRows, shiftTemplates] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("staff_id", staffId).limit(200)),
    queryRows(() => supabase.from("leave_entitlements").select("*").eq("staff_id", staffId).order("entitlement_year", { ascending: false }).limit(5)),
    queryRows(() => supabase.from("rosters").select("*").eq("staff_id", staffId).gte("roster_date", today).lte("roster_date", inSevenDays.toISOString().slice(0, 10)).order("roster_date", { ascending: true }).limit(20)),
    queryRows(() => supabase.from("rosters").select("*").eq("branch_id", branchId).gte("roster_date", today).lte("roster_date", inSevenDays.toISOString().slice(0, 10)).order("roster_date", { ascending: true }).limit(200)),
    queryRows(() => supabase.from("leave_requests").select("*").eq("branch_id", branchId).eq("status", "pending").limit(80)),
    queryRows(() => supabase.from("feedbacks").select("*").eq("branch_id", branchId).in("status", ["new", "assigned", "in_progress", "need_more_info"]).order("created_at", { ascending: false }).limit(120)),
    queryRows(() => supabase.from("staff").select("*").eq("branch_id", branchId).limit(200)),
    queryRows(() => supabase.from("shift_templates").select("*").limit(120)),
  ]);

  const leaveBalance = buildLeaveBalanceSummary(entitlementRows.rows[0] ?? null, personalLeaveRows.rows);
  const nextShift = getNextPersonalShift(ownRosterRows.rows, staffId);
  const nextHoliday = getNextHoliday(holidays.rows, branchId);
  const todayBranchRows = branchRosterRows.rows.filter((row) => String(row.roster_date ?? row.date ?? "").slice(0, 10) === today);
  const todayDoctors = todayBranchRows.filter((row) => inferRoleOnShift(row, branchStaffRows.rows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""))) === "doctor").length;
  const todaySupport = todayBranchRows.filter((row) => inferRoleOnShift(row, branchStaffRows.rows.find((staff) => String(staff.id ?? "") === String(row.staff_id ?? ""))) === "staff").length;
  const incompleteProfiles = branchStaffRows.rows.filter(isStaffRecordIncomplete);
  const branchOperationalIssues = dedupeRowsById(branchFeedbackRows.rows.filter((row) => isBranchOperationalIssue(row, branchId)));
  const feedbackForMe = dedupeRowsById(branchFeedbackRows.rows.filter((row) => isFeedbackForCurrentStaff(row, staffId, profileId)));

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, holidays.error, personalLeaveRows.error, entitlementRows.error, ownRosterRows.error, branchRosterRows.error, branchLeaveRows.error, branchFeedbackRows.error, branchStaffRows.error, shiftTemplates.error]} />
      <HeroCard
        title={`${greetingByTime()}, ${String(context.staff?.full_name ?? context.profile?.full_name ?? "Branch PIC")}`}
        subtitle="Hari ini anda nampak dua lapisan kerja sekali gus: keperluan peribadi sebagai staff dan operasi cawangan yang perlu dipantau sepanjang minggu."
        branch={getBranchName(branches, branchId)}
        position={String(context.staff?.position ?? "Branch PIC")}
        nextShift={nextShift ? `${formatDate(nextShift.roster_date)} · ${getShiftName(nextShift, shiftTemplates.rows)} · ${getTimeRange(nextShift, shiftTemplates.rows)}` : undefined}
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
        <StatCard title="Pending Leave Requests" value={branchLeaveRows.rows.length} description="Permohonan cuti cawangan yang masih menunggu semakan." icon={ClipboardList} />
        <StatCard title="Feedback Untuk Saya" value={feedbackForMe.length} description="Feedback yang ditujukan terus kepada anda atau telah diassign ke akaun anda." icon={MessageSquareMore} />
        <StatCard title="Branch Operational Issues" value={branchOperationalIssues.length} description="Isu operasi cawangan yang relevan untuk tindakan atau pemantauan anda." icon={MessageSquareMore} />
        <StatCard title="Incomplete Staff Profiles" value={incompleteProfiles.length} description="Rekod staff cawangan yang masih perlukan kemaskini penting." icon={UserRound} />
      </section>

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
          items={feedbackForMe.slice(0, 5).map((row) => renderFeedbackItem(row, branchStaffRows.rows, { currentStaffId: staffId, currentProfileId: profileId }))}
          emptyTitle="Tiada feedback untuk anda"
          emptyDescription="Belum ada feedback yang ditujukan terus kepada anda buat masa ini."
        />
        <DashboardList
          title="Branch Operational Issues"
          description="Hanya isu operasi, facility, roster, equipment, atau tugasan cawangan dari branch anda dipaparkan di sini."
          items={branchOperationalIssues.slice(0, 5).map((row) => renderFeedbackItem(row, branchStaffRows.rows))}
          emptyTitle="Tiada isu operasi cawangan"
          emptyDescription="Tiada isu operasi cawangan yang relevan untuk dipantau sekarang."
        />
      </div>
    </div>
  );
}

async function loadHrDashboard(supabase: SupabaseClient, context: DashboardContextLike, branches: BranchOption[]) {
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const [notifications, leaveRows, staffDocs, feedbackRows, staffRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("leave_requests").select("*").limit(300)),
    queryRows(() => supabase.from("staff_documents").select("*").limit(320)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(250)),
    queryRows(() => supabase.from("staff").select("*").limit(300)),
  ]);

  const pendingLeave = leaveRows.rows.filter(isPendingLeaveStatus);
  const pendingMc = pendingLeave.filter((row) => normalizeString(row.leave_type) === "medical_leave" || Boolean(row.attachment_url));
  const pendingDocReview = staffDocs.rows.filter((row) => normalizeString(row.status) === "pending_review");
  const incompleteProfiles = staffRows.rows.filter(isStaffRecordIncomplete);
  const hrFeedback = feedbackRows.rows.filter((row) => ["hr", "portal_system"].includes(normalizeString(row.target_type)) && ["new", "assigned", "in_progress", "need_more_info"].includes(normalizeString(row.status)));
  const expiringDocs = filterExpiringRows(staffDocs.rows);
  const expiredDocs = staffDocs.rows.filter((row) => getExpiryStatus(row).label === "expired");
  const doctorApc = expiringDocs.filter((row) => {
    const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
    return docText.includes("apc") || docText.includes("mmc");
  });
  const juruxrayDocs = expiringDocs.filter((row) => {
    const docText = `${normalizeString(row.document_name)} ${normalizeString(row.document_type)}`;
    return docText.includes("juruxray") || docText.includes("cme") || docText.includes("medical checkup");
  });
  const completedProfiles = staffRows.rows.filter((row) => !isStaffRecordIncomplete(row)).slice(0, 5);

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, leaveRows.error, staffDocs.error, feedbackRows.error, staffRows.error]} />
      <PageHeader title="HR Dashboard" description="Action queue yang jelas untuk approval, compliance, dan staff profile supaya pasukan HR boleh bergerak ikut keutamaan harian." />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Pending Leave" value={pendingLeave.length} description="Permohonan cuti menunggu semakan." icon={ClipboardList} />
        <StatCard title="Pending MC Review" value={pendingMc.length} description="MC atau medical leave yang belum ditutup." icon={Upload} />
        <StatCard title="Pending Staff Doc Review" value={pendingDocReview.length} description="Dokumen staff yang masih perlu review." icon={FileBadge} />
        <StatCard title="Incomplete Staff Profiles" value={incompleteProfiles.length} description="Rekod staff yang masih belum lengkap." icon={UserRound} />
        <StatCard title="New HR Feedback" value={hrFeedback.length} description="Feedback baru yang perlukan perhatian HR." icon={MessageSquareMore} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Staff Docs Expiring Soon" value={countExpiringRows(staffDocs.rows)} description="Dokumen staff hampir tamat tempoh." icon={FileSearch} />
        <StatCard title="Expired Staff Docs" value={expiredDocs.length} description="Dokumen staff yang telah tamat tempoh." icon={ShieldAlert} />
        <StatCard title="Doctor APC/MMC Risk" value={doctorApc.length} description="Dokumen APC atau MMC doktor yang hampir tamat tempoh." icon={Stethoscope} />
        <StatCard title="Juruxray / CME Risk" value={juruxrayDocs.length} description="Juruxray, CME, atau medical checkup yang hampir tamat tempoh." icon={ShieldCheck} />
      </section>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/leave", label: "Review Leave", helper: "Semak queue cuti dan MC" },
          { href: "/mc", label: "Review MC", helper: "Lihat MC yang baru dihantar" },
          { href: "/staff-compliance", label: "Staff Compliance", helper: "Review dokumen staff" },
          { href: "/clinic-compliance", label: "Clinic Compliance", helper: "Semak dokumen klinik" },
          { href: "/feedback/manage", label: "Feedback Manage", helper: "Tangani isu yang masuk ke HR" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardList title="Leave Approval Queue" description="Permohonan terkini yang perlu diputuskan." items={pendingLeave.slice(0, 5).map((row) => renderLeaveQueueItem(row, staffRows.rows))} emptyTitle="Tiada cuti pending" emptyDescription="Semua permohonan cuti sudah clear buat masa ini." />
        <DashboardList title="Compliance Expiry Queue" description="Dokumen staff yang hampir tamat tempoh atau telah expired." items={expiringDocs.slice(0, 5).map((row) => renderComplianceItem(row, staffRows.rows))} emptyTitle="Tiada dokumen hampir tamat tempoh" emptyDescription="Bagus, tiada dokumen staff yang mendesak sekarang." />
        <DashboardList title="Recent Feedback" description="Isu atau feedback yang baru masuk ke aliran kerja HR." items={hrFeedback.slice(0, 5).map((row) => renderFeedbackItem(row, staffRows.rows))} emptyTitle="Tiada feedback baru" emptyDescription="Tiada feedback baru yang menunggu HR sekarang." />
        <DashboardList title="Recently Completed Staff Profiles" description="Rekod staff yang lengkap dan sedia digunakan dalam workflow portal." items={completedProfiles.map((row) => renderStaffProfileItem(row, branches))} emptyTitle="Profil belum lengkap" emptyDescription="Belum ada profil lengkap yang baru diselesaikan untuk dipaparkan." />
      </div>

      <NotificationWidget rows={notifications.rows.slice(0, 5)} unreadCount={countUnreadNotifications(notifications.rows, profileId)} error={notifications.error} />
    </div>
  );
}

async function loadOperationDashboard(supabase: SupabaseClient, context: DashboardContextLike) {
  const profileId = String(context.profile?.id ?? context.user?.id ?? "");
  const startOfWeek = getStartOfWeek().toISOString();
  const [notifications, feedbackRows, commentRows] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(280)),
    queryRows(() => supabase.from("feedback_comments").select("*").order("created_at", { ascending: false }).limit(120)),
  ]);

  const assignedIssues = feedbackRows.rows.filter((row) => String(row.assigned_to ?? "") === profileId || normalizeString(row.target_type) === "operation" || normalizeString(row.assigned_department) === "operation");
  const openIssues = assignedIssues.filter((row) => ["new", "assigned", "in_progress", "need_more_info"].includes(normalizeString(row.status)));
  const urgentIssues = assignedIssues.filter((row) => ["high", "urgent"].includes(normalizeString(row.priority)) && !["resolved", "closed"].includes(normalizeString(row.status)));
  const resolvedThisWeek = countResolvedThisWeek(assignedIssues);
  const portalIssues = assignedIssues.filter((row) => normalizeString(row.target_type) === "portal_system");
  const recentReplies = commentRows.rows.filter((row) => String(row.created_at ?? "") >= startOfWeek);

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, feedbackRows.error, commentRows.error]} />
      <PageHeader title="Operation Dashboard" description="Dashboard operasi yang fokus pada isu, reply queue, dan perkara urgent tanpa mengganggu anda dengan metrik HR yang tidak berkaitan." />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Assigned Feedback / Issues" value={assignedIssues.length} description="Jumlah isu yang kini visible kepada operation." icon={MessageSquareMore} />
        <StatCard title="Open Operation Issues" value={openIssues.length} description="Isu aktif yang masih perlukan susulan." icon={ClipboardList} />
        <StatCard title="Resolved This Week" value={resolvedThisWeek} description="Jumlah isu yang ditutup minggu ini." icon={CheckCircle2} />
        <StatCard title="Urgent / Escalated" value={urgentIssues.length} description="Isu keutamaan tinggi yang perlu didahulukan." icon={ShieldAlert} />
        <StatCard title="Portal System Issues" value={portalIssues.length} description="Feedback portal system yang singgah di aliran operation." icon={FileText} />
      </section>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/feedback/manage", label: "View Assigned Feedback", helper: "Semak isu yang perlu diurus sekarang" },
          { href: "/feedback/manage", label: "Reply Feedback", helper: "Balas dan kemas kini status isu" },
          { href: "/roster", label: "View Roster", helper: "Semak roster secara read-only" },
          { href: "/clinic-compliance", label: "Clinic Compliance", helper: "Lihat dokumen klinik jika dibenarkan" },
        ]}
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
  const [notifications, staffCount, branchCount, staffRows, leaveRows, feedbackRows, staffDocs, clinicDocs, holidays] = await Promise.all([
    queryRows(() => supabase.from("notifications").select("*").eq("recipient_profile_id", profileId).order("created_at", { ascending: false }).limit(20)),
    queryCount(() => supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active")),
    queryCount(() => supabase.from("branches").select("id", { count: "exact", head: true })),
    queryRows(() => supabase.from("staff").select("*").limit(400)),
    queryRows(() => supabase.from("leave_requests").select("*").limit(400)),
    queryRows(() => supabase.from("feedbacks").select("*").limit(320)),
    queryRows(() => supabase.from("staff_documents").select("*").limit(320)),
    queryRows(() => supabase.from("clinic_compliance_documents").select("*").limit(240)),
    queryRows(() => supabase.from("holidays").select("*").limit(120)),
  ]);

  const pendingLeave = leaveRows.rows.filter(isPendingLeaveStatus).length;
  const openIssues = feedbackRows.rows.filter((row) => !["resolved", "closed"].includes(normalizeString(row.status))).length;
  const complianceSoon = countExpiringRows(staffDocs.rows) + countExpiringRows(clinicDocs.rows);
  const nextHoliday = getNextHoliday(holidays.rows, null);
  const incompleteProfiles = staffRows.rows.filter(isStaffRecordIncomplete).length;
  const branchIssueSummary = branches.map((branch) => ({
    branch,
    openIssues: feedbackRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && !["resolved", "closed"].includes(normalizeString(row.status))).length,
    pendingLeave: leaveRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && isPendingLeaveStatus(row)).length,
    activeStaff: staffRows.rows.filter((row) => String(row.branch_id ?? "") === branch.id && normalizeString(row.status) !== "resigned").length,
  })).filter((item) => item.activeStaff || item.pendingLeave || item.openIssues);

  return (
    <div className="space-y-8">
      <PartialDataNotice errors={[notifications.error, staffCount.error, branchCount.error, staffRows.error, leaveRows.error, feedbackRows.error, staffDocs.error, clinicDocs.error, holidays.error]} />
      <PageHeader title="Super Admin Dashboard" description="Gambaran keseluruhan rentas cawangan yang ringkas tetapi bermakna, supaya anda boleh nampak risiko, isu terbuka, dan tumpuan pasukan tanpa tenggelam dalam terlalu banyak detail harian." />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Total Active Staff" value={staffCount.count} description="Jumlah staff aktif di seluruh rangkaian klinik." icon={Users} />
        <StatCard title="Total Branches" value={branchCount.count} description="Jumlah cawangan yang sedang dipantau." icon={BriefcaseMedical} />
        <StatCard title="Pending Leave Approvals" value={pendingLeave} description="Jumlah permohonan cuti yang masih terbuka." icon={ClipboardList} />
        <StatCard title="Open Feedback / Issues" value={openIssues} description="Jumlah isu rentas cawangan yang belum ditutup." icon={MessageSquareMore} />
        <StatCard title="Compliance Expiring Soon" value={complianceSoon} description="Gabungan dokumen staff dan klinik yang hampir tamat tempoh." icon={FileSearch} />
        <StatCard title="Next Clinic Holiday" value={nextHoliday ? formatCountdown(daysUntil(nextHoliday.holiday_date)) : "-"} description={nextHoliday ? `${String(nextHoliday.holiday_name ?? "Cuti akan datang")} pada ${formatDate(nextHoliday.holiday_date)}` : "Belum ada cuti akan datang yang direkodkan."} icon={CalendarDays} />
      </section>

      <QuickActions
        title="Quick Actions"
        actions={[
          { href: "/staff", label: "Staff", helper: "Semak direktori dan status staff" },
          { href: "/leave", label: "Leave", helper: "Pantau approval queue" },
          { href: "/feedback/manage", label: "Feedback", helper: "Lihat isu rentas pasukan" },
          { href: "/roster", label: "Roster", helper: "Semak jadual cawangan" },
          { href: "/staff-compliance", label: "Staff Compliance", helper: "Pantau dokumen staff" },
          { href: "/clinic-compliance", label: "Clinic Compliance", helper: "Pantau risiko dokumen klinik" },
          { href: "/holidays", label: "Holidays", helper: "Urus cuti klinik dan awam" },
        ]}
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

export default async function DashboardPage() {
  const context = await requireRouteAccess("dashboard");

  if (!context.user || context.unauthorized || !context.supabase) {
    return (
      <EmptyState
        title="Dashboard access unavailable"
        description="Sign in with a valid portal account to view dashboard content."
      />
    );
  }

  const branchRows = await queryRows(() => context.supabase!.from("branches").select("*").limit(100));
  const branches = toBranchOptions(branchRows.rows);

  let content: React.ReactNode;

  if (context.role === "staff") {
    content = await loadStaffDashboard(context.supabase, context, branches);
  } else if (context.role === "branch_pic") {
    content = await loadBranchPicDashboard(context.supabase, context, branches);
  } else if (context.role === "hr") {
    content = await loadHrDashboard(context.supabase, context, branches);
  } else if (context.role === "operation") {
    content = await loadOperationDashboard(context.supabase, context);
  } else {
    content = await loadSuperAdminDashboard(context.supabase, context, branches);
  }

  return <div className="space-y-6">{content}</div>;
}

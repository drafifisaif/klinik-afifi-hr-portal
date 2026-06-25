import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import type { BranchOption, UserRole } from "@/lib/types";
import { formatDate, formatDateTime, formatMinutesAsHours } from "@/lib/utils";

interface SummaryDayRow {
  date: string;
  shiftLabel: string;
  scheduledMinutes: number;
  grossMinutes: number;
  breakMinutes: number;
  countedWorkedMinutes: number;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

interface StaffWeeklySummaryRow {
  staffId: string;
  staffName: string;
  branchName: string;
  roleLabel: string;
  rosterDays: number;
  scheduledMinutes: number;
  dueScheduledMinutes: number;
  presentDays: number;
  workedMinutes: number;
  missedScheduledMinutes: number;
  otMinutes: number;
  notPunchedIn: number;
  incompletePunch: number;
  lateCount: number;
  earlyOutCount: number;
  days: SummaryDayRow[];
}

interface RosterSummaryPageProps {
  summaries: StaffWeeklySummaryRow[];
  branches: BranchOption[];
  role: UserRole;
  filters: {
    branchId: string;
    roleFilter: string;
    startDate: string;
    endDate: string;
  };
  canViewAllBranches: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  error?: string | null;
}

function toRoleLabel(value: string) {
  if (!value) {
    return "Staff";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function RosterSummaryPage({
  summaries,
  branches,
  role,
  filters,
  canViewAllBranches,
  emptyTitle = "No items found for this filter.",
  emptyDescription = "No items found for this filter.",
  error,
}: RosterSummaryPageProps) {
  const roleOptions = ["all", "doctor", "staff", "branch_pic", "operation", "hr", "super_admin"];

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load roster summary" description={error} /> : null}

      <FormSection
        title="Weekly Filters"
        description="Worked hours are counted from scheduled roster hours only for due days marked attended. Future shifts stay as upcoming and do not increase missed hours yet."
      >
        <form className="grid gap-4 lg:grid-cols-4" method="get">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Branch</span>
            <select
              name="branch"
              defaultValue={filters.branchId}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
            >
              {canViewAllBranches ? <option value="all">All branches</option> : null}
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Role</span>
            <select
              name="role"
              defaultValue={filters.roleFilter}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>
                  {toRoleLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Week Start Date</span>
            <input
              type="date"
              name="start"
              defaultValue={filters.startDate}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--foreground)]">Week End Date</span>
            <input
              type="date"
              name="end"
              defaultValue={filters.endDate}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
            />
          </label>

          <div className="lg:col-span-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25"
            >
              Apply Filters
            </button>
            <a
              href={`/roster/summary/export?branch=${encodeURIComponent(filters.branchId)}&role=${encodeURIComponent(filters.roleFilter)}&start=${encodeURIComponent(filters.startDate)}&end=${encodeURIComponent(filters.endDate)}`}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-white px-5 text-sm font-semibold text-[var(--foreground)]"
            >
              Export CSV
            </a>
            <a
              href="/roster/summary"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-semibold text-[var(--foreground)]"
            >
              Reset
            </a>
          </div>
        </form>
      </FormSection>

      <FormSection
        title="Weekly Roster Hours Summary"
        description={role === "branch_pic" ? "Ringkasan mingguan untuk cawangan anda sahaja." : "Ringkasan mingguan semua staff mengikut filter yang dipilih."}
      >
        {summaries.length ? (
          <div className="space-y-4">
            <div className="hidden rounded-[24px] border border-[var(--border)] bg-[var(--card-muted)]/55 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)] lg:grid lg:grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr_0.8fr_0.9fr_0.8fr_0.8fr_0.8fr] lg:gap-3">
              <span>Staff</span>
              <span>Branch</span>
              <span>Role</span>
              <span>Roster Days</span>
              <span>Scheduled Hours</span>
              <span>Present Days</span>
              <span>Worked Hours</span>
              <span>OT Hours</span>
              <span>Missed Hours</span>
              <span>Not Punched In</span>
              <span>Incomplete</span>
              <span>Late / Early</span>
            </div>

            {summaries.map((row) => (
              <details
                key={row.staffId}
                className="group overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_18px_45px_rgba(18,42,44,0.04)]"
              >
                <summary className="list-none cursor-pointer px-5 py-5">
                  <div className="space-y-4 lg:grid lg:grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr_0.8fr_0.9fr_0.8fr_0.8fr_0.8fr] lg:items-center lg:gap-3 lg:space-y-0">
                    <div>
                      <p className="font-semibold text-[var(--foreground)]">{row.staffName}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Click to view daily breakdown</p>
                    </div>
                    <p className="text-sm text-[var(--foreground)]">{row.branchName}</p>
                    <p className="text-sm text-[var(--foreground)]">{row.roleLabel}</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{row.rosterDays}</p>
                    <p className="text-sm text-[var(--foreground)]">{formatMinutesAsHours(row.scheduledMinutes)}</p>
                    <p className="text-sm text-[var(--foreground)]">{row.presentDays}</p>
                    <p className="text-sm font-semibold text-emerald-700">{formatMinutesAsHours(row.workedMinutes)}</p>
                    <p className={row.otMinutes > 0 ? "text-sm font-semibold text-orange-700" : "text-sm text-[var(--foreground)]"}>{formatMinutesAsHours(row.otMinutes)}</p>
                    <p className="text-sm font-semibold text-rose-700">{formatMinutesAsHours(row.missedScheduledMinutes)}</p>
                    <p className="text-sm text-[var(--foreground)]">{row.notPunchedIn}</p>
                    <p className="text-sm text-[var(--foreground)]">{row.incompletePunch}</p>
                    <p className="text-sm text-[var(--foreground)]">{row.lateCount} / {row.earlyOutCount}</p>
                  </div>
                </summary>

                <div className="border-t border-[var(--border)] bg-[var(--card-muted)]/35 px-5 py-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Scheduled Hours</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{formatMinutesAsHours(row.scheduledMinutes)}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Due roster hours: {formatMinutesAsHours(row.dueScheduledMinutes)}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Worked Hours</p>
                      <p className="mt-2 text-lg font-semibold text-emerald-700">{formatMinutesAsHours(row.workedMinutes)}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Counted from scheduled shift hours on attended days only.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Missed Scheduled Hours</p>
                      <p className="mt-2 text-lg font-semibold text-rose-700">{formatMinutesAsHours(row.missedScheduledMinutes)}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Future shifts are not counted as missed yet.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">OT Hours / Excess Hours</p>
                      <p className={row.otMinutes > 0 ? "mt-2 text-lg font-semibold text-orange-700" : "mt-2 text-lg font-semibold text-[var(--foreground)]"}>{formatMinutesAsHours(row.otMinutes)}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">Preview only. Final payroll approval remains subject to HR review.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Attendance Alerts</p>
                      <p className="mt-2 text-sm text-[var(--foreground)]">Not punched in: {row.notPunchedIn}</p>
                      <p className="mt-1 text-sm text-[var(--foreground)]">Incomplete: {row.incompletePunch}</p>
                      <p className="mt-1 text-sm text-[var(--foreground)]">Late / Early out: {row.lateCount} / {row.earlyOutCount}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Daily Breakdown</p>
                    {row.days.map((day) => (
                      <div key={`${row.staffId}-${day.date}`} className="rounded-3xl border border-[var(--border)] bg-white px-5 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-semibold text-[var(--foreground)]">{formatDate(day.date)}</p>
                            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Shift: {day.shiftLabel}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge value={day.status} />
                            {day.lateMinutes > 0 ? <StatusBadge value={`Late ${day.lateMinutes}m`} /> : null}
                            {day.earlyLeaveMinutes > 0 ? <StatusBadge value={`Early Out ${day.earlyLeaveMinutes}m`} /> : null}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 text-sm text-[var(--foreground)] md:grid-cols-2 xl:grid-cols-3">
                          <p><span className="font-semibold">Gross Hours:</span> {formatMinutesAsHours(day.grossMinutes)}</p>
                          <p><span className="font-semibold">Break Deducted:</span> {formatMinutesAsHours(day.breakMinutes)}</p>
                          <p><span className="font-semibold">Net Scheduled Hours:</span> {formatMinutesAsHours(day.scheduledMinutes)}</p>
                          <p><span className="font-semibold">Counted Worked Hours:</span> {formatMinutesAsHours(day.countedWorkedMinutes)}</p>
                          <p><span className="font-semibold">Late Minutes:</span> {day.lateMinutes}</p>
                          <p><span className="font-semibold">Check In:</span> {day.checkInAt ? formatDateTime(day.checkInAt) : "-"}</p>
                          <p><span className="font-semibold">Check Out:</span> {day.checkOutAt ? formatDateTime(day.checkOutAt) : "-"}</p>
                          <p><span className="font-semibold">Early Out Minutes:</span> {day.earlyLeaveMinutes}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        )}
      </FormSection>
      <p className="text-sm text-[var(--muted-foreground)]">
        OT preview is calculated from counted worked hours above 45 hours per week. Final payroll approval remains subject to HR review.
      </p>
    </div>
  );
}

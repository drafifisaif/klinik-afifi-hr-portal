import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RosterSummaryPage } from "@/components/roster-summary-page";
import { requireRouteAccess } from "@/lib/auth";
import {
  buildRosterWeeklySummaries,
  getCurrentMalaysiaWeekRange,
  getSearchParamValue,
  resolveOperationalBranchId,
  toBranchOptions,
} from "@/lib/roster-summary";
import { createAdminClient } from "@/lib/supabase/admin";

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function RosterSummaryRoute({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("rosterSummary");
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Roster summary access restricted"
        description="Only HR, super admin, and allowed branch managers can access weekly roster hours summary."
      />
    );
  }

  const adminClient = createAdminClient();
  const client = adminClient ?? context.supabase;

  if (!client) {
    return (
      <EmptyState
        title="Roster summary unavailable"
        description="Supabase client is not configured."
      />
    );
  }

  const defaultWeek = getCurrentMalaysiaWeekRange();
  const operationalBranchId = resolveOperationalBranchId(context.staff, context.profile);
  const canViewAllBranches = context.role === "hr" || context.role === "super_admin";
  const requestedBranchId = getSearchParamValue(resolvedSearchParams.branch) ?? (canViewAllBranches ? "all" : operationalBranchId);
  const selectedBranchId = canViewAllBranches ? requestedBranchId : operationalBranchId;
  const roleFilter = getSearchParamValue(resolvedSearchParams.role) ?? "all";
  const startDate = getSearchParamValue(resolvedSearchParams.start) ?? defaultWeek.start;
  const endDate = getSearchParamValue(resolvedSearchParams.end) ?? defaultWeek.end;

  const [rosterResult, attendanceResult, staffResult, branchResult, profileResult] = await Promise.all([
    client
      .from("rosters")
      .select("*")
      .gte("roster_date", startDate)
      .lte("roster_date", endDate)
      .order("roster_date", { ascending: true })
      .limit(2000),
    client
      .from("attendance_records")
      .select("*")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .limit(2000),
    client.from("staff").select("*").limit(500),
    client.from("branches").select("*").order("name", { ascending: true }).limit(100),
    client.from("profiles").select("*").limit(500),
  ]);

  const branches = toBranchOptions((branchResult.data ?? []) as Record<string, unknown>[]);
  const summaries = buildRosterWeeklySummaries({
    rosters: (rosterResult.data ?? []) as Record<string, unknown>[],
    attendanceRows: (attendanceResult.data ?? []) as Record<string, unknown>[],
    staffRows: (staffResult.data ?? []) as Record<string, unknown>[],
    profileRows: (profileResult.data ?? []) as Record<string, unknown>[],
    branches,
    selectedBranchId: selectedBranchId || (canViewAllBranches ? "all" : operationalBranchId),
    roleFilter,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster Summary"
        description="Ringkasan jam kerja mingguan berdasarkan jam roster bersih untuk hari staff hadir, termasuk preview OT apabila counted worked hours melebihi 45 jam."
      />
      <RosterSummaryPage
        summaries={summaries}
        branches={canViewAllBranches ? branches : branches.filter((branch) => branch.id === operationalBranchId)}
        role={context.role}
        filters={{
          branchId: selectedBranchId || (canViewAllBranches ? "all" : operationalBranchId),
          roleFilter,
          startDate,
          endDate,
        }}
        canViewAllBranches={canViewAllBranches}
        emptyTitle="No items found for this filter."
        emptyDescription="No items found for this filter."
        error={[
          rosterResult.error?.message,
          attendanceResult.error?.message,
          staffResult.error?.message,
          branchResult.error?.message,
          profileResult.error?.message,
        ].filter(Boolean).join(" ") || null}
      />
    </div>
  );
}

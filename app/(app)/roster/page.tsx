import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RosterManagementPage } from "@/components/roster-management-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { loadPortalStaff, loadRosterRange } from "@/lib/portal-range-data";
import { addDaysToDateString, getMalaysiaDateString } from "@/lib/utils";

export default async function RosterPage() {
  const context = await requireRouteAccess("roster");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Roster access restricted"
        description="Your current role does not include the roster workspace."
      />
    );
  }

  const today = getMalaysiaDateString();
  const initialRanges = [{ start: today, end: addDaysToDateString(today, 13) }];
  const [rosters, staffRows, shiftTemplates, branches] = await Promise.all([
    loadRosterRange(context, initialRanges),
    loadPortalStaff(context),
    fetchRows(context.supabase, "shift_templates", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster"
        description="View clinic coverage across date ranges and keep the daily builder available for branch managers, HR, and super admin users."
      />
      <RosterManagementPage
        initialRosterData={rosters}
        initialRanges={initialRanges}
        shiftTemplates={shiftTemplates.rows}
        staff={staffRows.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={shiftTemplates.error ?? staffRows.error ?? branches.error}
      />
    </div>
  );
}

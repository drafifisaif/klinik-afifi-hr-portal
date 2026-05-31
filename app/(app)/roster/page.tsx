import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RosterManagementPage } from "@/components/roster-management-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableRow } from "@/lib/types";

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

  const adminClient = createAdminClient();
  const staffBranchId = String(context.staff?.branch_id ?? context.profile?.branch_id ?? "");

  let rosters = await fetchRows(context.supabase, "rosters", 700);
  let staffRows = await fetchRows(context.supabase, "staff", 300);

  if (context.role === "staff" && adminClient && staffBranchId) {
    const [branchRosterResult, branchStaffResult] = await Promise.all([
      adminClient
        .from("rosters")
        .select("*")
        .eq("branch_id", staffBranchId)
        .order("roster_date", { ascending: true })
        .limit(700),
      adminClient
        .from("staff")
        .select("*")
        .eq("branch_id", staffBranchId)
        .limit(300),
    ]);

    rosters = {
      rows: (branchRosterResult.data ?? []) as TableRow[],
      error: branchRosterResult.error?.message ?? rosters.error,
    };
    staffRows = {
      rows: (branchStaffResult.data ?? []) as TableRow[],
      error: branchStaffResult.error?.message ?? staffRows.error,
    };
  }

  const [shiftTemplates, branches] = await Promise.all([
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
        rosters={rosters.rows}
        shiftTemplates={shiftTemplates.rows}
        staff={staffRows.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={rosters.error ?? shiftTemplates.error ?? staffRows.error ?? branches.error}
      />
    </div>
  );
}

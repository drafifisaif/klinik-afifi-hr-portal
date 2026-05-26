import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { RosterManagementPage } from "@/components/roster-management-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

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

  const [rosters, shiftTemplates, staffRows, branches] = await Promise.all([
    fetchRows(context.supabase, "rosters", 200),
    fetchRows(context.supabase, "shift_templates", 100),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster"
        description="Review scheduled shifts, filter by branch or date, and manage roster publishing where permitted."
      />
      <RosterManagementPage
        rosters={rosters.rows}
        shiftTemplates={shiftTemplates.rows}
        staff={staffRows.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        error={rosters.error ?? shiftTemplates.error ?? staffRows.error ?? branches.error}
      />
    </div>
  );
}

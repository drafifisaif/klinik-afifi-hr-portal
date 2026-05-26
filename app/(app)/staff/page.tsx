import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StaffManagementPage } from "@/components/staff-management-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function StaffPage() {
  const context = await requireRouteAccess("staff");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Staff access restricted"
        description="Your current role does not include the staff directory view."
      />
    );
  }

  const [staffRows, branchRows, entitlementRows, leaveRows] = await Promise.all([
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "leave_entitlements", 200),
    fetchRows(context.supabase, "leave_requests", 200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Review staff visibility by role, update records safely, and surface leave balances alongside each profile."
      />
      <StaffManagementPage
        rows={staffRows.rows}
        branches={branchRows.rows
          .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
          .filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        entitlements={entitlementRows.rows}
        leaveRequests={leaveRows.rows}
        error={staffRows.error ?? branchRows.error ?? entitlementRows.error ?? leaveRows.error}
      />
    </div>
  );
}

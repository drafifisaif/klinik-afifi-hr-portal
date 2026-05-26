import { EmptyState } from "@/components/empty-state";
import { LeaveWorkflowPage } from "@/components/leave-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function LeavePage() {
  const context = await requireRouteAccess("leave");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Leave access restricted"
        description="Your current role does not include the leave workspace."
      />
    );
  }

  const [leaveRows, entitlementRows, staffRows] = await Promise.all([
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "leave_entitlements", 200),
    fetchRows(context.supabase, "staff", 200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description="Submit real leave requests, review approvals, and monitor annual and medical leave balances."
      />
      <LeaveWorkflowPage
        leaveRequests={leaveRows.rows}
        entitlements={entitlementRows.rows}
        staffRows={staffRows.rows}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={leaveRows.error ?? entitlementRows.error ?? staffRows.error}
      />
    </div>
  );
}

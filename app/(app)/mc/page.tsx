import { EmptyState } from "@/components/empty-state";
import { McWorkflowPage } from "@/components/mc-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function McPage() {
  const context = await requireRouteAccess("mc");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="MC access restricted"
        description="Your current role does not include the medical certificate workspace."
      />
    );
  }

  const [leaveRows, staffRows] = await Promise.all([
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "staff", 200),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Certificates"
        description="Upload your own MC privately, review approvals, and track the resulting medical leave workflow."
      />
      <McWorkflowPage
        leaveRequests={leaveRows.rows}
        currentStaff={context.staff}
        profile={context.profile}
        role={context.role}
        staffRows={staffRows.rows}
        error={leaveRows.error ?? staffRows.error}
      />
    </div>
  );
}

import { EmptyState } from "@/components/empty-state";
import { LeaveWorkflowPage } from "@/components/leave-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import type { BranchOption } from "@/lib/types";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function LeavePage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("leave");
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Leave access restricted"
        description="Your current role does not include the leave workspace."
      />
    );
  }

  const [leaveRows, entitlementRows, staffRows, branchRows] = await Promise.all([
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "leave_entitlements", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  const initialStatusFilter = getSearchParamValue(resolvedSearchParams.status);

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
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id) as BranchOption[]}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        initialStatusFilter={initialStatusFilter}
        error={leaveRows.error ?? entitlementRows.error ?? staffRows.error ?? branchRows.error}
      />
    </div>
  );
}

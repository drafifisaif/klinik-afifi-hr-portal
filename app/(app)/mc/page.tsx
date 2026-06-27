import { EmptyState } from "@/components/empty-state";
import { McWorkflowPage } from "@/components/mc-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function McPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("mc");
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="MC access restricted"
        description="Your current role does not include the medical certificate workspace."
      />
    );
  }

  const [leaveRows, staffRows, branchRows, profileRows] = await Promise.all([
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "profiles", 300),
  ]);
  const initialStatusFilter = getSearchParamValue(resolvedSearchParams.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Certificates"
        description="Review MC approvals and history linked to the medical leave workflow."
      />
      <McWorkflowPage
        leaveRequests={leaveRows.rows}
        currentStaff={context.staff}
        profile={context.profile}
        role={context.role}
        staffRows={staffRows.rows}
        branchRows={branchRows.rows}
        profileRows={profileRows.rows}
        initialStatusFilter={initialStatusFilter}
        error={leaveRows.error ?? staffRows.error ?? branchRows.error ?? profileRows.error}
      />
    </div>
  );
}

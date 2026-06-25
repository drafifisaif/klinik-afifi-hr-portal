import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StaffManagementPage } from "@/components/staff-management-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function StaffPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("staff");
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Staff access restricted"
        description="Your current role does not include the staff directory view."
      />
    );
  }

  const [staffRows, branchRows, entitlementRows, leaveRows, profileRows] = await Promise.all([
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "leave_entitlements", 200),
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "profiles", 300),
  ]);
  const initialProfileFilter = getSearchParamValue(resolvedSearchParams.profile);

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
        profileRows={profileRows.rows}
        initialProfileFilter={initialProfileFilter}
        error={staffRows.error ?? branchRows.error ?? entitlementRows.error ?? leaveRows.error ?? profileRows.error}
      />
    </div>
  );
}

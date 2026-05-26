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

  const [staffRows, branchRows] = await Promise.all([
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Review, create, and update staff records while keeping resigned and inactive staff in history."
      />
      <StaffManagementPage
        rows={staffRows.rows}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        error={staffRows.error ?? branchRows.error}
      />
    </div>
  );
}

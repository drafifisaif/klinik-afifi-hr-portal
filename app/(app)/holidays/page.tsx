import { EmptyState } from "@/components/empty-state";
import { HolidayManagementPage } from "@/components/holiday-management-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function HolidaysPage() {
  const context = await requireRouteAccess("holidays");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Holiday access restricted"
        description="Your current role does not include the holiday calendar."
      />
    );
  }

  const [holidayRows, branchRows] = await Promise.all([
    fetchRows(context.supabase, "holidays", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description="Track upcoming clinic and public holidays, including branch-specific dates and countdown visibility from the dashboard."
      />
      <HolidayManagementPage
        rows={holidayRows.rows}
        branches={branchRows.rows
          .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
          .filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        error={holidayRows.error ?? branchRows.error}
      />
    </div>
  );
}

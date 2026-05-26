import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

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

  const result = await fetchRows(context.supabase, "staff", 50);

  if (result.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Staff"
          description="Review branch staff records from the existing Supabase staff table."
        />
        <EmptyState title="Unable to load staff data" description={result.error} />
      </div>
    );
  }

  if (!result.rows.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Staff"
          description="Review branch staff records from the existing Supabase staff table."
        />
        <EmptyState
          title="No staff records yet"
          description="The table is connected and ready. Staff records will appear here once rows exist in Supabase."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Review branch staff records from the existing Supabase staff table."
      />
      <SimpleTable
        caption="Staff table"
        columns={deriveColumns(result.rows, ["full_name", "email", "branch_id", "position", "status"])}
        rows={result.rows}
      />
    </div>
  );
}

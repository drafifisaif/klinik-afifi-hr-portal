import { EmptyState } from "@/components/empty-state";
import { ExpiryTrackingPage } from "@/components/expiry-tracking-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterExpiringRows } from "@/lib/data";
import { mapRowsWithId } from "@/lib/utils";

export default async function StaffComplianceExpiryPage() {
  const context = await requireRouteAccess("staffComplianceExpiry");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Expiry tracking restricted"
        description="Your current role does not include staff compliance expiry tracking."
      />
    );
  }

  const [documents, staffRows, branches] = await Promise.all([
    fetchRows(context.supabase, "staff_documents", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  const expiringRows = filterExpiringRows(mapRowsWithId(documents.rows));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Compliance Expiry"
        description="Monitor expired and expiring staff documents within the next 60 days."
      />
      <ExpiryTrackingPage
        title="Staff document expiry tracking"
        description="Focus on documents that need renewal, review, or replacement soon."
        rows={expiringRows}
        staff={staffRows.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        emptyTitle="No staff documents are expiring soon"
        emptyDescription="Expired or soon-to-expire staff compliance documents will appear here automatically."
        showStaff
      />
    </div>
  );
}

import { EmptyState } from "@/components/empty-state";
import { ExpiryTrackingPage } from "@/components/expiry-tracking-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterExpiringRows } from "@/lib/data";
import { mapRowsWithId } from "@/lib/utils";

export default async function ClinicComplianceExpiryPage() {
  const context = await requireRouteAccess("clinicComplianceExpiry");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Clinic expiry tracking restricted"
        description="Your current role does not include clinic compliance expiry tracking."
      />
    );
  }

  const [documents, branches] = await Promise.all([
    fetchRows(context.supabase, "clinic_compliance_documents", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  const expiringRows = filterExpiringRows(mapRowsWithId(documents.rows));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic Compliance Expiry"
        description="Monitor clinic compliance documents that are expired or expiring within 60 days."
      />
      <ExpiryTrackingPage
        title="Clinic document expiry tracking"
        description="Keep branch licences, permits, and required clinic documents on schedule."
        rows={expiringRows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        emptyTitle="No clinic documents are expiring soon"
        emptyDescription="Expired or upcoming clinic compliance items will surface here automatically."
      />
    </div>
  );
}

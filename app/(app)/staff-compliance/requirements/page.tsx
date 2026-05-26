import { EmptyState } from "@/components/empty-state";
import { DocumentRequirementsPage } from "@/components/document-requirements-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function StaffComplianceRequirementsPage() {
  const context = await requireRouteAccess("staffComplianceRequirements");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Requirements access restricted"
        description="Your current role does not include compliance requirement management."
      />
    );
  }

  const requirements = await fetchRows(context.supabase, "document_requirements", 200);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Requirements"
        description="Define required staff documents by role, expiry expectation, and renewal cadence."
      />
      <DocumentRequirementsPage rows={requirements.rows} error={requirements.error} />
    </div>
  );
}

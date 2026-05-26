import { EmptyState } from "@/components/empty-state";
import { ClinicCompliancePage } from "@/components/clinic-compliance-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function ClinicComplianceDocumentsPage() {
  const context = await requireRouteAccess("clinicCompliance");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Clinic compliance access restricted"
        description="Your current role does not include clinic compliance documents."
      />
    );
  }

  const [documents, branches] = await Promise.all([
    fetchRows(context.supabase, "clinic_compliance_documents", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinic Documents"
        description="Upload and review clinic compliance documents by branch and category while keeping files private."
      />
      <ClinicCompliancePage
        rows={documents.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        error={documents.error ?? branches.error}
      />
    </div>
  );
}

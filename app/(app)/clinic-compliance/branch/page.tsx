import { BranchCompliancePage } from "@/components/branch-compliance-page";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function ClinicComplianceBranchPage() {
  const context = await requireRouteAccess("clinicComplianceBranch");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Branch compliance access restricted"
        description="Your current role does not include branch-level clinic compliance visibility."
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
        title="Branch Compliance"
        description="Review clinic compliance grouped by branch to quickly spot gaps in expiring or missing documents."
      />
      <BranchCompliancePage
        rows={documents.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
      />
    </div>
  );
}

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StaffCompliancePage } from "@/components/staff-compliance-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function StaffComplianceDocumentsPage() {
  const context = await requireRouteAccess("staffCompliance");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Staff compliance access restricted"
        description="Your current role does not include staff document management."
      />
    );
  }

  const [documents, staffRows, branches] = await Promise.all([
    fetchRows(context.supabase, "staff_documents", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Documents"
        description="Upload and track staff compliance documents while keeping private files inside Supabase Storage."
      />
      <StaffCompliancePage
        documents={documents.rows}
        staff={staffRows.rows}
        branches={branches.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        error={documents.error ?? staffRows.error ?? branches.error}
      />
    </div>
  );
}

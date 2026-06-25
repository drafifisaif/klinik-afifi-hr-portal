import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StaffCompliancePage } from "@/components/staff-compliance-page";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function StaffComplianceDocumentsPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("staffCompliance");
  const resolvedSearchParams = (await searchParams) ?? {};

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
  const initialStatusFilter = getSearchParamValue(resolvedSearchParams.status);
  const initialFilter = getSearchParamValue(resolvedSearchParams.filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Documents"
        description="Upload real compliance documents to private storage and review expiry and workflow status safely."
      />
      <StaffCompliancePage
        documents={documents.rows}
        staff={staffRows.rows}
        branches={branches.rows
          .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
          .filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        initialStatusFilter={initialStatusFilter}
        initialFilter={initialFilter}
        error={documents.error ?? staffRows.error ?? branches.error}
      />
    </div>
  );
}

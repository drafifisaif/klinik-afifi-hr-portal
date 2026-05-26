import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { FormSection } from "@/components/form-section";
import type { BranchOption, TableRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface BranchCompliancePageProps {
  rows: TableRow[];
  branches: BranchOption[];
}

export function BranchCompliancePage({ rows, branches }: BranchCompliancePageProps) {
  const grouped = branches
    .map((branch) => ({
      branch,
      rows: rows.filter((row) => String(row.branch_id ?? "") === branch.id),
    }))
    .filter((item) => item.rows.length > 0);

  return (
    <FormSection title="Branch compliance overview" description="Grouped clinic compliance documents by branch so operations and HR can spot gaps quickly.">
      {grouped.length ? (
        <div className="space-y-5">
          {grouped.map(({ branch, rows: branchRows }) => (
            <div key={branch.id} className="overflow-hidden rounded-[24px] border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--card-muted)] px-5 py-4">
                <h3 className="text-base font-semibold text-[var(--foreground)]">{branch.name}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-left">
                  <thead className="bg-white/80">
                    <tr>
                      {[
                        "Category",
                        "Document",
                        "Expiry",
                        "Status",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] bg-white">
                    {branchRows.map((row) => (
                      <tr key={String(row.id ?? `${branch.id}-${row.document_name}`)}>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.category ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_name ?? "-")}</td>
                        <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.expiry_date)}</td>
                        <td className="px-4 py-4 text-sm"><ExpiryBadge row={row} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No branch compliance records yet" description="Clinic compliance documents will appear here once uploads are saved to Supabase." />
      )}
    </FormSection>
  );
}

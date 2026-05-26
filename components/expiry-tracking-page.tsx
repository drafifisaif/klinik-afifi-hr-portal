import { EmptyState } from "@/components/empty-state";
import { ExpiryBadge } from "@/components/expiry-badge";
import { FormSection } from "@/components/form-section";
import type { BranchOption, TableRow } from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface ExpiryTrackingPageProps {
  title: string;
  description: string;
  rows: TableRow[];
  staff?: TableRow[];
  branches: BranchOption[];
  emptyTitle: string;
  emptyDescription: string;
  showStaff?: boolean;
}

export function ExpiryTrackingPage({
  title,
  description,
  rows,
  staff = [],
  branches,
  emptyTitle,
  emptyDescription,
  showStaff = false,
}: ExpiryTrackingPageProps) {
  return (
    <FormSection title={title} description={description}>
      {rows.length ? (
        <div className="overflow-hidden rounded-[24px] border border-[var(--border)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-left">
              <thead className="bg-[var(--card-muted)]/70">
                <tr>
                  {(showStaff
                    ? ["Owner", "Branch", "Document", "Expiry", "Status"]
                    : ["Branch", "Category", "Document", "Expiry", "Status"]
                  ).map((label) => (
                    <th key={label} className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-white">
                {rows.map((row) => (
                  <tr key={String(row.id ?? `${row.document_name}-${row.expiry_date}`)}>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                      {showStaff
                        ? (staff.find((member) => String(member.id ?? "") === String(row.staff_id ?? ""))?.full_name as string ?? String(row.staff_id ?? "-"))
                        : branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")}
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">
                      {showStaff
                        ? branches.find((branch) => branch.id === String(row.branch_id ?? ""))?.name ?? String(row.branch_id ?? "-")
                        : String(row.category ?? "-")}
                    </td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{String(row.document_name ?? "-")}</td>
                    <td className="px-4 py-4 text-sm text-[var(--foreground)]">{formatDate(row.expiry_date)}</td>
                    <td className="px-4 py-4 text-sm"><ExpiryBadge row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      )}
    </FormSection>
  );
}

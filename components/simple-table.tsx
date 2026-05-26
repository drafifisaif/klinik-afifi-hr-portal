import { StatusBadge } from "@/components/status-badge";
import { cn, formatCellValue, isStatusLikeKey } from "@/lib/utils";

export interface SimpleTableColumn {
  key: string;
  label: string;
}

interface SimpleTableProps {
  columns: SimpleTableColumn[];
  rows: Record<string, unknown>[];
  caption?: string;
}

export function SimpleTable({ columns, rows, caption }: SimpleTableProps) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border)] text-left">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-[var(--card-muted)]/70">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-white/90">
            {rows.map((row, index) => (
              <tr
                key={String(row.id ?? index)}
                className={cn(index % 2 === 0 ? "bg-white/90" : "bg-[#fbfcfc]")}
              >
                {columns.map((column) => {
                  const value = row[column.key];

                  return (
                    <td
                      key={column.key}
                      className="px-5 py-4 text-sm text-[var(--foreground)]"
                    >
                      {isStatusLikeKey(column.key) ? (
                        <StatusBadge value={String(value ?? "Unknown")} />
                      ) : (
                        <span className="block max-w-[240px] truncate">
                          {formatCellValue(value)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

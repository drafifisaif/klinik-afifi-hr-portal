import { getExpiryStatus } from "@/lib/data";
import type { TableRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExpiryBadgeProps {
  row: TableRow;
  field?: string;
}

const styles = {
  valid: "bg-emerald-50 text-emerald-700",
  expiring_soon: "bg-amber-50 text-amber-700",
  expired: "bg-rose-50 text-rose-700",
  pending_review: "bg-sky-50 text-sky-700",
};

export function ExpiryBadge({ row, field = "expiry_date" }: ExpiryBadgeProps) {
  const status = getExpiryStatus(row, field);

  const label =
    status.label === "expiring_soon"
      ? status.daysRemaining === 0
        ? "Expiring Today"
        : `Expiring in ${status.daysRemaining}d`
      : status.label === "expired"
        ? "Expired"
        : status.label === "pending_review"
          ? "Pending Review"
          : "Valid";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[status.label],
      )}
    >
      {label}
    </span>
  );
}

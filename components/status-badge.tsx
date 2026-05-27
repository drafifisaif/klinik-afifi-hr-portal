import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  value: string | null | undefined;
}

const styles: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  active: "bg-emerald-50 text-emerald-700",
  published: "bg-emerald-50 text-emerald-700",
  pending: "bg-rose-100 text-rose-700",
  submitted: "bg-rose-100 text-rose-700",
  assigned: "bg-rose-100 text-rose-700",
  in_progress: "bg-rose-100 text-rose-700",
  new: "bg-amber-100 text-amber-700",
  unread: "bg-sky-50 text-sky-700",
  rejected: "bg-rose-50 text-rose-700",
  closed: "bg-slate-100 text-slate-700",
  resolved: "bg-emerald-50 text-emerald-700",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value?.toLowerCase().replaceAll(" ", "_") ?? "unknown";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[normalized] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {value ?? "Unknown"}
    </span>
  );
}

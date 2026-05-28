import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  value: string | null | undefined;
}

const styles: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  active: "bg-emerald-50 text-emerald-700",
  published: "bg-emerald-50 text-emerald-700",
  present: "bg-emerald-50 text-emerald-700",
  pending: "bg-rose-100 text-rose-700",
  submitted: "bg-rose-100 text-rose-700",
  assigned: "bg-rose-100 text-rose-700",
  in_progress: "bg-rose-100 text-rose-700",
  absent: "bg-rose-100 text-rose-700",
  not_punched_in: "bg-rose-100 text-rose-700",
  new: "bg-amber-100 text-amber-700",
  incomplete: "bg-amber-100 text-amber-700",
  late: "bg-amber-100 text-amber-700",
  unread: "bg-sky-50 text-sky-700",
  pending_review: "bg-sky-50 text-sky-700",
  rejected: "bg-rose-50 text-rose-700",
  closed: "bg-slate-100 text-slate-700",
  resolved: "bg-emerald-50 text-emerald-700",
  on_leave: "bg-indigo-50 text-indigo-700",
  mc: "bg-cyan-50 text-cyan-700",
  clinic_network: "bg-emerald-50 text-emerald-700",
  unknown_network: "bg-orange-50 text-orange-700",
  unavailable: "bg-slate-100 text-slate-700",
  ip_unavailable: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value?.toLowerCase().replaceAll(" ", "_") ?? "unknown";
  const displayValue = String(value ?? "Unknown").replaceAll("_", " ");

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[normalized] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {displayValue}
    </span>
  );
}

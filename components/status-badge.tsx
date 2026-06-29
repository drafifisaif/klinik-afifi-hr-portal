import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  value: string | null | undefined;
}

const styles: Record<string, string> = {
  approved: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  active: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  created: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  published: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  present: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  complete: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  resolved: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  sent: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  delivered: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  verified_location: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  clinic_network: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border border-amber-200 bg-amber-50 text-amber-700",
  submitted: "border border-amber-200 bg-amber-50 text-amber-700",
  assigned: "border border-amber-200 bg-amber-50 text-amber-700",
  in_progress: "border border-amber-200 bg-amber-50 text-amber-700",
  new: "border border-amber-200 bg-amber-50 text-amber-700",
  suppressed: "border border-amber-200 bg-amber-50 text-amber-700",
  skipped_duplicate: "border border-amber-200 bg-amber-50 text-amber-700",
  late: "border border-amber-200 bg-amber-50 text-amber-700",
  permission_denied: "border border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border border-rose-200 bg-rose-50 text-rose-700",
  absent: "border border-rose-200 bg-rose-50 text-rose-700",
  not_punched_in: "border border-rose-200 bg-rose-50 text-rose-700",
  incomplete: "border border-rose-200 bg-rose-50 text-rose-700",
  outside_location: "border border-rose-200 bg-rose-50 text-rose-700",
  error: "border border-rose-200 bg-rose-50 text-rose-700",
  failed: "border border-rose-200 bg-rose-50 text-rose-700",
  not_sent_no_email: "border border-rose-200 bg-rose-50 text-rose-700",
  unread: "border border-blue-200 bg-blue-50 text-blue-700",
  pending_review: "border border-blue-200 bg-blue-50 text-blue-700",
  upcoming: "border border-blue-200 bg-blue-50 text-blue-700",
  on_leave: "border border-blue-200 bg-blue-50 text-blue-700",
  mc: "border border-blue-200 bg-blue-50 text-blue-700",
  offsite: "border border-violet-200 bg-violet-50 text-violet-700",
  closed: "border border-slate-200 bg-slate-100 text-slate-700",
  unavailable: "border border-slate-200 bg-slate-100 text-slate-700",
  ip_unavailable: "border border-slate-200 bg-slate-100 text-slate-700",
  location_unavailable: "border border-slate-200 bg-slate-100 text-slate-700",
  unknown_network: "border border-slate-200 bg-slate-100 text-slate-700",
  existing: "border border-slate-200 bg-slate-100 text-slate-700",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const normalized = value?.toLowerCase().replaceAll(" ", "_") ?? "unknown";
  const displayValue = String(value ?? "Unknown").replaceAll("_", " ");

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        styles[normalized] ?? "border border-slate-200 bg-slate-100 text-slate-700",
      )}
    >
      {displayValue}
    </span>
  );
}

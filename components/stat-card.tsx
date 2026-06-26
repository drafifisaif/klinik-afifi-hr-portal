import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone?: "neutral" | "alert" | "warning" | "success";
  href?: string;
}

export const clickableMetricCardClassName =
  "cursor-pointer transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(18,42,44,0.1)] hover:border-[#9fd9d4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const toneClasses = {
  neutral: {
    card: "border-[#d5e9e6] bg-white/95",
    value: "text-[var(--foreground)]",
    iconWrap: "bg-[#eaf8f6] text-[var(--accent)]",
  },
  alert: {
    card: "border-rose-200 bg-rose-50/88",
    value: "text-rose-700",
    iconWrap: "bg-rose-100 text-rose-600",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/88",
    value: "text-amber-700",
    iconWrap: "bg-amber-100 text-amber-600",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50/88",
    value: "text-emerald-700",
    iconWrap: "bg-emerald-100 text-emerald-600",
  },
};

export function StatCard({ title, value, description, icon: Icon, tone = "neutral", href }: StatCardProps) {
  const styles = toneClasses[tone];

  const content = (
    <div
      className={cn(
        "h-full rounded-[28px] border p-5 shadow-[0_18px_45px_rgba(18,42,44,0.06)]",
        styles.card,
        href ? clickableMetricCardClassName : "",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--muted-foreground)]">{title}</p>
          <p className={cn("mt-3 text-3xl font-semibold tracking-tight", styles.value)}>
            {value}
          </p>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", styles.iconWrap)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block h-full rounded-[28px] focus-visible:outline-none">
      {content}
    </Link>
  );
}

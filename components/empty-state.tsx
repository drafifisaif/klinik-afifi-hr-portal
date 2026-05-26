import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function EmptyState({ title, description, icon: Icon = Inbox }: EmptyStateProps) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--border)] bg-white/80 px-6 py-12 text-center shadow-[0_18px_45px_rgba(18,42,44,0.04)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-[var(--accent)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
    </div>
  );
}

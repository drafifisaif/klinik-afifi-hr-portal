import { LoaderCircle } from "lucide-react";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Loading" }: LoadingStateProps) {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--muted-foreground)] shadow-sm">
      <LoaderCircle className="h-4 w-4 animate-spin text-[var(--accent)]" />
      <span>{label}</span>
    </div>
  );
}

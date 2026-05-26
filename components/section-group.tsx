import { cn } from "@/lib/utils";

interface SectionGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionGroup({ children, className }: SectionGroupProps) {
  return <div className={cn("grid gap-6 xl:grid-cols-[1.15fr_0.85fr]", className)}>{children}</div>;
}

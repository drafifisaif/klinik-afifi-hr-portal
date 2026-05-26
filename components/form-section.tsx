import { cn } from "@/lib/utils";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section className={cn("rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]", className)}>
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
        {description ? (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

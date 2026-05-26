interface PageHeaderProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/80 bg-white/85 p-6 shadow-[0_16px_40px_rgba(18,42,44,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
          {description}
        </p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

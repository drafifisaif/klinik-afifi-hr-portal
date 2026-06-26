import type { LeaveBalanceSummary } from "@/lib/types";

interface LeaveBalancePanelProps {
  summary: LeaveBalanceSummary;
  title?: string;
  hideHeader?: boolean;
}

function BalanceCard({
  title,
  total,
  used,
  remaining,
}: {
  title: string;
  total: number;
  used: number;
  remaining: number;
}) {
  return (
    <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5 text-center sm:text-left">
      <h4 className="text-xl font-semibold text-[var(--foreground)] sm:text-[1.35rem]">{title}</h4>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Total</p>
          <p className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-[2rem]">{total}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Used</p>
          <p className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-[2rem]">{used}</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Remaining</p>
          <p className="text-[2.1rem] font-bold tracking-tight text-[var(--accent)] sm:text-[2.35rem]">{remaining}</p>
        </div>
      </div>
    </div>
  );
}

export function LeaveBalancePanel({ summary, title = "Leave Balance", hideHeader = false }: LeaveBalancePanelProps) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
      {!hideHeader ? (
        <div className="mb-5 flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {summary.entitlementYear ? `Entitlement year ${summary.entitlementYear}` : "No entitlement set yet."}
          </p>
          {summary.note ? <p className="text-xs text-[var(--muted-foreground)]">{summary.note}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <BalanceCard title="Annual Leave" {...summary.annual} />
        <BalanceCard title="Medical Leave" {...summary.medical} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5 text-center sm:text-left">
          <h4 className="text-xl font-semibold text-[var(--foreground)] sm:text-[1.35rem]">Emergency Leave</h4>
          <div className="mt-4">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Used</p>
              <p className="text-[2.1rem] font-bold tracking-tight text-[var(--foreground)] sm:text-[2.35rem]">{summary.emergency.used}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5 text-center sm:text-left">
          <h4 className="text-xl font-semibold text-[var(--foreground)] sm:text-[1.35rem]">Unpaid Leave</h4>
          <div className="mt-4">
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">Used</p>
              <p className="text-[2.1rem] font-bold tracking-tight text-[var(--foreground)] sm:text-[2.35rem]">{summary.unpaid.used}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

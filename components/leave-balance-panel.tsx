import type { LeaveBalanceSummary } from "@/lib/types";

interface LeaveBalancePanelProps {
  summary: LeaveBalanceSummary;
  title?: string;
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
    <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5">
      <h4 className="text-base font-semibold text-[var(--foreground)]">{title}</h4>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Total</p>
          <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{total}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Used</p>
          <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{used}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Remaining</p>
          <p className="mt-1 text-xl font-semibold text-[var(--accent)]">{remaining}</p>
        </div>
      </div>
    </div>
  );
}

export function LeaveBalancePanel({ summary, title = "Leave Balance" }: LeaveBalancePanelProps) {
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
      <div className="mb-5 flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          {summary.entitlementYear ? `Entitlement year ${summary.entitlementYear}` : "No entitlement set yet."}
        </p>
        {summary.note ? <p className="text-xs text-[var(--muted-foreground)]">{summary.note}</p> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BalanceCard title="Annual Leave" {...summary.annual} />
        <BalanceCard title="Medical Leave" {...summary.medical} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5">
          <h4 className="text-base font-semibold text-[var(--foreground)]">Emergency Leave</h4>
          <div className="mt-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Used</p>
              <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{summary.emergency.used}</p>
            </div>
          </div>
        </div>
        <div className="rounded-3xl bg-[var(--card-muted)] px-5 py-5">
          <h4 className="text-base font-semibold text-[var(--foreground)]">Unpaid Leave</h4>
          <div className="mt-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Used</p>
              <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">{summary.unpaid.used}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { CalendarPlus, Send } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

export default async function LeavePage() {
  const context = await requireRouteAccess("leave");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Leave access restricted"
        description="Your current role does not include the leave workspace."
      />
    );
  }

  const result = await fetchRows(context.supabase, "leave_requests", 50);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description="Track leave requests and keep the starter request form ready for final workflow wiring."
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          {result.error ? (
            <EmptyState title="Unable to load leave requests" description={result.error} />
          ) : result.rows.length ? (
            <SimpleTable
              caption="Leave request table"
              columns={deriveColumns(result.rows, ["staff_id", "leave_type", "start_date", "end_date", "status"])}
              rows={result.rows}
            />
          ) : (
            <EmptyState
              title="No leave requests yet"
              description="Once leave requests are submitted, they will appear here for review and approval."
            />
          )}
        </div>

        <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-[var(--accent)]">
              <CalendarPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Create leave request</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Placeholder UI for the next step in the leave submission flow.
              </p>
            </div>
          </div>

          <form className="mt-6 space-y-4">
            <select className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]">
              <option>Annual Leave</option>
              <option>Medical Leave</option>
              <option>Emergency Leave</option>
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <input type="date" className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]" />
              <input type="date" className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]" />
            </div>
            <textarea rows={4} placeholder="Reason for leave" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]" />
            <button type="button" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25">
              <Send className="h-4 w-4" />
              Save placeholder
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

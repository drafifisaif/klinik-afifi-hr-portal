import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterRowsByKnownAssignee } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

export default async function FeedbackManagePage() {
  const context = await requireRouteAccess("feedbackManage");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Management access restricted"
        description="Only operations, HR, and super admin roles can access this workflow."
      />
    );
  }

  const result = await fetchRows(context.supabase, "feedbacks", 50);
  const rows = filterRowsByKnownAssignee(result.rows, context.user.id, context.profile?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Feedback"
        description="Review assigned feedback and extend this page with assignment, commenting, and resolution actions."
      />

      <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 text-sm text-[var(--muted-foreground)] shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
        Assignment and status update controls are intentionally left as placeholders so they can match your final feedback schema and escalation rules.
      </div>

      {result.error ? (
        <EmptyState title="Unable to load managed feedback" description={result.error} />
      ) : rows.length ? (
        <SimpleTable
          caption="Managed feedback table"
          columns={deriveColumns(rows, ["subject", "assigned_to", "status", "priority", "created_at"])}
          rows={rows}
        />
      ) : (
        <EmptyState
          title="No feedback assignments yet"
          description="Assigned or available feedback items will appear here once records exist in Supabase."
        />
      )}
    </div>
  );
}

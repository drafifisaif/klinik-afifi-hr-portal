import { EmptyState } from "@/components/empty-state";
import { FeedbackWorkflowPage } from "@/components/feedback-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterRowsByKnownOwner } from "@/lib/data";

export default async function FeedbackPage() {
  const context = await requireRouteAccess("feedback");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Feedback access restricted"
        description="Your current role does not include the feedback submission workspace."
      />
    );
  }

  const [feedbackRows, staffRows, branchRows] = await Promise.all([
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  const ownRows = filterRowsByKnownOwner(feedbackRows.rows, context.user.id, context.profile?.id);
  const targetedRows = context.staff
    ? feedbackRows.rows.filter((row) => String(row.target_staff_id ?? "") === String(context.staff?.id ?? ""))
    : [];
  const visibleRows = [...new Map([...ownRows, ...targetedRows].map((row) => [String(row.id ?? `${row.created_at}-${row.title}`), row])).values()];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Submit real feedback, route it to the right team, and keep your own submission history visible."
      />
      <FeedbackWorkflowPage
        rows={visibleRows}
        staffRows={staffRows.rows}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={feedbackRows.error ?? staffRows.error ?? branchRows.error}
      />
    </div>
  );
}

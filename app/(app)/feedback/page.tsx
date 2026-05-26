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

  const [feedbackRows, staffRows] = await Promise.all([
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "staff", 200),
  ]);

  const ownRows = filterRowsByKnownOwner(feedbackRows.rows, context.user.id, context.profile?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Submit real feedback, route it to the right team, and keep your own submission history visible."
      />
      <FeedbackWorkflowPage
        rows={ownRows}
        staffRows={staffRows.rows}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={feedbackRows.error ?? staffRows.error}
      />
    </div>
  );
}

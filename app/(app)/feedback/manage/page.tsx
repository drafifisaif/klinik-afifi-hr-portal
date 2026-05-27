import { EmptyState } from "@/components/empty-state";
import { FeedbackManageWorkflowPage } from "@/components/feedback-manage-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

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

  const [feedbackRows, commentRows, staffRows, branchRows] = await Promise.all([
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "feedback_comments", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Feedback"
        description="Assign real workflow ownership, update status, and reply through the feedback comment stream."
      />
      <FeedbackManageWorkflowPage
        feedbackRows={feedbackRows.rows}
        commentRows={commentRows.rows}
        staffRows={staffRows.rows}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={feedbackRows.error ?? commentRows.error ?? staffRows.error ?? branchRows.error}
      />
    </div>
  );
}

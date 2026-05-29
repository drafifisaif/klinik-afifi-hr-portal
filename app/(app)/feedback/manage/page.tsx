import { EmptyState } from "@/components/empty-state";
import { FeedbackManageWorkflowPage } from "@/components/feedback-manage-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterFeedbackForManageView } from "@/lib/data";
import type { Profile } from "@/lib/types";

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

  const visibleFeedbackRows = filterFeedbackForManageView(
    feedbackRows.rows,
    context.role,
    context.profile,
    context.profile?.id ?? context.user.id,
    String(context.staff?.id ?? "") || undefined,
  );
  const visibleFeedbackIds = new Set(visibleFeedbackRows.map((row) => String(row.id ?? "")));
  const visibleCommentRows = commentRows.rows.filter((row) => visibleFeedbackIds.has(String(row.feedback_id ?? "")));

  const profileIds = Array.from(
    new Set(
      [...visibleFeedbackRows, ...visibleCommentRows]
        .flatMap((row) => [String(row.submitted_by ?? "").trim(), String(row.comment_by ?? "").trim(), String(row.assigned_to ?? "").trim()])
        .filter(Boolean),
    ),
  );

  const profileRows = profileIds.length
    ? await context.supabase.from("profiles").select("*").in("id", profileIds)
    : { data: [], error: null };
  const assignmentProfiles = await context.supabase
    .from("profiles")
    .select("*")
    .in("role", ["staff", "branch_pic", "operation", "hr"]);
  // TODO: Future enhancement: restrict assignment candidates using operation_branch_access.

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Feedback"
        description="Assign real workflow ownership, update status, and reply through the feedback comment stream."
      />
      <FeedbackManageWorkflowPage
        feedbackRows={visibleFeedbackRows}
        commentRows={visibleCommentRows}
        staffRows={staffRows.rows}
        profileRows={(profileRows.data ?? []) as Profile[]}
        assignmentProfiles={(assignmentProfiles.data ?? []) as Profile[]}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={feedbackRows.error ?? commentRows.error ?? staffRows.error ?? branchRows.error ?? profileRows.error?.message ?? assignmentProfiles.error?.message ?? null}
      />
    </div>
  );
}

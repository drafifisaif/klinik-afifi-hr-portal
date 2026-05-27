import { EmptyState } from "@/components/empty-state";
import { FeedbackWorkflowPage } from "@/components/feedback-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterRowsByKnownOwner } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { normalizeString } from "@/lib/utils";

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

  const [feedbackRows, staffRows, branchRows, profileRows] = await Promise.all([
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "staff", 200),
    fetchRows(context.supabase, "branches", 100),
    fetchRows(context.supabase, "profiles", 200),
  ]);

  const ownRows = filterRowsByKnownOwner(feedbackRows.rows, context.user.id, context.profile?.id);
  const feedbackForMe = feedbackRows.rows.filter((row) => {
    const targetedToCurrentStaff =
      context.staff &&
      normalizeString(row.target_type) === "staff" &&
      String(row.target_staff_id ?? "") === String(context.staff.id ?? "");
    const assignedToCurrentProfile = String(row.assigned_to ?? "") === String(context.profile?.id ?? context.user.id);

    return Boolean(targetedToCurrentStaff || assignedToCurrentProfile);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Submit real feedback, route it to the right team, and keep your own submission history visible."
      />
      <FeedbackWorkflowPage
        assignedRows={feedbackForMe}
        submittedRows={ownRows}
        staffRows={staffRows.rows}
        profileRows={profileRows.rows as Profile[]}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        error={feedbackRows.error ?? staffRows.error ?? branchRows.error ?? profileRows.error}
      />
    </div>
  );
}

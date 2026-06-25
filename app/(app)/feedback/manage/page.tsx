import { EmptyState } from "@/components/empty-state";
import { FeedbackManageWorkflowPage } from "@/components/feedback-manage-workflow-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterFeedbackForManageView } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { normalizeString } from "@/lib/utils";

type PageSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function FeedbackManagePage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const context = await requireRouteAccess("feedbackManage");
  const resolvedSearchParams = (await searchParams) ?? {};

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
    String(context.staff?.branch_id ?? context.profile?.branch_id ?? "") || undefined,
  );
  const statusFilter = normalizeString(getSearchParamValue(resolvedSearchParams.status));
  const departmentFilter = normalizeString(getSearchParamValue(resolvedSearchParams.department));
  const filteredFeedbackRows = visibleFeedbackRows.filter((row) => {
    const matchesStatus = !statusFilter || normalizeString(row.status) === statusFilter;
    const matchesDepartment =
      !departmentFilter ||
      normalizeString(row.assigned_department) === departmentFilter ||
      normalizeString(row.target_type) === departmentFilter;

    return matchesStatus && matchesDepartment;
  });
  const visibleFeedbackIds = new Set(filteredFeedbackRows.map((row) => String(row.id ?? "")));
  const visibleCommentRows = commentRows.rows.filter((row) => visibleFeedbackIds.has(String(row.feedback_id ?? "")));

  const profileIds = Array.from(
    new Set(
      [...filteredFeedbackRows, ...visibleCommentRows]
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
        feedbackRows={filteredFeedbackRows}
        commentRows={visibleCommentRows}
        staffRows={staffRows.rows}
        profileRows={(profileRows.data ?? []) as Profile[]}
        assignmentProfiles={(assignmentProfiles.data ?? []) as Profile[]}
        branches={branchRows.rows.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) })).filter((row) => row.id)}
        role={context.role}
        profile={context.profile}
        currentStaff={context.staff}
        emptyStateTitle={statusFilter || departmentFilter ? "No items found for this filter." : undefined}
        emptyStateDescription={statusFilter || departmentFilter ? "No items found for this filter." : undefined}
        error={feedbackRows.error ?? commentRows.error ?? staffRows.error ?? branchRows.error ?? profileRows.error?.message ?? assignmentProfiles.error?.message ?? null}
      />
    </div>
  );
}

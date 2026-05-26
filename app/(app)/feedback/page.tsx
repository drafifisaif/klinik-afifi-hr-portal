import { EmptyState } from "@/components/empty-state";
import { FeedbackFormCard } from "@/components/feedback-form-card";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterRowsByKnownOwner } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

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

  const result = await fetchRows(context.supabase, "feedbacks", 50);
  const rows = filterRowsByKnownOwner(result.rows, context.user.id, context.profile?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="Submit new feedback and review your recent feedback records from Supabase."
      />

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <FeedbackFormCard />
        {result.error ? (
          <EmptyState title="Unable to load feedback history" description={result.error} />
        ) : rows.length ? (
          <SimpleTable
            caption="Own feedback table"
            columns={deriveColumns(rows, ["subject", "status", "created_at", "category", "message"])}
            rows={rows}
          />
        ) : (
          <EmptyState
            title="No feedback history yet"
            description="Your submitted feedback entries will appear here once they exist in the feedbacks table."
          />
        )}
      </section>
    </div>
  );
}

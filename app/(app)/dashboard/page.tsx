import { ClipboardList, FileText, MessageSquareMore, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requireRouteAccess } from "@/lib/auth";
import { countByStatus, fetchCount, fetchRows, filterPublishedCirculars } from "@/lib/data";

export default async function DashboardPage() {
  const context = await requireRouteAccess("dashboard");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Dashboard access unavailable"
        description="Sign in with a valid portal account to view dashboard content."
      />
    );
  }

  const [staffCount, leaveRows, feedbackRows, circularRows] = await Promise.all([
    fetchCount(context.supabase, "staff"),
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "circulars", 200),
  ]);

  const pendingLeave = countByStatus(leaveRows.rows, ["pending", "submitted"]);
  const newFeedback = countByStatus(feedbackRows.rows, ["new", "pending"]) || feedbackRows.rows.length;
  const unreadCirculars = filterPublishedCirculars(circularRows.rows).length;
  const hasError = [staffCount.error, leaveRows.error, feedbackRows.error, circularRows.error].find(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A quick operational snapshot for head office, branch leaders, and frontline staff."
      />

      {hasError ? (
        <EmptyState
          title="Some dashboard data could not be loaded"
          description={hasError}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Staff"
          value={staffCount.count}
          description="Current records available in the staff directory."
          icon={Users}
        />
        <StatCard
          title="Pending Leave"
          value={pendingLeave}
          description="Leave requests awaiting review or action."
          icon={ClipboardList}
        />
        <StatCard
          title="New Feedback"
          value={newFeedback}
          description="Feedback items that may need follow-up."
          icon={MessageSquareMore}
        />
        <StatCard
          title="Unread Circulars"
          value={unreadCirculars}
          description="Published circulars ready for team visibility."
          icon={FileText}
        />
      </section>
    </div>
  );
}

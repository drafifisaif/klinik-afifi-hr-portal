import {
  BriefcaseMedical,
  CalendarClock,
  ClipboardList,
  FileBadge,
  MessageSquareMore,
  Users,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requireRouteAccess } from "@/lib/auth";
import {
  countByStatus,
  countExpiringRows,
  countTodayRoster,
  fetchCount,
  fetchRows,
} from "@/lib/data";

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

  const [staffCount, leaveRows, feedbackRows, rosterRows, staffDocs, clinicDocs] = await Promise.all([
    fetchCount(context.supabase, "staff"),
    fetchRows(context.supabase, "leave_requests", 200),
    fetchRows(context.supabase, "feedbacks", 200),
    fetchRows(context.supabase, "rosters", 200),
    fetchRows(context.supabase, "staff_documents", 200),
    fetchRows(context.supabase, "clinic_compliance_documents", 200),
  ]);

  const pendingLeave = countByStatus(leaveRows.rows, ["pending", "submitted"]);
  const newFeedback = countByStatus(feedbackRows.rows, ["new", "pending"]) || feedbackRows.rows.length;
  const todayRoster = countTodayRoster(rosterRows.rows);
  const expiringStaffDocs = countExpiringRows(staffDocs.rows);
  const expiringClinicDocs = countExpiringRows(clinicDocs.rows);
  const hasError = [
    staffCount.error,
    leaveRows.error,
    feedbackRows.error,
    rosterRows.error,
    staffDocs.error,
    clinicDocs.error,
  ].find(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A quick operational snapshot across HR workflows, rosters, staff compliance, and clinic compliance."
      />

      {hasError ? (
        <EmptyState
          title="Some dashboard data could not be loaded"
          description={hasError}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          title="Today Roster"
          value={todayRoster}
          description="Roster assignments scheduled for today."
          icon={CalendarClock}
        />
        <StatCard
          title="Staff Docs Expiring Soon"
          value={expiringStaffDocs}
          description="Staff compliance documents expired or within 60 days."
          icon={FileBadge}
        />
        <StatCard
          title="Clinic Docs Expiring Soon"
          value={expiringClinicDocs}
          description="Clinic compliance documents that need upcoming action."
          icon={BriefcaseMedical}
        />
      </section>
    </div>
  );
}

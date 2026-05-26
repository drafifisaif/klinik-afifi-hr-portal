import { EmptyState } from "@/components/empty-state";
import { NotificationCenterPage } from "@/components/notification-center-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterNotificationsForUser } from "@/lib/data";

export default async function NotificationsPage() {
  const context = await requireRouteAccess("notifications");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Notifications access restricted"
        description="Sign in to view your in-app notification inbox."
      />
    );
  }

  const result = await fetchRows(context.supabase, "notifications", 200);
  const rows = filterNotificationsForUser(result.rows, context.user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Review feedback and workflow notifications, then mark them as read once handled."
      />
      <NotificationCenterPage rows={rows} error={result.error} />
    </div>
  );
}

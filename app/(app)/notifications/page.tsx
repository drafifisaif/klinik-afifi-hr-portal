import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

export default async function NotificationsPage() {
  const context = await requireRouteAccess("notifications");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Notifications access restricted"
        description="Your current role does not include notification log monitoring."
      />
    );
  }

  const result = await fetchRows(context.supabase, "notifications", 50);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Monitor system and workflow notification logs coming from the notifications table."
      />
      {result.error ? (
        <EmptyState title="Unable to load notifications" description={result.error} />
      ) : result.rows.length ? (
        <SimpleTable
          caption="Notification table"
          columns={deriveColumns(result.rows, ["title", "type", "status", "created_at", "recipient_id"])}
          rows={result.rows}
        />
      ) : (
        <EmptyState
          title="No notification logs yet"
          description="Notification rows will appear here once they are written to Supabase."
        />
      )}
    </div>
  );
}

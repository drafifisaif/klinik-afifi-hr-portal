"use client";

import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FormSection } from "@/components/form-section";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@/lib/supabase/client";
import type { TableRow } from "@/lib/types";
import { formatDateTime, mapRowsWithId } from "@/lib/utils";

interface NotificationCenterPageProps {
  rows: TableRow[];
  error?: string | null;
}

export function NotificationCenterPage({ rows, error }: NotificationCenterPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const [message, setMessage] = useState<string | null>(null);
  const notificationRows = mapRowsWithId(rows);

  async function markAsRead(notificationId: string) {
    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    setMessage("Notification marked as read.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? <EmptyState title="Unable to load notifications" description={error} /> : null}
      <FormSection title="Notification inbox" description="In-app notifications are stored for workflow events. Email sending remains safely pending until a provider is configured.">
        {message ? <p className="mb-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
        {notificationRows.length ? (
          <div className="space-y-4">
            {notificationRows.map((row) => (
              <article key={String(row.id)} className="rounded-3xl border border-[var(--border)] bg-white px-5 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-[var(--foreground)]">{String(row.title ?? "Notification")}</h3>
                      <StatusBadge value={row.is_read === true ? "read" : "unread"} />
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">{String(row.type ?? "general")} · {formatDateTime(row.created_at)}</p>
                    <p className="mt-4 text-sm leading-6 text-[var(--foreground)]">{String(row.message ?? "-")}</p>
                  </div>
                  {row.is_read === true ? null : (
                    <button type="button" onClick={() => markAsRead(String(row.id))} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[var(--foreground)] px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10">
                      <CheckCheck className="h-4 w-4" />
                      Mark read
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No notifications yet" description="Feedback, workflow, and status notifications will appear here once they are generated." />
        )}
      </FormSection>
    </div>
  );
}

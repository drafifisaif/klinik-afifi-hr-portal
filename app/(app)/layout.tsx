import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentSessionProfile } from "@/lib/auth";
import { countUnreadNotifications, fetchRows } from "@/lib/data";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentSessionProfile();

  if (!context.user) {
    redirect("/login");
  }

  const notifications = await fetchRows(context.supabase, "notifications", 200);
  const unreadCount = countUnreadNotifications(notifications.rows, context.user.id);

  return (
    <AppShell profile={context.profile} role={context.role} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}

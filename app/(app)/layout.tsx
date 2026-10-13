import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentSessionProfile } from "@/lib/auth";
import { fetchUnreadNotificationCount } from "@/lib/data";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentSessionProfile();

  if (!context.user) {
    redirect("/login");
  }

  const unreadCount = await fetchUnreadNotificationCount(context.supabase, context.user.id);

  return (
    <AppShell profile={context.profile} role={context.role} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}

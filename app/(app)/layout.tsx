import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getCurrentSessionProfile } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentSessionProfile();

  if (!context.user) {
    redirect("/login");
  }

  return (
    <AppShell profile={context.profile} role={context.role}>
      {children}
    </AppShell>
  );
}

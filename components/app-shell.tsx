"use client";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getRoleNavigation } from "@/lib/navigation";
import type { Profile, UserRole } from "@/lib/types";

interface AppShellProps {
  children: React.ReactNode;
  profile: Profile | null;
  role: UserRole;
  unreadCount: number;
}

export function AppShell({ children, profile, role, unreadCount }: AppShellProps) {
  const pathname = usePathname();
  const navigation = getRoleNavigation(role);

  return (
    <div className="min-h-screen bg-transparent text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
        <Sidebar currentPath={pathname} navigation={navigation} profile={profile} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar currentPath={pathname} profile={profile} unreadCount={unreadCount} />
          <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

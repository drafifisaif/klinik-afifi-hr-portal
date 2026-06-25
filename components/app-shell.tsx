"use client";

import { useEffect, useState } from "react";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  useEffect(() => {
    const savedValue = window.localStorage.getItem("ka-hr-sidebar-collapsed");
    setDesktopSidebarCollapsed(savedValue === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ka-hr-sidebar-collapsed", String(desktopSidebarCollapsed));
  }, [desktopSidebarCollapsed]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col md:flex-row">
        <Sidebar
          currentPath={pathname}
          navigation={navigation}
          profile={profile}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          collapsed={desktopSidebarCollapsed}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar
            currentPath={pathname}
            profile={profile}
            unreadCount={unreadCount}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            desktopSidebarCollapsed={desktopSidebarCollapsed}
            onToggleDesktopSidebar={() => setDesktopSidebarCollapsed((current) => !current)}
          />
          <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
            <div className="mx-auto w-full max-w-[1540px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

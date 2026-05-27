import Link from "next/link";
import { Bell, Menu, Search } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import type { Profile } from "@/lib/types";
import { formatTitleFromPath, getInitials } from "@/lib/utils";

interface TopbarProps {
  currentPath: string;
  profile: Profile | null;
  unreadCount: number;
  onOpenSidebar?: () => void;
}

export function Topbar({ currentPath, profile, unreadCount, onOpenSidebar }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)] sm:block">
              Klinik Afifi HR Portal
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--foreground)] sm:mt-1 sm:text-2xl">
              {formatTitleFromPath(currentPath)}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted-foreground)] shadow-sm md:flex">
            <Search className="h-4 w-4" />
            <span>Staff, leave, feedback</span>
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm md:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <Link
            href="/notifications"
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] shadow-sm"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-xs font-semibold text-[var(--accent)]">
              {getInitials(profile?.full_name ?? profile?.email ?? "HR")}
            </div>
            <div className="hidden text-right lg:block">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {profile?.full_name ?? "Portal User"}
              </p>
              <p className="text-xs capitalize text-[var(--muted-foreground)]">
                {profile?.role?.replaceAll("_", " ") ?? "staff"}
              </p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

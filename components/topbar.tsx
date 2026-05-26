import Link from "next/link";
import { Bell, Search } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import type { Profile } from "@/lib/types";
import { formatTitleFromPath } from "@/lib/utils";

interface TopbarProps {
  currentPath: string;
  profile: Profile | null;
  unreadCount: number;
}

export function Topbar({ currentPath, profile, unreadCount }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent)]">
            Klinik Afifi HR Portal
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            {formatTitleFromPath(currentPath)}
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted-foreground)] shadow-sm md:flex">
            <Search className="h-4 w-4" />
            <span>Staff, leave, feedback</span>
          </div>
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
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {profile?.full_name ?? "Portal User"}
            </p>
            <p className="text-xs capitalize text-[var(--muted-foreground)]">
              {profile?.role?.replaceAll("_", " ") ?? "staff"}
            </p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

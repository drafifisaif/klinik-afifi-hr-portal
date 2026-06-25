"use client";

import Link from "next/link";
import { Hospital, X } from "lucide-react";

import { cn, getInitials } from "@/lib/utils";
import { getNavigationGroupLabel } from "@/lib/navigation";
import type { NavItem, NavigationGroup, Profile } from "@/lib/types";

interface SidebarProps {
  currentPath: string;
  navigation: NavItem[];
  profile: Profile | null;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
}

const GROUP_ORDER: NavigationGroup[] = [
  "core_hr",
  "staff_compliance",
  "clinic_compliance",
  "settings",
];

export function Sidebar({ currentPath, navigation, profile, mobileOpen = false, onCloseMobile, collapsed = false }: SidebarProps) {
  const compact = collapsed && !mobileOpen;
  const groupedNavigation = GROUP_ORDER.map((group) => ({
    group,
    items: navigation.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  const sidebarContent = (
    <>
      <div className={cn("flex items-center gap-3 rounded-3xl bg-[var(--card-muted)] px-4 py-3", compact ? "justify-center md:px-3" : "justify-between")}>
        <div className={cn("flex items-center gap-3", compact && "justify-center")}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20">
            <Hospital className="h-5 w-5" />
          </div>
          {!compact ? (
            <div>
              <p className="text-sm font-semibold tracking-wide text-[var(--foreground)]">
                Klinik Afifi
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">HR Portal</p>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] md:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {groupedNavigation.map(({ group, items }) => (
          <div key={group}>
            {!compact ? (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                {getNavigationGroupLabel(group)}
              </p>
            ) : null}
            <nav className="flex flex-col gap-2">
              {items.map((item) => {
                const isActive =
                  currentPath === item.href || currentPath.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    title={compact ? item.label : undefined}
                    aria-label={compact ? item.label : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white",
                      compact && "justify-center px-3",
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--card-muted)] hover:text-[var(--foreground)]",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!compact ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className={cn("mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4", compact && "md:px-3")}>
        <div className={cn("flex items-center gap-3", compact && "justify-center")}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-sm font-semibold text-[var(--foreground)]">
            {getInitials(profile?.full_name ?? profile?.email ?? "HR")}
          </div>
          {!compact ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                {profile?.full_name ?? "Portal User"}
              </p>
              <p className="truncate text-xs capitalize text-[var(--muted-foreground)]">
                {profile?.role?.replaceAll("_", " ") ?? "staff"}
              </p>
            </div>
          ) : (
            <span className="sr-only">
              {profile?.full_name ?? "Portal User"} · {profile?.role?.replaceAll("_", " ") ?? "staff"}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 border-r border-white/70 bg-white/80 px-5 py-6 shadow-[0_24px_48px_rgba(18,42,44,0.05)] backdrop-blur transition-[width,padding] duration-300 ease-out md:flex md:flex-col",
          collapsed ? "md:w-[96px] md:px-3" : "md:w-[300px]",
        )}
      >
        {sidebarContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
            aria-label="Close sidebar overlay"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-[320px] flex-col border-r border-white/70 bg-white px-4 py-4 shadow-[0_24px_48px_rgba(18,42,44,0.16)]">
            {sidebarContent}
          </aside>
        </div>
      ) : null}
    </>
  );
}

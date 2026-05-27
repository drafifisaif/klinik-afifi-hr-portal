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
}

const GROUP_ORDER: NavigationGroup[] = [
  "core_hr",
  "staff_compliance",
  "clinic_compliance",
  "settings",
];

export function Sidebar({ currentPath, navigation, profile, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const groupedNavigation = GROUP_ORDER.map((group) => ({
    group,
    items: navigation.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-[var(--card-muted)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20">
            <Hospital className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-[var(--foreground)]">
              Klinik Afifi
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">HR Portal</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-white text-[var(--foreground)] lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-6 flex flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {groupedNavigation.map(({ group, items }) => (
          <div key={group}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
              {getNavigationGroupLabel(group)}
            </p>
            <nav className="flex flex-col gap-2">
              {items.map((item) => {
                const isActive =
                  currentPath === item.href || currentPath.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onCloseMobile}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium",
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-lg shadow-teal-500/20"
                        : "text-[var(--muted-foreground)] hover:bg-[var(--card-muted)] hover:text-[var(--foreground)]",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-sm font-semibold text-[var(--foreground)]">
            {getInitials(profile?.full_name ?? profile?.email ?? "HR")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--foreground)]">
              {profile?.full_name ?? "Portal User"}
            </p>
            <p className="truncate text-xs capitalize text-[var(--muted-foreground)]">
              {profile?.role?.replaceAll("_", " ") ?? "staff"}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden w-[300px] shrink-0 border-r border-white/70 bg-white/80 px-5 py-6 shadow-[0_24px_48px_rgba(18,42,44,0.05)] backdrop-blur lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
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

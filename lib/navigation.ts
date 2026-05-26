import {
  Bell,
  ClipboardList,
  FileCheck,
  FileText,
  LayoutDashboard,
  MessageSquare,
  MessageSquareMore,
  Settings,
  Users,
} from "lucide-react";

import type { AppRouteKey, NavItem, UserRole } from "@/lib/types";

const NAVIGATION: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    routeKey: "dashboard",
  },
  {
    href: "/staff",
    label: "Staff",
    shortLabel: "Staff",
    icon: Users,
    routeKey: "staff",
  },
  {
    href: "/leave",
    label: "Leave",
    shortLabel: "Leave",
    icon: ClipboardList,
    routeKey: "leave",
  },
  {
    href: "/mc",
    label: "MC",
    shortLabel: "MC",
    icon: FileCheck,
    routeKey: "mc",
  },
  {
    href: "/feedback",
    label: "Feedback",
    shortLabel: "Feedback",
    icon: MessageSquare,
    routeKey: "feedback",
  },
  {
    href: "/feedback/manage",
    label: "Manage Feedback",
    shortLabel: "Manage",
    icon: MessageSquareMore,
    routeKey: "feedbackManage",
  },
  {
    href: "/notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    icon: Bell,
    routeKey: "notifications",
  },
  {
    href: "/circulars",
    label: "Circulars",
    shortLabel: "Circulars",
    icon: FileText,
    routeKey: "circulars",
  },
  {
    href: "/settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: Settings,
    routeKey: "settings",
  },
];

const ROLE_ACCESS: Record<UserRole, AppRouteKey[]> = {
  staff: ["dashboard", "leave", "mc", "feedback", "circulars", "settings"],
  branch_pic: ["dashboard", "staff", "leave", "feedback", "circulars", "settings"],
  operation: ["dashboard", "feedbackManage", "notifications", "circulars", "settings"],
  hr: [
    "dashboard",
    "staff",
    "leave",
    "mc",
    "feedbackManage",
    "notifications",
    "circulars",
    "settings",
  ],
  super_admin: NAVIGATION.map((item) => item.routeKey),
};

export function normalizeRole(value: unknown): UserRole {
  if (
    value === "super_admin" ||
    value === "hr" ||
    value === "operation" ||
    value === "branch_pic" ||
    value === "staff"
  ) {
    return value;
  }

  return "staff";
}

export function getRoleNavigation(role: UserRole) {
  return NAVIGATION.filter((item) => ROLE_ACCESS[role].includes(item.routeKey));
}

export function canAccessRoute(role: UserRole, routeKey: AppRouteKey) {
  return ROLE_ACCESS[role].includes(routeKey);
}

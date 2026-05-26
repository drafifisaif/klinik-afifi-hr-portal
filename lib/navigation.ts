import {
  Bell,
  BriefcaseMedical,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileBadge,
  FileCheck,
  FileSearch,
  FileText,
  LayoutDashboard,
  MessageSquare,
  MessageSquareMore,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { AppRouteKey, NavItem, NavigationGroup, UserRole } from "@/lib/types";

const NAVIGATION: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    routeKey: "dashboard",
    group: "core_hr",
  },
  {
    href: "/staff",
    label: "Staff",
    shortLabel: "Staff",
    icon: Users,
    routeKey: "staff",
    group: "core_hr",
  },
  {
    href: "/leave",
    label: "Leave",
    shortLabel: "Leave",
    icon: ClipboardList,
    routeKey: "leave",
    group: "core_hr",
  },
  {
    href: "/mc",
    label: "MC",
    shortLabel: "MC",
    icon: FileCheck,
    routeKey: "mc",
    group: "core_hr",
  },
  {
    href: "/feedback",
    label: "Feedback",
    shortLabel: "Feedback",
    icon: MessageSquare,
    routeKey: "feedback",
    group: "core_hr",
  },
  {
    href: "/feedback/manage",
    label: "Manage Feedback",
    shortLabel: "Manage",
    icon: MessageSquareMore,
    routeKey: "feedbackManage",
    group: "core_hr",
  },
  {
    href: "/roster",
    label: "Roster",
    shortLabel: "Roster",
    icon: CalendarClock,
    routeKey: "roster",
    group: "core_hr",
  },
  {
    href: "/holidays",
    label: "Holidays",
    shortLabel: "Holiday",
    icon: CalendarDays,
    routeKey: "holidays",
    group: "core_hr",
  },
  {
    href: "/notifications",
    label: "Notifications",
    shortLabel: "Alerts",
    icon: Bell,
    routeKey: "notifications",
    group: "core_hr",
  },
  {
    href: "/staff-compliance",
    label: "Staff Documents",
    shortLabel: "Docs",
    icon: FileBadge,
    routeKey: "staffCompliance",
    group: "staff_compliance",
  },
  {
    href: "/staff-compliance/requirements",
    label: "Document Requirements",
    shortLabel: "Reqs",
    icon: FileText,
    routeKey: "staffComplianceRequirements",
    group: "staff_compliance",
  },
  {
    href: "/staff-compliance/expiry",
    label: "Expiry Tracking",
    shortLabel: "Expiry",
    icon: FileSearch,
    routeKey: "staffComplianceExpiry",
    group: "staff_compliance",
  },
  {
    href: "/clinic-compliance",
    label: "Clinic Documents",
    shortLabel: "Clinic",
    icon: BriefcaseMedical,
    routeKey: "clinicCompliance",
    group: "clinic_compliance",
  },
  {
    href: "/clinic-compliance/branch",
    label: "Branch Compliance",
    shortLabel: "Branch",
    icon: ShieldCheck,
    routeKey: "clinicComplianceBranch",
    group: "clinic_compliance",
  },
  {
    href: "/clinic-compliance/expiry",
    label: "Expiry Tracking",
    shortLabel: "Expiry",
    icon: FileSearch,
    routeKey: "clinicComplianceExpiry",
    group: "clinic_compliance",
  },
  {
    href: "/settings",
    label: "My Profile",
    shortLabel: "Profile",
    icon: Settings,
    routeKey: "settings",
    group: "settings",
  },
  {
    href: "/circulars",
    label: "Circulars",
    shortLabel: "Circulars",
    icon: FileText,
    routeKey: "circulars",
    group: "settings",
  },
];

const ROLE_ACCESS: Record<UserRole, AppRouteKey[]> = {
  staff: ["dashboard", "leave", "mc", "feedback", "roster", "circulars", "settings"],
  branch_pic: [
    "dashboard",
    "staff",
    "leave",
    "mc",
    "feedback",
    "roster",
    "holidays",
    "circulars",
    "settings",
  ],
  operation: [
    "dashboard",
    "feedbackManage",
    "notifications",
    "roster",
    "holidays",
    "clinicCompliance",
    "clinicComplianceBranch",
    "clinicComplianceExpiry",
    "circulars",
    "settings",
  ],
  hr: [
    "dashboard",
    "staff",
    "leave",
    "mc",
    "feedback",
    "feedbackManage",
    "notifications",
    "roster",
    "holidays",
    "staffCompliance",
    "staffComplianceRequirements",
    "staffComplianceExpiry",
    "clinicCompliance",
    "clinicComplianceBranch",
    "clinicComplianceExpiry",
    "circulars",
    "settings",
  ],
  super_admin: NAVIGATION.map((item) => item.routeKey),
};

const GROUP_LABELS: Record<NavigationGroup, string> = {
  core_hr: "Core HR",
  staff_compliance: "Staff Compliance",
  clinic_compliance: "Clinic Compliance",
  settings: "Settings",
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

export function getNavigationGroupLabel(group: NavigationGroup) {
  return GROUP_LABELS[group];
}

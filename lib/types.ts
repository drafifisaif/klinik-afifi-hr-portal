import type { LucideIcon } from "lucide-react";

export type UserRole =
  | "super_admin"
  | "hr"
  | "operation"
  | "branch_pic"
  | "staff";

export interface Profile {
  id: string;
  role: UserRole;
  email?: string | null;
  full_name?: string | null;
  branch_id?: string | null;
  [key: string]: unknown;
}

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  routeKey: AppRouteKey;
}

export type AppRouteKey =
  | "dashboard"
  | "staff"
  | "leave"
  | "mc"
  | "feedback"
  | "feedbackManage"
  | "notifications"
  | "circulars"
  | "settings";

export type TableRow = Record<string, unknown> & {
  id?: string | number | null;
};

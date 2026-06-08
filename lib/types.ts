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

export type NavigationGroup = "core_hr" | "staff_compliance" | "clinic_compliance" | "settings";

export interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  routeKey: AppRouteKey;
  group: NavigationGroup;
}

export type AppRouteKey =
  | "dashboard"
  | "staff"
  | "leave"
  | "mc"
  | "attendance"
  | "feedback"
  | "feedbackManage"
  | "notifications"
  | "roster"
  | "holidays"
  | "staffCompliance"
  | "staffComplianceRequirements"
  | "staffComplianceExpiry"
  | "clinicCompliance"
  | "clinicComplianceBranch"
  | "clinicComplianceExpiry"
  | "circulars"
  | "settings";

export type TableRow = Record<string, unknown> & {
  id?: string | number | null;
};

export interface BranchOption {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  gps_radius_meters?: number | null;
  is_active?: boolean | null;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface LeaveBalanceSummary {
  annual: {
    total: number;
    openingUsed: number;
    portalUsed: number;
    remaining: number;
  };
  medical: {
    total: number;
    openingUsed: number;
    portalUsed: number;
    remaining: number;
  };
  entitlementYear: number | null;
  note: string | null;
}

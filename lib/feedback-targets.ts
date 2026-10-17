import type { BranchOption, TableRow, UserRole } from "@/lib/types";
import { normalizeString } from "@/lib/utils";

export const feedbackTargetLabels: Record<string, string> = {
  staff: "Staff",
  hr: "Human Resource (HR) Manager",
  operation: "Operation Manager",
  portal_system: "Portal System",
};

export function isStaffFeedbackSource(role: unknown) {
  return role === "staff" || role === "branch_pic";
}

export function getFeedbackTargetOptions(role: UserRole) {
  if (isStaffFeedbackSource(role)) {
    return ["hr", "operation"];
  }

  if (role === "operation") {
    return ["staff", "hr", "portal_system"];
  }

  if (role === "hr") {
    return ["staff", "operation", "portal_system"];
  }

  // Super admin can route feedback to the portal queue or managers.
  return ["hr", "operation", "portal_system"];
}

export function getSelectableFeedbackStaff(staffRows: TableRow[], branches: BranchOption[]) {
  const branchIds = new Set(branches.map((branch) => String(branch.id ?? "").trim()).filter(Boolean));

  return staffRows.filter((row) => {
    const name = normalizeString(row.full_name ?? row.email ?? "").replace(/\s+/g, " ");
    const branchId = String(row.branch_id ?? "").trim();
    return normalizeString(row.status) === "active"
      && branchIds.has(branchId)
      && !/^dr\.?\s*lokum\b/.test(name);
  });
}

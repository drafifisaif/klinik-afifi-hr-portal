import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { LeaveBalanceSummary, Profile, TableRow, UserRole } from "@/lib/types";
import {
  calculateLeaveDays,
  daysUntil,
  getMalaysiaDateString,
  normalizeString,
} from "@/lib/utils";

export interface QueryResult {
  rows: TableRow[];
  error: string | null;
}

export interface ExpiryStatus {
  label: "valid" | "expiring_soon" | "expired" | "pending_review";
  daysRemaining: number | null;
}

export async function fetchRows(
  supabase: SupabaseClient | null,
  table: string,
  limit = 20,
): Promise<QueryResult> {
  if (!supabase) {
    return { rows: [], error: "Supabase environment variables are missing." };
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const fallback = await supabase.from(table).select("*").limit(limit);

    if (fallback.error) {
      return { rows: [], error: fallback.error.message };
    }

    return {
      rows: (fallback.data ?? []) as TableRow[],
      error: null,
    };
  }

  return {
    rows: (data ?? []) as TableRow[],
    error: null,
  };
}

export async function fetchCount(
  supabase: SupabaseClient | null,
  table: string,
): Promise<{ count: number; error: string | null }> {
  if (!supabase) {
    return { count: 0, error: "Supabase environment variables are missing." };
  }

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

export function resolveError(error: PostgrestError | string | null | undefined) {
  if (!error) {
    return null;
  }

  return typeof error === "string" ? error : error.message;
}

export function countByStatus(rows: TableRow[], accepted: string[]) {
  return rows.filter((row) => {
    const statusValue =
      row.status ?? row.approval_status ?? row.state ?? row.request_status ?? null;

    if (!statusValue) {
      return false;
    }

    return accepted.includes(String(statusValue).toLowerCase());
  }).length;
}

export function filterRowsByKnownOwner(rows: TableRow[], userId: string, profileId?: string) {
  const identifiers = [userId, profileId].filter(Boolean);

  if (!identifiers.length) {
    return rows;
  }

  const ownerKeys = ["user_id", "profile_id", "created_by", "staff_id", "submitted_by"];

  return rows.filter((row) =>
    ownerKeys.some((key) => identifiers.includes(String(row[key] ?? ""))),
  );
}

export function filterRowsByKnownAssignee(
  rows: TableRow[],
  userId: string,
  profileId?: string,
) {
  const identifiers = [userId, profileId].filter(Boolean);
  const assigneeKeys = ["assigned_to", "assigned_user_id", "assigned_profile_id"];

  const assignedRows = rows.filter((row) =>
    assigneeKeys.some((key) => identifiers.includes(String(row[key] ?? ""))),
  );

  return assignedRows.length ? assignedRows : rows;
}

export function filterPublishedCirculars(rows: TableRow[]) {
  return rows.filter((row) => {
    const status = String(row.status ?? row.visibility ?? row.publish_status ?? "").toLowerCase();
    const isPublished = row.is_published;

    if (typeof isPublished === "boolean") {
      return isPublished;
    }

    if (!status) {
      return true;
    }

    return status === "published" || status === "active";
  });
}

export function filterRowsForScope(
  rows: TableRow[],
  role: UserRole,
  profile: Profile | null,
  userId: string,
  operationalBranchId?: string | null,
) {
  if (role === "super_admin" || role === "hr" || role === "operation") {
    return rows;
  }

  if (role === "branch_pic") {
    const branchId = String(operationalBranchId ?? profile?.branch_id ?? "");
    if (!branchId) {
      return rows;
    }

    return rows.filter((row) => String(row.branch_id ?? "") === branchId);
  }

  return rows.filter((row) => {
    const rowUserId = String(
      row.user_id ?? row.created_by ?? row.profile_id ?? row.staff_id ?? row.submitted_by ?? "",
    );
    return rowUserId === userId;
  });
}

export function getExpiryStatus(row: TableRow, field = "expiry_date"): ExpiryStatus {
  const statusValue = normalizeString(row.status ?? row.review_status ?? row.document_status);

  if (statusValue === "pending_review") {
    return {
      label: "pending_review",
      daysRemaining: daysUntil(row[field]),
    };
  }

  const remaining = daysUntil(row[field]);

  if (remaining === null) {
    return {
      label: "pending_review",
      daysRemaining: null,
    };
  }

  if (remaining < 0) {
    return {
      label: "expired",
      daysRemaining: remaining,
    };
  }

  if (remaining <= 60) {
    return {
      label: "expiring_soon",
      daysRemaining: remaining,
    };
  }

  return {
    label: "valid",
    daysRemaining: remaining,
  };
}

export function filterExpiringRows(rows: TableRow[], field = "expiry_date") {
  return rows.filter((row) => {
    const status = getExpiryStatus(row, field);
    return status.label === "expired" || status.label === "expiring_soon";
  });
}

export function countExpiringRows(rows: TableRow[], field = "expiry_date") {
  return filterExpiringRows(rows, field).length;
}

export function isStaffRecordIncomplete(row: TableRow) {
  const required = [row.full_name, row.phone, row.position, row.department, row.branch_id];
  return required.some((value) => !String(value ?? "").trim());
}

function countCompletedFields(values: unknown[]) {
  return values.filter((value) => String(value ?? "").trim()).length;
}

function compareDateLikeDesc(left: unknown, right: unknown) {
  const leftValue = String(left ?? "").trim();
  const rightValue = String(right ?? "").trim();

  if (!leftValue && !rightValue) {
    return 0;
  }

  if (!leftValue) {
    return 1;
  }

  if (!rightValue) {
    return -1;
  }

  return rightValue.localeCompare(leftValue);
}

export function choosePreferredStaffRow(rows: TableRow[]) {
  if (!rows.length) {
    return null;
  }

  return [...rows].sort((left, right) => {
    const leftActive = normalizeString(left.status) === "active" ? 1 : 0;
    const rightActive = normalizeString(right.status) === "active" ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftScore = countCompletedFields([
      left.full_name,
      left.ic_no,
      left.phone,
      left.email,
      left.address,
      left.emergency_contact_name,
      left.emergency_contact_phone,
      left.branch_id,
      left.position,
      left.department,
    ]);
    const rightScore = countCompletedFields([
      right.full_name,
      right.ic_no,
      right.phone,
      right.email,
      right.address,
      right.emergency_contact_name,
      right.emergency_contact_phone,
      right.branch_id,
      right.position,
      right.department,
    ]);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    const updatedOrder = compareDateLikeDesc(left.updated_at, right.updated_at);
    if (updatedOrder !== 0) {
      return updatedOrder;
    }

    const createdOrder = compareDateLikeDesc(left.created_at, right.created_at);
    if (createdOrder !== 0) {
      return createdOrder;
    }

    return String(right.id ?? "").localeCompare(String(left.id ?? ""));
  })[0] ?? null;
}

export function getMissingStaffEditableProfileFields(
  profile: Profile | null,
  staff: TableRow | null,
) {
  const missing: string[] = [];
  const fullName = String(staff?.full_name ?? profile?.full_name ?? "").trim();
  const phone = String(staff?.phone ?? "").trim();
  const icNo = String(staff?.ic_no ?? "").trim();
  const emergencyContactName = String(staff?.emergency_contact_name ?? "").trim();
  const emergencyContactPhone = String(staff?.emergency_contact_phone ?? "").trim();
  const address = String(staff?.address ?? "").trim();
  const avatarUrl = String(profile?.avatar_url ?? "").trim();

  if (!avatarUrl) {
    missing.push("Profile picture");
  }

  if (!fullName) {
    missing.push("Full name");
  }

  if (!phone) {
    missing.push("Phone number");
  }

  if (!icNo) {
    missing.push("IC / NRIC");
  }

  if (!emergencyContactName) {
    missing.push("Emergency contact name");
  }

  if (!emergencyContactPhone) {
    missing.push("Emergency contact phone");
  }

  if (!address) {
    missing.push("Address");
  }

  return missing;
}

export function isStaffEditableProfileIncomplete(
  profile: Profile | null,
  staff: TableRow | null,
) {
  return getMissingStaffEditableProfileFields(profile, staff).length > 0;
}

export function countTodayRoster(rows: TableRow[]) {
  const today = getMalaysiaDateString();
  return rows.filter((row) => String(row.roster_date ?? row.date ?? "").slice(0, 10) === today).length;
}

export function filterLeaveRequestsForRole(
  rows: TableRow[],
  role: UserRole,
  profile: Profile | null,
  userId: string,
  staffId?: string | null,
  operationalBranchId?: string | null,
) {
  if (role === "super_admin" || role === "hr") {
    return rows;
  }

  if (role === "branch_pic") {
    const branchId = String(operationalBranchId ?? profile?.branch_id ?? "");
    return rows.filter((row) => String(row.branch_id ?? "") === branchId);
  }

  return rows.filter((row) => {
    const rowProfileId = String(row.profile_id ?? row.submitted_by ?? "");
    const rowStaffId = String(row.staff_id ?? "");
    return rowProfileId === userId || (staffId ? rowStaffId === staffId : false);
  });
}

export function filterMcRequestsForRole(
  rows: TableRow[],
  role: UserRole,
  profile: Profile | null,
  userId: string,
  staffId?: string | null,
  operationalBranchId?: string | null,
) {
  const mcRows = rows.filter((row) => normalizeString(row.leave_type) === "medical_leave");
  return filterLeaveRequestsForRole(mcRows, role, profile, userId, staffId, operationalBranchId);
}

export function calculateApprovedLeaveUsage(rows: TableRow[]) {
  return rows.reduce<{ annual: number; medical: number; emergency: number; unpaid: number }>(
    (summary, row) => {
      if (normalizeString(row.status) !== "approved") {
        return summary;
      }

      const leaveType = normalizeString(row.leave_type);
      const totalDays = Number(row.total_days ?? 0) || calculateLeaveDays(
        String(row.start_date ?? ""),
        String(row.end_date ?? ""),
        row.half_day === true,
      );

      if (leaveType === "annual_leave") {
        summary.annual += totalDays;
      }

      if (leaveType === "medical_leave") {
        summary.medical += totalDays;
      }

      if (leaveType === "emergency_leave") {
        summary.emergency += totalDays;
      }

      if (leaveType === "unpaid_leave") {
        summary.unpaid += totalDays;
      }

      return summary;
    },
    { annual: 0, medical: 0, emergency: 0, unpaid: 0 },
  );
}

export function buildLeaveBalanceSummary(
  entitlement: TableRow | null,
  leaveRows: TableRow[],
): LeaveBalanceSummary {
  const usage = calculateApprovedLeaveUsage(leaveRows);
  const annualTotal = Number(entitlement?.annual_leave_total ?? 0);
  const annualOpening = Number(entitlement?.annual_leave_opening_used ?? 0);
  const medicalTotal = Number(entitlement?.medical_leave_total ?? 0);
  const medicalOpening = Number(entitlement?.medical_leave_opening_used ?? 0);

  return {
    annual: {
      total: annualTotal,
      used: annualOpening + usage.annual + usage.emergency,
      openingUsed: annualOpening,
      portalUsed: usage.annual,
      remaining: Math.max(annualTotal - annualOpening - usage.annual - usage.emergency, 0),
    },
    medical: {
      total: medicalTotal,
      used: medicalOpening + usage.medical,
      openingUsed: medicalOpening,
      portalUsed: usage.medical,
      remaining: Math.max(medicalTotal - medicalOpening - usage.medical, 0),
    },
    emergency: {
      total: usage.emergency,
      used: usage.emergency,
    },
    unpaid: {
      total: usage.unpaid,
      used: usage.unpaid,
    },
    entitlementYear: entitlement ? Number(entitlement.entitlement_year ?? null) : null,
    note: entitlement ? String(entitlement.opening_balance_note ?? "") || null : null,
  };
}

export function filterFeedbackForManageView(
  rows: TableRow[],
  role: UserRole,
  profile: Profile | null,
  userId: string,
  staffId?: string | null,
  operationalBranchId?: string | null,
) {
  if (role === "super_admin" || role === "hr") {
    return rows;
  }

  if (role === "operation") {
    return getOperationVisibleFeedback(rows, userId);
  }

  if (role === "branch_pic") {
    const branchId = String(operationalBranchId ?? profile?.branch_id ?? "");
    return rows.filter((row) => {
      const isBranch = String(row.branch_id ?? "") === branchId;
      const anonymous = row.is_anonymous === true;
      return isBranch && !anonymous;
    });
  }

  return rows.filter((row) => {
    const submittedBy = String(row.submitted_by ?? "");
    const targetStaffId = String(row.target_staff_id ?? "");
    return submittedBy === userId || (staffId ? targetStaffId === staffId : false);
  });
}

const OPERATIONAL_FEEDBACK_CATEGORIES = [
  "operation",
  "system",
  "facility",
  "roster",
  "equipment",
  "branch operation",
  "maintenance",
];

const OPERATION_CONFIDENTIAL_KEYWORDS = [
  "disciplinary",
  "discipline",
  "salary",
  "payroll",
  "leave approval note",
  "hr confidential",
  "confidential hr",
  "harassment",
  "bully",
  "bullying",
  "misconduct",
  "staff complaint",
  "complaint staff",
];

export function isOperationRestrictedFeedback(row: TableRow) {
  const targetType = normalizeString(row.target_type);
  const category = normalizeString(row.category);
  const haystack = [
    row.category,
    row.title,
    row.message,
    row.expected_action,
    row.portal_area,
    row.review_note,
  ]
    .map((value) => normalizeString(value))
    .join(" ");

  if (targetType === "hr") {
    return true;
  }

  if (targetType === "staff" && category !== "system") {
    return true;
  }

  return OPERATION_CONFIDENTIAL_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function isOperationVisibleFeedback(row: TableRow, profileId: string) {
  if (isOperationRestrictedFeedback(row)) {
    return false;
  }

  const category = normalizeString(row.category);
  const targetType = normalizeString(row.target_type);
  const assignedDepartment = normalizeString(row.assigned_department);
  const assignedTo = String(row.assigned_to ?? "");
  const haystack = [
    row.category,
    row.title,
    row.message,
    row.portal_area,
    row.expected_action,
    row.assigned_department,
    row.target_type,
  ]
    .map((value) => normalizeString(value))
    .join(" ");

  const keywordMatch = [
    "operation",
    "system",
    "facility",
    "roster",
    "equipment",
    "branch operation",
    "maintenance",
  ].some((keyword) => haystack.includes(keyword));

  return (
    assignedTo === profileId ||
    assignedDepartment === "operation" ||
    targetType === "operation" ||
    OPERATIONAL_FEEDBACK_CATEGORIES.includes(category) ||
    keywordMatch
  );
}

export function getOperationVisibleFeedback(rows: TableRow[], profileId: string) {
  return rows.filter((row) => isOperationVisibleFeedback(row, profileId));
}

export function filterNotificationsForUser(rows: TableRow[], profileId: string) {
  return rows.filter((row) => String(row.recipient_profile_id ?? "") === profileId);
}

export function countUnreadNotifications(rows: TableRow[], profileId: string) {
  return filterNotificationsForUser(rows, profileId).filter((row) => row.is_read !== true).length;
}

export function getNextHoliday(rows: TableRow[], branchId?: string | null) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const candidates = rows
    .filter((row) => {
      const holidayDate = new Date(String(row.holiday_date ?? ""));
      if (Number.isNaN(holidayDate.getTime())) {
        return false;
      }
      holidayDate.setHours(0, 0, 0, 0);
      const matchesBranch = !row.branch_id || String(row.branch_id) === String(branchId ?? "");
      return holidayDate >= today && matchesBranch;
    })
    .sort((left, right) => String(left.holiday_date ?? "").localeCompare(String(right.holiday_date ?? "")));

  return candidates[0] ?? null;
}

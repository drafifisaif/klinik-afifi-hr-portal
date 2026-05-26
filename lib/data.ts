import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Profile, TableRow, UserRole } from "@/lib/types";
import { daysUntil, normalizeString } from "@/lib/utils";

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

  const ownerKeys = ["user_id", "profile_id", "created_by", "staff_id"];

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
) {
  if (role === "super_admin" || role === "hr" || role === "operation") {
    return rows;
  }

  if (role === "branch_pic") {
    if (!profile?.branch_id) {
      return rows;
    }

    return rows.filter((row) => String(row.branch_id ?? "") === String(profile.branch_id));
  }

  return rows.filter((row) => {
    const rowUserId = String(row.user_id ?? row.created_by ?? row.profile_id ?? row.staff_id ?? "");
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

export function countTodayRoster(rows: TableRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter((row) => String(row.roster_date ?? row.date ?? "").slice(0, 10) === today).length;
}

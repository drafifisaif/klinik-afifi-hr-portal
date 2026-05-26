import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { TableRow } from "@/lib/types";

export interface QueryResult {
  rows: TableRow[];
  error: string | null;
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

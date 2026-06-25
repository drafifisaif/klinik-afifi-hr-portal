import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRole } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LeaveBalanceSummary, Profile, TableRow, UserRole } from "@/lib/types";
import { buildLeaveBalanceSummary, choosePreferredStaffRow } from "@/lib/data";

export async function getCurrentUserContext() {
  const supabase = await createClient();

  if (!supabase) {
    return {
      supabase: null,
      user: null,
      profile: null,
      staff: null,
      role: "staff" as UserRole,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      staff: null,
      role: "staff" as UserRole,
    };
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileData
    ? ({
        ...profileData,
        email: user.email ?? profileData.email ?? null,
        role: normalizeRole(profileData.role),
      } as Profile)
    : ({
        id: user.id,
        email: user.email ?? null,
        full_name: user.user_metadata.full_name ?? null,
        role: "staff",
      } as Profile);

  const { data: staffRows, error: staffLookupError } = await supabase
    .from("staff")
    .select("*")
    .eq("profile_id", user.id)
    .limit(2);

  if (staffLookupError) {
    console.error("[workflows] staff lookup failed for current user", {
      userId: user.id,
      error: staffLookupError,
    });
  }

  if ((staffRows ?? []).length > 1) {
    console.error("[workflows] duplicate staff rows detected for current user profile", {
      userId: user.id,
      staffIds: (staffRows ?? []).map((row) => row.id),
    });
  }

  const staffData = choosePreferredStaffRow((staffRows ?? []) as TableRow[]);

  return {
    supabase,
    user,
    profile,
    staff: staffData,
    role: normalizeRole(profile.role),
  };
}

export async function fetchLinkedProfileAndStaff(supabase: SupabaseClient, profileId: string) {
  const [{ data: profileData }, staffResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("staff").select("*").eq("profile_id", profileId).limit(2),
  ]);

  if (staffResult.error) {
    console.error("[workflows] linked staff lookup failed", {
      profileId,
      error: staffResult.error,
    });
  }

  if ((staffResult.data ?? []).length > 1) {
    console.error("[workflows] duplicate linked staff rows detected", {
      profileId,
      staffIds: (staffResult.data ?? []).map((row) => row.id),
    });
  }

  return {
    profile: (profileData as Profile | null) ?? null,
    staff: choosePreferredStaffRow((staffResult.data ?? []) as TableRow[]),
  };
}

export async function syncStaffProfileBranch(
  supabase: SupabaseClient | null,
  staffId: string,
) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase is not configured.",
      profileId: null,
      branchId: null,
    };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id, profile_id, branch_id")
    .eq("id", staffId)
    .maybeSingle();

  if (staffError) {
    return {
      success: false,
      error: staffError.message,
      profileId: null,
      branchId: null,
    };
  }

  if (!staffRow) {
    return {
      success: false,
      error: "Staff record not found.",
      profileId: null,
      branchId: null,
    };
  }

  const profileId = String(staffRow.profile_id ?? "").trim();
  if (!profileId) {
    return {
      success: false,
      error: "Linked profile is missing for this staff record.",
      profileId: null,
      branchId: String(staffRow.branch_id ?? "").trim() || null,
    };
  }

  const branchId = String(staffRow.branch_id ?? "").trim() || null;
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      branch_id: branchId,
    })
    .eq("id", profileId);

  if (profileError) {
    return {
      success: false,
      error: profileError.message,
      profileId,
      branchId,
    };
  }

  return {
    success: true,
    error: null,
    profileId,
    branchId,
  };
}

export async function fetchLatestLeaveEntitlement(
  supabase: SupabaseClient | null,
  staffId?: string | null,
) {
  if (!supabase || !staffId) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  const preferred = await supabase
    .from("leave_entitlements")
    .select("*")
    .eq("staff_id", staffId)
    .eq("entitlement_year", currentYear)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (preferred.data) {
    return preferred.data as TableRow;
  }

  const fallback = await supabase
    .from("leave_entitlements")
    .select("*")
    .eq("staff_id", staffId)
    .order("entitlement_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (fallback.data as TableRow | null) ?? null;
}

export async function fetchLeaveBalance(
  supabase: SupabaseClient | null,
  staffId?: string | null,
  profileId?: string | null,
): Promise<LeaveBalanceSummary> {
  if (!supabase || !staffId) {
    return buildLeaveBalanceSummary(null, []);
  }

  const entitlement = await fetchLatestLeaveEntitlement(supabase, staffId);
  const leaveRowsResult = await supabase
    .from("leave_requests")
    .select("*")
    .eq("staff_id", staffId);

  const leaveRows = (leaveRowsResult.data as TableRow[] | null) ?? [];
  const scopedLeaveRows = profileId
    ? leaveRows.filter((row) => String(row.profile_id ?? profileId) === profileId || String(row.staff_id ?? "") === staffId)
    : leaveRows;

  return buildLeaveBalanceSummary(entitlement, scopedLeaveRows);
}

export async function createNotificationRows(
  supabase: SupabaseClient | null,
  payloads: TableRow[],
) {
  if (!supabase || !payloads.length) {
    return;
  }

  // TODO: integrate Resend/SMTP worker to send pending notification emails asynchronously.
  await supabase.from("notifications").insert(payloads);
}

export async function resolveFeedbackRecipients(
  supabase: SupabaseClient | null,
  targetType: string,
  targetStaffId?: string | null,
) {
  if (!supabase) {
    return [] as TableRow[];
  }

  const recipients: TableRow[] = [];

  if (targetType === "staff" && targetStaffId) {
    const { data: targetStaff } = await supabase
      .from("staff")
      .select("profile_id, email, full_name")
      .eq("id", targetStaffId)
      .maybeSingle();

    if (targetStaff?.profile_id) {
      recipients.push(targetStaff as TableRow);
    }

    return recipients;
  }

  const roleNames =
    targetType === "hr" || targetType === "portal_system"
      ? ["hr", "super_admin"]
      : targetType === "operation"
        ? ["operation", "super_admin"]
        : [];

  if (!roleNames.length) {
    return recipients;
  }

  const { data: matchingProfiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("role", roleNames);

  return (matchingProfiles as TableRow[] | null) ?? [];
}

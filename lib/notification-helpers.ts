import type { SupabaseClient } from "@supabase/supabase-js";

import type { Profile, TableRow } from "@/lib/types";
import { normalizeString } from "@/lib/utils";

export async function resolveFeedbackNotificationRecipients(
  supabase: SupabaseClient,
  options: {
    targetType: string;
    targetStaffId?: string | null;
    submitterProfileId?: string | null;
    assignedTo?: string | null;
    sourceProfile?: Profile | null;
  },
) {
  const recipientMap = new Map<string, { profile_id: string; email: string | null }>();

  function addRecipient(profileId: string | null | undefined, email?: string | null) {
    if (!profileId) {
      return;
    }

    recipientMap.set(profileId, {
      profile_id: profileId,
      email: email ?? null,
    });
  }

  if (options.targetType === "staff" && options.targetStaffId) {
    const { data: targetStaff } = await supabase
      .from("staff")
      .select("profile_id, email")
      .eq("id", options.targetStaffId)
      .maybeSingle();

    addRecipient(String(targetStaff?.profile_id ?? "") || null, (targetStaff?.email as string | null) ?? null);
  }

  const normalizedType = normalizeString(options.targetType);
  if (["hr", "portal_system", "operation"].includes(normalizedType)) {
    const roles =
      normalizedType === "operation"
        ? ["operation", "super_admin"]
        : ["hr", "super_admin"];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("role", roles);

    (profiles ?? []).forEach((profile) => {
      addRecipient(String(profile.id), (profile.email as string | null) ?? null);
    });
  }

  addRecipient(options.submitterProfileId ?? null);
  addRecipient(options.assignedTo ?? null);

  if (options.sourceProfile?.id) {
    recipientMap.delete(options.sourceProfile.id);
  }

  return [...recipientMap.values()];
}

export async function insertNotificationRows(
  supabase: SupabaseClient | null,
  rows: TableRow[],
) {
  if (!supabase || !rows.length) {
    return;
  }

  // TODO: wire a background worker for Resend/SMTP delivery and transition email_status from pending.
  await supabase.from("notifications").insert(rows);
}

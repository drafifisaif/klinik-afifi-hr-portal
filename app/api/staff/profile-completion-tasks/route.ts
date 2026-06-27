import { NextResponse } from "next/server";

import {
  choosePreferredStaffRow,
  getMissingStaffEditableProfileFields,
} from "@/lib/data";
import { insertNotificationRows } from "@/lib/notification-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TableRow } from "@/lib/types";

const PROFILE_COMPLETION_TITLE = "Lengkapkan Profil HR Portal";
const PROFILE_COMPLETION_MESSAGE = `Sila lengkapkan maklumat profil anda di HR Portal melalui menu My Profile.

Pastikan maklumat berikut dikemaskini:

* gambar profil
* nombor telefon
* nombor IC / NRIC jika belum lengkap
* nama dan nombor telefon waris kecemasan
* alamat terkini

Maklumat ini diperlukan untuk urusan HR, cuti, MC, komunikasi dalaman dan rekod staff.

Sila lengkapkan secepat mungkin.`;

function isActiveStaffRow(row: TableRow) {
  const normalizedStatus = String(row.status ?? "active").trim().toLowerCase();
  return normalizedStatus !== "inactive" && normalizedStatus !== "resigned";
}

function hasOpenProfileCompletionTask(row: TableRow) {
  const category = String(row.category ?? "").trim().toLowerCase();
  const status = String(row.status ?? "").trim().toLowerCase();

  return category === "profile_completion" && !["closed", "resolved", "completed"].includes(status);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  if (!supabase || !adminClient) {
    return NextResponse.json(
      { error: "Profile completion bulk task requires server-side Supabase admin configuration." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: actingProfile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const actingRole = String(actingProfile?.role ?? "");

  if (!["hr", "super_admin", "operation"].includes(actingRole)) {
    return NextResponse.json({ error: "This bulk action is restricted to HR, Operation Manager, and Super Admin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    staffIds?: string[];
  } | null;

  const requestedStaffIds = Array.from(
    new Set(
      (body?.staffIds ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (!requestedStaffIds.length) {
    return NextResponse.json({ error: "No staff selected for the profile completion task bulk action." }, { status: 400 });
  }

  const { data: actingStaffRows, error: actingStaffError } = await adminClient
    .from("staff")
    .select("*")
    .eq("profile_id", user.id)
    .limit(5);

  if (actingStaffError) {
    return NextResponse.json({ error: actingStaffError.message }, { status: 400 });
  }

  const actingStaff = choosePreferredStaffRow((actingStaffRows ?? []) as TableRow[]);
  const actingBranchId = String(actingStaff?.branch_id ?? actingProfile?.branch_id ?? "");

  const { data: targetStaffRows, error: targetStaffError } = await adminClient
    .from("staff")
    .select("*")
    .in("id", requestedStaffIds)
    .limit(Math.max(requestedStaffIds.length, 1));

  if (targetStaffError) {
    return NextResponse.json({ error: targetStaffError.message }, { status: 400 });
  }

  const targetStaff = ((targetStaffRows ?? []) as TableRow[]).filter((row) => isActiveStaffRow(row));

  if (actingRole === "branch_pic") {
    const outOfScopeRow = targetStaff.find((row) => String(row.branch_id ?? "") !== actingBranchId);
    if (outOfScopeRow) {
      return NextResponse.json({ error: "Branch PIC can only send profile tasks to staff within their own branch." }, { status: 403 });
    }
  }

  const targetProfileIds = Array.from(
    new Set(
      targetStaff
        .map((row) => String(row.profile_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  const [{ data: targetProfiles, error: targetProfilesError }, { data: existingFeedbackRows, error: feedbackError }] = await Promise.all([
    targetProfileIds.length
      ? adminClient.from("profiles").select("*").in("id", targetProfileIds)
      : Promise.resolve({ data: [], error: null }),
    adminClient
      .from("feedbacks")
      .select("*")
      .eq("category", "profile_completion")
      .in("target_staff_id", requestedStaffIds)
      .limit(1000),
  ]);

  if (targetProfilesError || feedbackError) {
    return NextResponse.json({ error: targetProfilesError?.message ?? feedbackError?.message ?? "Unable to prepare profile completion tasks." }, { status: 400 });
  }

  const profileMap = new Map<string, Profile>(
    ((targetProfiles ?? []) as Profile[]).map((row) => [String(row.id), row]),
  );

  const existingTaskStaffIds = new Set(
    ((existingFeedbackRows ?? []) as TableRow[])
      .filter(hasOpenProfileCompletionTask)
      .map((row) => String(row.target_staff_id ?? "").trim())
      .filter(Boolean),
  );

  let totalIncomplete = 0;
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const staffRow of targetStaff) {
    const targetProfile = profileMap.get(String(staffRow.profile_id ?? "")) ?? null;
    const missingFields = getMissingStaffEditableProfileFields(targetProfile, staffRow);

    if (!missingFields.length) {
      continue;
    }

    totalIncomplete += 1;

    const targetStaffId = String(staffRow.id ?? "").trim();
    if (!targetStaffId) {
      failed += 1;
      continue;
    }

    if (existingTaskStaffIds.has(targetStaffId)) {
      skippedExisting += 1;
      continue;
    }

    const insertPayload = {
      title: PROFILE_COMPLETION_TITLE,
      category: "profile_completion",
      message: PROFILE_COMPLETION_MESSAGE,
      target_type: "staff",
      target_staff_id: targetStaffId,
      expected_action: "Complete your My Profile details in the HR Portal.",
      priority: "normal",
      submitted_by: user.id,
      staff_id: actingStaff?.id ?? null,
      branch_id: staffRow.branch_id ?? targetProfile?.branch_id ?? null,
      source_type: actingRole,
      assigned_department: "hr",
      assigned_to: targetProfile?.id ?? null,
      status: "new",
    };

    const { data: insertedFeedback, error: insertError } = await adminClient
      .from("feedbacks")
      .insert(insertPayload)
      .select("id")
      .maybeSingle();

    if (insertError || !insertedFeedback?.id) {
      console.error("Profile completion feedback insert failed", {
        targetStaffId,
        profileId: targetProfile?.id ?? null,
        code: insertError?.code ?? null,
        message: insertError?.message ?? null,
        details: insertError?.details ?? null,
        hint: insertError?.hint ?? null,
      });
      failed += 1;
      continue;
    }

    created += 1;
    existingTaskStaffIds.add(targetStaffId);

    if (targetProfile?.id) {
      await insertNotificationRows(adminClient, [
        {
          recipient_profile_id: targetProfile.id,
          recipient_email: targetProfile.email ?? staffRow.email ?? null,
          title: PROFILE_COMPLETION_TITLE,
          message: "Sila lengkapkan profil anda melalui menu My Profile.",
          type: "feedback_new",
          related_table: "feedbacks",
          related_id: insertedFeedback.id,
          email_status: "pending",
          is_read: false,
        },
      ]);
    }
  }

  return NextResponse.json({
    totalIncomplete,
    created,
    skippedExisting,
    failed,
  });
}

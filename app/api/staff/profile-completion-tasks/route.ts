import { NextResponse } from "next/server";

import {
  choosePreferredStaffRow,
  getMissingStaffEditableProfileFields,
} from "@/lib/data";
import { deliverFeedbackNotifications, type FeedbackEmailAttemptResult } from "@/lib/feedback-email";
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
    resendForStaffId?: string | null;
  } | null;

  const requestedStaffIds = Array.from(
    new Set(
      ([...(body?.staffIds ?? []), ...(body?.resendForStaffId ? [body.resendForStaffId] : [])] as string[])
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
  let notificationsCreated = 0;
  let emailsSent = 0;
  let emailsSuppressed = 0;
  let emailsFailed = 0;
  let noEmail = 0;
  const recipientResults: FeedbackEmailAttemptResult[] = [];

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

    const existingTask = ((existingFeedbackRows ?? []) as TableRow[])
      .filter(hasOpenProfileCompletionTask)
      .find((row) => String(row.target_staff_id ?? "").trim() === targetStaffId) ?? null;

    if (existingTask && !body?.resendForStaffId) {
      skippedExisting += 1;
      recipientResults.push({
        staffId: targetStaffId,
        profileId: targetProfile?.id ?? null,
        staffName: String(staffRow.full_name ?? staffRow.email ?? "Unknown Staff"),
        email: String(staffRow.email ?? targetProfile?.email ?? "").trim() || null,
        feedbackId: String(existingTask.id ?? ""),
        taskCreated: false,
        notificationCreated: false,
        notificationStatus: "failed",
        emailStatus: "skipped_duplicate",
        resendEmailId: null,
        errorMessage: "Existing open profile completion task already found.",
        logCreated: false,
      });
      continue;
    }

    let feedbackId = String(existingTask?.id ?? "").trim();
    let taskCreated = false;

    if (!existingTask) {
      const insertPayload = {
        title: PROFILE_COMPLETION_TITLE,
        category: "profile_completion",
        message: PROFILE_COMPLETION_MESSAGE,
        target_type: "staff",
        target_staff_id: targetStaffId,
        expected_action: "Sila login ke HR Portal dan lengkapkan profil anda melalui menu My Profile.",
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
        recipientResults.push({
          staffId: targetStaffId,
          profileId: targetProfile?.id ?? null,
          staffName: String(staffRow.full_name ?? staffRow.email ?? "Unknown Staff"),
          email: String(staffRow.email ?? targetProfile?.email ?? "").trim() || null,
          feedbackId: "",
          taskCreated: false,
          notificationCreated: false,
          notificationStatus: "failed",
          emailStatus: "failed",
          resendEmailId: null,
          errorMessage: insertError?.message ?? "Unable to create feedback task.",
          logCreated: false,
        });
        continue;
      }

      feedbackId = String(insertedFeedback.id);
      created += 1;
      taskCreated = true;
      existingTaskStaffIds.add(targetStaffId);
    }

    const delivery = await deliverFeedbackNotifications({
      feedbackId,
      eventType: taskCreated ? "feedback_new" : "feedback_assignment",
      actorProfileId: user.id,
      createInAppNotification: !body?.resendForStaffId,
      taskCreated,
    });

    notificationsCreated += delivery.counts.notificationsCreated;
    emailsSent += delivery.counts.emailsSent;
    emailsSuppressed += delivery.counts.emailsSuppressed;
    emailsFailed += delivery.counts.emailsFailed;
    noEmail += delivery.counts.noEmail;

    if (!delivery.results.length) {
      recipientResults.push({
        staffId: targetStaffId,
        profileId: targetProfile?.id ?? null,
        staffName: String(staffRow.full_name ?? staffRow.email ?? "Unknown Staff"),
        email: String(staffRow.email ?? targetProfile?.email ?? "").trim() || null,
        feedbackId,
        taskCreated,
        notificationCreated: false,
        notificationStatus: "failed",
        emailStatus: "failed",
        resendEmailId: null,
        errorMessage: "No delivery result returned for the targeted staff.",
        logCreated: false,
      });
      continue;
    }

    recipientResults.push(
      ...delivery.results.filter((row) => String(row.staffId ?? "") === targetStaffId),
    );
  }

  return NextResponse.json({
    totalIncomplete,
    created,
    skippedExisting,
    failed,
    notificationsCreated,
    emailsSent,
    emailsSuppressed,
    emailsFailed,
    noEmail,
    results: recipientResults,
  });
}

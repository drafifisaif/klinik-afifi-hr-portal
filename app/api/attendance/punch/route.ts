import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { calculateDistanceMeters, getMalaysiaDateString } from "@/lib/utils";

function combineDateAndTime(date: string, timeValue?: string | null) {
  const time = String(timeValue ?? "").trim().slice(0, 5);
  if (!date || !time) {
    return null;
  }

  return `${date}T${time}:00`;
}

function parseIso(value: unknown, referenceDate?: Date | null) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hours, minutes, seconds = "00"] = text.split(":");
    const base = referenceDate ? new Date(referenceDate) : new Date();
    base.setHours(Number(hours), Number(minutes), Number(seconds), 0);
    return Number.isNaN(base.getTime()) ? null : base;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeLateMinutes(checkInAt: unknown, scheduledStart: unknown, graceMinutes: number) {
  const checkIn = parseIso(checkInAt);
  const scheduled = parseIso(scheduledStart, checkIn);
  if (!checkIn || !scheduled) {
    return 0;
  }

  return Math.max(0, Math.round((checkIn.getTime() - scheduled.getTime()) / 60000) - graceMinutes);
}

function computeEarlyLeaveMinutes(checkOutAt: unknown, scheduledEnd: unknown, graceMinutes: number) {
  const checkOut = parseIso(checkOutAt);
  const scheduled = parseIso(scheduledEnd, checkOut);
  if (!checkOut || !scheduled) {
    return 0;
  }

  const diffMinutes = Math.round((scheduled.getTime() - checkOut.getTime()) / 60000);
  return diffMinutes > graceMinutes ? diffMinutes : 0;
}

function computeAttendanceStatus(record: Record<string, unknown> | null, graceMinutes: number) {
  if (!record) {
    return "not_punched_in";
  }

  const lateMinutes = Number(record.late_minutes ?? computeLateMinutes(record.check_in_at, record.scheduled_start, graceMinutes));
  if (record.check_in_at && record.check_out_at) {
    return lateMinutes > 0 ? "late" : "present";
  }

  if (record.check_in_at) {
    return lateMinutes > 0 ? "late" : "incomplete";
  }

  return "not_punched_in";
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

function getLocationMessage(status: string) {
  if (status === "verified_location") {
    return "Location verified.";
  }

  if (status === "outside_location") {
    return "Location recorded outside branch radius.";
  }

  if (status === "permission_denied") {
    return "Location permission denied.";
  }

  return "Location unavailable.";
}

interface PunchLocationPayload {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  status?: "verified_location" | "outside_location" | "location_unavailable" | "permission_denied" | "captured";
}

interface OffsitePayload {
  isOffsite?: boolean;
  note?: string | null;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: "in" | "out";
    location?: PunchLocationPayload | null;
    offsite?: OffsitePayload | null;
  } | null;
  const action = body?.action;

  if (action !== "in" && action !== "out") {
    return NextResponse.json({ error: "Invalid punch action." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: staff } = await supabase.from("staff").select("*").eq("profile_id", user.id).maybeSingle();

  if (!staff?.id) {
    return NextResponse.json({ error: "Linked staff profile is required before using attendance." }, { status: 400 });
  }

  const locationPayload = body?.location ?? null;
  const offsitePayload = body?.offsite ?? null;

  if (offsitePayload?.isOffsite && !String(offsitePayload.note ?? "").trim()) {
    return NextResponse.json({ error: "Offsite note is required." }, { status: 400 });
  }

  const today = getMalaysiaDateString();
  const timestamp = new Date().toISOString();
  const clientIp = getRequestIp(request);

  const { data: roster } = await supabase
    .from("rosters")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("roster_date", today)
    .maybeSingle();

  const shiftTemplateId = String(roster?.shift_template_id ?? "");
  const { data: shiftTemplate } = shiftTemplateId
    ? await supabase.from("shift_templates").select("*").eq("id", shiftTemplateId).maybeSingle()
    : { data: null };

  const branchId = String(staff.branch_id ?? profile?.branch_id ?? "");
  const { data: branch } = branchId
    ? await supabase.from("branches").select("*").eq("id", branchId).maybeSingle()
    : { data: null };
  const { data: branchSetting } = await supabase
    .from("attendance_settings")
    .select("*")
    .eq("branch_id", branchId)
    .maybeSingle();
  const { data: globalSetting } = branchSetting
    ? { data: null }
    : await supabase.from("attendance_settings").select("*").is("branch_id", null).maybeSingle();

  const activeSetting = branchSetting ?? globalSetting ?? null;
  const graceMinutes = Number(activeSetting?.grace_minutes ?? 10) || 10;
  const earlyLeaveGraceMinutes = Number(activeSetting?.early_leave_grace_minutes ?? 10) || 10;

  const branchLatitude = toNumberOrNull(branch?.latitude);
  const branchLongitude = toNumberOrNull(branch?.longitude);
  const branchRadiusMeters = Number(branch?.gps_radius_meters ?? 300) || 300;
  const branchGpsIsActive = branch?.gps_is_active !== false;
  const locationLatitude = toNumberOrNull(locationPayload?.latitude);
  const locationLongitude = toNumberOrNull(locationPayload?.longitude);
  const incomingLocationStatus = String(locationPayload?.status ?? "").trim();

  let resolvedLocationStatus = "location_unavailable";
  let resolvedDistanceMeters: number | null = null;

  if (incomingLocationStatus === "permission_denied") {
    resolvedLocationStatus = "permission_denied";
  } else if (branchGpsIsActive && locationLatitude !== null && locationLongitude !== null && branchLatitude !== null && branchLongitude !== null) {
    resolvedDistanceMeters = calculateDistanceMeters(
      branchLatitude,
      branchLongitude,
      locationLatitude,
      locationLongitude,
    );
    resolvedLocationStatus = resolvedDistanceMeters <= branchRadiusMeters ? "verified_location" : "outside_location";
  } else {
    resolvedLocationStatus = "location_unavailable";
  }

  const scheduledStart = combineDateAndTime(today, String(roster?.custom_start_time ?? shiftTemplate?.start_time ?? ""));
  const scheduledEnd = combineDateAndTime(today, String(roster?.custom_end_time ?? shiftTemplate?.end_time ?? ""));

  const { data: existingRecord } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("attendance_date", today)
    .maybeSingle();

  if (action === "in") {
    const lateMinutes = computeLateMinutes(existingRecord?.check_in_at ?? timestamp, existingRecord?.scheduled_start ?? scheduledStart, graceMinutes);
    const payload = {
      profile_id: user.id,
      staff_id: staff.id,
      branch_id: staff.branch_id ?? profile?.branch_id ?? null,
      attendance_date: today,
      roster_id: roster?.id ?? null,
      check_in_at: existingRecord?.check_in_at ?? timestamp,
      check_in_ip: clientIp,
      check_in_network_status: existingRecord?.check_in_network_status ?? null,
      check_in_latitude: locationLatitude,
      check_in_longitude: locationLongitude,
      check_in_distance_meters: resolvedDistanceMeters,
      check_in_location_status: resolvedLocationStatus,
      check_in_is_offsite: offsitePayload?.isOffsite === true,
      late_minutes: Number(existingRecord?.late_minutes ?? lateMinutes),
      early_leave_minutes: Number(existingRecord?.early_leave_minutes ?? 0),
      offsite_note: (offsitePayload?.note?.trim() || existingRecord?.offsite_note) ?? null,
      status: computeAttendanceStatus(
        {
          ...existingRecord,
          check_in_at: existingRecord?.check_in_at ?? timestamp,
          scheduled_start: existingRecord?.scheduled_start ?? scheduledStart,
          late_minutes: Number(existingRecord?.late_minutes ?? lateMinutes),
        },
        graceMinutes,
      ),
    };

    const result = existingRecord?.id
      ? await supabase.from("attendance_records").update(payload).eq("id", existingRecord.id)
      : await supabase.from("attendance_records").insert(payload);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `${roster ? "Punch in recorded." : "Punch in recorded. Roster belum diset untuk hari ini."}${lateMinutes > 0 ? ` Late by ${lateMinutes} minutes.` : ""} ${getLocationMessage(resolvedLocationStatus)}`,
      locationStatus: resolvedLocationStatus,
      distanceMeters: resolvedDistanceMeters,
      ip: clientIp,
    });
  }

  if (!existingRecord?.id) {
    return NextResponse.json({ error: "Punch in is required before punching out." }, { status: 400 });
  }

  const lateMinutes = Number(existingRecord.late_minutes ?? computeLateMinutes(existingRecord.check_in_at, existingRecord.scheduled_start ?? scheduledStart, graceMinutes));
  const earlyLeaveMinutes = Number(existingRecord.early_leave_minutes ?? computeEarlyLeaveMinutes(timestamp, existingRecord.scheduled_end ?? scheduledEnd, earlyLeaveGraceMinutes));
  const status = computeAttendanceStatus(
    {
      ...existingRecord,
      check_out_at: timestamp,
    },
    graceMinutes,
  );

  const updateResult = await supabase
    .from("attendance_records")
    .update({
      check_out_at: timestamp,
      check_out_ip: clientIp,
      check_out_network_status: existingRecord.check_out_network_status ?? null,
      check_out_latitude: locationLatitude,
      check_out_longitude: locationLongitude,
      check_out_distance_meters: resolvedDistanceMeters,
      check_out_location_status: resolvedLocationStatus,
      check_out_is_offsite: offsitePayload?.isOffsite === true,
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      offsite_note: (offsitePayload?.note?.trim() || existingRecord.offsite_note) ?? null,
      status: status === "incomplete" ? "present" : status,
    })
    .eq("id", existingRecord.id);

  if (updateResult.error) {
    return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: `${roster ? "Punch out recorded." : "Punch out recorded. Roster belum diset untuk hari ini."}${lateMinutes > 0 ? ` Late by ${lateMinutes} minutes.` : ""}${earlyLeaveMinutes > 0 ? ` Early leave by ${earlyLeaveMinutes} minutes.` : ""} ${getLocationMessage(resolvedLocationStatus)}`,
    locationStatus: resolvedLocationStatus,
    distanceMeters: resolvedDistanceMeters,
    ip: clientIp,
  });
}

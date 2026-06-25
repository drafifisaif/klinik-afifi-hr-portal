import { NextResponse } from "next/server";

import { choosePreferredStaffRow } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TableRow } from "@/lib/types";

type ProfileUpdateBody = {
  full_name?: string;
  email?: string;
  ic_no?: string;
  phone?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  avatar_url?: string | null;
  branch_id?: string | null;
  position?: string | null;
  department?: string | null;
  status?: string | null;
  role?: string | null;
};

function toNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function logProfileUpdateError(
  context: string,
  {
    profileId,
    staffId,
    payloadKeys,
    error,
  }: {
    profileId: string;
    staffId?: string | null;
    payloadKeys: string[];
    error: unknown;
  },
) {
  const typedError = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  console.error("[api/profile/update]", {
    context,
    profileId,
    staffId: staffId ?? null,
    payloadKeys,
    code: typedError?.code ?? null,
    message: typedError?.message ?? String(error ?? ""),
    details: typedError?.details ?? null,
    hint: typedError?.hint ?? null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const client = adminClient ?? supabase;
  const body = (await request.json().catch(() => null)) as ProfileUpdateBody | null;

  const profileId = String(user.id ?? "").trim();
  if (!profileId) {
    return NextResponse.json({ error: "Profile ID is missing." }, { status: 400 });
  }

  const profilePayload = {
    full_name: toNullableString(body?.full_name),
    email: toNullableString(body?.email),
    avatar_url: typeof body?.avatar_url === "string" ? toNullableString(body.avatar_url) : body?.avatar_url ?? null,
  };

  const staffPayload = {
    profile_id: profileId,
    full_name: toNullableString(body?.full_name),
    email: toNullableString(body?.email),
    ic_no: toNullableString(body?.ic_no),
    phone: toNullableString(body?.phone),
    address: toNullableString(body?.address),
    emergency_contact_name: toNullableString(body?.emergency_contact_name),
    emergency_contact_phone: toNullableString(body?.emergency_contact_phone),
  };

  const { data: profileRow, error: profileLookupError } = await client
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (profileLookupError) {
    logProfileUpdateError("profile lookup failed", {
      profileId,
      payloadKeys: Object.keys(profilePayload),
      error: profileLookupError,
    });
    return NextResponse.json({ error: "Profile could not be updated. Please contact HR/admin if this continues." }, { status: 500 });
  }

  const { data: staffRows, error: staffLookupError } = await client
    .from("staff")
    .select("*")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (staffLookupError) {
    logProfileUpdateError("staff lookup failed", {
      profileId,
      payloadKeys: Object.keys(staffPayload),
      error: staffLookupError,
    });
    return NextResponse.json({ error: "Profile could not be updated. Please contact HR/admin if this continues." }, { status: 500 });
  }

  const linkedStaff = choosePreferredStaffRow((staffRows ?? []) as TableRow[]);
  const linkedStaffId = String(linkedStaff?.id ?? "").trim() || null;
  const requesterRole = String(profileRow?.role ?? "").trim().toLowerCase();
  const canManageExtended = requesterRole === "hr" || requesterRole === "super_admin";

  const extendedProfilePayload = canManageExtended
    ? {
        ...profilePayload,
        role: toNullableString(body?.role) ?? String(profileRow?.role ?? "staff"),
        branch_id: typeof body?.branch_id === "string" ? toNullableString(body.branch_id) : body?.branch_id ?? null,
      }
    : profilePayload;

  const extendedStaffPayload = canManageExtended
    ? {
        ...staffPayload,
        branch_id: typeof body?.branch_id === "string" ? toNullableString(body.branch_id) : body?.branch_id ?? null,
        position: toNullableString(body?.position),
        department: toNullableString(body?.department),
        status: toNullableString(body?.status) ?? String(linkedStaff?.status ?? "active"),
      }
    : staffPayload;

  const { data: updatedProfile, error: profileUpdateError } = await client
    .from("profiles")
    .update(extendedProfilePayload)
    .eq("id", profileId)
    .select("*")
    .maybeSingle();

  if (profileUpdateError || !updatedProfile) {
    logProfileUpdateError("profiles update failed", {
      profileId,
      staffId: linkedStaffId,
      payloadKeys: Object.keys(extendedProfilePayload),
      error: profileUpdateError ?? "Profile row was not returned after update.",
    });
    return NextResponse.json({ error: "Profile could not be updated. Please contact HR/admin if this continues." }, { status: 400 });
  }

  let updatedStaff: TableRow | null = null;

  if (linkedStaffId) {
    const { data, error } = await client
      .from("staff")
      .update(extendedStaffPayload)
      .eq("id", linkedStaffId)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      logProfileUpdateError("staff update failed", {
        profileId,
        staffId: linkedStaffId,
        payloadKeys: Object.keys(extendedStaffPayload),
        error: error ?? "Staff row was not returned after update.",
      });
      return NextResponse.json({ error: "Profile could not be updated. Please contact HR/admin if this continues." }, { status: 400 });
    }

    updatedStaff = data as TableRow;
  } else {
    const { data, error } = await client
      .from("staff")
      .insert({
        ...extendedStaffPayload,
        status: "active",
        date_joined: new Date().toISOString().slice(0, 10),
      })
      .select("*")
      .maybeSingle();

    if (error || !data) {
      logProfileUpdateError("staff insert failed", {
        profileId,
        payloadKeys: Object.keys(extendedStaffPayload),
        error: error ?? "Staff row was not returned after insert.",
      });
      return NextResponse.json({ error: "Profile could not be updated. Please contact HR/admin if this continues." }, { status: 400 });
    }

    updatedStaff = data as TableRow;
  }

  const [refetchedProfileResult, refetchedStaffResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    client.from("staff").select("*").eq("profile_id", profileId).order("updated_at", { ascending: false }).limit(20),
  ]);

  if (refetchedProfileResult.error) {
    logProfileUpdateError("refetch profile failed", {
      profileId,
      staffId: String(updatedStaff?.id ?? linkedStaffId ?? ""),
      payloadKeys: Object.keys(extendedProfilePayload),
      error: refetchedProfileResult.error,
    });
  }

  if (refetchedStaffResult.error) {
    logProfileUpdateError("refetch staff failed", {
      profileId,
      staffId: String(updatedStaff?.id ?? linkedStaffId ?? ""),
      payloadKeys: Object.keys(extendedStaffPayload),
      error: refetchedStaffResult.error,
    });
  }

  const finalProfile = ((refetchedProfileResult.data as Profile | null) ?? (updatedProfile as Profile)) as Profile;
  const finalStaff =
    choosePreferredStaffRow((refetchedStaffResult.data ?? []) as TableRow[]) ??
    updatedStaff;

  console.log("[api/profile/update] verified persisted profile values", {
    profileId: finalProfile.id,
    staffId: String(finalStaff?.id ?? ""),
    emergency_contact_name: String(finalStaff?.emergency_contact_name ?? ""),
    emergency_contact_phone: String(finalStaff?.emergency_contact_phone ?? ""),
    address: String(finalStaff?.address ?? ""),
    avatar_url: String(finalProfile.avatar_url ?? ""),
  });

  return NextResponse.json({
    success: true,
    profile: finalProfile,
    staff: finalStaff,
  });
}

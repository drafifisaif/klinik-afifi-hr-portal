import "server-only";

import { canAccessRoute, normalizeRole } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRouteKey, Profile, UserRole } from "@/lib/types";

export async function getCurrentSessionProfile() {
  const supabase = await createClient();

  if (!supabase) {
    return {
      supabase: null,
      user: null,
      profile: null,
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

  return {
    supabase,
    user,
    profile,
    role: normalizeRole(profile.role),
  };
}

export async function requireRouteAccess(routeKey: AppRouteKey) {
  const context = await getCurrentSessionProfile();

  if (!context.user) {
    return { ...context, unauthorized: true as const };
  }

  return {
    ...context,
    unauthorized: !canAccessRoute(context.role, routeKey),
  };
}

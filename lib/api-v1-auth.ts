import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { choosePreferredStaffRow } from "@/lib/data";
import { normalizeRole } from "@/lib/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Profile, TableRow, UserRole } from "@/lib/types";

export interface ApiV1Context {
  supabase: SupabaseClient;
  user: User;
  profile: Profile;
  staff: TableRow | null;
  role: UserRole;
}

type ApiV1AuthResult = { context: ApiV1Context; error?: never } | { context?: never; error: NextResponse };

function authError(status: 401 | 503, message: string) {
  return NextResponse.json({ error: { code: status === 401 ? "unauthorized" : "service_unavailable", message } }, {
    status,
    headers: status === 401 ? { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } : { "Cache-Control": "no-store" },
  });
}

export async function authenticateApiV1(request: Request): Promise<ApiV1AuthResult> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > 4096) {
    return { error: authError(401, "Provide a valid Supabase access token in the Authorization header.") };
  }

  const env = getSupabaseEnv();
  if (!env) return { error: authError(503, "Authentication service is not configured.") };

  const supabase = createSupabaseClient(env.url, env.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });

  const { data: { user }, error: authFailure } = await supabase.auth.getUser(match[1]);
  if (!user || authFailure) return { error: authError(401, "The access token is invalid or expired.") };

  const [{ data: profileData, error: profileError }, { data: staffRows, error: staffError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("staff").select("*").eq("profile_id", user.id).order("updated_at", { ascending: false }).limit(20),
  ]);

  if (profileError || staffError) {
    return { error: NextResponse.json({ error: { code: "identity_lookup_failed", message: "Could not load the authenticated portal profile." } }, { status: 500, headers: { "Cache-Control": "no-store" } }) };
  }

  const role = normalizeRole(profileData?.role);
  const profile = (profileData
    ? { ...profileData, email: user.email ?? profileData.email ?? null, role }
    : { id: user.id, email: user.email ?? null, full_name: user.user_metadata.full_name ?? null, role }) as Profile;

  return {
    context: {
      supabase,
      user,
      profile,
      staff: choosePreferredStaffRow((staffRows ?? []) as TableRow[]),
      role,
    },
  };
}

export function apiV1PageParams(url: URL, defaultPerPage = 100) {
  const rawPage = url.searchParams.get("page") ?? "1";
  const rawPerPage = url.searchParams.get("per_page") ?? String(defaultPerPage);
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawPerPage)) return null;
  const page = Number(rawPage);
  const perPage = Number(rawPerPage);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) return null;
  return { page, perPage, from: (page - 1) * perPage, to: page * perPage - 1 };
}

export function apiV1PageResponse<T>(data: T[], page: number, perPage: number, total: number | null) {
  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: total === null ? null : Math.ceil(total / perPage),
    },
  };
}

export function apiV1Error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "private, no-store" } });
}

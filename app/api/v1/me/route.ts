import { NextResponse } from "next/server";

import { authenticateApiV1 } from "@/lib/api-v1-auth";

export async function GET(request: Request) {
  const auth = await authenticateApiV1(request);
  if (auth.error) return auth.error;
  const { user, profile, staff, role } = auth.context;

  return NextResponse.json({
    data: {
      user_id: user.id,
      email: user.email ?? null,
      role,
      full_name: profile.full_name ?? null,
      branch_id: staff?.branch_id ?? profile.branch_id ?? null,
      staff_id: staff?.id ?? null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

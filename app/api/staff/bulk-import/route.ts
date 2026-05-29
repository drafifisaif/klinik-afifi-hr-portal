import { NextResponse } from "next/server";

import { parseBulkStaffInput, type BulkImportPreviewRow } from "@/lib/staff-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function createTemporaryPassword() {
  const random = Math.random().toString(36).slice(2, 10);
  return `Klinik!${random}9`;
}

async function getAllAuthUsers(adminClient: NonNullable<ReturnType<typeof createAdminClient>>) {
  const users: Array<{ id: string; email: string | null }> = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    const currentUsers = data?.users ?? [];
    currentUsers.forEach((user) => {
      users.push({
        id: user.id,
        email: user.email ?? null,
      });
    });

    if (currentUsers.length < 200) {
      break;
    }

    page += 1;
  }

  return users;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  if (!supabase || !adminClient) {
    return NextResponse.json(
      { error: "Bulk import requires server-side Supabase admin configuration. Add SUPABASE_SERVICE_ROLE_KEY to continue." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? "");

  if (role !== "hr" && role !== "super_admin") {
    return NextResponse.json({ error: "Bulk staff import is restricted to HR and Super Admin." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: "preview" | "create";
    rawInput?: string;
    rows?: BulkImportPreviewRow[];
  } | null;

  const action = body?.action;
  const rawInput = String(body?.rawInput ?? "");

  if (action !== "preview" && action !== "create") {
    return NextResponse.json({ error: "Invalid bulk import action." }, { status: 400 });
  }

  const [{ data: branchRows, error: branchError }, { data: profileRows, error: profileError }, { data: staffRows, error: staffError }, authUsers] = await Promise.all([
    adminClient.from("branches").select("*").limit(200),
    adminClient.from("profiles").select("id, email, role").limit(1000),
    adminClient.from("staff").select("id, profile_id, email, full_name").limit(1000),
    getAllAuthUsers(adminClient),
  ]);

  if (branchError || profileError || staffError) {
    return NextResponse.json({ error: branchError?.message ?? profileError?.message ?? staffError?.message ?? "Unable to load import dependencies." }, { status: 400 });
  }

  const branches = (branchRows ?? [])
    .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
    .filter((row) => row.id);

  const duplicateSources = [
    ...(profileRows ?? []),
    ...(staffRows ?? []),
    ...authUsers.map((authUser) => ({ email: authUser.email, role: "staff", auth_user_id: authUser.id })),
  ];

  const previewRows = parseBulkStaffInput(rawInput, branches, duplicateSources);

  if (action === "preview") {
    return NextResponse.json({
      rows: previewRows,
      summary: {
        ready: previewRows.filter((row) => row.state === "ready").length,
        duplicates: previewRows.filter((row) => row.state === "duplicate").length,
        invalid: previewRows.filter((row) => row.state === "invalid").length,
      },
    });
  }

  const rowsToCreate = previewRows.filter((row) => row.state === "ready");
  const results: BulkImportPreviewRow[] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const row of previewRows) {
    if (row.state !== "ready") {
      if (row.state === "duplicate") {
        duplicates += 1;
      } else if (row.state === "invalid") {
        failed += 1;
      }

      results.push(row);
      continue;
    }

    const tempPassword = createTemporaryPassword();
    const createAuthResult = await adminClient.auth.admin.createUser({
      email: row.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: row.name,
        role: "staff",
        branch_id: row.branchId,
      },
    });

    if (createAuthResult.error || !createAuthResult.data.user?.id) {
      failed += 1;
      results.push({
        ...row,
        state: "failed",
        reason: createAuthResult.error?.message ?? "Failed to create auth user",
      });
      continue;
    }

    const authUserId = createAuthResult.data.user.id;

    const profileInsert = await adminClient.from("profiles").upsert({
      id: authUserId,
      full_name: row.name,
      email: row.email,
      role: "staff",
      branch_id: row.branchId,
    });

    if (profileInsert.error) {
      await adminClient.auth.admin.deleteUser(authUserId);
      failed += 1;
      results.push({
        ...row,
        state: "failed",
        reason: profileInsert.error.message,
      });
      continue;
    }

    const staffInsert = await adminClient.from("staff").insert({
      profile_id: authUserId,
      full_name: row.name,
      email: row.email,
      position: row.position,
      status: "active",
      branch_id: row.branchId,
      department: null,
      date_joined: new Date().toISOString().slice(0, 10),
    });

    if (staffInsert.error) {
      await adminClient.from("profiles").delete().eq("id", authUserId);
      await adminClient.auth.admin.deleteUser(authUserId);
      failed += 1;
      results.push({
        ...row,
        state: "failed",
        reason: staffInsert.error.message,
      });
      continue;
    }

    created += 1;
    results.push({
      ...row,
      state: "created",
      reason: "User created",
      tempPassword,
    });
  }

  return NextResponse.json({
    rows: results,
    summary: {
      created,
      duplicates,
      failed,
      attempted: rowsToCreate.length,
    },
  });
}

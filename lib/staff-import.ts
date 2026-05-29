import type { BranchOption, TableRow } from "@/lib/types";

export interface BulkImportPreviewRow {
  id: string;
  branch: string;
  branchId: string | null;
  name: string;
  email: string;
  role: "staff";
  position: "Doctor" | "Staff";
  status: "active";
  state: "ready" | "invalid" | "duplicate" | "created" | "failed";
  reason: string;
  tempPassword?: string | null;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function inferPosition(name: string) {
  const normalized = normalizeLabel(name);
  return normalized.startsWith("dr") || normalized.startsWith("doktor") ? "Doctor" : "Staff";
}

function parseStaffLine(line: string) {
  const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  if (!emailMatch) {
    return null;
  }

  const email = emailMatch[0].trim();
  const name = line
    .replace(emailMatch[0], "")
    .replace(/[(),:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    email,
    name,
  };
}

export function parseBulkStaffInput(input: string, branches: BranchOption[], existingRows?: TableRow[]) {
  const branchMap = new Map(branches.map((branch) => [normalizeLabel(branch.name), branch]));
  const existingEmailMap = new Map<string, TableRow>();

  (existingRows ?? []).forEach((row) => {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (email) {
      existingEmailMap.set(email, row);
    }
  });

  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let activeBranchName = "";
  let activeBranchId: string | null = null;

  return lines.flatMap((line, index) => {
    const parsed = parseStaffLine(line);

    if (!parsed) {
      activeBranchName = line;
      activeBranchId = branchMap.get(normalizeLabel(line))?.id ?? null;
      return [];
    }

    const normalizedEmail = parsed.email.toLowerCase();
    const branch = activeBranchName;
    const branchId = activeBranchId;
    const issues: string[] = [];

    if (!branch) {
      issues.push("Branch heading missing");
    } else if (!branchId) {
      issues.push("Branch not found");
    }

    if (!parsed.name) {
      issues.push("Name missing");
    }

    if (!isValidEmail(parsed.email)) {
      issues.push("Email invalid");
    }

    const existingRow = existingEmailMap.get(normalizedEmail) ?? null;
    const existingRole = normalizeLabel(String(existingRow?.role ?? existingRow?.profile_role ?? ""));
    const isProtectedExistingUser = existingRole === "hr" || existingRole === "super_admin";
    const isDuplicate = Boolean(existingRow);

    if (isProtectedExistingUser) {
      issues.push("Existing HR / Super Admin account");
    } else if (isDuplicate) {
      issues.push("Duplicate email");
    }

    return [{
      id: `preview-${index}-${normalizedEmail}`,
      branch,
      branchId,
      name: parsed.name,
      email: parsed.email,
      role: "staff" as const,
      position: inferPosition(parsed.name),
      status: "active" as const,
      state: isProtectedExistingUser
        ? "duplicate"
        : isDuplicate
          ? "duplicate"
          : issues.length
            ? "invalid"
            : "ready",
      reason: issues.join(", "),
      tempPassword: null,
    } satisfies BulkImportPreviewRow];
  });
}

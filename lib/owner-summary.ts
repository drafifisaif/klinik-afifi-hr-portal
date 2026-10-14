import type { TableRow } from "@/lib/types";
import { normalizeString } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_FEEDBACK_STATUSES = new Set(["new", "assigned", "in_progress", "need_more_info", "escalated"]);

function getPersonKey(row: TableRow) {
  const profileId = String(row.profile_id ?? "").trim();
  const staffId = String(row.id ?? "").trim();
  return profileId ? `profile:${profileId}` : staffId ? `staff:${staffId}` : null;
}

function countPeopleCreatedInWindow(rows: TableRow[], startMs: number, endMs: number) {
  const earliestCreatedAtByPerson = new Map<string, number>();

  rows.forEach((row) => {
    const key = getPersonKey(row);
    const createdAt = Date.parse(String(row.created_at ?? ""));
    if (!key || !Number.isFinite(createdAt) || createdAt > endMs) return;
    const previous = earliestCreatedAtByPerson.get(key);
    if (previous === undefined || createdAt < previous) earliestCreatedAtByPerson.set(key, createdAt);
  });

  return [...earliestCreatedAtByPerson.values()].filter((createdAt) => createdAt >= startMs).length;
}

export function buildOwnerSummary({ staffRows, branchRows, feedbackRows, now = new Date() }: {
  staffRows: TableRow[];
  branchRows: TableRow[];
  feedbackRows: TableRow[];
  now?: Date;
}) {
  const nowMs = now.getTime();
  const currentStart = nowMs - 30 * DAY_MS;
  const previousStart = nowMs - 60 * DAY_MS;
  const activePeople = new Set(
    staffRows
      .filter((row) => normalizeString(row.status) === "active")
      .map(getPersonKey)
      .filter((key): key is string => Boolean(key)),
  );
  const newStaffProfilesLast30Days = countPeopleCreatedInWindow(staffRows, currentStart, nowMs);
  const newStaffProfilesPrevious30Days = countPeopleCreatedInWindow(staffRows, previousStart, currentStart - 1);
  const criticalFeedback = feedbackRows.filter((row) => {
    const status = normalizeString(row.status);
    return OPEN_FEEDBACK_STATUSES.has(status)
      && (normalizeString(row.priority) === "urgent" || status === "escalated");
  });
  const ownerCriticalFeedback = criticalFeedback.filter((row) => row.assigned_to_owner === true).length;

  return {
    generated_at: now.toISOString(),
    scope: "owner",
    workforce: {
      active_people_count: activePeople.size,
      configured_clinic_count: branchRows.length,
      new_staff_profiles_last_30_days: newStaffProfilesLast30Days,
      new_staff_profiles_previous_30_days: newStaffProfilesPrevious30Days,
      staff_profile_creation_change_vs_previous_30_days: newStaffProfilesLast30Days - newStaffProfilesPrevious30Days,
    },
    attention: {
      critical_open_feedback_count: criticalFeedback.length,
      critical_open_feedback_assigned_to_owner_count: ownerCriticalFeedback,
      feedback_path: "/feedback/manage",
    },
    data_gaps: [
      "Payroll and staff-cost data are not available in the current API.",
      "Staff exit dates/history are not recorded reliably enough for a turnover trend.",
      "Staff profile creation dates are not verified employment start dates and should not be treated as a hiring trend.",
      "The portal does not yet have a structured owner-decision field; owner-assigned critical feedback is reported separately.",
    ],
  };
}

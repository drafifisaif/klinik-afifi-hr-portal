export const FEEDBACK_ATTACHMENT_BUCKET = "feedback-attachments";
export const MAX_FEEDBACK_FILES = 5;
export const MAX_FEEDBACK_FILE_SIZE = 10 * 1024 * 1024;

export interface FeedbackAttachment {
  path: string;
  name: string;
  size: number;
  content_type: string;
}

export function safeFeedbackFilename(value: string) {
  const name = value.split(/[\\/]/).pop() ?? "file";
  return name.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_").trim().slice(0, 150) || "file";
}

export function getFeedbackAttachments(value: unknown): FeedbackAttachment[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is FeedbackAttachment =>
    typeof item === "object" && item !== null
    && typeof item.path === "string"
    && typeof item.name === "string"
    && typeof item.size === "number"
    && typeof item.content_type === "string",
  );
}

export function isFeedbackAttachmentPath(path: string, submittedBy: string) {
  const parts = path.split("/");
  return parts.length === 4
    && parts[0] === "feedback"
    && parts[1] === submittedBy
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[2])
    && Boolean(parts[3])
    && parts[3] !== "."
    && parts[3] !== ".."
    && !parts[3].includes("\\");
}
import { filterFeedbackForManageView } from "@/lib/data";
import type { Profile, TableRow, UserRole } from "@/lib/types";


export function canViewFeedbackAttachment(
  feedback: TableRow,
  viewer: { role: UserRole; profile: Profile; staffId: string; branchId: string },
) {
  const { role, profile, staffId, branchId } = viewer;
  return String(feedback.submitted_by ?? "") === profile.id
    || String(feedback.assigned_to ?? "") === profile.id
    || Boolean(staffId && String(feedback.target_staff_id ?? "") === staffId)
    || filterFeedbackForManageView([feedback], role, profile, profile.id, staffId, branchId).length > 0;
}

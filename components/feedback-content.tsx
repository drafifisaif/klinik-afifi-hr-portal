import { Download, Paperclip } from "lucide-react";

import { getFeedbackAttachments } from "@/lib/feedback-attachments";

interface FeedbackDetail {
  label: string;
  value: string;
}

export function FeedbackMessageCard({ message, expectedAction }: { message: unknown; expectedAction?: unknown }) {
  const action = String(expectedAction ?? "").trim();

  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-[0_10px_30px_rgba(18,42,44,0.04)]">
      <div className="border-b border-teal-100 bg-teal-50/65 px-5 py-3 sm:px-6">
        <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-teal-900">Feedback message</h4>
      </div>
      <div className="px-5 py-5 sm:px-6">
        <p className="max-w-[78ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-[var(--foreground)] sm:text-base">
          {String(message ?? "-")}
        </p>
        {action ? (
          <div className="mt-6 max-w-[78ch] rounded-2xl border-l-4 border-teal-500 bg-teal-50/70 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-900">Expected action</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--foreground)]">{action}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FeedbackDetails({ items }: { items: FeedbackDetail[] }) {
  const visibleItems = items.filter((item) => item.value.trim());
  if (!visibleItems.length) return null;

  return (
    <dl className="mt-4 grid gap-x-5 gap-y-4 rounded-3xl border border-[var(--border)] bg-white/80 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6 xl:grid-cols-3">
      {visibleItems.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{item.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words font-medium leading-6 text-[var(--foreground)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FeedbackAttachmentList({ feedbackId, value }: { feedbackId: unknown; value: unknown }) {
  const attachments = getFeedbackAttachments(value);
  if (!attachments.length) return null;

  return (
    <section className="mt-4 rounded-3xl border border-[var(--border)] bg-white/90 px-5 py-4 sm:px-6">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <Paperclip className="h-4 w-4 text-[var(--accent)]" />
        Attachments ({attachments.length})
      </h4>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {attachments.map((attachment) => {
          const query = new URLSearchParams({ id: String(feedbackId ?? ""), path: attachment.path });
          return (
            <li key={attachment.path}>
              <a
                href={`/api/feedback/file?${query.toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)] transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <span className="min-w-0 truncate">{attachment.name}</span>
                <Download className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

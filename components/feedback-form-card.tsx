"use client";

import { MessageSquareQuote } from "lucide-react";
import { FormEvent, useState } from "react";

export function FeedbackFormCard() {
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      "Feedback form placeholder captured. Connect this form to your final feedback schema and assignment rules when ready.",
    );
  }

  return (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-[var(--accent)]">
          <MessageSquareQuote className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Submit feedback</h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            A starter form for culture, branch, operations, and anonymous workflow
            expansion.
          </p>
        </div>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Subject"
          className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
        />
        <textarea
          placeholder="Share your feedback, issue, or suggestion"
          rows={5}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
        />
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25"
        >
          Save placeholder
        </button>
      </form>

      {message ? (
        <p className="mt-4 rounded-2xl bg-[var(--card-muted)] px-4 py-3 text-sm text-[var(--foreground)]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

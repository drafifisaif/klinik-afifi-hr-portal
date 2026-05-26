"use client";

import { FileUp, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function McUploadCard() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload() {
    const supabase = createClient();

    if (!supabase || !file) {
      setMessage("Choose a file and make sure Supabase is configured before uploading.");
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const filePath = `placeholder/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("mc-uploads").upload(filePath, file, {
      upsert: true,
    });

    setIsUploading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setFile(null);
    setMessage("Upload completed to the mc-uploads bucket.");
  }

  return (
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--card-muted)] text-[var(--accent)]">
          <FileUp className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">MC Upload</h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            This foundation is ready to upload supporting files into the
            `mc-uploads` Supabase Storage bucket.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--muted-foreground)]"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isUploading ? "Uploading..." : "Upload MC"}
        </button>
      </div>

      <div className="mt-5 rounded-3xl border border-[var(--border)] bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--muted-foreground)]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <p>
            You can extend this with signed URLs, branch-based folders, and review
            workflows after the final MC schema is confirmed.
          </p>
        </div>
        {message ? <p className="mt-3 text-[var(--foreground)]">{message}</p> : null}
      </div>
    </div>
  );
}

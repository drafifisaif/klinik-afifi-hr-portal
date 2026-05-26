"use client";

import { Paperclip } from "lucide-react";

import { getFilename } from "@/lib/utils";

interface FileUploadFieldProps {
  label: string;
  file: File | null;
  storedPath?: string | null;
  helperText?: string;
  onChange: (file: File | null) => void;
}

export function FileUploadField({
  label,
  file,
  storedPath,
  helperText,
  onChange,
}: FileUploadFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">{label}</span>
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-muted)] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[var(--accent)] shadow-sm">
            <Paperclip className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <input
              type="file"
              onChange={(event) => onChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[var(--muted-foreground)]"
            />
            <p className="mt-1 truncate text-xs text-[var(--foreground)]">
              {file ? file.name : storedPath ? getFilename(storedPath) : "No file selected"}
            </p>
          </div>
        </div>
        {helperText ? <p className="mt-3 text-xs text-[var(--muted-foreground)]">{helperText}</p> : null}
      </div>
    </label>
  );
}

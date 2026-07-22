"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, Mail, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthCardShell } from "@/components/auth-card-shell";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

const COOLDOWN_SECONDS = 60;

function getRedirectUrl() {
  if (typeof window === "undefined") {
    return "https://hr.klinikafifi.com.my/reset-password";
  }

  return `${window.location.origin}/reset-password`;
}

export function ForgotPasswordForm() {
  const env = useMemo(() => getSupabaseEnv(), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldownRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownRemaining]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const supabase = createClient();
    if (!supabase || !env) {
      setError("Supabase is not configured for password recovery yet.");
      return;
    }

    if (cooldownRemaining > 0) {
      return;
    }

    setIsSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl(),
    });

    setIsSubmitting(false);

    const genericMessage = "Jika email ini berdaftar dalam HR Portal, link reset password akan dihantar ke email tersebut.";

    if (resetError) {
      const normalizedMessage = String(resetError.message ?? "").toLowerCase();
      if (
        normalizedMessage.includes("rate limit")
        || normalizedMessage.includes("too many")
        || normalizedMessage.includes("security purposes")
      ) {
        setError("Terlalu banyak percubaan reset password. Sila tunggu sebentar dan cuba semula.");
        setCooldownRemaining(COOLDOWN_SECONDS);
        return;
      }

      setMessage(genericMessage);
      setCooldownRemaining(COOLDOWN_SECONDS);
      return;
    }

    setMessage(genericMessage);
    setCooldownRemaining(COOLDOWN_SECONDS);
  }

  return (
    <AuthCardShell
      eyebrow="Password recovery"
      title="Forgot password"
      description="Masukkan email yang didaftarkan dalam HR Portal. Link reset password akan dihantar ke email anda."
    >
      {!env ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Add your Supabase public environment values before testing password recovery.
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
            <Mail className="h-4 w-4 text-[var(--accent)]" />
            Email address
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@klinikafifi.com.my"
            className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none ring-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
            required
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || cooldownRemaining > 0}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Send className="h-4 w-4" />
          <span>
            {isSubmitting
              ? "Sending..."
              : cooldownRemaining > 0
                ? `Send reset link again in ${cooldownRemaining}s`
                : "Send reset link"}
          </span>
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/login" className="inline-flex items-center gap-2 font-semibold text-[var(--accent)]">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>
      </div>
    </AuthCardShell>
  );
}

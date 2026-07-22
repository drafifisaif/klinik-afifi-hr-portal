"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, LockKeyhole } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthCardShell } from "@/components/auth-card-shell";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

function parseHashParams(hash: string) {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(fragment);
}

export function ResetPasswordForm() {
  const router = useRouter();
  const env = useMemo(() => getSupabaseEnv(), []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareRecoverySession() {
      const supabase = createClient();
      if (!supabase || !env) {
        if (isMounted) {
          setError("Supabase is not configured for password reset yet.");
          setIsPreparingSession(false);
        }
        return;
      }

      const url = new URL(window.location.href);
      const hashParams = parseHashParams(window.location.hash);
      const searchParams = url.searchParams;

      const urlError =
        searchParams.get("error_description")
        || hashParams.get("error_description")
        || searchParams.get("error")
        || hashParams.get("error");

      if (urlError) {
        if (isMounted) {
          setError("Link reset password tidak sah atau telah tamat tempoh. Sila minta link reset password yang baru.");
          setIsPreparingSession(false);
        }
        return;
      }

      const code = searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            throw sessionError;
          }
        }

        const { data, error: sessionLookupError } = await supabase.auth.getSession();
        if (sessionLookupError || !data.session) {
          throw sessionLookupError ?? new Error("Recovery session missing.");
        }

        if (isMounted) {
          setIsRecoveryReady(true);
          setIsPreparingSession(false);
        }
      } catch {
        if (isMounted) {
          setError("Link reset password tidak sah atau telah tamat tempoh. Sila minta link reset password yang baru.");
          setIsPreparingSession(false);
        }
      }
    }

    void prepareRecoverySession();

    return () => {
      isMounted = false;
    };
  }, [env]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const supabase = createClient();
    if (!supabase || !env) {
      setError("Supabase is not configured for password reset yet.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password mesti sekurang-kurangnya 8 aksara.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Pengesahan password tidak sepadan.");
      return;
    }

    setIsUpdating(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setIsUpdating(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Password berjaya dikemaskini. Sila login menggunakan password baru.");
    setNewPassword("");
    setConfirmPassword("");

    window.setTimeout(() => {
      router.replace("/login");
      router.refresh();
    }, 1400);
  }

  return (
    <AuthCardShell
      eyebrow="Password reset"
      title="Reset password"
      description="Set password baru anda selepas membuka link recovery daripada email HR Portal."
    >
      {/* Supabase Dashboard → Authentication → URL Configuration must allow:
          https://hr.klinikafifi.com.my/reset-password
          http://localhost:3000/reset-password
      */}

      {!env ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Add your Supabase public environment values before testing password reset.
        </div>
      ) : null}

      {isPreparingSession ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--card-muted)] px-4 py-4 text-sm text-[var(--foreground)]">
          Preparing secure recovery session...
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="mb-6 flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      {isRecoveryReady ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
              <LockKeyhole className="h-4 w-4 text-[var(--accent)]" />
              New password
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none ring-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
              <KeyRound className="h-4 w-4 text-[var(--accent)]" />
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat your new password"
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none ring-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
              required
            />
          </label>

          <button
            type="submit"
            disabled={isUpdating}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span>{isUpdating ? "Updating..." : "Update password"}</span>
          </button>
        </form>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/forgot-password" className="inline-flex items-center gap-2 font-semibold text-[var(--accent)]">
          <ArrowLeft className="h-4 w-4" />
          Request a new reset link
        </Link>
      </div>
    </AuthCardShell>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

export function LoginForm() {
  const router = useRouter();
  const env = useMemo(() => getSupabaseEnv(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const supabase = createClient();

    if (!supabase) {
      setError(
        "Supabase environment variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before signing in.",
      );
      return;
    }

    setIsLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0f9d94_0%,#1d7f89_45%,#163235_100%)] px-7 py-10 text-white shadow-[0_30px_80px_rgba(15,157,148,0.24)] sm:px-10 lg:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.14),transparent_24%)]" />
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-100">
              Modern Clinic SaaS Dashboard
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Klinik Afifi HR Portal
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-teal-50/90 sm:text-lg">
              A clean, role-aware foundation for staff operations, leave requests,
              medical certificate uploads, feedback workflows, and clinic-wide
              communication.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Role-based navigation",
                "Protected app routes",
                "Supabase auth and data layer",
                "Vercel-ready structure",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-3xl border border-white/15 bg-white/10 px-4 py-4 text-sm backdrop-blur"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[36px] border border-white/80 bg-white/90 p-6 shadow-[0_24px_60px_rgba(18,42,44,0.08)] sm:p-8 lg:p-10">
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--accent)]">
              Secure login
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              Welcome back
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              Sign in with your Klinik Afifi team email and password. This page uses
              Supabase email and password authentication with no hardcoded secrets.
            </p>

            {!env ? (
              <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                Add your Supabase values to the environment before testing login.
              </div>
            ) : null}

            {error ? (
              <div className="mt-6 flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <Mail className="h-4 w-4 text-[var(--accent)]" />
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@klinikafifi.com"
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none ring-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <LockKeyhole className="h-4 w-4 text-[var(--accent)]" />
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 outline-none ring-0 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--ring)]"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-foreground)] shadow-lg shadow-teal-500/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span>{isLoading ? "Signing in..." : "Sign in"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

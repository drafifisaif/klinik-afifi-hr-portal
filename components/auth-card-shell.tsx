"use client";

interface AuthCardShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}

export function AuthCardShell({ eyebrow, title, description, children }: AuthCardShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[36px] bg-[linear-gradient(135deg,#0f9d94_0%,#1d7f89_45%,#163235_100%)] px-7 py-10 text-white shadow-[0_30px_80px_rgba(15,157,148,0.24)] sm:px-10 lg:px-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.14),transparent_24%)]" />
          <div className="relative max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-100">
              {eyebrow}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Klinik Afifi HR Portal
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-teal-50/90 sm:text-lg">
              Password recovery stays inside the same secure Klinik Afifi portal flow, so staff can reset access without waiting for manual admin help.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Supabase Auth recovery",
                "No user enumeration",
                "Mobile friendly reset flow",
                "Works with deployed portal domain",
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
              {title}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
              {description}
            </p>
            <div className="mt-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

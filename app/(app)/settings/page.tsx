import { Mail, ShieldCheck, UserRound } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { toLabel } from "@/lib/utils";

export default async function SettingsPage() {
  const context = await requireRouteAccess("settings");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Settings unavailable"
        description="Sign in with a valid portal account to view your profile settings."
      />
    );
  }

  const profile = context.profile;
  const profileFields = Object.entries(profile ?? {}).filter(
    ([key]) => !["id", "role", "email", "full_name"].includes(key),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Current profile information from the Supabase profiles table."
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
          <UserRound className="h-5 w-5 text-[var(--accent)]" />
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Full name</p>
          <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            {profile?.full_name ?? "Not set"}
          </p>
        </div>
        <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
          <Mail className="h-5 w-5 text-[var(--accent)]" />
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Email</p>
          <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
            {profile?.email ?? context.user.email ?? "Not set"}
          </p>
        </div>
        <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
          <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">Role</p>
          <p className="mt-1 text-lg font-semibold capitalize text-[var(--foreground)]">
            {context.role.replaceAll("_", " ")}
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_45px_rgba(18,42,44,0.06)]">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Profile metadata</h3>
        {profileFields.length ? (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {profileFields.map(([key, value]) => (
              <div key={key} className="rounded-3xl bg-[var(--card-muted)] px-4 py-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                  {toLabel(key)}
                </dt>
                <dd className="mt-2 text-sm text-[var(--foreground)]">{String(value ?? "-")}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            No extra profile metadata was returned from Supabase yet.
          </p>
        )}
      </section>
    </div>
  );
}

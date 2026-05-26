import { EmptyState } from "@/components/empty-state";
import { MyProfilePage } from "@/components/my-profile-page";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows } from "@/lib/data";

export default async function SettingsPage() {
  const context = await requireRouteAccess("settings");

  if (!context.user || context.unauthorized || !context.profile) {
    return (
      <EmptyState
        title="My Profile unavailable"
        description="Sign in with a valid portal account to view and update your profile."
      />
    );
  }

  const branchRows = await fetchRows(context.supabase, "branches", 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Complete your staff profile, keep personal details current, and let HR control organization-level fields where required."
      />
      <MyProfilePage
        profile={context.profile}
        staff={context.staff}
        branches={branchRows.rows
          .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? row.branch_name ?? row.id) }))
          .filter((row) => row.id)}
        role={context.role}
      />
    </div>
  );
}

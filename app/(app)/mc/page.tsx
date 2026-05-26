import { EmptyState } from "@/components/empty-state";
import { McUploadCard } from "@/components/mc-upload-card";
import { PageHeader } from "@/components/page-header";
import { requireRouteAccess } from "@/lib/auth";

export default async function McPage() {
  const context = await requireRouteAccess("mc");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="MC access restricted"
        description="Your current role does not include the medical certificate workspace."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Certificates"
        description="Upload supporting medical certificate files to the configured Supabase Storage bucket."
      />
      <McUploadCard />
    </div>
  );
}

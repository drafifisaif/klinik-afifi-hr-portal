import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SimpleTable } from "@/components/simple-table";
import { requireRouteAccess } from "@/lib/auth";
import { fetchRows, filterPublishedCirculars } from "@/lib/data";
import { deriveColumns } from "@/lib/utils";

export default async function CircularsPage() {
  const context = await requireRouteAccess("circulars");

  if (!context.user || context.unauthorized) {
    return (
      <EmptyState
        title="Circular access restricted"
        description="Your current role does not include circular viewing."
      />
    );
  }

  const result = await fetchRows(context.supabase, "circulars", 50);
  const rows = filterPublishedCirculars(result.rows);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Circulars"
        description="Read published circulars and use this page as the base for acknowledgements or read tracking."
      />
      {result.error ? (
        <EmptyState title="Unable to load circulars" description={result.error} />
      ) : rows.length ? (
        <SimpleTable
          caption="Circulars table"
          columns={deriveColumns(rows, ["title", "status", "published_at", "created_at", "branch_id"])}
          rows={rows}
        />
      ) : (
        <EmptyState
          title="No circulars available"
          description="Published circulars will appear here once rows exist in the Supabase circulars table."
        />
      )}
    </div>
  );
}

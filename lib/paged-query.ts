import type { QueryResult } from "@/lib/data";
import type { TableRow } from "@/lib/types";

interface PageResult { data: unknown[] | null; error: { message: string } | null; count?: number | null }

// A fresh, deterministically ordered query per page avoids PostgREST's row cap.
// Use the first-page count when provided; a smaller server row cap is safe too.
export async function fetchPagedRows(queryPage: (from: number, to: number) => PromiseLike<PageResult>): Promise<QueryResult> {
  const rows: TableRow[] = [];
  let total: number | null = null;
  for (;;) {
    const { data, error, count } = await queryPage(rows.length, rows.length + 499);
    if (error) return { rows: [], error: error.message };
    if (typeof count === "number") total = count;
    if (!data?.length) return { rows, error: null };
    rows.push(...data as TableRow[]);
    if (total !== null && rows.length >= total) return { rows, error: null };
  }
}

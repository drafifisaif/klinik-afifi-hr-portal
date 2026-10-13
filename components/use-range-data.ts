"use client";

import { useEffect, useState } from "react";
import { portalRangeQuery, type PortalDateRange } from "@/lib/portal-date-range";

export function useRangeData<T extends { error: string | null }>(endpoint: string, initialData: T, initialRanges: PortalDateRange[], ranges: PortalDateRange[]) {
  let query = "";
  let validationError: string | null = null;
  try { query = portalRangeQuery(ranges); }
  catch (error) { validationError = error instanceof Error ? error.message : "Invalid date range."; }
  const initialQuery = portalRangeQuery(initialRanges);
  const [result, setResult] = useState({ query: initialQuery, data: initialData, source: initialData });
  const [failure, setFailure] = useState<{ query: string; message: string } | null>(null);

  useEffect(() => {
    if (!query) return;
    setFailure(null);
    if (query === initialQuery) {
      setResult({ query, data: initialData, source: initialData });
      return;
    }
    const controller = new AbortController();
    // Date inputs may emit several changes while the user is typing.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${endpoint}?${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json() as T;
        if (!response.ok || data.error) throw new Error(data.error || "Unable to load records.");
        if (!controller.signal.aborted) setResult({ query, data, source: initialData });
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ query, message: error instanceof Error ? error.message : "Unable to load records." });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, initialData, initialQuery, query]);

  const error = validationError ?? (failure?.query === query ? failure.message : null) ?? (result.query === query ? result.data.error : null);
  const loading = !error && (result.query !== query || result.source !== initialData);
  return { data: result.data, loading, error };
}

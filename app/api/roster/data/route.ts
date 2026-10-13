import { NextResponse } from "next/server";
import { requireRouteAccess } from "@/lib/auth";
import { parsePortalRangeQuery } from "@/lib/portal-date-range";
import { loadRosterRange } from "@/lib/portal-range-data";

export async function GET(request: Request) {
  const context = await requireRouteAccess("roster");
  if (!context.user || context.unauthorized) return NextResponse.json({ error: "Roster access restricted." }, { status: 403 });
  let ranges;
  try { ranges = parsePortalRangeQuery(new URL(request.url).searchParams); }
  catch { return NextResponse.json({ error: "Choose a valid date range of up to 370 days." }, { status: 400 }); }
  const data = await loadRosterRange(context, ranges);
  return NextResponse.json(data, { status: data.error ? 500 : 200, headers: { "Cache-Control": "private, no-store" } });
}

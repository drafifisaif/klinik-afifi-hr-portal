import { NextResponse } from "next/server";
import { requireRouteAccess } from "@/lib/auth";
import { parsePortalRangeQuery } from "@/lib/portal-date-range";
import { loadAttendanceRange } from "@/lib/portal-range-data";

export async function GET(request: Request) {
  const context = await requireRouteAccess("attendance");
  if (!context.user || context.unauthorized) return NextResponse.json({ error: "Attendance access restricted." }, { status: 403 });
  let ranges;
  try { ranges = parsePortalRangeQuery(new URL(request.url).searchParams); }
  catch { return NextResponse.json({ error: "Choose a valid date range of up to 370 days." }, { status: 400 }); }
  const data = await loadAttendanceRange(context, ranges);
  return NextResponse.json(data, { status: data.error ? 500 : 200, headers: { "Cache-Control": "private, no-store" } });
}

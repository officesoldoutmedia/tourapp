import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { fetchAnnualReport } from "@/lib/annualReportQuery";
import { annualReportCsv } from "@/lib/annualReport";

/** Export CSV al raportului anual per persoană — accounting only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  const { supabase, org, permission, tier } = await requireOrg(orgSlug);
  if (!can({ tier, permission }, "view_accounting"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const parsed = Number(searchParams.get("year"));
  const year =
    Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
      ? parsed
      : new Date().getFullYear();

  const people = await fetchAnnualReport(supabase, org.id, year);
  const csv = annualReportCsv(people);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="annual-report-${year}.csv"`,
    },
  });
}

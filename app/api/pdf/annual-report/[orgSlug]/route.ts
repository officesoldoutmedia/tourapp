import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { fetchAnnualReport } from "@/lib/annualReportQuery";
import { buildAnnualReportPdf } from "@/pdf/AnnualReportPdf";

/** PDF-ul raportului anual per persoană — accounting only. */
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
  const pdf = await buildAnnualReportPdf(org.name, year, people, await getLocale());

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="annual-report-${year}.pdf"`,
    },
  });
}

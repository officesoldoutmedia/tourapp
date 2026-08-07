import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseContractSnapshot } from "@/lib/contractMerge";
import { buildContractPdf } from "@/pdf/ContractPdf";

/** PDF-ul documentului de contract — RLS: doar admin/accounting. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const supabase = await createServerSupabase();

  const { data: doc } = await supabase
    .from("contract_documents")
    .select("doc_number, created_at, merge_snapshot")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const snapshot = parseContractSnapshot(doc.merge_snapshot);
  if (!snapshot) return NextResponse.json({ error: "bad_snapshot" }, { status: 422 });

  const pdf = await buildContractPdf({
    docNumber: doc.doc_number,
    docDate: String(doc.created_at).slice(0, 10),
    snapshot,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.doc_number}.pdf"`,
    },
  });
}

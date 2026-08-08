import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MAX_VENDOR_FILES, sanitizeFileName } from "@/lib/vendorPortal";
import { resolveVendorLink } from "@/app/share/vendor/[token]/resolve";

const MAX_BYTES = 50 * 1024 * 1024; // limita bucket-ului attachments

/** C4 — upload-ul vendorului: fișier real în categoria companiei pe ZIUA
 *  show-ului → intră direct în advancing (SP3b). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ctx = await resolveVendorLink(token);
  if (!ctx) return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  if (!ctx.fileCategoryId) {
    return NextResponse.json({ error: "no_category" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("parent_type", "day")
    .eq("parent_id", ctx.dayId)
    .eq("category_id", ctx.fileCategoryId)
    .is("deleted_at", null);
  if ((count ?? 0) >= MAX_VENDOR_FILES) {
    return NextResponse.json({ error: "limit" }, { status: 429 });
  }

  const name = sanitizeFileName(file.name);
  const path = `${ctx.organizationId}/vendor/${ctx.companyId}/${crypto.randomUUID()}-${name}`;
  const { error: upError } = await supabase.storage
    .from("attachments")
    .upload(path, file);
  if (upError) {
    return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  const { error } = await supabase.from("attachments").insert({
    organization_id: ctx.organizationId,
    parent_type: "day",
    parent_id: ctx.dayId,
    file_name: name,
    storage_path: path,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    tags: [],
    category_id: ctx.fileCategoryId,
    uploaded_by: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

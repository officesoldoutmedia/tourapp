"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 40);
}

export async function createOrganization(formData: FormData): Promise<void> {
  const { supabase } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const orgType = String(formData.get("orgType") ?? "") || null;
  if (!name) redirect("/app?error=name_required");

  const base = slugify(name) || "org";

  // Slug unic: încearcă base, apoi base-2..base-9, apoi sufix aleator.
  for (const candidate of [
    base,
    ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`),
    `${base}-${crypto.randomUUID().slice(0, 8)}`,
  ]) {
    const { data, error } = await supabase.rpc("create_organization", {
      org_name: name,
      org_slug: candidate,
      org_type_in: orgType,
    });
    if (!error) {
      redirect(`/o/${candidate}`);
    }
    // 23505 = unique_violation pe slug → încearcă următorul candidat.
    if (error.code !== "23505") {
      redirect("/app?error=create_failed");
    }
    void data;
  }

  redirect("/app?error=create_failed");
}

export async function acceptInvitation(token: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("accept_invitation", {
    invite_token: token,
  });
  if (error) return { error: "accept_failed" as const, detail: error.message };
  redirect("/app");
}

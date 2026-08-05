import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { ArtistTabs } from "./ArtistTabs";

/** Shell-ul paginii de artist: header + tab-uri Date / Profil / Acces. */
export default async function ArtistLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; artistSlug: string }>;
}) {
  const { orgSlug, artistSlug } = await params;
  const { supabase, org } = await requireOrg(orgSlug);
  const t = await getTranslations("artist");

  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, slug, color, photo_path, is_archived")
    .eq("organization_id", org.id)
    .eq("slug", artistSlug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!artist) notFound();

  const base = `/o/${orgSlug}/a/${artistSlug}`;
  const tabs = [
    { href: base, label: t("tabDates"), exact: true },
    { href: `${base}/profile`, label: t("tabProfile") },
    { href: `${base}/access`, label: t("tabAccess") },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex items-center gap-3">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: artist.color ?? "#888" }}
        />
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {artist.name}
        </h1>
      </header>
      <ArtistTabs tabs={tabs} />
      {children}
    </main>
  );
}

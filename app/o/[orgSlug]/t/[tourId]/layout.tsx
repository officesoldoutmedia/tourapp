import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/org";
import { can } from "@/lib/permissions";
import { PrimarySidebar, type SidebarSection } from "@/components/ui/PrimarySidebar";
import { BreadcrumbTail } from "@/components/ui/BreadcrumbTail";
import { CommandPalette, type PaletteItem } from "@/components/ui/CommandPalette";

/**
 * Shell-ul turului (Graphite): sidebar 236px cu secțiunile
 * TOUR / MANAGEMENT / ORGANIZATION. Navigarea pe zile se face din
 * Calendar + săgețile prev/next din headerul zilei (rail-ul de date
 * din dreapta a fost înlocuit de inspector, conform designului aprobat).
 */
export default async function TourLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase, permission, tier } = await requireOrg(orgSlug);

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase
      .from("tours")
      .select("id, name")
      .eq("id", tourId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("days")
      .select("date, day_type")
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  const allDates = (days ?? []).map((d) => d.date);
  const showCount = (days ?? []).filter((d) => d.day_type === "show").length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const defaultDate = allDates.includes(todayKey)
    ? todayKey
    : (allDates.find((d) => d >= todayKey) ?? allDates.at(-1) ?? todayKey);

  const base = `/o/${orgSlug}/t/${tourId}`;
  const dayBase = `${base}/d/${defaultDate}`;
  const canAccounting = can({ tier, permission }, "view_accounting");

  const sections: SidebarSection[] = [
    {
      label: "Tour",
      items: [
        { label: "Overview", href: dayBase, match: "/d/" },
        { label: "Calendar", href: `${base}/calendar`, match: "/calendar" },
        { label: "Schedule", href: `${dayBase}#schedule` },
        { label: "Travel", href: `${base}/travel`, match: "/travel" },
        { label: "Hotels", href: `${base}/hotels`, match: "/hotels" },
        { label: "Documents", href: `${base}/attachments`, match: "/attachments" },
        { label: "Gear", href: `${base}/gear`, match: "/gear" },
      ],
    },
    {
      label: "Management",
      items: [
        { label: "Personnel", href: `${base}/personnel`, match: "/personnel" },
        ...(canAccounting
          ? [{ label: "Finances", href: `${base}/finances`, match: "/finances" }]
          : []),
        { label: "Tour passes", href: `${base}/passes`, match: "/passes" },
        { label: "Tour settings", href: `${base}/settings`, match: `/t/${tourId}/settings` },
      ],
    },
    {
      label: "Organization",
      items: [
        { label: "Route map", href: `${base}/dashboard`, match: "/dashboard" },
        { label: "Contacts", href: `/o/${orgSlug}/contacts` },
      ],
    },
  ];

  const paletteItems: PaletteItem[] = sections.flatMap((section) =>
    section.items.map((item) => ({
      label: item.label,
      href: item.href,
      kind: "Screen",
    })),
  );

  return (
    <div className="flex h-full overflow-hidden">
      <BreadcrumbTail label={tour.name} />
      <CommandPalette items={paletteItems} />
      <PrimarySidebar
        tourName={tour.name}
        tourMeta={`${showCount} shows · ${allDates.length} days`}
        sections={sections}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

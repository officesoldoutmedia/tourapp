import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireOrg } from "@/lib/org";
import { PageHeader } from "@/components/ui/PageHeader";

/** Hotels la nivel de TUR (prototip Graphite): proprietăți + room list. */
export default async function TourHotelsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; tourId: string }>;
}) {
  const { orgSlug, tourId } = await params;
  const { supabase } = await requireOrg(orgSlug);
  const t = await getTranslations("tourHotels");
  const locale = await getLocale();

  const [{ data: tour }, { data: days }] = await Promise.all([
    supabase.from("tours").select("id, name").eq("id", tourId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("days")
      .select(
        "id, date, city, day_hotels(id, name, address_line1, city, check_in_date, check_out_date, deleted_at, sort_order, room_list_entries(id, guest_name, room_number, room_type, deleted_at, sort_order, tour_personnel(first_name, last_name, role)))",
      )
      .eq("tour_id", tourId)
      .is("deleted_at", null)
      .order("date"),
  ]);
  if (!tour) notFound();

  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const fmt = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : null);
  const nights = (a: string | null, b: string | null) => {
    if (!a || !b) return null;
    const n = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
    return n > 0 ? n : null;
  };

  type RoomEntry = {
    id: string;
    guest_name: string | null;
    room_number: string | null;
    room_type: string | null;
    deleted_at: string | null;
    sort_order: number | null;
    tour_personnel: { first_name: string | null; last_name: string | null; role: string | null } | null;
  };
  type HotelRow = {
    id: string;
    name: string;
    address_line1: string | null;
    city: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    deleted_at: string | null;
    sort_order: number | null;
    room_list_entries: RoomEntry[];
  };

  const hotels = (days ?? []).flatMap((day) =>
    ((day.day_hotels ?? []) as unknown as HotelRow[])
      .filter((h) => !h.deleted_at)
      .map((hotel) => {
        const rooms = (hotel.room_list_entries ?? [])
          .filter((r) => !r.deleted_at)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const n = nights(hotel.check_in_date, hotel.check_out_date);
        const meta = [
          hotel.address_line1,
          [fmt(hotel.check_in_date), fmt(hotel.check_out_date)].filter(Boolean).join(" → ") || null,
          n != null ? t("nights", { count: n }) : null,
          rooms.length ? t("rooms", { count: rooms.length }) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return { date: day.date, hotel, rooms, meta };
      }),
  );

  const roomNights = hotels.reduce((sum, h) => {
    const n = nights(h.hotel.check_in_date, h.hotel.check_out_date) ?? 1;
    return sum + n * h.rooms.length;
  }, 0);

  return (
    <main className="w-full pb-11">
      <PageHeader
        eyebrow={t("countLine", { properties: hotels.length, roomNights })}
        title={t("title")}
        actions={
          <Link href={`/o/${orgSlug}/t/${tourId}/calendar`} className="btn-quiet h-8">
            {t("addHint")}
          </Link>
        }
      />

      <div className="max-w-[960px] px-8 pt-1.5">
        {hotels.length === 0 && (
          <p className="py-10 text-center text-[12.5px] text-tertiary">{t("empty")}</p>
        )}
        {hotels.map(({ date, hotel, rooms, meta }) => (
          <section key={hotel.id}>
            <div className="mb-0.5 mt-[30px] flex items-baseline gap-3">
              <Link
                href={`/o/${orgSlug}/t/${tourId}/d/${date}#hotels`}
                className="font-display text-[15px] font-semibold tracking-[-0.01em] text-primary hover:underline"
              >
                {hotel.name}
              </Link>
              {hotel.city && <span className="text-[11.5px] text-tertiary">{hotel.city}</span>}
              <span className="ml-auto font-mono text-[11px] text-tertiary">
                {fmt(date)}
              </span>
            </div>
            {meta && <p className="mb-2.5 text-[11.5px] text-secondary">{meta}</p>}
            <div className="border-t border-faint">
              {rooms.length === 0 && (
                <p className="border-b border-faint py-3 text-[11.5px] text-tertiary">
                  {t("noRooms")}
                </p>
              )}
              {rooms.map((room) => {
                const person = room.tour_personnel;
                const who =
                  room.guest_name ??
                  ([person?.first_name, person?.last_name].filter(Boolean).join(" ") || "—");
                return (
                  <div
                    key={room.id}
                    className="grid h-[46px] grid-cols-[minmax(0,1fr)_130px_90px_110px] items-center border-b border-faint transition-colors hover:bg-fill-row-hover"
                  >
                    <span className="flex min-w-0 items-baseline gap-2.5">
                      <span className="truncate text-[12.5px] font-medium text-primary">{who}</span>
                      {person?.role && (
                        <span className="truncate text-[11px] text-tertiary">{person.role}</span>
                      )}
                    </span>
                    <span className="text-[11.5px] text-secondary">{room.room_type ?? "—"}</span>
                    <span className="font-mono text-[12px] text-secondary">
                      {room.room_number ?? "—"}
                    </span>
                    <span className="pr-1 text-right text-[11px] text-tertiary">
                      {(() => {
                        const n = nights(hotel.check_in_date, hotel.check_out_date);
                        return n != null ? t("nights", { count: n }) : "";
                      })()}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

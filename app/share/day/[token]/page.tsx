import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getDaySheetData } from "@/lib/daysheet";
import { formatDayHeader, formatTimeInZone } from "@/lib/datetime";

export const dynamic = "force-dynamic";

/**
 * Day sheet public [N §6.17.4]: link tokenizat read-only, doar itemii
 * fără reguli de visibility ("basic itinerary"). Fără cont.
 */
export default async function SharedDayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();

  const supabase = createServiceClient();
  // expirarea se verifică în SQL (now()) — componenta rămâne pură
  const { data: link } = await supabase
    .from("share_links")
    .select("day_id")
    .eq("token", token)
    .is("revoked_at", null)
    .or("expires_at.is.null,expires_at.gt.now()")
    .maybeSingle();
  if (!link) notFound();

  const day = await getDaySheetData(supabase, link.day_id, {
    publicOnly: true,
    includeRooms: false,
  });
  if (!day) notFound();
  const tz = day.timezone ?? "UTC";

  const clock = (t: string | null) => (t ? t.slice(0, 5) : "");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">{day.tour}</p>
        <h1 className="text-2xl font-semibold">
          {[day.city, day.country].filter(Boolean).join(", ") || day.day_type}
        </h1>
        <p className="text-sm text-neutral-500">
          {formatDayHeader(day.date, tz, "ro")} · {day.day_type}
        </p>
      </header>

      {day.general_notes && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{day.general_notes}</p>
        </section>
      )}

      {day.schedule.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Schedule</h2>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {day.schedule.map((item, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-neutral-600">
                  {item.start_at ? formatTimeInZone(new Date(item.start_at), tz) : "—"}
                  {item.end_at && `–${formatTimeInZone(new Date(item.end_at), tz)}`}
                </span>
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {day.events.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Event</h2>
          {day.events.map((event, i) => (
            <p key={i} className="text-sm">
              <b>{event.title}</b>
              {event.address && <span className="text-neutral-500"> — {event.address}</span>}
            </p>
          ))}
        </section>
      )}

      {day.travel.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Travel</h2>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {day.travel.map((item, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-neutral-600">
                  {clock(item.depart_time)}
                  {item.arrive_time && `–${clock(item.arrive_time)}`}
                </span>
                <span>{item.title ?? "Travel"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {day.hotels.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Hotels</h2>
          {day.hotels.map((hotel, i) => (
            <p key={i} className="text-sm">
              🏨 {hotel.name}
              {hotel.city && `, ${hotel.city}`}
            </p>
          ))}
        </section>
      )}

      <footer className="border-t border-neutral-100 pt-3 text-xs text-neutral-400">
        TourApp · read-only day sheet
      </footer>
    </main>
  );
}

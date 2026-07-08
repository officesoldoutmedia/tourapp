"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createEvent, searchVenues, type VenueHit } from "./e/actions";

export interface EventSummary {
  id: string;
  title: string | null;
  venue_name: string | null;
}

export function EventsSection({
  orgSlug,
  tourId,
  date,
  dayId,
  events,
  canEdit,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  events: EventSummary[];
  canEdit: boolean;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VenueHit[]>([]);
  const [manual, setManual] = useState(false);
  const [newVenue, setNewVenue] = useState({ name: "", city: "", country: "" });
  const [duplicates, setDuplicates] = useState<VenueHit[] | null>(null);
  const [pending, startTransition] = useTransition();

  function search(q: string) {
    setQuery(q);
    if (q.trim().length >= 2) {
      startTransition(async () => setHits(await searchVenues(orgSlug, q)));
    } else {
      setHits([]);
    }
  }

  function attach(input: Parameters<typeof createEvent>[3]) {
    startTransition(async () => {
      const result = await createEvent(orgSlug, tourId, date, input);
      if (result?.duplicates) setDuplicates(result.duplicates);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t("title")}</h2>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
          >
            + {t("addEvent")}
          </button>
        )}
      </div>

      {events.length === 0 && !adding && (
        <p className="text-sm text-neutral-400">{t("noEvents")}</p>
      )}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 empty:hidden">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              href={`/o/${orgSlug}/t/${tourId}/d/${date}/e/${event.id}`}
              className="flex items-center justify-between px-3 py-2 hover:bg-neutral-50"
            >
              <span className="text-sm font-medium">
                {event.title ?? event.venue_name ?? "—"}
              </span>
              <span className="text-xs text-neutral-500">{event.venue_name}</span>
            </Link>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
          {!manual ? (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder={t("searchVenue")}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <ul className="divide-y divide-neutral-100 empty:hidden">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      disabled={pending}
                      onClick={() => attach({ dayId, venueId: hit.id })}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-sm hover:bg-neutral-50"
                    >
                      <span>
                        {hit.name}
                        <span className="ml-2 text-xs text-neutral-500">
                          {[hit.city, hit.country].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${hit.source === "catalog" ? "bg-blue-100 text-blue-800" : "bg-neutral-100 text-neutral-600"}`}
                      >
                        {hit.source === "catalog" ? t("sourceCatalog") : t("sourceOrg")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  setManual(true);
                  setNewVenue((v) => ({ ...v, name: query }));
                }}
                className="text-xs font-medium text-neutral-600 underline"
              >
                {t("createManually")}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                value={newVenue.name}
                onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })}
                placeholder={t("venueName")}
                className="min-w-40 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                value={newVenue.city}
                onChange={(e) => setNewVenue({ ...newVenue, city: e.target.value })}
                placeholder="Oraș / City"
                className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <input
                value={newVenue.country}
                onChange={(e) => setNewVenue({ ...newVenue, country: e.target.value })}
                placeholder="Țară / Country"
                className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm"
              />
              <button
                disabled={pending || !newVenue.name.trim()}
                onClick={() => attach({ dayId, newVenue })}
                className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                {tc("save")}
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setAdding(false);
              setManual(false);
              setDuplicates(null);
            }}
            className="text-xs text-neutral-500 underline"
          >
            {tc("cancel")}
          </button>

          {/* Dialog "Multiple Records Found" [C §6.5.1.5] */}
          {duplicates && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold">{t("duplicatesFound")}</p>
              <p className="text-xs text-neutral-600">{t("duplicatesHint")}</p>
              <ul className="space-y-1">
                {duplicates.map((dupe) => (
                  <li key={dupe.id} className="flex items-center justify-between text-sm">
                    <span>
                      {dupe.name}{" "}
                      <span className="text-xs text-neutral-500">
                        {[dupe.city, dupe.country].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <button
                      disabled={pending}
                      onClick={() => attach({ dayId, venueId: dupe.id })}
                      className="rounded border border-neutral-400 px-2 py-0.5 text-xs font-medium"
                    >
                      {t("useExisting")}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                disabled={pending}
                onClick={() => attach({ dayId, newVenue, ignoreDuplicates: true })}
                className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white"
              >
                {t("createNew")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

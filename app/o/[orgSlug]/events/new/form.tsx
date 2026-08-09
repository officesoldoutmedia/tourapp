"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createOneOffEvent, type OneOffPayload } from "./actions";
import { searchVenues, type VenueHit } from "../../t/[tourId]/d/[date]/e/actions";

export function NewEventForm({
  orgSlug,
  artists,
  scheduleTemplates,
  advanceTemplates,
  dealTemplates,
  defaultArtistId,
}: {
  orgSlug: string;
  artists: { id: string; name: string }[];
  scheduleTemplates: { id: string; name: string }[];
  advanceTemplates: { id: string; title: string }[];
  dealTemplates: {
    id: string;
    name: string;
    artist_id: string;
    schedule_template_id: string | null;
  }[];
  defaultArtistId?: string;
}) {
  const t = useTranslations("newEvent");
  const tc = useTranslations("common");

  const [artistId, setArtistId] = useState<string>(
    defaultArtistId ?? (artists.length === 1 ? artists[0].id : ""),
  );
  const [date, setDate] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Romania");
  const [eventName, setEventName] = useState("");
  const [stageTime, setStageTime] = useState("");
  const [scheduleTemplateId, setScheduleTemplateId] = useState("");
  const [advanceTemplateId, setAdvanceTemplateId] = useState("");
  const [dealTemplateId, setDealTemplateId] = useState("");

  const [venueQuery, setVenueQuery] = useState("");
  const [venueHits, setVenueHits] = useState<VenueHit[]>([]);
  // "none" (default) | "manual" | hit.id
  const [venueChoice, setVenueChoice] = useState<string>("none");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  function search() {
    const q = venueQuery.trim();
    if (q.length < 2) {
      setVenueHits([]);
      return;
    }
    startSearch(async () => {
      const hits = await searchVenues(orgSlug, q);
      setVenueHits(hits.slice(0, 20));
    });
  }

  // Deal-urile sunt per-artist — filtrare client-side pe artistul selectat;
  // se golește la schimbarea artistului (handler-ul de mai jos).
  const artistDealTemplates = useMemo(
    () => dealTemplates.filter((d) => d.artist_id === artistId),
    [dealTemplates, artistId],
  );

  const selectedVenue = useMemo<OneOffPayload["venue"]>(() => {
    if (venueChoice === "none") return null;
    if (venueChoice === "manual") {
      const name = venueQuery.trim();
      if (!name) return null;
      return { newVenue: { name, city, country } };
    }
    const hit = venueHits.find((h) => h.id === venueChoice);
    if (!hit) return null;
    return hit.source === "google" ? { googleVenue: hit.google } : { venueId: hit.id };
  }, [venueChoice, venueHits, venueQuery, city, country]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createOneOffEvent(orgSlug, {
        artistId,
        date,
        city,
        country,
        eventName: eventName.trim() || undefined,
        stageTime: stageTime || undefined,
        scheduleTemplateId: scheduleTemplateId || null,
        advanceTemplateId: advanceTemplateId || null,
        dealTemplateId: dealTemplateId || null,
        venue: selectedVenue,
      });
      if (result?.error) setError(tc("error"));
    });
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("artistLabel")}</span>
          <select
            value={artistId}
            onChange={(e) => {
              setArtistId(e.target.value);
              setDealTemplateId(""); // deal-urile sunt per-artist — se golește la schimbare
            }}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="" disabled>
              —
            </option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("dateLabel")}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("cityLabel")}</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("countryLabel")}</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("nameLabel")}</span>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("stageTimeLabel")}</span>
          <input
            type="time"
            value={stageTime}
            onChange={(e) => setStageTime(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("scheduleTemplateLabel")}</span>
          <select
            value={scheduleTemplateId}
            onChange={(e) => setScheduleTemplateId(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">{t("noTemplate")}</option>
            {scheduleTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("advanceTemplateLabel")}</span>
          <select
            value={advanceTemplateId}
            onChange={(e) => setAdvanceTemplateId(e.target.value)}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">{t("noTemplate")}</option>
            {advanceTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("dealLabel")}</span>
          <select
            value={dealTemplateId}
            onChange={(e) => {
              const id = e.target.value;
              setDealTemplateId(id);
              // C2: deal-ul aduce template-ul de program (§9.1) — doar dacă
              // are unul legat; alegerea manuală ulterioară rămâne posibilă.
              // Reconciliat cu lista live de scheduleTemplates — un deal salvat
              // înainte ca template-ul lui să fie șters (soft-delete) nu mai
              // pre-completează un id mort (select-ul ar rămâne gol oricum).
              const tpl = artistDealTemplates.find((d) => d.id === id);
              if (
                tpl?.schedule_template_id &&
                scheduleTemplates.some((s) => s.id === tpl.schedule_template_id)
              ) {
                setScheduleTemplateId(tpl.schedule_template_id);
              }
            }}
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          >
            <option value="">{t("noDeal")}</option>
            {artistDealTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("venueLabel")}</h2>
        <div className="flex gap-2">
          <input
            value={venueQuery}
            onChange={(e) => setVenueQuery(e.target.value)}
            placeholder={t("venueSearch")}
            className="flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="btn-quiet h-9 px-3 disabled:opacity-50"
          >
            {t("venueSearch")}
          </button>
        </div>

        <div className="space-y-1.5 rounded-[12px] border border-hairline bg-surface p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="venue"
              checked={venueChoice === "none"}
              onChange={() => setVenueChoice("none")}
            />
            {t("venueNone")}
          </label>

          {venueHits.map((hit) => (
            <label key={hit.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="venue"
                checked={venueChoice === hit.id}
                onChange={() => setVenueChoice(hit.id)}
              />
              <span>
                {hit.name}
                <span className="ml-2 text-xs text-secondary">
                  {[hit.city, hit.country].filter(Boolean).join(", ")}
                </span>
              </span>
            </label>
          ))}

          {venueQuery.trim() && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="venue"
                checked={venueChoice === "manual"}
                onChange={() => setVenueChoice("manual")}
              />
              {t("venueCreate", { name: venueQuery.trim() })}
            </label>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={pending || !artistId || !date || !city}
        className="btn-primary h-9 disabled:opacity-50"
      >
        {pending ? t("creating") : t("create")}
      </button>
    </main>
  );
}

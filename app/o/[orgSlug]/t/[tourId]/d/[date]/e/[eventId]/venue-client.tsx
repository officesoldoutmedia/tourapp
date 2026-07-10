"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { unlinkEventVenue, updateEventVenue } from "../actions";

export interface VenueInfo {
  name: string;
  address_line1: string | null;
  city: string | null;
  country: string | null;
  capacity: number | null;
  organization_id: string | null;
  copied_from: string | null;
  source: string;
}

export function VenueSection({
  orgSlug,
  eventId,
  venue,
  canEdit,
}: {
  orgSlug: string;
  eventId: string;
  venue: VenueInfo;
  canEdit: boolean;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: venue.name,
    address_line1: venue.address_line1 ?? "",
    city: venue.city ?? "",
    country: venue.country ?? "",
    capacity: venue.capacity?.toString() ?? "",
  });
  const [pending, startTransition] = useTransition();

  const isGlobal = venue.organization_id === null;

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="space-y-2 rounded-[12px] border border-hairline bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm font-medium">
          {t("venue")}: {venue.name}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isGlobal
                ? "bg-accent-subtle text-accent"
                : venue.source === "google"
                  ? "bg-success-subtle text-success"
                  : "bg-inset text-secondary"
            }`}
          >
            {isGlobal ? t("sourceCatalog") : venue.copied_from ? t("localCopy") : t("sourceOrg")}
          </span>
        </span>
        {canEdit && !editing && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="rounded border border-hairline px-2 py-1 text-xs font-medium"
            >
              ✎ {t("editVenue")}
            </button>
            <button
              disabled={pending}
              title={t("unlinkHint")}
              onClick={() => run(() => unlinkEventVenue(orgSlug, eventId))}
              className="rounded border border-hairline px-2 py-1 text-xs font-medium"
            >
              {t("unlinkVenue")}
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-secondary">
        {[venue.address_line1, venue.city, venue.country].filter(Boolean).join(", ") || "—"}
        {venue.capacity != null && ` · ${t("capacity")}: ${venue.capacity}`}
      </p>

      {editing && (
        <div className="space-y-2 border-t border-hairline pt-2">
          {isGlobal && (
            <p className="rounded bg-accent-subtle px-2 py-1 text-xs text-accent">
              {t("cowHint")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("venueName")} className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-sm" />
            <input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} placeholder="Adresă / Address" className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-sm" />
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Oraș / City" className="w-32 rounded border border-hairline px-2 py-1 text-sm" />
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Țară / Country" className="w-32 rounded border border-hairline px-2 py-1 text-sm" />
            <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder={t("capacity")} className="w-24 rounded border border-hairline px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-2">
            <button
              disabled={pending || !form.name.trim()}
              onClick={() =>
                run(() =>
                  updateEventVenue(orgSlug, eventId, {
                    name: form.name.trim(),
                    address_line1: form.address_line1 || null,
                    city: form.city || null,
                    country: form.country || null,
                    capacity: form.capacity ? Number(form.capacity) : null,
                  }),
                )
              }
              className="btn-quiet h-7 px-2.5 disabled:opacity-40"
            >
              {tc("save")}
            </button>
            <button onClick={() => setEditing(false)} className="rounded border border-hairline px-3 py-1 text-xs">
              {tc("cancel")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

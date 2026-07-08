"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { suggestTimezone, allTimezones, DEFAULT_TZ } from "@/lib/tzLookup";
import { createTour, type WizardDay } from "./actions";

const DAY_TYPES = [
  "show",
  "travel",
  "day_off",
  "rehearsal",
  "promo",
  "production",
  "home",
  "studio",
  "load_in",
  "writing",
  "new",
] as const;

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 366) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function TourWizard({
  orgSlug,
  templates,
}: {
  orgSlug: string;
  templates: { id: string; name: string }[];
}) {
  const t = useTranslations("tours");
  const td = useTranslations("dayTypes");
  const tc = useTranslations("common");

  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState<WizardDay[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timezones = useMemo(() => allTimezones(), []);

  function generateDays(fromValue: string, toValue: string) {
    if (!fromValue || !toValue || fromValue > toValue) return;
    setDays((prev) => {
      const byDate = new Map(prev.map((d) => [d.date, d]));
      return datesBetween(fromValue, toValue).map(
        (date) =>
          byDate.get(date) ?? {
            date,
            day_type: "new",
            city: "",
            country: "",
            timezone: DEFAULT_TZ,
          },
      );
    });
  }

  function updateDay(idx: number, patch: Partial<WizardDay>) {
    setDays((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      if (patch.country !== undefined) {
        const tz = suggestTimezone(patch.country);
        if (tz) next[idx].timezone = tz;
      }
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTour(orgSlug, {
        name,
        startDate: from,
        endDate: to,
        days,
        templateId: templateId || null,
      });
      if (result?.error) setError(tc("error"));
    });
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t("newTour")}</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">{t("name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("from")}</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              generateDays(e.target.value, to);
            }}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("to")}</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              generateDays(from, e.target.value);
            }}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {days.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">{t("wizardDays")}</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">{t("dayTypeLabel")}</th>
                  <th className="px-3 py-2">{t("city")}</th>
                  <th className="px-3 py-2">{t("country")}</th>
                  <th className="px-3 py-2">{t("timezone")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {days.map((day, idx) => (
                  <tr key={day.date}>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                      {day.date}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={day.day_type}
                        onChange={(e) =>
                          updateDay(idx, { day_type: e.target.value })
                        }
                        className="rounded border border-neutral-300 px-2 py-1"
                      >
                        {DAY_TYPES.map((dt) => (
                          <option key={dt} value={dt}>
                            {td(dt)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={day.city}
                        onChange={(e) => updateDay(idx, { city: e.target.value })}
                        className="w-32 rounded border border-neutral-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={day.country}
                        onChange={(e) =>
                          updateDay(idx, { country: e.target.value })
                        }
                        className="w-32 rounded border border-neutral-300 px-2 py-1"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={day.timezone}
                        onChange={(e) =>
                          updateDay(idx, { timezone: e.target.value })
                        }
                        className="w-48 rounded border border-neutral-300 px-2 py-1"
                      >
                        {timezones.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("applyTemplate")}</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">{t("noTemplate")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={pending || !name.trim() || days.length === 0}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {t("createTour")}
      </button>
    </main>
  );
}

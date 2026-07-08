"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Mini-calendar de navigare [A.2] — lună cu zilele turului evidențiate;
 * click pe o zi de tur navighează la ea.
 */
export function MiniCalendar({
  baseHref,
  dates,
  locale,
}: {
  baseHref: string; // /o/[slug]/t/[tourId]/d
  dates: string[]; // YYYY-MM-DD ale zilelor turului
  locale: string;
}) {
  const router = useRouter();
  const dateSet = useMemo(() => new Set(dates), [dates]);
  const [month, setMonth] = useState(() =>
    (dates[0] ?? new Date().toISOString().slice(0, 10)).slice(0, 7),
  );

  const [year, monthNum] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNum - 1, 1));
  // Luni = prima coloană
  const startPad = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstDay);

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  }

  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" });
    // 2024-01-01 a fost luni
    return Array.from({ length: 7 }, (_, i) =>
      format.format(new Date(Date.UTC(2024, 0, 1 + i))),
    );
  }, [locale]);

  return (
    <div className="border-t border-hairline p-2 text-xs">
      <div className="mb-1 flex items-center justify-between px-1">
        <button onClick={() => shift(-1)} className="rounded px-1.5 hover:bg-subtle">‹</button>
        <span className="font-semibold capitalize">{monthLabel}</span>
        <button onClick={() => shift(1)} className="rounded px-1.5 hover:bg-subtle">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w, i) => (
          <span key={i} className="text-[10px] text-tertiary">{w}</span>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNum = i + 1;
          const iso = `${month}-${String(dayNum).padStart(2, "0")}`;
          const isTourDay = dateSet.has(iso);
          return (
            <button
              key={iso}
              disabled={!isTourDay}
              onClick={() => router.push(`${baseHref}/${iso}`)}
              className={`rounded py-0.5 ${
                isTourDay
                  ? "bg-accent-subtle font-semibold text-accent hover:bg-accent-border/40"
                  : "text-disabled"
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

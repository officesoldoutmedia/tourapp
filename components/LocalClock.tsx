"use client";

/** Ora locală live a zilei ("Thursday, 09:43 (EEST)") — ca în Master Tour. */
import { useEffect, useState } from "react";

export function LocalClock({ tz, locale }: { tz: string; locale: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 30_000);
    const raf = requestAnimationFrame(update);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);
  if (!now) return <span className="font-mono text-sm text-tertiary">—</span>;

  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: tz }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(now);
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: tz })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";

  return (
    <span className="text-sm">
      <span className="capitalize">{weekday}</span>,{" "}
      <span className="font-mono font-medium">{time}</span>{" "}
      <span className="text-tertiary">({zone})</span>
    </span>
  );
}

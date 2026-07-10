"use client";

/** Ceasul live din headerul zilei (Graphite: GS 32/500, tabular). */
import { useEffect, useState } from "react";

export function HeaderClock({ tz, subLabel }: { tz: string; subLabel: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 1000);
    const raf = requestAnimationFrame(update);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
      }).format(now)
    : "--:--";

  return (
    <div className="text-right">
      <p className="font-display text-[32px] font-medium leading-none tracking-[-0.03em] text-primary tabular-nums">
        {time}
      </p>
      <p className="mt-1 text-[11px] text-tertiary">{subLabel}</p>
    </div>
  );
}

"use client";

/**
 * Day workspace — "Up next" Hero (varianta aprobată, fără casetă) +
 * timeline-ul zilei cu rail continuu (Graphite README §2).
 * Primește itemii precompuși de server (ore deja formatate în tz-ul
 * zilei); doar starea done/current/upcoming se derivă client-side.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export interface FocusItem {
  id: string;
  time: string; // HH:mm în tz-ul zilei
  title: string;
  sub: string | null;
  confirmed: boolean;
  startMs: number;
  endMs: number; // start + durată (sau +45min implicit)
}

type Status = "done" | "current" | "upcoming";

export function DayFocus({
  items,
  isToday,
  isPast,
  labels,
}: {
  items: FocusItem[];
  isToday: boolean;
  isPast: boolean;
  labels: {
    upNext: string;
    today: string;
    scheduledItems: string;
    complete: string;
    onSchedule: string;
    unconfirmed: string;
  };
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    const timer = setInterval(update, 30_000);
    const raf = requestAnimationFrame(update);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (items.length === 0) return null;

  function statusOf(item: FocusItem): Status {
    if (isPast) return "done";
    if (!isToday || nowMs === null) return "upcoming";
    if (item.endMs <= nowMs) return "done";
    const current = items.find((i) => i.endMs > nowMs);
    return current?.id === item.id ? "current" : "upcoming";
  }

  const hero = isPast
    ? null
    : (items.find((i) => statusOf(i) === "current") ??
      items.find((i) => statusOf(i) === "upcoming") ??
      null);

  return (
    <div>
      {/* ── Hero "Up next" — borderless, tipografic ── */}
      {hero && (
        <div className="flex items-end justify-between gap-6 border-b border-hairline pb-6 pt-0.5">
          <div className="min-w-0">
            <p className="eyebrow" style={{ color: "var(--accent)", letterSpacing: "0.09em" }}>
              {labels.upNext}
            </p>
            <h2 className="mt-1.5 truncate font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-primary">
              {hero.title}
            </h2>
            {hero.sub && <p className="mt-1.5 truncate text-[13px] text-secondary">{hero.sub}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="font-display text-[44px] font-medium leading-none tracking-[-0.04em] text-primary tabular-nums">
              {hero.time}
            </p>
            <p
              className={`mt-1.5 flex items-center justify-end gap-1.5 text-[11px] ${hero.confirmed ? "text-success" : "text-warning"}`}
            >
              <span
                className={`h-[5px] w-[5px] rounded-full ${hero.confirmed ? "bg-success" : "bg-warning"}`}
              />
              {hero.confirmed ? labels.onSchedule : labels.unconfirmed}
            </p>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex items-baseline justify-between pb-1 pt-6">
        <h3 className="section-title">{labels.today}</h3>
        <span className="text-[11px] text-tertiary">{labels.scheduledItems}</span>
      </div>
      <div className="relative border-t" style={{ borderColor: "rgba(255,255,255,.07)" }}>
        {/* rail-ul vertical continuu */}
        <span
          aria-hidden
          className="absolute bottom-7 top-7 w-px"
          style={{ left: 70, background: "rgba(255,255,255,.07)" }}
        />
        {items.map((item) => {
          const status = statusOf(item);
          const isSelected = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(isSelected ? null : item.id)}
              className="grid h-14 w-full grid-cols-[56px_28px_1fr_auto] items-center border-b text-left transition-colors"
              style={{
                borderColor: "rgba(255,255,255,.06)",
                background: isSelected ? "var(--sel-row)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,.025)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.background = "";
              }}
            >
              <span
                className={`font-mono text-[12px] ${
                  status === "done"
                    ? "text-tertiary"
                    : status === "current"
                      ? "text-primary"
                      : "text-secondary"
                }`}
              >
                {item.time}
              </span>
              <span className="relative z-10 flex items-center justify-start">
                {status === "done" ? (
                  <Check size={13} strokeWidth={2.25} className="text-tertiary" />
                ) : status === "current" ? (
                  <span
                    className="ml-[3px] h-[7px] w-[7px] rounded-full bg-accent motion-safe:[animation:nowPulse_2.4s_ease-in-out_infinite]"
                  />
                ) : (
                  <span
                    className="ml-[3px] h-[7px] w-[7px] rounded-full border"
                    style={{ borderColor: "rgba(255,255,255,.25)" }}
                  />
                )}
              </span>
              <span className="min-w-0 pr-4">
                <span
                  className={`block truncate text-[13px] font-medium ${
                    status === "done" ? "text-done" : "text-primary"
                  }`}
                >
                  {item.title}
                </span>
                {item.sub && (
                  <span
                    className={`block truncate text-[11.5px] ${
                      status === "done" ? "text-tertiary" : "text-secondary"
                    }`}
                  >
                    {item.sub}
                  </span>
                )}
              </span>
              <span
                className={`pr-1 text-[11px] font-medium ${
                  status === "done"
                    ? "text-tertiary"
                    : status === "current"
                      ? "text-accent"
                      : "text-transparent"
                }`}
              >
                {status === "done" ? labels.complete : status === "current" ? labels.upNext : "·"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

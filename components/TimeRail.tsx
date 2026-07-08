"use client";

/**
 * THE TIME RAIL — semnătura produsului (design system §5.6).
 * Coloană verticală mono cu orele zilei; blocurile de schedule și travel
 * se ancorează pe ea. Linia "acum" apare doar dacă ziua e azi.
 */
import { useEffect, useState } from "react";
import { Plane, CarFront, TrainFront, Ship, Mic } from "lucide-react";
import { formatTimeInZone } from "@/lib/datetime";

export interface RailBlock {
  id: string;
  kind: "schedule" | "publicity" | "ground" | "air" | "rail" | "sea";
  title: string;
  startAt: string; // ISO
  endAt: string | null;
  confirmed: boolean;
  party?: string | null;
}

const HOUR_PX = 44;
const RAIL_W = 56;

const TRAVEL_ICON = {
  ground: CarFront,
  air: Plane,
  rail: TrainFront,
  sea: Ship,
} as const;

function localMinutes(iso: string, tz: string): number {
  const [h, m] = formatTimeInZone(new Date(iso), tz).split(":").map(Number);
  return h * 60 + m;
}

export function TimeRail({
  date,
  tz,
  blocks,
}: {
  date: string;
  tz: string;
  blocks: RailBlock[];
}) {
  // "acum" — doar client-side, refresh la minut (§5.6). Starea pornește
  // null (SSR-safe) și se populează din interval, nu sincron în effect.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = setInterval(update, 60_000);
    const raf = requestAnimationFrame(update);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const timed = blocks.filter((b) => b.startAt);
  if (timed.length === 0) return null;

  // fereastra de ore: min–max din itemi, cu aer de o oră
  const starts = timed.map((b) => localMinutes(b.startAt, tz));
  const ends = timed.map((b) => {
    if (!b.endAt) return localMinutes(b.startAt, tz) + 60;
    const duration = (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60_000;
    return localMinutes(b.startAt, tz) + Math.max(duration, 30);
  });
  const startHour = Math.max(0, Math.floor(Math.min(...starts) / 60) - 1);
  const endHour = Math.min(28, Math.ceil(Math.max(...ends) / 60) + 1);
  const totalMinutes = (endHour - startHour) * 60;
  const y = (minutes: number) => ((minutes - startHour * 60) / 60) * HOUR_PX;

  // lane assignment pentru suprapuneri (§5.6 — coloane paralele cu gap)
  const sorted = [...timed].sort(
    (a, b) => localMinutes(a.startAt, tz) - localMinutes(b.startAt, tz),
  );
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const block of sorted) {
    const start = localMinutes(block.startAt, tz);
    const end = ends[timed.indexOf(block)];
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.set(block.id, lane);
  }
  const laneCount = Math.max(1, laneEnds.length);

  const isToday =
    now !== null &&
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) === date;
  const nowMinutes = isToday && now ? localMinutes(now.toISOString(), tz) : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface shadow-xs">
      <div className="relative" style={{ height: totalMinutes * (HOUR_PX / 60) + 16 }}>
        {/* rail-ul de ore */}
        <div
          className="absolute inset-y-0 left-0 border-r border-hairline bg-canvas"
          style={{ width: RAIL_W }}
        />
        {Array.from({ length: endHour - startHour + 1 }, (_, i) => {
          const hour = startHour + i;
          return (
            <div key={hour} className="absolute inset-x-0" style={{ top: y(hour * 60) + 8 }}>
              <span
                className="absolute -translate-y-1/2 pr-2 text-right font-mono text-xs text-tertiary"
                style={{ width: RAIL_W }}
              >
                {String(hour % 24).padStart(2, "0")}:00
              </span>
              <div
                className="absolute right-0 border-t border-hairline"
                style={{ left: RAIL_W }}
              />
            </div>
          );
        })}

        {/* linia "acum" (§5.6) */}
        {nowMinutes !== null &&
          nowMinutes >= startHour * 60 &&
          nowMinutes <= endHour * 60 && (
            <div
              className="absolute inset-x-0 z-10"
              style={{ top: y(nowMinutes) + 8 }}
            >
              <div className="absolute right-0 border-t border-accent" style={{ left: RAIL_W }} />
              <span
                className="absolute h-2 w-2 -translate-y-1/2 rounded-full bg-accent motion-safe:animate-pulse"
                style={{ left: RAIL_W - 4 }}
              />
            </div>
          )}

        {/* blocurile */}
        {timed.map((block) => {
          const start = localMinutes(block.startAt, tz);
          const duration = block.endAt
            ? Math.max((Date.parse(block.endAt) - Date.parse(block.startAt)) / 60_000, 30)
            : 45;
          const lane = lanes.get(block.id) ?? 0;
          const laneWidth = 100 / laneCount;
          const blockHeight = Math.max(duration * (HOUR_PX / 60) - 2, 26);
          // sub 40px nu încap două rânduri → totul pe un singur rând
          const compact = blockHeight < 40;
          const isTravel = block.kind !== "schedule" && block.kind !== "publicity";
          const Icon =
            block.kind === "publicity"
              ? Mic
              : isTravel
                ? TRAVEL_ICON[block.kind as keyof typeof TRAVEL_ICON]
                : null;
          const timeLabel = (
            <>
              {formatTimeInZone(new Date(block.startAt), tz)}
              {block.endAt && `–${formatTimeInZone(new Date(block.endAt), tz)}`}
              {block.confirmed && <span className="ml-1 text-success">✓</span>}
            </>
          );
          return (
            <div
              key={block.id}
              className={`absolute flex flex-col justify-center overflow-hidden rounded-md border border-hairline bg-surface px-2 shadow-xs ${
                isTravel ? "border-l-3 border-l-party-5" : "border-l-3 border-l-accent"
              }`}
              style={{
                top: y(start) + 8,
                height: blockHeight,
                left: `calc(${RAIL_W + 8}px + ${lane * laneWidth}% - ${lane * laneWidth * ((RAIL_W + 16) / 100)}px)`,
                width: `calc(${laneWidth}% - ${laneWidth * ((RAIL_W + 16) / 100)}px - 8px)`,
              }}
            >
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-tight">
                {Icon && <Icon size={13} className="shrink-0 text-secondary" />}
                {block.party && (
                  <span className="shrink-0 rounded-full bg-accent-subtle px-1.5 text-[10px] font-bold text-accent">
                    {block.party}
                  </span>
                )}
                <span className="truncate">{block.title}</span>
                {compact && (
                  <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] font-normal text-tertiary">
                    {timeLabel}
                  </span>
                )}
              </p>
              {!compact && (
                <p className="font-mono text-[11px] text-tertiary">{timeLabel}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

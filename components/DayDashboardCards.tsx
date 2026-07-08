/**
 * Cardurile Weather + Local Map de pe dashboardul zilei
 * (blueprint §3.3 [C-S], design §5.5). Server components — zero JS client.
 */
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Droplets,
  Sunrise,
  Sunset,
  MapPin,
  Hotel,
} from "lucide-react";
import { weatherGroup, type WeatherDay } from "@/lib/weather";

const WEATHER_ICON = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
} as const;

export function WeatherCard({
  days,
  todayLabel,
  tomorrowLabel,
}: {
  days: WeatherDay[];
  todayLabel: string;
  tomorrowLabel: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Weather</h2>
      <div className="grid grid-cols-2 gap-4">
        {days.slice(0, 2).map((day, i) => {
          const Icon = WEATHER_ICON[weatherGroup(day.code)];
          const isFirst = i === 0;
          return (
            <div key={day.date} className={isFirst ? "" : "opacity-80"}>
              <p className="text-xs font-medium uppercase tracking-wider text-tertiary">
                {isFirst ? todayLabel : tomorrowLabel}
              </p>
              <p className="mt-1 flex items-center gap-2">
                <Icon
                  size={28}
                  strokeWidth={1.5}
                  className={isFirst ? "text-accent" : "text-secondary"}
                />
                <span className="font-mono text-xl font-medium">
                  {day.tMax}°
                  <span className="ml-1 text-sm text-tertiary">{day.tMin}°</span>
                </span>
              </p>
              <ul className="mt-2 space-y-1 text-xs text-secondary">
                {day.precipProb != null && (
                  <li className="flex items-center gap-1.5">
                    <Droplets size={13} strokeWidth={1.5} className="text-tertiary" />
                    <span className="font-mono">{day.precipProb}%</span>
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <Wind size={13} strokeWidth={1.5} className="text-tertiary" />
                  <span className="font-mono">{day.windMax} km/h</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Sunrise size={13} strokeWidth={1.5} className="text-tertiary" />
                    <span className="font-mono">{day.sunrise}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Sunset size={13} strokeWidth={1.5} className="text-tertiary" />
                    <span className="font-mono">{day.sunset}</span>
                  </span>
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface MapPinLink {
  kind: "venue" | "hotel";
  name: string;
  query: string; // adresa/numele pt Google Maps
}

export function MapCard({
  lat,
  lng,
  pins,
}: {
  lat: number;
  lng: number;
  pins: MapPinLink[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-xs">
      {/* embed keyless — cheia server-side rămâne privată [N] */}
      <iframe
        title="Local map"
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=13&output=embed`}
        className="h-44 w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      {pins.length > 0 && (
        <ul className="divide-y divide-hairline">
          {pins.map((pin, i) => (
            <li key={i}>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pin.query)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-subtle"
              >
                {pin.kind === "venue" ? (
                  <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-accent" />
                ) : (
                  <Hotel size={15} strokeWidth={1.5} className="shrink-0 text-secondary" />
                )}
                <span className="truncate">{pin.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

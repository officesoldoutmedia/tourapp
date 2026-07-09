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
import { LocalClock } from "@/components/LocalClock";
import { Star, Hotel as HotelIcon, Phone, Mail, Globe, Users } from "lucide-react";

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
  highlight,
  tz,
  locale,
  locationLabel,
}: {
  days: WeatherDay[];
  highlight: string; // ziua evidențiată (show day sau azi)
  tz: string;
  locale: string;
  locationLabel: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {locationLabel} <span className="font-normal text-tertiary">local time</span>
        </h2>
        <LocalClock tz={tz} locale={locale} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {days.slice(0, 4).map((day) => {
          const Icon = WEATHER_ICON[weatherGroup(day.code)];
          const isHl = day.date === highlight;
          const weekday = new Intl.DateTimeFormat(locale, {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(`${day.date}T00:00:00Z`));
          return (
            <div
              key={day.date}
              className={`rounded-md px-2 py-2 text-center ${isHl ? "border border-accent-border bg-accent-subtle/40" : ""}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                {weekday}
              </p>
              <Icon
                size={26}
                strokeWidth={1.5}
                className={`mx-auto mt-1 ${isHl ? "text-accent" : "text-secondary"}`}
              />
              <p className="mt-1 font-mono text-sm font-medium">
                {day.tMax}°<span className="text-tertiary">/{day.tMin}°</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-secondary">
                {day.precipProb != null && (
                  <li className="flex items-center justify-center gap-1">
                    <Droplets size={11} strokeWidth={1.5} className="text-tertiary" />
                    <span className="font-mono">{day.precipProb}%</span>
                  </li>
                )}
                <li className="flex items-center justify-center gap-1">
                  <Wind size={11} strokeWidth={1.5} className="text-tertiary" />
                  <span className="font-mono">{day.windMax}</span>
                </li>
                <li className="flex items-center justify-center gap-1 font-mono text-tertiary">
                  <Sunrise size={11} strokeWidth={1.5} />
                  {day.sunrise}
                </li>
                <li className="flex items-center justify-center gap-1 font-mono text-tertiary">
                  <Sunset size={11} strokeWidth={1.5} />
                  {day.sunset}
                </li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface VenueCardData {
  eventHref: string;
  name: string;
  address: string;
  url: string | null;
}

/** Cardul VENUES de pe dashboardul zilei (ca în Master Tour). */
export function VenuesCard({ venues }: { venues: VenueCardData[] }) {
  if (venues.length === 0) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <Star size={16} strokeWidth={1.5} className="text-accent" /> Venues
      </h2>
      <ul className="space-y-3">
        {venues.map((v, i) => (
          <li key={i} className="text-sm">
            <a href={v.eventHref} className="font-medium hover:underline">
              {v.name}
            </a>
            {v.address && <p className="text-secondary">{v.address}</p>}
            {v.url && (
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Globe size={11} strokeWidth={1.5} /> {v.url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface HotelCardData {
  name: string;
  address: string;
  phone: string | null;
}

export function HotelsCard({ hotels }: { hotels: HotelCardData[] }) {
  if (hotels.length === 0) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <HotelIcon size={16} strokeWidth={1.5} className="text-secondary" /> Hotels
      </h2>
      <ul className="space-y-3">
        {hotels.map((h, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">{h.name}</p>
            {h.address && <p className="text-secondary">{h.address}</p>}
            {h.phone && (
              <a
                href={`tel:${h.phone.replace(/\s+/g, "")}`}
                className="flex items-center gap-1 font-mono text-xs text-accent hover:underline"
              >
                <Phone size={11} strokeWidth={1.5} /> {h.phone}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** KEY CONTACTS — valoarea câmpului venue_info.venue_contacts (text liber). */
export function KeyContactsCard({ text }: { text: string }) {
  if (!text.trim()) return null;
  // liniile "Nume - Rol - telefon - email" devin rânduri; tel/email → linkuri
  const lines = text.split(/\n+/).filter((l) => l.trim());
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-xs">
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
        <Users size={16} strokeWidth={1.5} className="text-secondary" /> Key contacts
      </h2>
      <ul className="space-y-1.5 text-sm">
        {lines.map((line, i) => {
          const email = line.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0];
          const phone = line.match(/\+?[\d][\d\s().-]{6,}\d/)?.[0];
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-2">
              <span>{line.replace(email ?? "", "").replace(phone ?? "", "").replace(/[-–,;·]+\s*$/, "").trim()}</span>
              {phone && (
                <a href={`tel:${phone.replace(/[\s().-]/g, "")}`} className="flex items-center gap-1 font-mono text-xs text-accent hover:underline">
                  <Phone size={11} strokeWidth={1.5} /> {phone.trim()}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-1 text-xs text-accent hover:underline">
                  <Mail size={11} strokeWidth={1.5} /> {email}
                </a>
              )}
            </li>
          );
        })}
      </ul>
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

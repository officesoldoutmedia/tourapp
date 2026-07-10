"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDuration } from "@/lib/travel";
import { useTranslations } from "next-intl";
import {
  deleteFlightLeg,
  deleteTravelItem,
  setTravelPassengers,
  toggleTravelConfirmed,
  upsertFlightLeg,
  upsertTravelItem,
  type TravelItemInput,
} from "./travel-actions";

const TYPE_ICON = { ground: "🚌", air: "✈️", rail: "🚆", sea: "⛴" } as const;
type TravelType = keyof typeof TYPE_ICON;

export interface TravelItemData {
  id: string;
  travel_type: TravelType;
  title: string | null;
  auto_title: boolean;
  is_confirmed: boolean;
  party: string | null;
  origin_label: string | null;
  dest_label: string | null;
  depart_time: string | null; // 'HH:mm:ss'
  depart_day_offset: number;
  arrive_time: string | null;
  arrive_day_offset: number;
  distance: number | null;
  distance_unit: string;
  duration_min: number | null;
  detail: string | null;
  rail_line: string | null;
  train_number: string | null;
  ticket_status: string | null;
  confirmation_number: string | null;
  legs: {
    id: string;
    airline: string | null;
    flight_number: string | null;
    dep_airport_iata: string | null;
    arr_airport_iata: string | null;
    dep_time: string; // 'HH:mm' precompus server-side
    arr_time: string;
  }[];
  passenger_ids: string[];
}

export interface PersonnelOption {
  id: string;
  name: string;
}

/** Pin-picker [C-S]: venue-urile și hotelurile turului ca origin/dest. */
export interface TravelPin {
  type: "venue" | "hotel";
  id: string;
  label: string;
}

function clock(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

/**
 * Input cu autocomplete Google Places (adrese/POI-uri; la air → aeroporturi,
 * rail → gări, sea → porturi). Sugestiile vin prin API-ul nostru — cheia
 * Google nu ajunge în browser.
 */
function PlaceInput({
  value,
  onChange,
  placeholder,
  mode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  mode: TravelType;
}) {
  const [result, setResult] = useState<{ query: string; items: string[] } | null>(null);
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (value.trim().length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/travel/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: value, mode }),
        });
        const data = await res.json();
        setResult({ query: value, items: data.suggestions ?? [] });
      } catch {
        /* sugestiile sunt best-effort */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, mode]);

  const items =
    focused && value !== picked && result?.query === value ? result.items : [];

  return (
    <span className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="w-full rounded border border-hairline px-2 py-1 text-sm"
      />
      {items.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-1 w-max min-w-full max-w-[28rem] overflow-hidden rounded-md border border-hairline bg-surface shadow-popover">
          {items.map((sug) => (
            <li key={sug}>
              <button
                type="button"
                // mousedown, nu click — altfel blur-ul închide lista înainte
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(sug);
                  setPicked(sug);
                }}
                className="block w-full max-w-[28rem] truncate px-2.5 py-1.5 text-left text-sm hover:bg-subtle"
              >
                {sug}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export function TravelSection({
  orgSlug,
  tourId,
  date,
  dayId,
  tz,
  items,
  personnel,
  pins,
  canEdit,
  firstSchedule,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  dayId: string;
  tz: string;
  items: TravelItemData[];
  personnel: PersonnelOption[];
  pins: TravelPin[];
  canEdit: boolean;
  firstSchedule?: { time: string; title: string } | null;
}) {
  const t = useTranslations("travel");
  const [editing, setEditing] = useState<TravelItemData | null>(null);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      await fn();
      setEditing(null);
      setAdding(false);
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("title")}</h2>
        {canEdit && !adding && !editing && (
          <button
            onClick={() => setAdding(true)}
            className="btn-quiet h-7 px-2.5"
          >
            + {t("add")}
          </button>
        )}
      </div>

      {items.length === 0 && !adding && (
        <p className="text-sm text-tertiary">{t("noItems")}</p>
      )}

      <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface empty:hidden">
        {items.map((item) => (
          <li key={item.id} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span>{TYPE_ICON[item.travel_type]}</span>
              <span className="w-28 shrink-0 font-mono text-xs text-secondary">
                {clock(item.depart_time)}
                {item.depart_day_offset > 0 && <sup className="text-danger">+1</sup>}
                {item.arrive_time && (
                  <>
                    –{clock(item.arrive_time)}
                    {item.arrive_day_offset > 0 && (
                      <sup className="text-danger">+1</sup>
                    )}
                  </>
                )}
              </span>
              <button
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
              >
                {item.party && (
                  <span className="mr-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-canvas">
                    {item.party}
                  </span>
                )}
                {item.title ?? "—"}
              </button>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.is_confirmed ? "bg-success-subtle text-success" : "bg-inset text-secondary"}`}
              >
                {item.is_confirmed ? t("confirmed") : t("unconfirmed")}
              </span>
              {canEdit && (
                <span className="flex shrink-0 gap-1">
                  <button
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleTravelConfirmed(orgSlug, tourId, date, item.id, !item.is_confirmed),
                      )
                    }
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="rounded px-1.5 py-0.5 text-xs hover:bg-subtle"
                  >
                    ✎
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => run(() => deleteTravelItem(orgSlug, tourId, date, item.id))}
                    className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger-subtle"
                  >
                    🗑
                  </button>
                </span>
              )}
            </div>

            {expanded === item.id && (
              <div className="mt-2 space-y-2 border-t border-hairline pt-2 text-xs text-secondary">
                {item.detail && <p>{item.detail}</p>}
                {item.travel_type === "air" && (
                  <FlightLegs
                    orgSlug={orgSlug}
                    tourId={tourId}
                    date={date}
                    tz={tz}
                    item={item}
                    canEdit={canEdit}
                    pending={pending}
                    run={run}
                  />
                )}
                {personnel.length > 0 && (
                  <PassengerPicker
                    item={item}
                    personnel={personnel}
                    canEdit={canEdit}
                    pending={pending}
                    onSave={(ids) =>
                      run(() => setTravelPassengers(orgSlug, tourId, date, item.id, ids))
                    }
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {(adding || editing) && (
        <TravelForm
          key={editing?.id ?? "new"}
          initial={editing}
          dayId={dayId}
          pins={pins}
          firstSchedule={firstSchedule ?? null}
          pending={pending}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={(input) => run(() => upsertTravelItem(orgSlug, tourId, date, tz, input))}
        />
      )}
    </section>
  );
}

function TravelForm({
  initial,
  dayId,
  pins,
  firstSchedule,
  pending,
  onSave,
  onCancel,
}: {
  initial: TravelItemData | null;
  dayId: string;
  pins: TravelPin[];
  firstSchedule: { time: string; title: string } | null;
  pending: boolean;
  onSave: (input: TravelItemInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("travel");
  const tc = useTranslations("common");

  const [type, setType] = useState<TravelType>(initial?.travel_type ?? "ground");
  const [autoTitle, setAutoTitle] = useState(initial?.auto_title ?? true);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [party, setParty] = useState(initial?.party ?? "");
  const [origin, setOrigin] = useState(initial?.origin_label ?? "");
  const [dest, setDest] = useState(initial?.dest_label ?? "");
  const [depart, setDepart] = useState(clock(initial?.depart_time ?? null));
  const [arrive, setArrive] = useState(clock(initial?.arrive_time ?? null));
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [railLine, setRailLine] = useState(initial?.rail_line ?? "");
  const [trainNumber, setTrainNumber] = useState(initial?.train_number ?? "");
  const [ticketStatus, setTicketStatus] = useState(initial?.ticket_status ?? "");
  const [confirmation, setConfirmation] = useState(initial?.confirmation_number ?? "");
  const firstLeg = initial?.legs?.[0] ?? null;
  const [airline, setAirline] = useState(firstLeg?.airline ?? "");
  const [flightNumber, setFlightNumber] = useState(firstLeg?.flight_number ?? "");

  // ── Rută live [C §6.7 extins]: origin+dest → km/durată + sugestie plecare ──
  // rezultatul poartă cheia (origin/dest) pentru care a fost calculat —
  // se invalidează singur la tastare, fără setState sincron în effect
  const [routeResult, setRouteResult] = useState<{
    origin: string;
    dest: string;
    distanceKm: number;
    durationMin: number;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  useEffect(() => {
    if (type !== "ground" || origin.trim().length < 3 || dest.trim().length < 3) return;
    const timer = setTimeout(async () => {
      setRouteLoading(true);
      try {
        const res = await fetch("/api/travel/route-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, dest }),
        });
        const data = await res.json();
        if (data.ok) {
          setRouteResult({ origin, dest, distanceKm: data.distanceKm, durationMin: data.durationMin });
        }
      } finally {
        setRouteLoading(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [type, origin, dest]);
  const route =
    routeResult && routeResult.origin === origin && routeResult.dest === dest
      ? routeResult
      : null;

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const toHhmm = (min: number) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  // ținta de sosire: ora de arrive introdusă SAU primul item din program
  // minus 15 min buffer; plecarea sugerată se rotunjește în jos la 5 min.
  const BUFFER_MIN = 15;
  let suggestion: { departMin: number; arriveMin: number; anchor: string } | null = null;
  if (route) {
    if (arrive) {
      const departMin = Math.floor((toMin(arrive) - route.durationMin - BUFFER_MIN) / 5) * 5;
      suggestion = { departMin, arriveMin: departMin + route.durationMin, anchor: "" };
    } else if (firstSchedule) {
      const targetArrive = toMin(firstSchedule.time) - BUFFER_MIN;
      const departMin = Math.floor((targetArrive - route.durationMin) / 5) * 5;
      suggestion = { departMin, arriveMin: departMin + route.durationMin, anchor: firstSchedule.title };
    }
  }

  function save(autoCalc: boolean) {
    onSave({
      id: initial?.id,
      dayId,
      travelType: type,
      title,
      autoTitle,
      party,
      originLabel: origin,
      destLabel: dest,
      airline,
      flightNumber,
      departTime: depart,
      departDayOffset: initial?.depart_day_offset ?? 0,
      arriveTime: arrive,
      arriveDayOffset: initial?.arrive_day_offset ?? 0,
      detail,
      distanceUnit: "kilometers",
      railLine,
      trainNumber,
      ticketStatus,
      confirmationNumber: confirmation,
      autoCalc,
    });
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-hairline bg-surface p-3">
      {/* tabs GROUND|AIR|RAIL|SEA [C-S] */}
      <div className="flex gap-1">
        {(Object.keys(TYPE_ICON) as TravelType[]).map((tt) => (
          <button
            key={tt}
            onClick={() => setType(tt)}
            className={`h-[26px] rounded-[6px] px-3 font-display text-[12px] font-medium transition-colors ${type === tt ? "bg-fill-segment-active text-primary" : "text-secondary hover:text-primary"}`}
          >
            {t(tt)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="flex min-w-36 flex-1 gap-1">
          <PlaceInput value={origin} onChange={setOrigin} placeholder={t("origin")} mode={type} />
          {pins.length > 0 && (
            <select
              value=""
              title={t("pinPicker")}
              onChange={(e) => e.target.value && setOrigin(e.target.value)}
              className="w-9 rounded border border-hairline text-sm"
            >
              <option value="">📍</option>
              {pins.map((pin) => (
                <option key={`${pin.type}:${pin.id}`} value={pin.label}>
                  {pin.type === "venue" ? "🎪" : "🏨"} {pin.label}
                </option>
              ))}
            </select>
          )}
        </span>
        <span className="flex min-w-36 flex-1 gap-1">
          <PlaceInput value={dest} onChange={setDest} placeholder={t("destination")} mode={type} />
          {pins.length > 0 && (
            <select
              value=""
              title={t("pinPicker")}
              onChange={(e) => e.target.value && setDest(e.target.value)}
              className="w-9 rounded border border-hairline text-sm"
            >
              <option value="">📍</option>
              {pins.map((pin) => (
                <option key={`${pin.type}:${pin.id}`} value={pin.label}>
                  {pin.type === "venue" ? "🎪" : "🏨"} {pin.label}
                </option>
              ))}
            </select>
          )}
        </span>
        <label className="flex items-center gap-1 text-xs">
          {t("depart")}
          <input
            type="time"
            value={depart}
            onChange={(e) => setDepart(e.target.value)}
            className="rounded border border-hairline px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          {t("arrive")}
          <input
            type="time"
            value={arrive}
            onChange={(e) => setArrive(e.target.value)}
            className="rounded border border-hairline px-2 py-1 text-sm"
          />
        </label>
        <input
          value={party}
          onChange={(e) => setParty(e.target.value)}
          placeholder={t("party")}
          className="w-16 rounded border border-hairline px-2 py-1 text-sm"
        />
      </div>

      {type === "ground" && (routeLoading || route) && (
        <div className="space-y-1.5 rounded-md border border-accent-border bg-accent-subtle/40 px-3 py-2 text-sm">
          {routeLoading && !route ? (
            <p className="text-tertiary">{t("routeLoading")}</p>
          ) : route ? (
            <>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-medium">{route.distanceKm} km</span>
                <span className="font-mono">{formatDuration(route.durationMin)}</span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {t("openRoute")} ↗
                </a>
              </p>
              {suggestion && suggestion.departMin >= 0 && (
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-secondary">
                    {suggestion.anchor
                      ? t("suggestAnchored", { title: suggestion.anchor, time: firstSchedule!.time })
                      : t("suggestForArrive")}
                  </span>
                  <button
                    onClick={() => {
                      setDepart(toHhmm(suggestion!.departMin));
                      setArrive(toHhmm(suggestion!.arriveMin));
                    }}
                    className="btn-quiet h-7 px-2.5"
                  >
                    {t("leaveAt")} {toHhmm(suggestion.departMin)} → {toHhmm(suggestion.arriveMin)}
                  </button>
                </p>
              )}
              {!suggestion && (
                <p className="text-xs text-tertiary">{t("suggestHint")}</p>
              )}
            </>
          ) : null}
        </div>
      )}

      {type === "rail" && (
        <div className="flex flex-wrap gap-2">
          <input value={railLine} onChange={(e) => setRailLine(e.target.value)} placeholder={t("railLine")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
          <input value={trainNumber} onChange={(e) => setTrainNumber(e.target.value)} placeholder={t("trainNumber")} className="w-24 rounded border border-hairline px-2 py-1 text-sm" />
          <input value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)} placeholder={t("ticketStatus")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={t("confirmation")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
        </div>
      )}

      {/* air: nr. de zbor trackabil (devine primul flight leg) */}
      {type === "air" && (
        <div className="flex flex-wrap gap-2">
          <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder={t("airline")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
          <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder={t("flightNumber")} className="w-28 rounded border border-hairline px-2 py-1 font-mono text-sm" />
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={t("confirmation")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
        </div>
      )}

      {/* sea: operator + vas/voiaj (refolosește coloanele rail) */}
      {type === "sea" && (
        <div className="flex flex-wrap gap-2">
          <input value={railLine} onChange={(e) => setRailLine(e.target.value)} placeholder={t("seaOperator")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
          <input value={trainNumber} onChange={(e) => setTrainNumber(e.target.value)} placeholder={t("seaVessel")} className="w-32 rounded border border-hairline px-2 py-1 font-mono text-sm" />
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={t("confirmation")} className="w-28 rounded border border-hairline px-2 py-1 text-sm" />
        </div>
      )}

      {/* AUTOTITLE|CUSTOMTITLE toggle [C-S] */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex rounded-full bg-inset p-0.5 text-xs font-semibold">
          <button
            onClick={() => setAutoTitle(true)}
            className={`rounded-full px-3 py-1 transition-colors ${autoTitle ? "bg-surface text-primary" : "text-tertiary hover:text-secondary"}`}
          >
            {t("autoTitle")}
          </button>
          <button
            onClick={() => setAutoTitle(false)}
            className={`rounded-full px-3 py-1 transition-colors ${!autoTitle ? "bg-surface text-primary" : "text-tertiary hover:text-secondary"}`}
          >
            {t("customTitle")}
          </button>
        </span>
        {!autoTitle && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("customTitle")}
            className="min-w-40 flex-1 rounded border border-hairline px-2 py-1 text-sm"
          />
        )}
      </div>

      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={t("detail")}
        rows={2}
        className="w-full rounded border border-hairline px-2 py-1 text-sm"
      />

      <div className="flex gap-2">
        {type === "ground" && (
          <button
            disabled={pending || !origin || !dest}
            onClick={() => save(true)}
            className="rounded bg-success px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {t("calc")}
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => save(false)}
          className="btn-quiet h-7 px-2.5 disabled:opacity-40"
        >
          {tc("save")}
        </button>
        <button onClick={onCancel} className="rounded border border-hairline px-3 py-1 text-xs">
          {tc("cancel")}
        </button>
      </div>
    </div>
  );
}

function FlightLegs({
  orgSlug,
  tourId,
  date,
  tz,
  item,
  canEdit,
  pending,
  run,
}: {
  orgSlug: string;
  tourId: string;
  date: string;
  tz: string;
  item: TravelItemData;
  canEdit: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const t = useTranslations("travel");
  const [draft, setDraft] = useState({
    airline: "",
    flightNumber: "",
    depIata: "",
    arrIata: "",
    depTime: "",
    arrTime: "",
  });

  return (
    <div className="space-y-1">
      <p className="font-semibold uppercase tracking-wide">{t("flights")}</p>
      <ul className="space-y-0.5">
        {item.legs.map((leg) => (
          <li key={leg.id} className="flex items-center gap-2">
            <span className="font-mono">
              <a
                href={`https://www.flightradar24.com/data/flights/${(leg.flight_number ?? "").replace(/\s+/g, "").toLowerCase()}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent hover:underline"
                title="Track on Flightradar24"
              >
                {leg.airline} {leg.flight_number} ↗
              </a>{" "}
              · {leg.dep_airport_iata}→
              {leg.arr_airport_iata} · {leg.dep_time}–{leg.arr_time}
            </span>
            {canEdit && (
              <button
                disabled={pending}
                onClick={() => run(() => deleteFlightLeg(orgSlug, tourId, date, leg.id))}
                className="text-danger"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["airline", t("airline"), "w-24"],
              ["flightNumber", t("flightNumber"), "w-20"],
              ["depIata", "DEP", "w-16"],
              ["arrIata", "ARR", "w-16"],
            ] as const
          ).map(([key, ph, w]) => (
            <input
              key={key}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              placeholder={ph}
              className={`${w} rounded border border-hairline px-1.5 py-0.5`}
            />
          ))}
          <input type="time" value={draft.depTime} onChange={(e) => setDraft({ ...draft, depTime: e.target.value })} className="rounded border border-hairline px-1.5 py-0.5" />
          <input type="time" value={draft.arrTime} onChange={(e) => setDraft({ ...draft, arrTime: e.target.value })} className="rounded border border-hairline px-1.5 py-0.5" />
          <button
            disabled={pending || !draft.flightNumber}
            onClick={() =>
              run(async () => {
                const r = await upsertFlightLeg(orgSlug, tourId, date, tz, {
                  travelItemId: item.id,
                  ...draft,
                });
                if (!r.error)
                  setDraft({ airline: "", flightNumber: "", depIata: "", arrIata: "", depTime: "", arrTime: "" });
                return r;
              })
            }
            className="btn-quiet h-7 px-2.5"
          >
            + {t("addLeg")}
          </button>
        </div>
      )}
    </div>
  );
}

function PassengerPicker({
  item,
  personnel,
  canEdit,
  pending,
  onSave,
}: {
  item: TravelItemData;
  personnel: PersonnelOption[];
  canEdit: boolean;
  pending: boolean;
  onSave: (ids: string[]) => void;
}) {
  const t = useTranslations("travel");
  const [selected, setSelected] = useState<Set<string>>(new Set(item.passenger_ids));
  const dirty =
    selected.size !== item.passenger_ids.length ||
    item.passenger_ids.some((id) => !selected.has(id));

  return (
    <div className="space-y-1">
      <p className="font-semibold uppercase tracking-wide">{t("passengers")}</p>
      <div className="flex flex-wrap gap-2">
        {personnel.map((p) => (
          <label key={p.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={selected.has(p.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(p.id);
                else next.delete(p.id);
                setSelected(next);
              }}
            />
            {p.name}
          </label>
        ))}
        {canEdit && dirty && (
          <button
            disabled={pending}
            onClick={() => onSave([...selected])}
            className="btn-quiet h-7 px-2.5"
          >
            ✓
          </button>
        )}
      </div>
    </div>
  );
}

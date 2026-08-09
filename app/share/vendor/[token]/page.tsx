import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getDaySheetData } from "@/lib/daysheet";
import { formatDayHeader, formatTimeInZone } from "@/lib/datetime";
import { resolveVendorLink } from "./resolve";
import { PortalClient, type VendorEmployeeRow } from "./portal-client";

export const dynamic = "force-dynamic";

/**
 * C4 — portalul public de vendor: link tokenizat, read-only pe
 * program/hotel + self-service pe echipă/fișiere DOAR pentru propria
 * companie. Fără sesiune — resolveVendorLink() e singura autoritate,
 * re-validată pe fiecare scriere (actions.ts / route.ts). Standalone,
 * fără nav, fără next-intl (L10N local mai jos).
 */

type Lang = "ro" | "en";

const L10N: Record<Lang, Record<string, string>> = {
  ro: {
    schedule: "Program",
    hotel: "Hotel",
    files: "Fișierele voastre",
    team: "Echipa voastră",
    addPerson: "Adaugă persoană",
    uploadFile: "Urcă fișier",
    noCategory: "Departament neconfigurat — cere organizatorului.",
    invalidLink: "Link invalid sau expirat",
    firstName: "Prenume",
    lastName: "Nume",
    role: "Rol",
    phone: "Telefon",
    email: "Email",
    remove: "Elimină",
    confirmRemove: "Sigur elimini această persoană?",
    errorGeneric: "A apărut o eroare. Încearcă din nou.",
    errorLimit: "Ai atins limita maximă.",
    uploadErrorNoCategory: "Departament neconfigurat — cere organizatorului.",
    uploadErrorTooLarge: "Fișierul e prea mare (limită 50 MB).",
    guestOf: "invitat de",
  },
  en: {
    schedule: "Schedule",
    hotel: "Hotel",
    files: "Your files",
    team: "Your team",
    addPerson: "Add person",
    uploadFile: "Upload file",
    noCategory: "No department configured — ask the organizer.",
    invalidLink: "Invalid or expired link",
    firstName: "First name",
    lastName: "Last name",
    role: "Role",
    phone: "Phone",
    email: "Email",
    remove: "Remove",
    confirmRemove: "Remove this person?",
    errorGeneric: "Something went wrong. Try again.",
    errorLimit: "You've reached the limit.",
    uploadErrorNoCategory: "No department configured — ask the organizer.",
    uploadErrorTooLarge: "File is too large (50 MB limit).",
    guestOf: "guest of",
  },
};

function formatShortDate(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ro" ? "ro-RO" : "en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function VendorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveVendorLink(token);
  if (!ctx) notFound();

  const lang: Lang = (await headers()).get("accept-language")?.toLowerCase().startsWith("ro")
    ? "ro"
    : "en";
  const t = L10N[lang];

  const supabase = createServiceClient();

  const [{ data: org }, { data: event }, { data: dayRow }, daySheet, { data: hotels }, { data: personnel }] =
    await Promise.all([
      supabase.from("organizations").select("name").eq("id", ctx.organizationId).maybeSingle(),
      supabase.from("events").select("title, venues(name)").eq("id", ctx.eventId).maybeSingle(),
      supabase
        .from("days")
        .select("date, city, country, timezone")
        .eq("id", ctx.dayId)
        .maybeSingle(),
      getDaySheetData(supabase, ctx.dayId, { publicOnly: true, includeRooms: false }),
      supabase
        .from("day_hotels")
        .select("name, city, check_in_date, check_in_time, check_out_date, check_out_time")
        .eq("day_id", ctx.dayId)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("tour_personnel")
        .select("id, first_name, last_name, role, phones")
        .eq("tour_id", ctx.tourId)
        .eq("company_id", ctx.companyId)
        .is("deleted_at", null)
        .order("created_at"),
    ]);
  if (!org || !event || !dayRow || !daySheet) notFound();

  const venue = event.venues as unknown as { name: string } | null;
  const eventTitle = event.title ?? venue?.name ?? dayRow.city ?? "—";
  // day.events [publicOnly] nu are reguli de visibility — folosit doar
  // pentru adresa venue-ului sub header, restul câmpurilor day sheet-ului
  // (travel/hotel_notes/general_notes/tasks) NU se ating aici [C4 spec].
  const eventAddress =
    daySheet.events.find((e) => e.title === eventTitle)?.address ??
    daySheet.events[0]?.address ??
    null;
  const tz = dayRow.timezone ?? "UTC";

  let files: {
    id: string;
    file_name: string;
    size_bytes: number | null;
    signedUrl: string | null;
  }[] = [];
  let categoryName: string | null = null;

  if (ctx.fileCategoryId) {
    const [{ data: category }, { data: attachments }] = await Promise.all([
      supabase.from("file_categories").select("name").eq("id", ctx.fileCategoryId).maybeSingle(),
      supabase
        .from("attachments")
        .select("id, file_name, size_bytes, created_at, storage_path, status")
        .eq("parent_type", "day")
        .eq("parent_id", ctx.dayId)
        .eq("category_id", ctx.fileCategoryId)
        .is("deleted_at", null)
        .not("storage_path", "is", null)
        .neq("status", "superseded")
        .order("created_at", { ascending: false }),
    ]);
    categoryName = category?.name ?? null;
    files = await Promise.all(
      (attachments ?? []).map(async (a) => {
        const { data: signed } = await supabase.storage
          .from("attachments")
          .createSignedUrl(a.storage_path as string, 3600);
        return {
          id: a.id,
          file_name: a.file_name,
          size_bytes: a.size_bytes,
          signedUrl: signed?.signedUrl ?? null,
        };
      }),
    );
  }

  const employees: VendorEmployeeRow[] = (personnel ?? []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    role: p.role,
    phones: (p.phones as string[] | null) ?? [],
  }));

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{eventTitle}</h1>
        <p className="text-sm text-secondary">{formatDayHeader(dayRow.date, tz, lang)}</p>
        {(dayRow.city || dayRow.country) && (
          <p className="text-sm text-secondary">
            {[dayRow.city, dayRow.country].filter(Boolean).join(", ")}
          </p>
        )}
        {eventAddress && <p className="text-xs text-tertiary">{eventAddress}</p>}
        <p className="text-xs text-tertiary">
          {ctx.companyName} · {t.guestOf} {org.name}
        </p>
      </header>

      {daySheet.schedule.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
            {t.schedule}
          </h2>
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
            {daySheet.schedule.map((item, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-secondary">
                  {item.start_at ? formatTimeInZone(new Date(item.start_at), tz) : "—"}
                  {item.end_at && `–${formatTimeInZone(new Date(item.end_at), tz)}`}
                </span>
                <span>{item.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hotels && hotels.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
            {t.hotel}
          </h2>
          <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
            {hotels.map((hotel, i) => (
              <li key={i} className="space-y-0.5 px-3 py-2 text-sm">
                <p>
                  🏨 {hotel.name}
                  {hotel.city && `, ${hotel.city}`}
                </p>
                {(hotel.check_in_date || hotel.check_out_date) && (
                  <p className="text-xs text-tertiary">
                    {hotel.check_in_date && formatShortDate(hotel.check_in_date, lang)}
                    {hotel.check_in_time && ` ${hotel.check_in_time.slice(0, 5)}`}
                    {" – "}
                    {hotel.check_out_date && formatShortDate(hotel.check_out_date, lang)}
                    {hotel.check_out_time && ` ${hotel.check_out_time.slice(0, 5)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
          {t.files}
          {categoryName && <span className="normal-case text-tertiary"> · {categoryName}</span>}
        </h2>
        {!ctx.fileCategoryId ? (
          <p className="text-sm text-secondary">{t.noCategory}</p>
        ) : (
          files.length > 0 && (
            <ul className="divide-y divide-hairline rounded-[12px] border border-hairline bg-surface">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {f.signedUrl ? (
                    <a
                      href={f.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-primary hover:underline"
                    >
                      {f.file_name}
                    </a>
                  ) : (
                    <span className="flex-1 truncate">{f.file_name}</span>
                  )}
                  <span className="shrink-0 font-mono text-xs text-tertiary">
                    {formatFileSize(f.size_bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        <PortalClient
          token={token}
          lang={lang}
          canUpload={Boolean(ctx.fileCategoryId)}
          employees={employees}
          t={t}
        />
      </section>

      <footer className="border-t border-hairline pt-3 text-xs text-tertiary">Toura</footer>
    </main>
  );
}

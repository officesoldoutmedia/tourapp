"use client";

/** Formularul de profil al artistului — câmpuri + arhivare, cu toast la
 * salvare (același bus ca `logo-client.tsx`) și confirmare nativă pentru
 * arhivare (pattern-ul celui mai apropiat buton destructiv, tour settings). */
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/Toaster";
import { saveArtistProfile, setArtistArchived } from "./actions";

interface Links {
  spotify: string;
  instagram: string;
  youtube: string;
  website: string;
}

export function ProfileForm({
  orgSlug,
  artistId,
  colors,
  timezones,
  currencies,
  isArchived,
  initial,
}: {
  orgSlug: string;
  artistId: string;
  colors: string[];
  timezones: string[];
  currencies: string[];
  isArchived: boolean;
  initial: {
    name: string;
    legalName: string;
    homeBaseCity: string;
    currency: string;
    timezone: string;
    color: string;
    links: Links;
  };
}) {
  const t = useTranslations("artist");
  const tc = useTranslations("common");
  const [color, setColor] = useState(initial.color);
  const [pending, startTransition] = useTransition();
  const [archiving, startArchiving] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await saveArtistProfile(orgSlug, artistId, formData);
      if (result?.error) toast(tc("error"), "danger");
      else toast(t("saved"));
    });
  }

  function toggleArchive() {
    const question = isArchived ? t("unarchive") : t("archive");
    if (!window.confirm(`${question}?`)) return;
    startArchiving(async () => {
      const result = await setArtistArchived(orgSlug, artistId, !isArchived);
      if (result?.error) toast(tc("error"), "danger");
    });
  }

  const label = "block text-[11.5px] font-medium text-secondary";
  const input =
    "h-9 w-full rounded-[8px] border border-hairline bg-inset px-3 text-[13px] text-primary outline-none";

  return (
    <div className="space-y-6">
      <form
        action={submit}
        className="space-y-4 rounded-[12px] border border-hairline bg-surface p-5"
      >
        <label className="block space-y-1">
          <span className={label}>{t("nameLabel")}</span>
          <input name="name" required defaultValue={initial.name} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={label}>{t("legalNameLabel")}</span>
          <input name="legal_name" defaultValue={initial.legalName} className={input} />
        </label>

        <label className="block space-y-1">
          <span className={label}>{t("homeBaseLabel")}</span>
          <input name="home_base_city" defaultValue={initial.homeBaseCity} className={input} />
          <span className="block text-[11px] text-tertiary">{t("homeBaseHint")}</span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className={label}>{t("currencyLabel")}</span>
            <select name="default_currency" defaultValue={initial.currency} className={input}>
              <option value="">—</option>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className={label}>{t("timezoneLabel")}</span>
            <select name="timezone" defaultValue={initial.timezone} className={input}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-1.5">
          <span className={label}>{t("colorLabel")}</span>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  className="sr-only"
                />
                <span
                  className={`block h-7 w-7 rounded-[7px] border-2 ${
                    color === c ? "border-strong" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={label}>{t("linksLabel")}</span>
          <div className="grid grid-cols-2 gap-3">
            <input
              name="link_spotify"
              placeholder="Spotify"
              defaultValue={initial.links.spotify}
              className={input}
            />
            <input
              name="link_instagram"
              placeholder="Instagram"
              defaultValue={initial.links.instagram}
              className={input}
            />
            <input
              name="link_youtube"
              placeholder="YouTube"
              defaultValue={initial.links.youtube}
              className={input}
            />
            <input
              name="link_website"
              placeholder="Website"
              defaultValue={initial.links.website}
              className={input}
            />
          </div>
        </div>

        <button type="submit" disabled={pending} className="btn-primary h-9 disabled:opacity-50">
          {tc("save")}
        </button>
      </form>

      <div
        className="flex items-center justify-between gap-4 rounded-[12px] px-[18px] py-4"
        style={{ border: "1px solid rgba(237,106,103,.25)" }}
      >
        <p className="text-[12.5px] font-medium text-primary">
          {isArchived ? t("unarchive") : t("archive")}
        </p>
        <button
          type="button"
          onClick={toggleArchive}
          disabled={archiving}
          className="btn-danger h-8 disabled:opacity-50"
        >
          {isArchived ? t("unarchive") : t("archive")}
        </button>
      </div>
    </div>
  );
}

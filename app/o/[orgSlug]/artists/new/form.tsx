"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createArtist } from "./actions";

/** Formularul de creare artist — la eroare afișăm mesajul sub buton
 * (același pattern ca `tours/new/wizard.tsx`: useTransition + useState). */
export function NewArtistForm({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("roster");
  const tc = useTranslations("common");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createArtist(orgSlug, formData);
      if (result?.error) setError(tc("error"));
    });
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-8 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {t("createTitle")}
      </h1>

      <form action={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("nameLabel")}</span>
          <input
            name="name"
            required
            autoFocus
            className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button type="submit" disabled={pending} className="btn-primary h-9 disabled:opacity-50">
          {t("createTitle")}
        </button>
      </form>
    </main>
  );
}

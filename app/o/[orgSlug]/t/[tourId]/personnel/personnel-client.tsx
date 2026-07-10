"use client";

/** Lista Personnel (prototip): filtru live în header + Add person care
 * deschide formularul inline; rândurile rămân 56px cu chevron. */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export interface PersonRow {
  id: string;
  name: string;
  initials: string;
  sub: string;
  party: string | null;
  phone: string | null;
  cost: string | null;
}

export function PersonnelClient({
  orgSlug,
  tourId,
  rows,
  canEdit,
  addAction,
}: {
  orgSlug: string;
  tourId: string;
  rows: PersonRow[];
  canEdit: boolean;
  addAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations("personnel");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = query.trim()
    ? rows.filter((p) =>
        `${p.name} ${p.sub} ${p.party ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : rows;

  const input =
    "h-8 rounded-[8px] border border-hairline bg-fill-control px-2.5 text-[12.5px] text-primary placeholder:text-tertiary";

  return (
    <main className="w-full pb-11">
      <PageHeader
        eyebrow={t("countLine", { count: rows.length })}
        title={t("title")}
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filter")}
              className="h-8 w-[220px] rounded-[8px] border border-hairline bg-inset px-3 text-[12.5px] text-primary outline-none placeholder:text-tertiary"
            />
            {canEdit && (
              <button onClick={() => setAdding((v) => !v)} className="btn-quiet h-8">
                {t("addPerson")}
              </button>
            )}
          </>
        }
      />

      <div className="mx-auto w-full max-w-[960px] px-8">
        {canEdit && adding && (
          <form
            action={(fd) => startTransition(() => addAction(fd))}
            className="flex flex-wrap items-center gap-2 border-b border-faint py-4"
          >
            <input name="first" placeholder={t("first")} className={`${input} w-36`} autoFocus />
            <input name="last" placeholder={t("last")} className={`${input} w-36`} />
            <input name="role" placeholder={t("role")} className={`${input} w-44`} />
            <button disabled={pending} className="btn-primary h-8">
              + {t("addPerson")}
            </button>
            <p className="w-full text-[10.5px] text-tertiary">{t("addHint")}</p>
          </form>
        )}

        <div className="mt-3.5 border-t border-faint">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[12.5px] text-tertiary">
              {rows.length === 0 ? t("empty") : t("noMatches")}
            </p>
          )}
          {filtered.map((person) => (
            <Link
              key={person.id}
              href={`/o/${orgSlug}/t/${tourId}/personnel/${person.id}`}
              className="grid h-14 grid-cols-[44px_1.3fr_90px_150px_140px_20px] items-center border-b border-faint transition-colors hover:bg-fill-row-hover"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-avatar font-display text-[9px] font-semibold text-secondary">
                {person.initials}
              </span>
              <span className="min-w-0 pr-3">
                <span className="block truncate text-[13px] font-medium text-primary">
                  {person.name}
                </span>
                <span className="block truncate text-[11px] text-secondary">{person.sub}</span>
              </span>
              <span>
                {person.party && (
                  <span className="rounded-full border border-hairline bg-fill-control px-2 py-[3px] text-[10px] font-medium text-secondary">
                    {person.party}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11.5px] text-tertiary">{person.phone ?? "—"}</span>
              <span className="font-mono text-[11.5px] text-secondary">{person.cost ?? ""}</span>
              <ChevronRight size={14} strokeWidth={1.75} className="text-disabled" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

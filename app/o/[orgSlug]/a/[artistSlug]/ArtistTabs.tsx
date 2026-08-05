"use client";

/** Tab-urile paginii de artist (Date / Profil / Acces) — subliniere pe tabul activ. */
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ArtistTab {
  href: string;
  label: string;
  /** true dacă tabul e activ doar pe match exact (tabul de bază, "Date"). */
  exact?: boolean;
}

export function ArtistTabs({ tabs }: { tabs: ArtistTab[] }) {
  const pathname = usePathname();

  function isActive(tab: ArtistTab): boolean {
    return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
  }

  return (
    <nav className="flex gap-1 border-b border-hairline">
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? "border-accent font-medium text-primary"
                : "border-transparent text-secondary hover:bg-subtle hover:text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

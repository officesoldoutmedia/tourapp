"use client";

/**
 * Sidebar-ul principal (Graphite README §1, varianta aprobată):
 * 236px, etichete simple — fără numere, fără iconuri, fără pill de
 * accent. Activ = fill ridicat rgba(255,255,255,.08).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarItem {
  label: string;
  href: string;
  /** segment de pathname care marchează itemul ca activ */
  match?: string;
}

export interface SidebarSection {
  label: string;
  items: SidebarItem[];
}

export function PrimarySidebar({
  tourName,
  tourMeta,
  sections,
}: {
  tourName: string;
  tourMeta: string;
  sections: SidebarSection[];
}) {
  const pathname = usePathname();

  function isActive(item: SidebarItem): boolean {
    if (!item.match) return false;
    if (item.match === "/d/") {
      // Overview = orice pagină de zi, dar nu sub-rutele de event
      return pathname.includes("/d/") && !pathname.includes("/e/");
    }
    return pathname.includes(item.match);
  }

  return (
    <nav
      aria-label="Tour"
      className="hidden w-[236px] shrink-0 overflow-y-auto border-r border-hairline bg-sidebar px-2.5 py-3.5 lg:block"
    >
      <div className="px-2.5 pb-4 pt-2">
        <p className="font-display text-[15px] font-semibold tracking-[-0.02em] text-primary">
          {tourName}
        </p>
        <p className="mt-0.5 text-[11px] text-secondary">{tourMeta}</p>
      </div>

      {sections.map((section, i) => (
        <div key={section.label} className={i > 0 ? "mt-4" : ""}>
          <p className="eyebrow px-2.5 pb-1.5" style={{ letterSpacing: "0.08em" }}>
            {section.label}
          </p>
          <ul>
            {section.items.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.label} className="my-px">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-[34px] items-center rounded-[8px] px-2.5 font-display text-[12.5px] font-medium transition-colors ${
                      active
                        ? "bg-fill-nav-active text-primary"
                        : "text-secondary hover:bg-fill-control hover:text-primary"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

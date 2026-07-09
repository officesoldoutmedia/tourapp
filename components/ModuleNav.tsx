"use client";

/** Nav-ul stâng de module (§4.4) — ancore către secțiunile zilei. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Route,
  Hotel,
  CircleCheck,
  Paperclip,
  Star,
  Ticket,
  Users,
  Settings,
  Map,
  CalendarDays,
  Banknote,
} from "lucide-react";

const MODULES = [
  { id: "notes", label: "Dashboard", icon: LayoutDashboard },
  { id: "events", label: "Events", icon: Star },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "travel", label: "Travel", icon: Route },
  { id: "hotels", label: "Hotels", icon: Hotel },
  { id: "tasks", label: "Tasks", icon: CircleCheck },
  { id: "attachments", label: "Files", icon: Paperclip },
] as const;

export function ModuleNav({
  tourBase,
  defaultDate,
  canAccounting = false,
}: {
  tourBase: string;
  defaultDate: string | null;
  canAccounting?: boolean;
}) {
  const pathname = usePathname();
  const onDayPage = /\/d\/\d{4}-\d{2}-\d{2}/.test(pathname);
  // de pe Personnel/Passes/Settings, modulele te duc înapoi la ziua relevantă
  const dayHref = defaultDate ? `${tourBase}/d/${defaultDate}` : null;

  return (
    <nav className="hidden w-52 shrink-0 border-r border-hairline bg-subtle px-2 py-4 lg:block">
      <ul className="space-y-0.5">
        {MODULES.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={onDayPage ? `#${id}` : dayHref ? `${dayHref}#${id}` : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-secondary transition-colors hover:bg-surface hover:text-primary ${!onDayPage && !dayHref ? "pointer-events-none opacity-40" : ""}`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </a>
          </li>
        ))}
        {(
          [
            ["dashboard", "Tour overview", Map],
            ["calendar", "Calendar", CalendarDays],
            ...(canAccounting ? ([["finances", "Finances", Banknote]] as const) : []),
            ["personnel", "Personnel", Users],
            ["passes", "Tour passes", Ticket],
            ["settings", "Tour settings", Settings],
          ] as const
        ).map(([slug, label, Icon], i) => (
          <li key={slug} className={i === 0 ? "pt-3" : ""}>
            <Link
              href={`${tourBase}/${slug}`}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-secondary transition-colors hover:bg-surface hover:text-primary"
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

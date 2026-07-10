"use client";

/**
 * Avatarul din chrome + popover-ul de cont (Graphite README §1).
 * 28px cerc, inel inset; meniu 232px pe raised, umbră de popover.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function AvatarMenu({
  name,
  email,
  initials,
  profileHref,
  settingsHref,
  signOut,
  labels,
}: {
  name: string;
  email: string;
  initials: string;
  profileHref: string;
  settingsHref: string | null;
  signOut: () => Promise<void>;
  labels: { profile: string; orgSettings: string; signOut: string };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const item =
    "flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[12.5px] text-secondary transition-colors hover:bg-fill-menu-hover hover:text-primary";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        className="flex h-7 w-7 items-center justify-center rounded-full font-display text-[10px] font-semibold text-primary ring-1 ring-inset ring-white/10 transition-shadow hover:ring-white/25"
        style={{ background: "var(--bg-avatar-chrome)" }}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[38px] z-50 w-[232px] rounded-[12px] border border-strong bg-raised p-1.5 shadow-popover"
        >
          <div className="border-b border-hairline px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[12.5px] font-medium text-primary">{name}</p>
            <p className="truncate text-[11px] text-tertiary">{email}</p>
          </div>
          <div className="pt-1.5">
            <Link href={profileHref} role="menuitem" className={item} onClick={() => setOpen(false)}>
              {labels.profile}
            </Link>
            {settingsHref && (
              <Link href={settingsHref} role="menuitem" className={item} onClick={() => setOpen(false)}>
                {labels.orgSettings}
              </Link>
            )}
            <div className="my-1 border-t border-hairline" />
            <form action={signOut}>
              <button
                role="menuitem"
                className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[12.5px] text-danger transition-colors hover:bg-danger-subtle"
              >
                {labels.signOut}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

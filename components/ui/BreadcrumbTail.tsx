"use client";

/**
 * Coada breadcrumb-ului din chrome ("› Tour") — randată de layoutul de
 * tur printr-un portal în slotul #chrome-crumb din AppChrome, pentru că
 * chrome-ul trăiește în layoutul de organizație și nu cunoaște turul.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function BreadcrumbTail({
  label,
  parent,
}: {
  label: string;
  /** crumb intermediar (ex. artistul turului), randat ca link înainte de label */
  parent?: { label: string; href: string };
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      setSlot(document.getElementById("chrome-crumb")),
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!slot) return null;
  return createPortal(
    <span className="flex min-w-0 items-center gap-1.5">
      {parent && (
        <>
          <ChevronRight size={12} strokeWidth={1.75} className="shrink-0 text-disabled" />
          <Link
            href={parent.href}
            className="truncate text-[12px] text-secondary transition-colors hover:text-primary"
          >
            {parent.label}
          </Link>
        </>
      )}
      <ChevronRight size={12} strokeWidth={1.75} className="shrink-0 text-disabled" />
      <span className="truncate text-[12px] font-medium text-primary">{label}</span>
    </span>,
    slot,
  );
}

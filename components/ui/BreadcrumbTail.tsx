"use client";

/**
 * Coada breadcrumb-ului din chrome ("› Tour") — randată de layoutul de
 * tur printr-un portal în slotul #chrome-crumb din AppChrome, pentru că
 * chrome-ul trăiește în layoutul de organizație și nu cunoaște turul.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

export function BreadcrumbTail({ label }: { label: string }) {
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
      <ChevronRight size={12} strokeWidth={1.75} className="shrink-0 text-disabled" />
      <span className="truncate text-[12px] font-medium text-primary">{label}</span>
    </span>,
    slot,
  );
}

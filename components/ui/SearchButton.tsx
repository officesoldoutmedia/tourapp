"use client";

/** Câmpul-buton de căutare din chrome (210×30) — deschide ⌘K palette. */
import { Search } from "lucide-react";

export function SearchButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("tourapp:palette"))}
      className="group hidden h-[30px] w-[210px] items-center gap-2 rounded-[8px] border border-hairline bg-fill-control px-2.5 transition-colors hover:border-strong md:flex"
      aria-label="Search"
    >
      <Search size={13} strokeWidth={1.75} className="shrink-0 text-tertiary" />
      <span className="min-w-0 flex-1 truncate text-left text-[12px] text-tertiary transition-colors group-hover:text-secondary">
        Search or jump to…
      </span>
      <kbd className="rounded-[4px] border border-strong px-[5px] py-[2px] font-mono text-[9.5px] text-tertiary">
        ⌘K
      </kbd>
    </button>
  );
}

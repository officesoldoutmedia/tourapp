"use client";

/**
 * ⌘K Command palette (Graphite README §14): overlay + panou 580px la
 * 14vh, input h48, rezultate h38 cu tag de tip, footer cu kbd hints.
 * Filtru live pe substring; ↑↓/Enter/Esc; mouse-ul mută selecția.
 * Se deschide cu ⌘K/Ctrl+K sau prin evenimentul "tourapp:palette"
 * (emis de butonul de căutare din chrome).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export interface PaletteItem {
  label: string;
  href: string;
  kind: string; // "Screen" | "Action" (etichetă afișată)
}

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActive(0);
      }
    }
    function onOpen() {
      setOpen(true);
      setQuery("");
      setActive(0);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("tourapp:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("tourapp:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  if (!open) return null;

  function go(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <div
      className="fixed inset-0 z-[90]"
      style={{ background: "rgba(10,11,13,.5)", animation: "toastIn 120ms ease-out" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((a) => Math.min(a + 1, filtered.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((a) => Math.max(a - 1, 0));
        }
        if (e.key === "Enter" && filtered[active]) go(filtered[active]);
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="mx-auto mt-[14vh] w-[580px] overflow-hidden rounded-[12px] border border-strong bg-raised shadow-popover"
        style={{ animation: "paletteIn 160ms ease-out" }}
      >
        {/* input */}
        <div className="flex h-12 items-center gap-2.5 border-b border-hairline px-4">
          <Search size={15} strokeWidth={1.75} className="shrink-0 text-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search or jump to…"
            className="h-full min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-primary outline-none placeholder:text-tertiary"
            style={{ boxShadow: "none" }}
          />
          <kbd className="rounded-[4px] border border-strong px-[5px] py-[2px] font-mono text-[9.5px] text-tertiary">
            ESC
          </kbd>
        </div>

        {/* rezultate */}
        <div className="max-h-[322px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-tertiary">
              No results for “{query}”
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.href + item.label}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className="flex h-[38px] w-full items-center justify-between rounded-[8px] px-3 text-left"
                style={{ background: i === active ? "var(--sel-palette)" : undefined }}
              >
                <span className="text-[12.5px] text-primary">{item.label}</span>
                <span className="text-[10px] text-tertiary">{item.kind}</span>
              </button>
            ))
          )}
        </div>

        {/* footer */}
        <div className="flex h-[34px] items-center gap-4 border-t border-hairline px-4 font-mono text-[10px] text-tertiary">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
      <style>{`
        @keyframes paletteIn { from { opacity: 0; transform: translateY(4px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes toastIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

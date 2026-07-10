"use client";

/**
 * Toasts (Graphite README §15): dreapta-sus, pe raised, dot semantic,
 * fade-up 180ms, auto-dismiss 2.6s. Emitere din orice componentă client
 * prin `toast("mesaj", "success")` — bus pe CustomEvent, fără context.
 */
import { useEffect, useState } from "react";

export type ToastKind = "success" | "warning" | "danger";

export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(
    new CustomEvent("tourapp:toast", { detail: { message, kind } }),
  );
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving: boolean;
}

const DOT: Record<ToastKind, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

let nextId = 1;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const { message, kind } = (e as CustomEvent).detail as {
        message: string;
        kind: ToastKind;
      };
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, kind, leaving: false }]);
      setTimeout(() => {
        setItems((prev) =>
          prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
        );
      }, 2600);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 2800);
    }
    window.addEventListener("tourapp:toast", onToast);
    return () => window.removeEventListener("tourapp:toast", onToast);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="fixed right-5 top-16 z-[100] flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className="flex items-center gap-2 rounded-[10px] border border-strong bg-raised py-2.5 pl-3.5 pr-4 text-[12.5px] text-primary shadow-popover transition-all duration-200"
          style={{
            opacity: item.leaving ? 0 : 1,
            transform: item.leaving ? "translateY(-4px)" : "translateY(0)",
            animation: "toastIn 180ms ease-out",
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: DOT[item.kind] }}
          />
          {item.message}
        </div>
      ))}
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

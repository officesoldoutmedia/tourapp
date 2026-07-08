"use client";

/** Buton de copiere în clipboard cu feedback (✓ 2s). */
import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        copied
          ? "border-success bg-success-subtle text-success"
          : "border-hairline bg-surface text-secondary hover:bg-subtle hover:text-primary"
      }`}
    >
      {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.5} />}
      {copied ? "✓" : label}
    </button>
  );
}

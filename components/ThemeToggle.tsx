"use client";

/** Comutator light/dark (§2.5) — persistă în cookie, SSR fără flash. */
import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ initial }: { initial: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="text-secondary transition-colors hover:text-primary"
    >
      {theme === "dark" ? (
        <Sun size={18} strokeWidth={1.5} />
      ) : (
        <Moon size={18} strokeWidth={1.5} />
      )}
    </button>
  );
}

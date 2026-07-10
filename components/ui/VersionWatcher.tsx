"use client";

/**
 * După un deploy, taburile deschise rămân pe build-ul vechi (chunks
 * purjate → click-uri moarte). Comparăm ID-ul de build al clientului cu
 * al serverului la refocus + la 5 min și afișăm un banner persistent.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

const CLIENT_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export function VersionWatcher() {
  const t = useTranslations("version");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const serverId = (await res.text()).trim();
        if (!stopped && serverId && serverId !== "dev" && serverId !== CLIENT_ID) {
          setStale(true);
        }
      } catch {
        // offline / tranzitoriu — ignorăm
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }

    const interval = setInterval(check, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[95] flex items-center gap-3 rounded-[10px] border border-strong bg-raised py-2.5 pl-3.5 pr-2.5 shadow-popover"
      style={{ animation: "toastIn 160ms ease-out" }}
      role="status"
    >
      <span className="text-[12px] text-primary">{t("newVersion")}</span>
      <button onClick={() => window.location.reload()} className="btn-primary h-7">
        <RefreshCw size={12} strokeWidth={2} />
        {t("reload")}
      </button>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

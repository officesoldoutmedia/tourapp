"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";

/**
 * Ținta linkului de resetare a parolei (template-ul Recovery trimite la
 * /auth/confirm?type=recovery&next=/reset-password, care creează sesiunea).
 * Fără sesiune — link expirat sau accesare directă — afișăm mesaj + drum
 * înapoi spre login, nu formularul.
 */
function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();

  const [sessionState, setSessionState] = useState<"checking" | "ok" | "missing">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setSessionState(user ? "ok" : "missing");
    });
  }, []);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) {
      setError(tc("error"));
      return;
    }
    setSaved(true);
    setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-[360px] space-y-5 rounded-[16px] border border-hairline bg-surface p-7 shadow-panel">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-strong bg-raised font-display text-[11px] font-semibold text-primary">
            T
          </span>
          <span className="font-display text-[13px] font-semibold tracking-[-0.01em] text-primary">
            {tc("appName")}
          </span>
        </div>
        <h1 className="font-display text-[20px] font-semibold tracking-tight text-primary">
          {t("resetHeading")}
        </h1>

        {sessionState === "missing" ? (
          <>
            <p className="rounded-md border border-hairline bg-raised p-3 text-sm text-secondary">
              {t("resetLinkInvalid")}
            </p>
            <p className="text-sm text-secondary">
              <Link href="/login" className="font-medium underline">
                {t("backToLogin")}
              </Link>
            </p>
          </>
        ) : saved ? (
          <p className="rounded-md border border-success bg-success-subtle p-3 text-sm text-success">
            {t("passwordSaved")}
          </p>
        ) : (
          <form onSubmit={savePassword} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-secondary">{t("newPassword")}</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-hairline px-3 text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-secondary">{t("confirmPassword")}</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-hairline px-3 text-[13px]"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={pending || sessionState === "checking"}
              className="btn-primary h-9 w-full"
            >
              {t("savePassword")}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

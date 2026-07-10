"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";

function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(false);
    if (error) {
      setError(t("invalidCredentials"));
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink() {
    if (!email) return;
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setPending(false);
    if (error) {
      setError(tc("error"));
      return;
    }
    setMessage(t("magicLinkSent"));
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
          {t("heading")}
        </h1>

        {message ? (
          <p className="rounded-md border border-success bg-success-subtle p-3 text-sm text-success">
            {message}
          </p>
        ) : (
          <form onSubmit={signInWithPassword} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-secondary">{t("email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-hairline px-3 text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11.5px] font-medium text-secondary">{t("password")}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-[8px] border border-hairline px-3 text-[13px]"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="btn-primary h-9 w-full"
            >
              {t("logIn")}
            </button>

            <div className="flex items-center gap-3 text-xs text-tertiary">
              <span className="h-px flex-1 bg-hairline" />
              {t("orSeparator")}
              <span className="h-px flex-1 bg-hairline" />
            </div>

            <button
              type="button"
              onClick={sendMagicLink}
              disabled={pending || !email}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t("magicLink")}
            </button>
          </form>
        )}

        <p className="text-sm text-secondary">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-medium underline">
            {t("signUp")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

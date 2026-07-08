"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/browser";

function SignupForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setPending(false);
    if (error) {
      setError(tc("error"));
      return;
    }
    setMessage(t("confirmEmailSent"));
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{tc("appName")}</h1>

        {message ? (
          <p className="rounded-md border border-success bg-success-subtle p-3 text-sm text-success">
            {message}
          </p>
        ) : (
          <form onSubmit={signUp} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t("firstName")}</span>
                <input
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">{t("lastName")}</span>
                <input
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("password")}</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent hover:bg-accent-hover px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t("signUp")}
            </button>
          </form>
        )}

        <p className="text-sm text-secondary">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium underline">
            {t("logIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

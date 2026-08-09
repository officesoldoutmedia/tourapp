// lib/authEmailTemplates.ts
/** Sursele template-urilor de auth Supabase (spec 2026-08-09 §3).
 *  Placeholder-ele {{ .TokenHash }} / {{ .SiteURL }} sunt literale — le
 *  interpolează Supabase. Fișierele din docs/email-templates/ se generează
 *  cu: WRITE_EMAIL_TEMPLATES=1 pnpm vitest run lib/authEmailTemplates.test.ts
 *  și se lipesc manual în dashboard (Auth → Emails → Templates). */
import { renderEmail } from "./emailTemplate";

const CONFIRM = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}";

function withSubject(subject: string, html: string): string {
  return `<!-- Subject: ${subject} -->\n${html}`;
}

export const AUTH_EMAILS: { file: string; subject: string; html: string }[] = [
  {
    file: "reset-password.html",
    subject: "Reset your Toura password",
    html: withSubject(
      "Reset your Toura password",
      renderEmail({
        title: "Reset your password",
        bodyHtml: "We received a request to reset your password. The link below is valid for 60 minutes.",
        cta: { label: "Set a new password", url: `${CONFIRM}&type=recovery&next=/reset-password` },
        note: "Didn't request this? You can safely ignore this email.",
        footer: "Sent by Toura · toura.pro",
      }),
    ),
  },
  {
    file: "magic-link.html",
    subject: "Sign in to Toura",
    html: withSubject(
      "Sign in to Toura",
      renderEmail({
        title: "Sign in to Toura",
        bodyHtml: "Click the button below to sign in. The link can be used once.",
        cta: { label: "Sign in", url: `${CONFIRM}&type=magiclink&next=/app` },
        note: "Didn't request this? You can safely ignore this email.",
        footer: "Sent by Toura · toura.pro",
      }),
    ),
  },
  {
    file: "confirm-signup.html",
    subject: "Confirm your email",
    html: withSubject(
      "Confirm your email",
      renderEmail({
        title: "Confirm your email",
        bodyHtml: "Welcome to Toura! Confirm your email address to finish creating your account.",
        cta: { label: "Confirm email", url: `${CONFIRM}&type=signup&next=/app` },
        footer: "Sent by Toura · toura.pro",
      }),
    ),
  },
];

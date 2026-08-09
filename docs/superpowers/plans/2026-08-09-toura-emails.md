# Toura Emails + English-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toate emailurile aplicației în stilul dark Toura (EN), template-urile Supabase la fel, iar aplicația devine English-only (contractele C3 rămân RO).

**Architecture:** Un helper pur `renderEmail()` (table-based, inline styles) generează HTML-ul de email; compunerile per-email sunt funcții pure testabile în `lib/emailMessages.ts`; template-urile de auth trăiesc ca fișiere în `docs/email-templates/` ținute sincron cu helperul printr-un test. English-only = locale hardcodat + ștergerea stringurilor RO enumerate exact aici.

**Tech Stack:** TypeScript, vitest (TDD), Resend (existent, neatins), next-intl (rămâne, doar EN).

## Global Constraints

- Limbă: engleză pentru TOT ce e user-facing. Excepție: contractele C3 (`lib/contractMerge.ts`, `lib/numberToWords.ts`, `pdf/ContractPdf.tsx`, `pdf/AnnexPdf*`, seed-urile din settings contract-templates) — NU se ating.
- Stil email (spec §1): fundal `#101012`, card `#18181b` 480px colțuri 12px border `#2e2e33`, titlu 17px/600 `#fafafa`, body 13.5px `#a1a1aa` lh 1.55, buton `<a>` alb `#fafafa` text `#18181b` 13px/600 padding 10px 22px colțuri 8px centrat, infoBox `#1f1f23`/`#2e2e33` text `#d4d4d8`, note 11.5px `#71717a` centrat, footer 11px `#71717a` peste hairline `#2e2e33`.
- Fără imagini externe; wordmark „T Toura" din celule de tabel. `<meta name="color-scheme" content="dark">` + `bgcolor` pe body și tabele.
- Footer: emailuri de org → `Sent by {org} via Toura · toura.pro`; auth → `Sent by Toura · toura.pro`.
- Orice valoare interpolată trece prin `esc()` la compunere. `renderEmail` escapează singur `cta.label` și `cta.url`; `bodyHtml`, `infoBox`, `note`, `footer`, `title` vin gata escapate de builder (pot conține `<b>`).
- `lib/emailTemplate.ts`, `lib/emailMessages.ts`, `lib/authEmailTemplates.ts` NU importă `server-only` (trebuie să ruleze în vitest). `lib/email.ts` rămâne `server-only`.
- Zero dependențe noi. Commit după fiecare task.

---

### Task 1: `lib/emailTemplate.ts` — renderEmail + esc (TDD)

**Files:**
- Create: `lib/emailTemplate.ts`
- Test: `lib/emailTemplate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EmailInput = {
    title: string;      // gata escapat de apelant
    bodyHtml: string;   // HTML permis (<b>), valorile interpolate deja escapate
    cta?: { label: string; url: string }; // escapate de renderEmail
    infoBox?: string[]; // o linie per element, gata escapate; randate cu <br>
    note?: string;      // gata escapat
    footer: string;     // gata escapat
  };
  export function renderEmail(input: EmailInput): string; // → document HTML complet
  export function esc(s: string): string;
  ```

- [ ] **Step 1: Scrie testele (failing)**

```ts
// lib/emailTemplate.test.ts
import { describe, expect, it } from "vitest";
import { esc, renderEmail } from "./emailTemplate";

describe("esc", () => {
  it("escapează & < > \" '", () => {
    expect(esc(`Tom & Jerry <script>"'`)).toBe(
      "Tom &amp; Jerry &lt;script&gt;&quot;&#39;",
    );
  });
});

describe("renderEmail", () => {
  const base = {
    title: "You're invited to SOM",
    bodyHtml: "Join the <b>SOM</b> workspace.",
    footer: "Sent by SOM via Toura · toura.pro",
  };

  it("conține titlul, body-ul, footerul și wordmark-ul", () => {
    const html = renderEmail(base);
    expect(html).toContain("You're invited to SOM");
    expect(html).toContain("Join the <b>SOM</b> workspace.");
    expect(html).toContain("Sent by SOM via Toura · toura.pro");
    expect(html).toContain(">Toura</");
    expect(html).toContain('content="dark"');
    expect(html).toContain('bgcolor="#101012"');
  });

  it("fără cta → fără buton; cu cta → <a> cu url și label escapate", () => {
    expect(renderEmail(base)).not.toContain("border-radius:8px");
    const html = renderEmail({
      ...base,
      cta: { label: "Accept & join", url: "https://x.ro/a?b=1&c=2" },
    });
    expect(html).toContain('href="https://x.ro/a?b=1&amp;c=2"');
    expect(html).toContain("Accept &amp; join");
  });

  it("infoBox: o linie per element, unite cu <br>", () => {
    const html = renderEmail({ ...base, infoBox: ["2 × tickets", "1 × AAA"] });
    expect(html).toContain("2 × tickets<br>1 × AAA");
  });

  it("note apare doar când e dat", () => {
    expect(renderEmail(base)).not.toContain("11.5px");
    expect(renderEmail({ ...base, note: "See you there!" })).toContain(
      "See you there!",
    );
  });
});
```

- [ ] **Step 2: Rulează — trebuie să pice**

Run: `pnpm vitest run lib/emailTemplate.test.ts`
Expected: FAIL (modulul nu există)

- [ ] **Step 3: Implementarea**

```ts
// lib/emailTemplate.ts
/**
 * Layoutul unic al emailurilor Toura (spec 2026-08-09): dark ca UI-ul,
 * table-based + stiluri inline (singurul mod fiabil în clienți de email),
 * fără imagini externe. Pur — fără server-only, ca să fie testabil.
 */

export type EmailInput = {
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  infoBox?: string[];
  note?: string;
  footer: string;
};

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BG = "#101012";
const CARD = "#18181b";
const HAIRLINE = "#2e2e33";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const FAINT = "#71717a";

export function renderEmail(input: EmailInput): string {
  const rows: string[] = [];

  rows.push(`<tr><td style="padding:0 0 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="24" height="24" align="center" bgcolor="#232327" style="border:1px solid #3f3f46;border-radius:7px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12px;font-weight:700;color:${TEXT};">T</td>
      <td style="padding-left:8px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:${TEXT};letter-spacing:-0.01em;">Toura</td>
    </tr></table>
  </td></tr>`);

  rows.push(`<tr><td style="padding:0 0 8px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:17px;font-weight:600;color:${TEXT};">${input.title}</td></tr>`);
  rows.push(`<tr><td style="padding:0 0 18px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:13.5px;line-height:1.55;color:${MUTED};">${input.bodyHtml}</td></tr>`);

  if (input.infoBox && input.infoBox.length > 0) {
    rows.push(`<tr><td style="padding:0 0 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="#1f1f23" style="border:1px solid ${HAIRLINE};border-radius:8px;padding:12px 14px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:12.5px;line-height:1.7;color:#d4d4d8;">${input.infoBox.join("<br>")}</td>
      </tr></table>
    </td></tr>`);
  }

  if (input.cta) {
    rows.push(`<tr><td align="center" style="padding:0 0 14px;">
      <a href="${esc(input.cta.url)}" style="display:inline-block;background:${TEXT};color:${CARD};font-family:-apple-system,'Segoe UI',sans-serif;font-size:13px;font-weight:600;padding:10px 22px;border-radius:8px;text-decoration:none;">${esc(input.cta.label)}</a>
    </td></tr>`);
  }

  if (input.note) {
    rows.push(`<tr><td align="center" style="padding:0 0 18px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:11.5px;color:${FAINT};">${input.note}</td></tr>`);
  }

  rows.push(`<tr><td style="border-top:1px solid ${HAIRLINE};padding:14px 0 0;font-family:-apple-system,'Segoe UI',sans-serif;font-size:11px;line-height:1.5;color:${FAINT};">${input.footer}</td></tr>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
</head>
<body bgcolor="${BG}" style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="max-width:480px;width:100%;background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;"><tr><td style="padding:28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows.join("\n")}
</table>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
}
```

- [ ] **Step 4: Rulează — verde**

Run: `pnpm vitest run lib/emailTemplate.test.ts`
Expected: PASS (5 teste)

- [ ] **Step 5: Commit**

```bash
git add lib/emailTemplate.ts lib/emailTemplate.test.ts
git commit -m "feat: renderEmail — layoutul dark Toura pentru emailuri"
```

---

### Task 2: Compunerile per-email + rescrierea celor 3 senderi

**Files:**
- Create: `lib/emailMessages.ts`
- Test: `lib/emailMessages.test.ts`
- Modify: `lib/email.ts` (sendGuestApprovalEmail → builder + orgName)
- Modify: `app/o/[orgSlug]/settings/users/page.tsx:81-85` (invitația)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions.ts` (vendorEmailHtml → builder, 2 apeluri)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/guest-list/actions.ts:147` (adaugă orgName)

**Interfaces:**
- Consumes: `renderEmail`, `esc` din Task 1.
- Produces (toate întorc `{ subject: string; html: string }`):
  ```ts
  export function buildInvitationEmail(i: { orgName: string; url: string }): EmailMessage;
  export function buildGuestApprovalEmail(i: {
    orgName: string; guestName: string; eventTitle: string; eventDate: string;
    numTickets: number; passes: { name: string; quantity: number }[];
  }): EmailMessage;
  export function buildVendorEmail(i: { orgName: string; url: string; expiresAt: string }): EmailMessage;
  ```
  `sendGuestApprovalEmail` primește în plus `orgName: string` (breaking, un singur apelant).

- [ ] **Step 1: Testele (failing)**

```ts
// lib/emailMessages.test.ts
import { describe, expect, it } from "vitest";
import {
  buildGuestApprovalEmail,
  buildInvitationEmail,
  buildVendorEmail,
} from "./emailMessages";

describe("buildInvitationEmail", () => {
  it("subiect EN + org escapat + link + footer de org", () => {
    const m = buildInvitationEmail({ orgName: "R&B <Live>", url: "https://toura.pro/invite/t1" });
    expect(m.subject).toBe("You're invited to R&B <Live> on Toura");
    expect(m.html).toContain("R&amp;B &lt;Live&gt;");
    expect(m.html).toContain('href="https://toura.pro/invite/t1"');
    expect(m.html).toContain("Sent by R&amp;B &lt;Live&gt; via Toura · toura.pro");
    expect(m.html).toContain("Accept invitation");
  });
});

describe("buildGuestApprovalEmail", () => {
  const base = {
    orgName: "SOM", guestName: "Andrei & Co", eventTitle: "SPEAK — Arene",
    eventDate: "2026-08-14", numTickets: 2,
    passes: [{ name: "Backstage", quantity: 1 }],
  };
  it("casetă cu bilete + pass-uri, nume escapat", () => {
    const m = buildGuestApprovalEmail(base);
    expect(m.subject).toBe("Guest list confirmed — SPEAK — Arene (2026-08-14)");
    expect(m.html).toContain("Andrei &amp; Co");
    expect(m.html).toContain("2 × tickets<br>1 × Backstage");
    expect(m.html).toContain("You're on the guest list");
  });
  it("fără bilete → doar pass-urile în casetă", () => {
    const m = buildGuestApprovalEmail({ ...base, numTickets: 0 });
    expect(m.html).not.toContain("× tickets");
    expect(m.html).toContain("1 × Backstage");
  });
});

describe("buildVendorEmail", () => {
  it("buton + valabilitate + footer org", () => {
    const m = buildVendorEmail({
      orgName: "SOM", url: "https://toura.pro/share/vendor/tok",
      expiresAt: "2026-09-13T10:00:00Z",
    });
    expect(m.subject).toBe("SOM — vendor portal access");
    expect(m.html).toContain('href="https://toura.pro/share/vendor/tok"');
    expect(m.html).toContain("Open vendor portal");
    expect(m.html).toContain("Link valid until 2026-09-13");
    expect(m.html).not.toContain("v-a invitat");
  });
});
```

- [ ] **Step 2: Rulează — FAIL** (`pnpm vitest run lib/emailMessages.test.ts`)

- [ ] **Step 3: Implementarea builder-elor**

```ts
// lib/emailMessages.ts
/** Compunerile emailurilor din aplicație (spec 2026-08-09 §2) — funcții
 *  pure {subject, html}; trimiterea rămâne în lib/email.ts / apelanți. */
import { esc, renderEmail } from "./emailTemplate";

export type EmailMessage = { subject: string; html: string };

export function buildInvitationEmail(i: { orgName: string; url: string }): EmailMessage {
  const org = esc(i.orgName);
  return {
    subject: `You're invited to ${i.orgName} on Toura`,
    html: renderEmail({
      title: `You're invited to ${org}`,
      bodyHtml: `You've been invited to join the <b>${org}</b> workspace on Toura — tours, day sheets, guest lists and advancing in one place.`,
      cta: { label: "Accept invitation", url: i.url },
      note: "If you weren't expecting this, you can ignore this email.",
      footer: `Sent by ${org} via Toura · toura.pro`,
    }),
  };
}

export function buildGuestApprovalEmail(i: {
  orgName: string;
  guestName: string;
  eventTitle: string;
  eventDate: string;
  numTickets: number;
  passes: { name: string; quantity: number }[];
}): EmailMessage {
  const infoBox = [
    ...(i.numTickets > 0 ? [`${i.numTickets} × tickets`] : []),
    ...i.passes.map((p) => `${p.quantity} × ${esc(p.name)}`),
  ];
  return {
    subject: `Guest list confirmed — ${i.eventTitle} (${i.eventDate})`,
    html: renderEmail({
      title: "You're on the guest list 🎟️",
      bodyHtml: `<b>${esc(i.guestName)}</b> is confirmed for <b>${esc(i.eventTitle)}</b> — ${esc(i.eventDate)}.`,
      infoBox,
      note: "Show this email at the entrance. See you there!",
      footer: `Sent by ${esc(i.orgName)} via Toura · toura.pro`,
    }),
  };
}

export function buildVendorEmail(i: {
  orgName: string;
  url: string;
  expiresAt: string;
}): EmailMessage {
  const org = esc(i.orgName);
  return {
    subject: `${i.orgName} — vendor portal access`,
    html: renderEmail({
      title: "Vendor portal access",
      bodyHtml: `<b>${org}</b> invited you to the vendor portal for this show. Add your team and upload the files your department needs.`,
      cta: { label: "Open vendor portal", url: i.url },
      note: `Link valid until ${esc(String(i.expiresAt).slice(0, 10))}`,
      footer: `Sent by ${org} via Toura · toura.pro`,
    }),
  };
}
```

- [ ] **Step 4: Rulează — PASS** (`pnpm vitest run lib/emailMessages.test.ts`)

- [ ] **Step 5: Rescrie senderii**

În `lib/email.ts`: `sendGuestApprovalEmail` primește `orgName: string` în input și devine:

```ts
import { buildGuestApprovalEmail } from "./emailMessages";

export async function sendGuestApprovalEmail(input: {
  to: string;
  orgName: string;
  guestName: string;
  eventTitle: string;
  eventDate: string;
  numTickets: number;
  passes: { name: string; quantity: number }[];
}): Promise<{ error?: string }> {
  const { to, ...rest } = input;
  const message = buildGuestApprovalEmail(rest);
  return sendEmail({ to, subject: message.subject, html: message.html });
}
```

(șterge vechiul HTML inline și comentariul RO despre listă.)

În `app/o/[orgSlug]/settings/users/page.tsx` (în blocul `if (inviteRow)`):

```ts
const message = buildInvitationEmail({ orgName: ctx.org.name, url });
await sendEmail({ to: email, subject: message.subject, html: message.html });
```

(import `buildInvitationEmail` din `@/lib/emailMessages`; șterge subiectul/HTML-ul RO.)

În `extras-actions.ts`: șterge funcția `vendorEmailHtml` și în AMBELE locuri (create + resend):

```ts
const message = buildVendorEmail({ orgName: org.name, url, expiresAt: data.expires_at });
const sent = await sendEmail({ to: company.email, subject: message.subject, html: message.html });
```

(la resend: `url` e `${base}/share/vendor/${link.token}`, `expiresAt: link.expires_at`.)

În `guest-list/actions.ts:147`: adaugă `orgName: org.name,` în apelul `sendGuestApprovalEmail` (obiectul `org` există deja în scope din `requireEditor`/context — verifică numele variabilei la fața locului).

- [ ] **Step 6: Full suite + commit**

Run: `pnpm vitest run` → verde; `pnpm exec tsc --noEmit` (dacă e configurat: `pnpm run typecheck`; altfel `pnpm exec next build` NU e necesar aici).

```bash
git add lib/email.ts lib/emailMessages.ts lib/emailMessages.test.ts "app/o/[orgSlug]/settings/users/page.tsx" "app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions.ts" "app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/guest-list/actions.ts"
git commit -m "feat: emailurile din app pe layoutul Toura, EN-only"
```

---

### Task 3: Template-urile de auth ca fișiere sincronizate

**Files:**
- Create: `lib/authEmailTemplates.ts`
- Create: `docs/email-templates/reset-password.html`, `docs/email-templates/magic-link.html`, `docs/email-templates/confirm-signup.html`
- Test: `lib/authEmailTemplates.test.ts`

**Interfaces:**
- Consumes: `renderEmail` din Task 1.
- Produces: `export const AUTH_EMAILS: { file: string; subject: string; html: string }[]` (3 intrări; `html` include comentariul cu subiectul pe prima linie).

- [ ] **Step 1: Modulul**

```ts
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
```

- [ ] **Step 2: Testul de sincronizare (cu mod de regenerare)**

```ts
// lib/authEmailTemplates.test.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_EMAILS } from "./authEmailTemplates";

const DIR = join(__dirname, "..", "docs", "email-templates");

describe("docs/email-templates sincron cu renderEmail", () => {
  for (const t of AUTH_EMAILS) {
    it(t.file, () => {
      if (process.env.WRITE_EMAIL_TEMPLATES === "1") {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(join(DIR, t.file), t.html);
      }
      expect(readFileSync(join(DIR, t.file), "utf8")).toBe(t.html);
    });
  }

  it("linkurile folosesc token_hash prin /auth/confirm", () => {
    for (const t of AUTH_EMAILS) {
      expect(t.html).toContain("/auth/confirm?token_hash={{ .TokenHash }}&amp;type=");
    }
  });
});
```

- [ ] **Step 3: Generează fișierele + verifică**

Run: `WRITE_EMAIL_TEMPLATES=1 pnpm vitest run lib/authEmailTemplates.test.ts` (scrie fișierele), apoi `pnpm vitest run lib/authEmailTemplates.test.ts` — PASS fără env.

- [ ] **Step 4: Commit**

```bash
git add lib/authEmailTemplates.ts lib/authEmailTemplates.test.ts docs/email-templates/
git commit -m "feat: template-urile de auth Supabase în stilul Toura, token_hash pe toate"
```

---

### Task 4: English-only — locale, sweep stringuri, raport anual

**Files:**
- Modify: `i18n/request.ts` (rescris integral)
- Delete: `messages/ro.json`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/events-client.tsx:171,177`
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/venue-client.tsx:104-106`
- Modify: `app/o/[orgSlug]/events/new/form.tsx:36`
- Modify: `lib/costCalc.ts:27` + testele care afirmă labelul
- Modify: `lib/dealSnapshot.ts:137` + `lib/dealSnapshot.test.ts` (expectările)
- Modify: `app/o/[orgSlug]/t/[tourId]/d/[date]/e/[eventId]/accounting/accounting-client.tsx:79`
- Modify: `pdf/AnnualReportPdf.tsx` + `app/api/pdf/annual-report/[orgSlug]/route.ts`

**Interfaces:**
- Produces: `buildAnnualReportPdf(orgName: string, year: number, people: PersonYearReport[])` — parametrul `locale` DISPARE.

- [ ] **Step 1: i18n hardcodat**

`i18n/request.ts` devine:

```ts
import { getRequestConfig } from 'next-intl/server'

// English-only (decizie 2026-08-09); contractele C3 rămân RO prin propriile
// texte, nu prin next-intl.
export const LOCALES = ['en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: (await import('../messages/en.json')).default,
}))
```

`git rm messages/ro.json`. Apoi `grep -rn "messages/ro\|LOCALES\|DEFAULT_LOCALE" --include="*.ts" --include="*.tsx" app components lib i18n next.config* | grep -v node_modules` — orice referință rămasă la `ro` se curăță (ex. dacă `next.config` sau vreun util citește LOCALES, rămâne valid cu `['en']`).

- [ ] **Step 2: Placeholder-ele bilingve → EN**

- `events-client.tsx`: `placeholder="Oraș / City"` → `placeholder="City"`; `placeholder="Țară / Country"` → `placeholder="Country"`.
- `venue-client.tsx`: `"Adresă / Address"` → `"Address"`, `"Oraș / City"` → `"City"`, `"Țară / Country"` → `"Country"`.
- `events/new/form.tsx:36`: `useState("România")` → `useState("Romania")`.

- [ ] **Step 3: Labelurile de linii financiare**

- `lib/costCalc.ts:27`: `` `Diurnă ${party.name} — ${headcount} × ${rate} ${currency} × ${days} zile` `` → `` `Per diem ${party.name} — ${headcount} × ${rate} ${currency} × ${days} days` ``
- `lib/dealSnapshot.ts:137`: `` `Impozit reținut ${percent}% — ${amount} ${currency}` `` → `` `Withholding tax ${percent}% — ${amount} ${currency}` ``
- `grep -rn "Diurnă\|Impozit reținut" lib app --include="*.ts" --include="*.tsx"` → actualizează TOATE aparițiile rămase (inclusiv expectările din teste — ex. `lib/dealSnapshot.test.ts`, testele de costCalc/showFinance) la noile labeluri. Notă: rândurile deja salvate în DB păstrează labelul vechi — acceptat prin spec.

- [ ] **Step 4: Formatare numerică EN**

`accounting-client.tsx:79`: `toLocaleString("ro-RO", …)` → `toLocaleString("en-US", …)`.

- [ ] **Step 5: Raportul anual EN-only**

În `pdf/AnnualReportPdf.tsx`: șterge obiectul `L10N` și parametrul `locale`; păstrează doar stringurile EN într-un `const T = { title: "Annual per-person payment report", generated: "Generated from Toura", paid: "paid", pending: "due", person: ["person", "people"], annex: ["annex", "annexes"], outstanding: "outstanding", allPaid: "all paid" }` și înlocuiește `t` cu `T`. Semnătura: `buildAnnualReportPdf(orgName, year, people)`.

În `app/api/pdf/annual-report/[orgSlug]/route.ts`: apelul devine `buildAnnualReportPdf(org.name, year, people)`; șterge importul/apelul `getLocale` dacă rămâne nefolosit.

- [ ] **Step 6: Suite + commit**

Run: `pnpm vitest run` → verde (inclusiv testele actualizate).

```bash
git add -A
git commit -m "feat: English-only — locale hardcodat en, stringuri RO traduse, raport anual EN"
```

---

### Task 5: Vendor portal EN-only

**Files:**
- Modify: `app/share/vendor/[token]/page.tsx` (L10N, Lang, accept-language, formatShortDate)
- Modify: `app/share/vendor/[token]/portal-client.tsx` (prop `lang`)

**Interfaces:**
- Consumes: nimic din taskurile anterioare.
- Produces: `T` (obiectul de stringuri EN) rămâne cu ACELEAȘI chei ca azi — clientul folosește `t.invalidLink`, `t.uploadErrorTooLarge` etc. neschimbate.

- [ ] **Step 1: page.tsx**

- Șterge `type Lang` și ramura `ro:` din `L10N`; obiectul devine `const T: Record<string, string> = { …exact stringurile EN de azi… }`.
- Șterge sniff-ul `accept-language` (`const lang: Lang = …`) și `const t = L10N[lang]` → `const t = T`. Dacă `headers` din `next/headers` rămâne neimportat de altceva în fișier, șterge importul.
- `formatShortDate(date: string)` — un singur parametru; `Intl.DateTimeFormat("en-US", …)`. Actualizează apelurile (scoate argumentul `lang`).
- Prop-ul `lang` NU se mai trimite către client.

- [ ] **Step 2: portal-client.tsx**

Scoate `lang` din props (și din tipuri); `<div lang={lang}` → `<div lang="en"`.

- [ ] **Step 3: Verificare + commit**

Run: `pnpm vitest run` → verde; `grep -n "[ăâîșț]" "app/share/vendor/[token]/page.tsx" "app/share/vendor/[token]/portal-client.tsx" | grep -v "^\s*[0-9]*:\s*\*\|//"` → doar comentarii (sau nimic).

```bash
git add "app/share/vendor/[token]/page.tsx" "app/share/vendor/[token]/portal-client.tsx"
git commit -m "feat: vendor portal English-only"
```

---

### Task 6 (manual, sesiunea principală, DUPĂ merge + deploy): Supabase + smoke

Nu e task de subagent — îl execută sesiunea principală prin browser:

- [ ] Lipește conținutul celor 3 fișiere din `docs/email-templates/` în Supabase → Authentication → Emails → Templates (Reset password / Magic link or OTP / Confirm sign up), FĂRĂ prima linie de comentariu; setează subiectele din comentarii: `Reset your Toura password` / `Sign in to Toura` / `Confirm your email`.
- [ ] Smoke real: de pe `/login`, „Forgot password?" pe contul lui Ștefan → emailul nou (dark, buton) → click → `/reset-password` → setează parola → intră în app. Verifică în Resend că emailul e Delivered.
- [ ] Smoke magic link: „Send me a magic link" → click din email (poate fi alt browser — token_hash o permite acum) → ajunge logat în `/app`.
- [ ] Verifică vizual un email în Gmail (dark, wordmark, buton, footer).

---

## Self-review (făcut la scriere)

- **Acoperire spec:** §1→Task 1, §2.1-2.3→Task 2, §3→Task 3+6, §4→Task 4+5, §5→testele din 1-3 + suite în 4-5 + smoke în 6. „Sweep diacritice" e enumerat exhaustiv (inventar făcut cu grep înainte de plan; comentariile RO rămân intenționat).
- **Placeholder scan:** fără TBD; tot codul e complet în plan.
- **Consistență tipuri:** `EmailInput`/`EmailMessage`/`AUTH_EMAILS` folosite identic în Taskurile 1-3; `buildAnnualReportPdf` fără `locale` reflectat și în route (Task 4 Step 5). Escaping: `renderEmail` escapează doar `cta`; builder-ele escapează restul — testele din Task 2 verifică exact asta. Subiectele NU se escapează (nu sunt HTML).

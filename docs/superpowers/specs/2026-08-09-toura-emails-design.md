# Toura Emails + English-Only — Design

**Date:** 2026-08-09 · **Status:** aprobat în brainstorm (mockups validate vizual de Ștefan)

## Scop

Toate emailurile pe care le primesc oamenii (echipă, guests, vendori, viitori
useri) arată la fel: stilul dark al aplicației, brand Toura, limba engleză.
Bonus de scope aprobat: aplicația devine **English-only** (UI + emailuri);
contractele PDF generate (C3) rămân în **română** — documente juridice după
modelele Zolei.

## Decizii luate (cu Ștefan, 2026-08-09)

1. **Scope emailuri:** toate 6 — invitație org, guest list, vendor portal
   (app) + reset password, magic link, confirm signup (Supabase auth).
2. **Limbă:** engleză peste tot. Nimic bilingv. Contractele C3 rămân RO.
3. **Stil vizual:** varianta „B — Dark brand" din mockup: card `#18181b` pe
   fundal `#101012`, text alb, buton alb cu text negru — identic cu UI-ul.
4. **Footer:** emailurile trimise de o organizație zic
   „Sent by {org} via Toura · toura.pro"; cele de auth doar
   „Sent by Toura · toura.pro".

## 1. `lib/emailTemplate.ts` — helperul de layout

```ts
export function renderEmail(input: {
  title: string;                       // titlul mare din card
  bodyHtml: string;                    // paragraful principal (HTML DEJA escapat de apelant prin esc())
  cta?: { label: string; url: string };// butonul alb (opțional)
  infoBox?: string[];                  // caseta de detalii (o linie per element; escapate de apelant)
  note?: string;                       // rând mic sub buton (ex. valabilitate / "ignore this email")
  footer: string;                      // "Sent by X via Toura · toura.pro"
}): string                             // → document HTML complet
export function esc(s: string): string // escape HTML: & < > " '
```

Reguli de construcție (email-safe):

- **Table-based**, toate stilurile **inline**; fără CSS extern, fără imagini
  externe (blocate default) — wordmark-ul „T Toura" e desenat din celule de
  tabel (pătrățel bordurat cu „T" + text „Toura").
- Anti-inversare dark: `<meta name="color-scheme" content="dark">`,
  `bgcolor` pe `<body>` și pe tabelele de fundal, culorile și pe atribute
  nu doar în `style`.
- Lățime card 480px, colțuri 12px, border `#2e2e33`; titlu 17px/600 `#fafafa`;
  body 13.5px `#a1a1aa` line-height 1.55; buton `#fafafa` pe text `#18181b`,
  13px/600, padding 10px 22px, colțuri 8px, centrat; infoBox fundal `#1f1f23`,
  border `#2e2e33`, text `#d4d4d8`; note 11.5px `#71717a` centrat; footer
  11px `#71717a` peste hairline `#2e2e33`.
- Butonul e `<a>` cu stiluri inline (nu `<button>`); URL-ul niciodată trunchiat.
- `esc()` se aplică de apelant pe ORICE valoare interpolată (nume guest, nume
  org, titlu event) — un nume `<script>` ajunge text, nu markup.

## 2. Cele 3 emailuri din aplicație (rescrise pe helper)

### 2.1 Invitație în organizație — `app/o/[orgSlug]/settings/users/page.tsx`

- Subiect: `You're invited to {org} on Toura`
- title: `You're invited to {org}`
- body: `You've been invited to join the <b>{org}</b> workspace on Toura —
  tours, day sheets, guest lists and advancing in one place.`
- cta: `Accept invitation` → linkul `/invite/{token}` existent
- note: `If you weren't expecting this, you can ignore this email.`
- footer: `Sent by {org} via Toura · toura.pro`

### 2.2 Guest list — `sendGuestApprovalEmail` din `lib/email.ts`

- Subiect: `Guest list confirmed — {eventTitle} ({eventDate})`
- title: `You're on the guest list 🎟️`
- body: `<b>{guestName}</b> is confirmed for <b>{eventTitle}</b> — {eventDate}.`
- infoBox: `["{n} × tickets"?, "{q} × {passName}"…]` (linia de bilete doar
  dacă `numTickets > 0`, ca azi)
- note: `Show this email at the entrance. See you there!`
- footer: `Sent by {org} via Toura · toura.pro` — **schimbare de semnătură:**
  `sendGuestApprovalEmail` primește nou câmpul `orgName: string`; apelantul
  (fluxul de aprobare guest list) îl are deja în context.
- fără cta.

### 2.3 Vendor portal — `vendorEmailHtml` din
`app/o/[orgSlug]/t/[tourId]/d/[date]/extras-actions.ts`

- Subiect: `{org} — vendor portal access` (neschimbat, deja EN)
- title: `Vendor portal access`
- body: `<b>{org}</b> invited you to the vendor portal for this show. Add
  your team and upload the files your department needs.`
- cta: `Open vendor portal` → linkul `/share/vendor/{token}`
- note: `Link valid until {YYYY-MM-DD}`
- footer: `Sent by {org} via Toura · toura.pro`
- Se elimină complet varianta bilingvă RO/EN. Folosit din ambele locuri
  (create + resend), ca azi.

## 3. Template-urile Supabase auth

Sursă de adevăr în repo: `docs/email-templates/{reset-password,magic-link,
confirm-signup}.html` — HTML-uri complete cu ACELAȘI vizual, comise ca
fișiere. Sincronizarea cu `renderEmail` e garantată de un test
(`lib/emailTemplate.test.ts`): randează cele 3 emailuri de auth prin
`renderEmail` (cu placeholder-ele `{{ .TokenHash }}` etc. ca stringuri
literale) și verifică egalitatea cu conținutul fișierelor din
`docs/email-templates/` — dacă layout-ul se schimbă, testul pică și
fișierele se regenerează din output-ul testului. Se lipesc manual în
dashboard (Ștefan sau Claude prin browser). Fiecare fișier are în capul lui
un comentariu HTML cu subiectul de setat.

| Template | Subiect | Link în buton | note |
|---|---|---|---|
| Reset password | `Reset your Toura password` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` | `The link is valid for 60 minutes.` + `Didn't request this? You can safely ignore this email.` |
| Magic link | `Sign in to Toura` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/app` | `Didn't request this? You can safely ignore this email.` |
| Confirm signup | `Confirm your email` | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/app` | — |

- Toate trec pe `token_hash` prin `/auth/confirm` (ruta există; `verifyOtp`
  acceptă `recovery`/`magiclink`/`signup`) — rezolvă și follow-up-ul „magic
  link merge doar în același browser" (PKCE). `emailRedirectTo` din
  login/signup devine irelevant pentru destinație (template-ul comandă), dar
  rămâne inofensiv în cod.
- Footer auth: `Sent by Toura · toura.pro`.
- title-uri: `Reset your password` / `Sign in to Toura` / `Confirm your email`;
  body-uri scurte pe modelul mockup-ului aprobat.

## 4. English-only

- `i18n/request.ts`: `LOCALES = ['en']`, locale hardcodat `'en'`, fără citit
  cookie. `messages/ro.json` se șterge. `next-intl` rămâne (cheile EN).
- Portalul de vendor (`app/share/vendor/[token]/page.tsx` + client):
  dicționarul local L10N devine doar EN (se șterg stringurile RO).
- Sweep: grep pe diacritice românești în stringuri user-visible din `app/`,
  `components/`, `lib/` (excluse: comentarii, `*.test.ts`, tot ce ține de
  contracte C3 — `contractMerge`, `numberToWords`, `ContractPdf`, texte
  juridice din settings contract-templates seed). Ce se găsește se traduce EN.
  `pdf/AnnualReportPdf.tsx`: ramura de labels RO se elimină — raportul e
  EN-only (decizia „nimic în română" acoperă și PDF-urile de raport;
  excepția RO e strict pentru contractele juridice C3).
- Emailul de invitație + subiectele RO existente intră deja la §2.

## 5. Testare

- `lib/emailTemplate.test.ts` (TDD): titlul/cta/footer apar în HTML; `esc()`
  escapează `&<>"'`; infoBox generează o linie per element; fără cta → fără
  `<a>` de buton; URL-ul din cta apare exact.
- Emailurile per-tip: un test per email (invitație/guest/vendor) că subiectul
  și body-ul conțin valorile interpolate escapate (funcțiile de compunere se
  extrag pur, testabile — ex. `buildGuestApprovalEmail(input) → {subject, html}`).
- Auth: smoke real după lipirea template-urilor (reset pe contul lui Ștefan).
- EN-only: `pnpm vitest run` verde + grep-ul de diacritice curat pe zonele
  user-visible.

## Out of scope

- Trimiterea de day sheets / parties pe email (§11 rămas — alt proiect).
- Logo grafic/imagini în emailuri (rămânem text-only, robust).
- Schimbarea providerului sau a expeditorului (rămâne Resend,
  `Toura <no-reply@toura.pro>`).
- Traducerea contractelor C3 (rămân RO prin decizie explicită).

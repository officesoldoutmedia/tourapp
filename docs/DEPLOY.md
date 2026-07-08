# DEPLOY.md — runbook producție

Stack țintă (blueprint §2.1): **Supabase cloud** (există: `jpeprowgdlgrtlmkgwou`,
eu-central-1) + **Cloudflare Workers** via OpenNext + **Resend**. Railway NU e
necesar în MVP (doar Faza 2, flight tracking).

## 0. Ce există deja
- Proiect Supabase `tourapp` cu toate cele 13 migrații aplicate, bucket
  Storage `attachments` + politici, Auth configurat (email fără confirmare —
  DE REACTIVAT la lansare publică, vezi §4).
- `wrangler.jsonc` + `open-next.config.ts` + scripts `pnpm preview` /
  `pnpm deploy`; build-ul OpenNext verificat local.
- Cheia Google Maps (Places New / Distance Matrix / Time Zone) — server-only.

## 1. Cloudflare — FĂCUT 2026-07-08
LIVE: **https://tourapp.office-2e5.workers.dev** (cont office@, worker `tourapp`).
Secrete setate: SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_API_KEY.
Auth Supabase: Site URL = workers.dev; redirect-uri: workers.dev/** + localhost:3000/**.
Redeploy la orice schimbare:
```sh
NEXT_PUBLIC_APP_URL=https://tourapp.office-2e5.workers.dev pnpm deploy
```
(APP_URL se COACE ÎN BUNDLE la build — nu uita variabila la rebuild!)
Apoi în dashboardul Cloudflare → Workers → tourapp → Domains: atașezi
domeniul ales (ex. app.tune-score.com). DNS-ul trebuie să fie pe Cloudflare.

## 2. Secrete & env pe Worker
```sh
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler secret put RESEND_API_KEY          # din resend.com, domeniu verificat
```
Variabile publice (dashboard → Settings → Variables sau [vars] în wrangler.jsonc):
```
NEXT_PUBLIC_SUPABASE_URL=https://jpeprowgdlgrtlmkgwou.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
NEXT_PUBLIC_APP_URL=https://<domeniu>
EMAIL_FROM=TourApp <no-reply@<domeniu-verificat-resend>>
```

## 3. Supabase la schimbarea domeniului
- Auth → URL Configuration: Site URL = https://<domeniu>; adaugă
  https://<domeniu>/auth/callback la Redirect URLs.
- Migrații viitoare: `supabase db push --db-url "$SUPABASE_DB_URL"`
  (connection string-ul cu parola DB — e în .env.local local, NU în repo).

## 4. Checklist de lansare (security pass §10 Faza 8)
- [ ] Reactivează **Confirm email** în Supabase Auth (dezactivat pt. testare).
- [ ] Auth → Attack Protection: rate limits default ON; adaugă CAPTCHA dacă
      apare abuz pe signup.
- [ ] Cloudflare → Security → Rate limiting rule pe `/api/ical/*` și
      `/share/*` (ex. 60 req/min/IP) — limitarea reală se face în edge,
      nu în aplicație.
- [ ] Verifică advisors: `get_advisors` (security) pe proiect — la zi, 0
      findings după migrația 00013.
- [ ] Rotația secretelor: parola DB + service_role se rotesc din dashboard;
      după rotire: update .env.local + `wrangler secret put`.
- [ ] Backups: incluse în planul Supabase (PITR opțional, add-on).

## 5. Verificare post-deploy
1. Signup + login pe domeniul real (email de confirmare sosește prin
   SMTP-ul Supabase; pt. volum → configurezi Custom SMTP cu Resend).
2. Creezi tur → zi → schedule → PDF + share link public de pe domeniu.
3. `/api/ical/<token>` importat în Google Calendar.
4. Email de aprobare guest list (cu RESEND_API_KEY setat) ajunge în inbox.

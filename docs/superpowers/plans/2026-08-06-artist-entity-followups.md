
## Adăugat post-SP3a (2026-08-06)

- **SP2/SP3a follow-ups noi:** idempotență createOneOffEvent (retry după eșec parțial),
  select-ul de valută rată nu se re-hidratează după save (afișează „—" deși DB e corect),
  aria-labels netraduse pe săgețile de reordonare parties, sort_order MAX+1,
  capsulă „(șters)" pt party soft-deleted referențiat, console.error în catch-ul
  computeGroundDistance, dedup query-uri tour_personnel pe costs page,
  chei orfane i18n (crewProfile.party), unit tests parties/copyArtistPartiesToTour.
- **Notă env:** `pnpm run deploy` poate afișa `ERROR Failed to copy ... color-string`
  pe volumul exFAT — non-fatal, build-ul se livrează; verifică `/api/version` după.

## Adăugat post-SP3b (2026-08-07)

- Semantica per-event fină la advancing multi-event (acum: „completat pe oricare event")
- Extracția computeProgressOfDays s-a făcut în fix wave; day page pe zile TRECUTE încă
  afișează % required-based (timeline/dashboard doar viitoare) — inconsistență minoră
- Head „reclaimed" + select status: rezolvat prin reset la draft; „(șters)" pe capsule rămâne
- Client Supabase netipizat proiect-wide (as X[] mască mismatch-uri) — efort separat mare
- Payload layout jsonb pe toate event-urile din istoric la timeline artist — de scoped la viitoare
- Chei/idiomuri: al 3-lea idiom de toggle, hint doar title pe touch, revoke execute pe seed fn

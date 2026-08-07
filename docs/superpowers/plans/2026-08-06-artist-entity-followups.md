
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

## Adăugat post-C1 (2026-08-07)

- Helper comun pentru gruparea snapshot-urilor pe zi (blocul de ~12 linii duplicat
  în day page / dashboard / artist timeline la construcția dealRequiredByDay)
- Constanta CURRENCIES duplicată acum în 3 fișiere — de partajat
- Erori non-conflict din applyDealToEvent nesemnalate în deal-card-client (fără
  pattern de toast pe pagină); idem restul acțiunilor startTransition de pe costs
- Withholding % neclampat server-side la ≤100 (doar max pe input-ul client)
- moveDealTemplate scrie indici de listă ca sort_order (clonă moveArtistParty) —
  drift la ties după soft-delete + insert; self-healing la mutări ulterioare
- deal_templates fără index pe organization_id (query-ul din wizard filtrează pe
  org) — irelevant la volumele actuale
- „1 nopți" în cardul Deal (deals.nights refolosit fără plural ICU)
- Prop dayPath mort în deal-card-client; title greșit (save) pe butonul de edit
  din deals-client
- Fluxul keepFee la conflict de fee folosește două window.confirm înlănțuite —
  de înlocuit cu un dialog custom 3-way când apare un pattern de modale

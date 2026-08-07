
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

## Adăugat post-C2 (2026-08-07)

- Titlul „Show" acceptat ca item show-anchored în template = footgun de recalcul
  (al doilea slot Show cu proveniență poate deveni reperul) — de respins în
  normalizeItems sau de sărit rândurile cu proveniență în findShowSlot
- Durata >1440 în editorul de template-uri se pierde silențios la save (offseturile
  resping, durata nu); inputul nu clamped valorile tastate
- Recalculează = N update-uri secvențiale fără atomicitate (self-healing la re-run;
  un upsert batch ar fi atomic și mai rapid)
- Capsula de offset rămâne pe valoarea generată după retime manual al unui item
  neconfirmat — următorul Recalculează suprascrie editarea manuală (confirm e
  escape hatch-ul); de discutat: golirea proveniențeí la editarea manuală a orei
- title-tooltip pe butonul Recalculează dezactivat — invizibil în Safari
- Erorile de save/delete rămân nesemnalate în templates-client + deals-client
  (pattern-ul general al paginilor; de rezolvat cu un pattern de toast)
- Fără index pe deal_templates.schedule_template_id (irelevant la volumele actuale)
- Lecție smoke C2: bug-ul de direcție (semnul pierdut prin −0 la offset 0) a
  scăpat de 3 review-uri și a fost prins doar la smoke pe producție — codul de
  editor UI cu stare derivată din semn merită test de interacțiune sau măcar
  smoke înainte de merge; fixat în 2 hotfix-uri pe main (a44dcb2 + 72d6f99)

## Adăugat post-C3 (2026-08-07)

- Trigger updated_at lipsă pe cele 4 tabele de contracte (migrare separată mică)
- Link de download pentru contractul-cadru SEMNAT (signed_storage_path scris dar
  niciun UI nu-l citește — spec gap, nu bug)
- Hartă de tranziții de status pe documente + gates consistente între registru
  (≠void) și Costs (≠signed); azi un void poate fi re-marcat
- Codurile de eroare (series_conflict, not_found) afișate brut sub „Missing:" —
  de i18n-izat
- .eq-uri cross-org suplimentare: generateContractDocument (eventId/personnelId),
  linkCrewEntity (tour_id) — teoretice, RLS backstop există
- numberToWords: clamp ≥1 miliard + carry la bani=100; guard negativ/NaN pe
  amountInWords (înainte să devină load-bearing în alte fluxuri)
- FIELD_RE doar lowercase — {{Crew.CUI}} tastat manual scapă de dry-run și apare
  literal în PDF; de făcut case-insensitive cu normalizare
- Cardul Contracte vizibil (gol, inert) pentru admin free-tier pe Costs — de
  ascuns ca la fix-ul din profil (96812d1)
- deal.fee neformatat în text (3500.5) — fee_in_words compensează; formatare de
  adăugat
- Statusul cadru: expirat de tot rămâne 🟡 pentru totdeauna — de introdus 🔴 la
  valid_until < azi
- Upload-ul semnatului netestat manual la smoke (file input prin browser MCP);
  fluxul e review-uit la nivel de cod pe pattern-ul storage existent — de
  verificat la prima folosire reală
- setDefaultEntity ne-atomic (fereastră zero-default) + fără constraint DB pe
  „un singur default" — is_default e doar display azi

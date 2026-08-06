
## Adăugat post-SP3a (2026-08-06)

- **SP2/SP3a follow-ups noi:** idempotență createOneOffEvent (retry după eșec parțial),
  select-ul de valută rată nu se re-hidratează după save (afișează „—" deși DB e corect),
  aria-labels netraduse pe săgețile de reordonare parties, sort_order MAX+1,
  capsulă „(șters)" pt party soft-deleted referențiat, console.error în catch-ul
  computeGroundDistance, dedup query-uri tour_personnel pe costs page,
  chei orfane i18n (crewProfile.party), unit tests parties/copyArtistPartiesToTour.
- **Notă env:** `pnpm run deploy` poate afișa `ERROR Failed to copy ... color-string`
  pe volumul exFAT — non-fatal, build-ul se livrează; verifică `/api/version` după.

# Implementation Status — fixuri-astra

## Current Phase
Ship: PR + CI + squash-merge + deploy + live verification

## Milestone Log (all merged into fix/astra-remediation)

- **M1 947db37 — N01 + shared date helpers**: corpora-refresh stages the real corpus
  dirs, quiet/changed from `git diff --cached --quiet` gating commit/publish/PR
  (dispatch included), force-pushed dated branch + PR reuse; `--input-dir/--manifest`
  offline import for SITUR/EIDA/LMI (SHA-validated); writeSnapshotIfChanged +
  order-preserving byte-stable registerPrefix (verified by consecutive quiet-day
  runs); isValidCalendarDate + calendarRange in lib/live/date.ts.
- **M2 3abf8ab — D01+D06 SEN**: verified endpoint /sen-filter; numeric PROD/CONS/SOLD
  contract (moved endpoint = source failure, not empty success); UTC+2/UTC+3
  candidate parsing with formatToParts round-trip (winter/summer vectors, spring gap
  + fall ambiguity stay unconfirmed with reasons); adaptor v2 bypassing v1 backoff;
  v1 copies re-validated at serve time (declared); negative ages unmasked;
  storedAdapterVersion exposed on SourceState.
- **M3 e79563d — D02+D04**: SITUR county canonicalized on both sides (387 food rows
  București for all 4 spellings, controls Brașov 607/Cluj 676/Ilfov 74, cazare 2491,
  agentii 893; unknown county → 400); lawyers barCounty independent of context.active
  (county-only reaches IFEP ddlCompany, asserted through real GET with captured
  loader key; invalid county 400 pre-upstream; national explicit preserved);
  verify-lawyers + verify-geographic-scope wired into CI.
- **M4 23185db — D03+D05+D11**: pure FDSN parser (header-mapped, header change stops
  import, comments never rows, invalid rows reported); stations 150 (header gone);
  corpus migrated to aflivra-eida-v2 via the package's verified apply_eida_candidate.py
  (1,157 events, field semantics restored, inconclusive 2026 slice preserved); coverage
  contract full/partial/outside/inconclusive with effective range + inconclusiveYears +
  magnitude-floor honesty; calendar-strict interval validation (impossible prefixes +
  reversed → 400); corpus gate pins exact counts + semantics; offline-parity gate —
  the repaired importer reproduces the committed corpus byte-stably from fixtures.
- **M5 8298bab — D07**: bbox-layout extraction (std-lib Python helper + column-geometry
  assembly in scripts/lib/lmi-rows.mjs); dating-column edge derived per page from the
  anchors (right-walk → median → geometric re-split); continuations (incl. 17 real
  cross-page wraps) by x coordinates; rotated Monitor strip recognized per page
  against the footer line; folio vs pdfPage separate; corpus aflivra-lmi-bucuresti-v2:
  same 2,651 codes, 12 golden corrections verbatim, empty datings 1,715 → 337 genuine,
  30-row visual pass across pdfPages 5–233; gate pins goldens + 337 + separation.
- **M6 8147599 — D08+D09+D10**: cinema strict calendar validation (impossible days
  400 with zero upstream calls); resource sheet index validated against the set
  before page reads (400 for table out-of-range and datastore≠0; cache intact);
  MCP venue examples canonical (odeon/operacluj/teatruldearta) + eventVenue folds the
  registry id; every quoted schema example walks the real resolver + route.
- **M7 1f6287b — U01 (user directive)**: official-registers workspace (#view=registre,
  menu + footer) — SITUR/AMCCRS/EIDA(+coverage)/LMI/INS/POSF+SEN on their real routes;
  scripts/verify-mcp-ui-parity.mjs in CI: 34/34 MCP routes have UI surfaces
  (32 direct, 1 shared-data, 1 verified pairing); e2e smoke (4 passed); docs parity
  chapter.
- **Ship 6498c1b**: registry in the build's canonical form (ends the newline
  byte-yo-yo); enrichment-joins pin moved with D10; hygiene censuses regenerated.

## Verification
- verify-integration-regressions.mjs: 14/14 groups (dates, workflow, offline-importers,
  sen, sen-route, situr-county, lawyers-county, eida-parser, eida-coverage,
  eida-offline-parity, lmi-golden, cinema-date, resource-sheet, venue-examples).
- Full CI battery locally: 41/41 gates green (after moving the enrichment-joins pin).
- tsc 0 errors, lint 0 errors, build complete, registry byte-stable across
  import+build. e2e: official-registries 4/4, events-venues + resource-flow 11/11.
- Live verification (post-deploy) pending: verify-mcp-live + extended probes
  (county-only lawyers, invalid date/sheet, EIDA coverage semantics).

## Notes
- PDF retestare (Seara) unreadable by the model — user informed; plan md + package
  were the requirements source; the plan cites the retest's findings.
- LSP diagnostics throughout the session were stale; tsc is the gate (session
  precedent).
- The offline parity for SITUR/LMI runs locally (MB sources in raw/, gitignored);
  EIDA parity runs in CI (committed FDSN fixtures).

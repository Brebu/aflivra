# Dead-data census — content-enrichment-ux (Wave A2)

**Generated**: 2026-10-09T09:14:26.081Z by `scripts/audit-dead-data.mjs` (REPORT-ONLY — no deletion)

**Policy**: the D3 per-family recency table (ADVOCATE-REVIEW.md, accepted) — pinned code-side by `scripts/verify-recency-policy.mjs`. „Dead" = no-content / expired-source / irreversible-stale, **never age alone**, and age only where the table sets a horizon for that family.

| Familie | Politică (rând D3) | Rânduri | Fără conținut | Dincolo de orizont | Orfane | Recomandare | Note |
|---|---|---|---|---|---|---|---|
| feeds/munca | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/stiri | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/sanatate | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/educatie | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/justitie | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/agricultura | last 3 years (D3: news feeds) | 8 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/energie-transport | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/energie-transport | last 3 years (D3: news feeds) | 10 | 0 | 0 | — | **CURAT — nicio acțiune** | stored copy is the honest last-good fallback; the source feed itself carries the recency |
| feeds/agricultura (detaliu) | last 3 years (D3: news feeds) | 8 | 0 | 0 | — | **CURAT — nicio acțiune** | AFIR rows are relayed copies; recency governed by the weekly relay |
| company/anaf (istoric bilanțuri) | last 3 fiscal years (D3: ANAF company history) | 3 | 0 | 0 | — | **CURAT — nicio acțiune** | firm EXISTENCE is exempt (full identity regardless of year); only balance history rolls |
| directory/health | latest edition within 3y (D3: CNAS editions) | 4117 | 0 | 0 | — | **CURAT — nicio acțiune** | stored edition period 31.03.2026; the loader re-picks the newest in-window edition at expiry |
| directory/pharmacies | latest edition within 3y (D3: CNAS editions) | 2284 | 0 | 0 | — | **CURAT — nicio acțiune** | stored edition period 31.03.2026; the loader re-picks the newest in-window edition at expiry |
| directory/hospitals | latest edition within 3y (D3: CNAS editions) | 731 | 0 | 0 | — | **CURAT — nicio acțiune** | stored edition period 31.03.2026; the loader re-picks the newest in-window edition at expiry |
| directory/schools | edition-governed (D3: directory seed) | 6000 | 0 | 0 | — | **CURAT — nicio acțiune** | paged datastore copy; records are re-verified per query, no age semantics on rows |
| catalog/ckan (inventar stocat) | modified >= 3y la servire (D3: CKAN browsing; coded at cache.ts:15) | 1662 | 0 | 1 | — | **CURAT — nicio acțiune** | 1 rând pe muchia rulantă a ferestrei de 3 ani — fereastra se aplică dinamic la servire, rândurile ies singure; interogările live nu filtrează după an (disclosure-ul „metadate mai vechi" este cel înregistrat); serve-seed kit: 0 chei catalog în server seeds |
| events/odeon (calendar stocat) | future-facing display (D3: events) | 19 | 0 | 0 | — | **CURAT — nicio acțiune** | 1 eveniment trecut rămâne în calendar — filtru de afișare, nu date moarte; calendarul rotunjește la următoarea preluare |
| feeds/filme (corpus) | exempt — all years by design (D3: films) | 1870 | 0 | 0 | — | **CURAT — nicio acțiune** | year span 1898–2026 is catalog breadth, not staleness |
| localities/siruta | exempt — standing registry (D3: geography) | 13755 | 0 | 0 | — | **CURAT — nicio acțiune** |  |
| justice/notari | exempt — standing (D3: professional registries) | 3096 | 0 | 0 | — | **CURAT — nicio acțiune** | loader already filters all-empty rows at parse |
| justice/experti-judiciari | exempt — standing (D3: professional registries) | 8024 | 0 | 0 | — | **CURAT — nicio acțiune** | loader already filters all-empty rows at parse |
| justice/experti-tehnici | exempt — standing (D3: professional registries) | 1494 | 0 | 0 | — | **CURAT — nicio acțiune** | loader already filters all-empty rows at parse |
| places (corpus) | exempt — geography & heritage (D3: places, 181,537 records) | 181537 | 0 | 0 | 0 | **CURAT — nicio acțiune** | integritate eșantionată: 24.000 înregistrări din 40/303 fragmente (maxim 40); dovada sha256 pe fiecare fragment o verifică verify-model-contracts |
| stories (corpus) | exempt — literary corpus (D3: stories) | 233 | 0 | 0 | 0 | **CURAT — nicio acțiune** | 233 texte integrale verificate; eșecuri de preluare înregistrate la import: ; fișiere 233/233 |
| transport/tpbi (corpus) | edition TTL governs (D3: transport network) | 201 | 0 | 0 | 0 | **CURAT — nicio acțiune** | 201 rute în manifest, 201 fișiere reale; numărătoarea pinned (181.537 locuri) se verifică în verify-sweep-inventory |
| transport/trains (corpus) | edition-governed (D3: transport schedules) | 2363 | 0 | 0 | 0 | **CURAT — nicio acțiune** | 2 ediții cu valabilitate trecută rămân în corpus — re-importul se face pe ediție; shards 128/128 |
| dev D1 cache (stare locală de dezvoltare) | expired-source rows per family (D3 machinery: last-good-copy, seu nocturn, lease 60s) | 134 | 0 | 0 | — | **CURAT — nicio acțiune** | rânduri de sarcină în eroare (fără copie): 8 — fiecare familie are propria poartă onestă și backoff; fragmente payload pensionate (curățare 48h): 0 din 77; copia dev nu certifică starea producției |

## Samples and error-state observations

### catalog/ckan (inventar stocat)
- samples: `[{"modified":"2023-10-05","title":"Achiziții Poliția Locală Iași"}]`
### events/odeon (calendar stocat)
- samples: `[{"start":"2026-10-05T19:00","title":"Viitorul președinte al României"}]`
### feeds/filme (corpus)
- samples: `[{"oldest":"1898","newest":"2026"}]`
### transport/trains (corpus)
- samples: `[{"operator":"cfm","validTo":"20251213"},{"operator":"regiotrans","validTo":"20171209"}]`
### dev D1 cache (stare locală de dezvoltare)
- rânduri/familie în eroare (dev D1, informational): `{"transport":"1/3","flights":"2/2","article":"2/2","lawyers":"2/4","housing":"1/2"}`

## Purge decision protocol

This census is the **input** to the review gate — nothing above executes a deletion. The classifications mean:

- **CURAT** — nothing to do; the family's own semantics already govern it.
- **DE REVIZUIT** — a real signal exists; the orchestrator reviews the cited rows against the D3 policy row before any purge (R2: over-eager purge destroying valid corpora is HIGH risk).
- **SANCTIONAT-TRIVIAL** — empty-content rows whose family's own loader/parser already defines them dead, eligible for the trivial purge path **after** the census→review→sanction flow confirms them.

Pinned corpus counts (places 181,537) are protected by `verify-sweep-inventory.mjs` — any change must cite the D3 policy row.

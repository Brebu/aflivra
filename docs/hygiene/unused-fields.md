# Unused-fields census — content-enrichment-ux (Wave A2, point 2 substrate)

**Generated**: 2026-10-08T12:34:13.330Z by `scripts/audit-unused-fields.mjs` (offline, mechanical)

**Purpose**: the ordered gap-list that feeds Wave B — every field below is fetched from a public source but shown only inside the raw disclosure (or not kept at all). Each is a **candidate** for a typed, attributed display in Wave B — never an automatic promotion; joins happen only on validated keys (D4).

**Evidence**: the 2026-10-08 probe captures (`ssnc-agent-orch/2026/10/08/content-enrichment-ux/`), the in-repo fixtures (`verify-source-errors.mjs` matrix literals, the 2026-10-07 wave2 captures), the committed seeds and corpora. Typed fields are extracted structurally from the owning workspace components (configured row variables per family).

## The ordered gap table

| Familie | Câmpuri prelate | Câmpuri tipizate | Necesită promovare (îngropate în raw) | Renunțate (nepăstrate) | Atribuire Wave B |
|---|---|---|---|---|---|
| events (calendare tribe) | 64 | 10 | `global_id`, `global_id_lineage`, `author`, `slug`, `extension`, `width`, `height`, `filesize`, `sizes`, `medium`, `large`, `thumbnail`, `medium_large`, `cmplz_banner_image` +38 mai mult | — | B-5 (venue id): author, organizer, cost and the other offered-but-buried event keys go to the venue card with attribution; loader-mapped calendar keys (title/start/content/…) are already typed |
| flights/adsb (aeronave) | 51 | 18 | `type`, `flight`, `r`, `t`, `alt_baro`, `alt_geom`, `gs`, `ias`, `tas`, `mach`, `wd`, `ws`, `oat`, `tat` +31 mai mult | — | Wave B/C candidate fields: alt_geom, ias, tas, mach, wd/ws (wind), oat/tat, track_rate, roll, mag_heading, category, nav_qnh, seen/seen_pos — disclosed in MetadataFields only today |
| catalog/ckan (seturi de date) | 33 | 44 | `rating`, `license_title`, `maintainer`, `relationships_as_object`, `private`, `maintainer_email`, `num_tags`, `metadata_created`, `metadata_modified`, `author`, `author_email`, `state`, `version`, `creator_user_id` +12 mai mult | — | Wave B candidate fields (disclosed via metadata raw): tags, groups, maintainer, relationships_as_object — typed surfacing on the dataset reader, attributed per source |
| places (etichete OSM) | 31 | 14 | `amenity ×6988`, `shop ×3755`, `operator ×2399`, `building ×2004`, `addr:postcode ×1948`, `public_transport ×1730`, `brand ×1690`, `brand:wikidata ×1572`, `bus ×1424`, `highway ×1238`, `tourism ×997`, `office ×859`, `shelter_type ×837`, `bench ×681` +11 mai mult | — | B-3 (Q-id/OSM id): cuisine, outdoor_seating, wheelchair (typed pe card), wikipedia/wikidata link fields — attributed joins only |
| transport/tranzy | 11 | 37 | `timestamp`, `vehicle_type`, `bike_accessible`, `wheelchair_accessible`, `route_id`, `trip_id` | — | Wave B later: vehicle_type, bike_accessible — typed display candidates on the Tranzy rows (wheelchair_accessible and speed are already typed) |
| transport/realtime (TPBI vehicule) | 18 | 37 | `currentStopSequence`, `currentStatus`, `startDate`, `scheduleRelationship`, `licensePlate` | — | Wave A1/B per-line layer candidates: currentStopSequence, currentStatus, trip.startDate, trip.scheduleRelationship, vehicle.licensePlate — promotion is a display decision, never a data change |
| flights/bia (panou aeroport) | 11 | 18 | `actualTime`, `detalii brute FDS în panel MetadataFields` | — | actualTime (atd/ata) — typed display candidate on arrivals panel |
| company/anaf (identitate + bilanțuri) | 6 | 33 | — | `den_caen — numele codului CAEN din bilanț este preluat și încărcat, dar nici tipizat nici inclus în registryDetails` | B-1 (CUI): den_caen typed display lângă codul CAEN; TVA date-intervals promoted from RegistryFields flatten |
| localities/siruta | 6 | 7 | — | — | SIRUTA join (B): geographic scoping already consumes columns; the rest stays registry disclosure |

## Verified no-buried-fields (generic full-field render)

Every published column of these registries is already displayed — their workspaces loop over the source's own field list:

- **directory/schools + directory/health|pharmacies|hospitals** — app/record-workspace.tsx RecordBrowser — d.fields.map(field ⇒ <dt>{field}</dt>) over the full published column list
- **justice/notari + experti-judiciari + experti-tehnici + traducatori** — app/notaries-workspace.tsx + app/experts-workspace.tsx — d.fields generic loop over every published column
- **housing/anl + housing/ancpi** — app/imobiliare-workspace.tsx — d.fields loop covering every published column

## Parsed-only families (dropped-at-parse candidates)

- **feeds (anunțuri oficiale)** — parseFeed keeps title/link/publishedAt/summary/content + media — the raw item XML (category, guid, dc:creator) is not kept; dropped-fields candidates for Wave B (author/category attribution) Dropped: `category`, `guid`, `dc:creator (nehotărât — dacă sursa le publică)`.
- **weather/open-meteo** — every requested variable renders — current metric grid + forecast tables enumerate d.currentUnits/dailyUnits/hourlyUnits keys generically
- **lawyers/ifep** — parseLawyers promotes every parsed field (name/title/details/rights/updatedAt/paragraphs) — raw page fields outside the fișe are not per-row data
- **transport/tpbi (GTFS static)** — the full export is downloadable CSV per table + MetadataFields on trip/calendar rows — typed surface is the curated network view
- **stories/cinema/bnr/weather-ANM/courts/law (legislație + dosare)** — typed surfaces render every parsed field; the raw source envelope (SOAP XML, RSS) is not retained per-row by design

## How Wave B consumes this

Per the PLAN Wave-B table (D4 validated keys only): join fields by **CUI** (company card), **dosar number**, **place/Q-id** (places), **act id** (legal), **venue id** (events). Buried fields become typed displays *grouped by source* with `provenance[field]={source,url,verifiedAt,referenceDate}` (the `combineCompany` model); anything without a validated key becomes a **federated link** (B-6), never a merge. The raw disclosure panels are never replaced.

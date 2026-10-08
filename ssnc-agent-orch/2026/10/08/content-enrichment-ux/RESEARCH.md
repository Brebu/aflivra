# RESEARCH — A2-1 probe pass (content-enrichment-ux, Wave A2)

**Date**: 2026-10-08 (probe window 02:47–02:58 UTC · all timestamps UTC)
**Operator**: Builder-B (Wave A2 corpus hygiene)
**Method**: one polite probe per active family — the loaders' own request URLs and
headers (`User-Agent: Aflivra/1.0 public-data-source-check`, Accept per loader), so the
captured shape is the exact shape the app parses. Fixtures: `fixtures/` (this dir),
ledger machine-readable: `probe-results.json`, driver: `probe-sources.mjs`.
**Politeness ledger summary**: 24 probes over 11 minutes; ≥5 s between probes, ≥20 s
between the two TPBI hits (2 TPBI requests inside one minute — the hard ceiling is
≤4 TPBI/min; nowhere near it); one data.gov.ro request every ≥5 s (8 total: catalog,
schools datastore, lista-furnizori shared by 3 CNAS families, SIRUTA, 4 justice
registries); one SOAP POST each to portalquery.just.ro and legislatie.just.ro; the
deployed-worker law check is our own infrastructure (outside the source budget, the
`--live` discipline). 2 families skipped with justification (below). No DuckDuckGo
anywhere (D6 — research-only, and not needed for this pass).

## Per-family ledger and outcome

| Family | Vantage & method | Outcome | Shape notes (fields offered) |
|---|---|---|---|
| weather/open-meteo | GET loader URL (all current/hourly/daily vars, unixtime) | **200 OK** | envelope `latitude,longitude,generationtime_ms,utc_offset_seconds,timezone,timezone_abbreviation,elevation,current_units,current,hourly_units,hourly,daily_units,daily`; `current.time/interval + 14 vars`; sunrise/sunset are **unix seconds** |
| company/anaf | GET `webservicesp.anaf.ro/bilant?an=2025&cui=427282` | **200 OK** | bilanț row `an,cui,deni,caen,den_caen,i[]`; indicator rows `indicator,val_indicator,val_den_indicator` — `den_caen` is not currently promoted typed |
| courts/portal.just | POST `CautareDosare2` SOAP, number `1/2/2026` | **200 OK** | official SOAP envelope, single Dosar shape as matrix-pinned |
| feeds/stiri | GET `mai.gov.ro/feed/` | **200 OK** | RSS 2.0, `title/link/pubDate/description/content:encoded` (loader's own extraction set) |
| catalog/ckan | GET `package_search` (loader params, rows=4) | **200 OK** | CKAN full row ~40 keys (`rating,license_title,maintainer,relationships_as_object,private,maintainer_email,num_tags,id,metadata_created,metadata_modified,author,author_email,state,version,archiver,creator_user_id,type,resources,num_resources,tags,groups,…`) — kept whole as `metadata` (disclosed), small typed subset |
| transport/tpbi | GET `BUCHAREST-REGION.zip` with `Range: bytes=0-2047` | **206 Partial** (range honored) | `PK` zip magic, `last-modified: Wed, 07 Oct 2026 11:34:06 GMT`, `cache-control: max-age=14400`, 652 first-chunk bytes |
| transport/realtime | GET `api/gtfs-rt/vehiclePositions` (protobuf decoded with the repo's own `gtfs-realtime-bindings`) | **200 OK**, 64,139 B, **596 entities live** | header `gtfsRealtimeVersion,incrementality,timestamp`; vehicle `trip{tripId,startDate,scheduleRelationship,routeId},position{latitude,longitude,bearing},currentStopSequence,currentStatus,timestamp,stopId,vehicle{…}`; sample: `routeId PV9_462, tripId PV9_PV9_462_1_33887, licensePlate IF 25 POB, stopId PV9_682, currentStatus IN_TRANSIT_TO, timestamp numeric-string`; **`position` exposes no `speed`/`occupancy` keys in this snapshot** (loader tolerates absence) |
| directory/schools | GET `datastore_search` resource `280d52b6…`, limit 2 | **200 OK** | fields list: `_id,An,Judet PJ,Localitate PJ,Cod SIRUTA PJ,Mediu loc. PJ,Cod SIIIR PJ,Denumire PJ,Localitate unitate…` — richer than historical snapshot |
| directory/health + pharmacies + hospitals | GET `package_show?id=lista-furnizori` — **shared endpoint, one probe** covers all three (each resolves its own resource CLINIC/FARM/SPITAL from the same response) | **200 OK** | resources[] with name/url/format/last_modified; current edition `31.03.2026` as served |
| localities/siruta | GET `package_show?id=siruta_s1-2026` | **200 OK** | resources[] CSV as registered |
| lawyers/ifep | GET LawyersPanel.aspx | **200 OK** | ASP.NET XHTML search page (hidden form fields, pager spans) as matrix-pinned |
| legal/law | POST `GetToken` SOAP — **3 checks** (2 http + 1 https, see below) | **source-down at probe time**: HTTP 500 with empty body (http, ×2), TLS/protocol refusal (https) | empty body ⇒ loader's `validateSoap` degrades honestly; deployed worker checked 02:58:33Z serves `status:"stale"` last-good copy (CODUL CIVIL rows) — production degrade confirmed working end-to-end |
| feeds/agricultura | GET `afir.ro/` | **200 OK** (residential egress, as the relay reads it) | homepage HTML with the `card-body news-content` blocks the loader parses |
| feeds/filme | GET Wikidata SPARQL (filmQuery, LIMIT 50) | **200 OK** | bindings as matrix-pinned |
| events/odeon | GET `teatrul-odeon.ro/` (venue root — the jsonld calendar page) | **200 OK** | HTML with `application/ld+json` scripts + schema.org `itemtype` markup; probe shape heuristic misread `<itemprop` as `<item` (noted; fixture is the HTML) |
| cinema/cinemacity | GET quickbook film-events 1824/@today | **200 OK** | `body{films[],events[]}` as matrix-pinned |
| stories/wikisource | GET MediaWiki `action=parse` pageid 29611 | **200 OK** | `parse{pageid,title,text,links,revid,images,categories}` |
| justice/notari | GET `package_show?id=bc69c898…` | **200 OK** | resources[] XLSX as registered |
| justice/experti-judiciari | GET `package_show?id=476a8363…` | **200 OK** | same |
| justice/experti-tehnici | GET `package_show?id=3f26ecb7…` | **200 OK** | same |
| justice/traducatori | GET `package_show?id=b1c5ffa9…` | **200 OK** | same |
| flights/adsb | GET `api.adsb.lol/v2/lat/44.5/lon/26.1/dist/250` (1 of the loader's 4 coverage points — probe cost 1) | **200 OK** | envelope `ac[],msg,now(ms),total,ctime,ptime`; ac row ~40 keys: `hex,type,flight,r,t,alt_baro,alt_geom,gs,ias,tas,mach,wd,ws,oat,tat,track,track_rate,roll,mag_heading,true_heading,baro_rate,geom_rate,squawk,emergency,category,nav_qnh,nav_altitude_mcp,…` |
| flights/bia | GET `bucharestairports.ro/wp-json/fds/v1/flights?airport=henri-coanda&language=ro` | **403 browser challenge** (class confirmed today) | `Just a moment...` challenge page, exactly the registered class — the relay tour is the only live path (no budget spent fighting it) |
| events/search + events/operanationalacluj | GET `operacluj.ro/wp-json/tribe/events/v1/events?per_page=100&status=publish` — **shared host+endpoint, one probe** covers both | **200 OK** | tribe envelope `events[],rest_url,next_rest_url,total,total_pages` as fixture-pinned |
| transport/trains | **skipped — corpus-only** | — | the loader serves the committed Infofer corpus (`public/trains/**`) and never re-fetches; a live probe would target the one-time import source, not the served family — ledger spends no external request |
| transport/tranzy | **skipped — env-gated** | — | `TRANZY_API_KEY` not configured here and the loader's own gate forbids interrogating any Tranzy address without it; shape stays pinned by the fixture matrix + 2026/10/06 reference probe |

## Findings that matter downstream

1. **legal/law source-down at probe time (honest class).** `legislatie.just.ro`
   GetToken answered HTTP 500 with an empty body twice (02:53Z, 02:57Z) and refused the
   https variant at protocol level (02:58Z, `Empty reply`/PROTOCOL_ERROR). The deployed
   worker (checked 02:58:33Z, our infra) serves the last good copy with
   `status:"stale"` — the reader-side honest-degrade is working in production. This is
   the `source-down` verdict class, not `our-bug`. No code change warranted; the
   diagnosed class is recorded here per estate probe discipline.
2. **TPBI rate posture at the D2 cadence.** Both TPBI responses today carry no
   rate-limit headers of any kind (no `retry-after`, no `x-ratelimit-*`, no
   `ratelimit-*`), and 429 has never been observed on TPBI by any probe in this
   estate's history. At 2 requests/minute from this probe (and ≤4/min planned at the
   15 s TTL with the single-writer lease) TPBI shows no throttling posture. The
   evidence supports the D2 15 s TTL decision; Builder-A's rollback constant stays
   one line.
3. **Live RT snapshot nuances.** 596 vehicles live; `position` in this snapshot
   exposes only `latitude, longitude, bearing` — `speed` and `occupancyPercentage`
   keys absent in this instant (the loader's tolerance for absence is already coded;
   dead-reckoning interpolation (D2 deferred option) would be speed-less in such
   frames — honest note, not a blocker).
4. **Fields offered richer than display on several families** — schools datastore
   field list (Cod SIRUTA PJ, Cod SIIIR PJ, Mediu loc. PJ, An…), ANAF `den_caen`,
   CKAN full metadata rows, adsb.lol ~40-key aircraft rows. The mechanical
   fetched-vs-displayed gap table is produced by `scripts/audit-unused-fields.mjs`
   (`docs/hygiene/unused-fields.md`) — Wave B's input.

## Politeness ledger (machine-readable)

`probe-results.json` in this directory carries the full ledger: per probe —
`attemptedAt`, method, URL, equivalent curl command, HTTP status, response headers
(rate-limit, retry-after, last-modified, cache-control), and shape extraction. Manual
follow-ups (the 2 legal/law retries + https variant + the deployed-worker check) are
recorded above with their exact curl commands and timestamps.

**No fixtures land in `archives/`** — that directory holds the published source
packages; probe fixtures follow the session-dir pattern (`fixtures/` here), matching
`2026/10/07/wave2-live-romania/fixtures/`.

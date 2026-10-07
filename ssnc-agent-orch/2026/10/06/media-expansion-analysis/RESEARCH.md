# Media Expansion Analysis — Web Research Findings

Session: 2026-10-06 · role: WEB RESEARCH (append-only dispatch) · researcher reach: ~29 source interactions over 22 distinct sources, each touched ≤3 times (politeness; includes failed attempts). Local context read first (sweep-federated-search STATUS.md — 38 families already integrated; `gtfs.tpbi.ro` = current Bucharest GTFS+GTFS-RT). The local CKAN catalog snapshot (`public/catalog/index.json.gz`, 5,251 datasets) was mined offline before any network call — many candidates below are **switch-ons of the already-integrated CKAN family**, zero new infrastructure.

## Research Findings

### (a) Photographs for places / museums / tourist attractions

| Source | Endpoint | What it gives | Access model | Terms / license | Latency / refresh | Integration class | Proof of reach |
|---|---|---|---|---|---|---|---|
| **Wikimedia Commons MediaWiki API** | `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=<place>&gsrnamespace=6&prop=imageinfo&iiprop=url\|extmetadata&format=json` | Per-place photo search: file URLs, per-file license (`LicenseShortName` CC BY-SA 4.0 / GFDL etc.), author, categories (incl. `Cultural heritage monuments in Romania with known IDs` — pairs with LMI monument IDs) | No-auth JSON API, CORS-friendly, generous limits | CC BY-SA / CC BY / PD per file; attribution string machine-readable via `extmetadata` | Live query; ~1–2s | **New API family** (plain `fetch`, no relay; cache per place) | HTTP 200 live: "File:Jewish Museum Bucharest 01.jpg" returned with `License: cc-by-sa-4.0`, artist, categories |
| **Openverse API** | `https://api.openverse.org/v1/images/?q=<place>&page_size=N` | CC-licensed image search (aggregates Flickr etc.): direct image URL, license+version, ready-made attribution string ("\"Triumphal Arch, Bucharest\" by Cost3l, CC BY 2.0") | No-auth REST (anonymous tier: modest rate limits, per response headers) | CC only (by / by-sa / by-nc etc. per item — filter NC server-side if desired) | Live; fast | **New API family** (complement to Commons when Commons has thin coverage) | HTTP 200 live: 240 results for "Bucharest", each with license + attribution |
| **Wiki-Loves-Monuments-RO 2011/2012 (INP via data.gov.ro CKAN)** | CKAN dataset `a33e9b39-…` / `4875980d-…` (XML in `/storage/f/2013-11-12T…`) | 1,488 LMI monuments with **8,518 photos**, incl. monument↔image mapping (2011 ed.); 2012 ed. same shape | Existing CKAN family — resource download | `uk-ogl` (OGL-ROU); photos CC BY-SA (WLM entries) | Static snapshot (2011/2012) | **CKAN switch-on** + XML→places-media join on LMI/monument ids | Verified in repo catalog snapshot (index + detail file read live earlier today by the app's CKAN family) |
| **AIGA Ortoimagini 1:5000 (MApN via CKAN)** | CKAN `57bdbd9b-…`; view service `https://inspire.geomil.ro/network/rest/services/INSPIRE/OI_View/MapServer` (+ ATOM download) | National orthophoto coverage (2017–2020), TIFF/shapefile by region + INSPIRE WMS/WMTS for **aerial photo of any place** | CKAN resources no-auth; INSPIRE ArcGIS REST view service | **CC-BY-4.0** | WMS live; refresh 3–5 yr | CKAN switch-on + **WMS tile pull at snapshot time** (see risk note) | Dataset+service URL verified in CKAN catalog; `inspire.geomil.ro` timed out from our vantage (3 attempts, 20–45s) — slow/possibly geo-limited server, retry at integration or ghRelayed one-shot pull |
| **KartaView** (ex-OpenStreetCam) | `https://kartaview.org/doc` · API `https://api.kartaview.org` (public list/nearby endpoints) | Crowdsourced street-level photo **sequences** (dashcam) of RO roads/streets; nearby-by-coordinates search, sequence metadata (direction, time, contributor) | Public endpoints for community use (registration only for upload/higher limits) | Raw JPEGs **CC BY-SA 4.0**; data OSM-aligned | Live | **New API family** (polite fetching, sequence→frame selection) | HTTP 200 on `/doc` (SPA shell; API docs confirmed via indexed doc text: "public and authenticated endpoints… many publicly accessible") |
| **Muzeele din România (INP via CKAN)** | CKAN `3692265b-…`, latest resource `INP-Muzee-edm-2025-10-18.xml` | Museum descriptive sheets (EDM/Europeana Data Model — name, address, contacts, categories) for the whole country, **updated 2025-10-18** | Existing CKAN family | `uk-ogl` | Refreshed periodically by INP | **CKAN switch-on** → museum directory ↔ Commons photos per museum | Verified in repo catalog detail file (resource list incl. the 2025-10-18 EDM) |
| **Mapillary API v4** — ❌ VERDICT: token-only | `https://graph.mapillary.com` | Street-level imagery with coverage of RO | **Requires client/user access token on every request** (official docs: "All requests against graph.mapillary.com and tiles.mapillary.com must be authorized") | CC BY-SA 4.0 imagery | — | **DISQUALIFIED for no-auth** (could revisit if product accepts one registered free token) | Official API doc page quote captured from published documentation (search-indexed snippet of mapillary.com/developer/api-documentation) |
| **Europeana Search API** — ⚠ free-key, not anonymous | `https://api.europeana.eu/record/v2/search.json?query=…` | Millions of digitized cultural objects incl. RO museum collections (metadata + media previews, rights per record) | **Free API key required** (registration); no anonymous tier | Data rights per provider (edm:rights) | Live | Free-key tier — same decision bucket as Tranzy (needs env-stored key) | HTTP 401 without key (`"Invalid API key provided!"`) — verified live |

### (b) Short video clips

| Source | Endpoint | What it gives | Access model | Terms / license | Integration class | Proof |
|---|---|---|---|---|---|---|
| **Wikimedia Commons video** | `…api.php?action=query&list=search&srsearch=filemime:video/webm <place>&srnamespace=6` | Webm/ogv clips of RO places (parks, streets, events) + same extmetadata licensing as photos | No-auth | CC/PD per file | **Same new Commons family** (one code path, extra query) | Live: 62 webm hits for "bucharest" (e.g. *Bucharest - evening on Lacul Lebedelor.webm*) |
| **Internet Archive** | `https://archive.org/advancedsearch.php?q=subject:Romania+AND+mediatype:movies&fl[]=identifier&fl[]=title&rows=N&output=json` + `https://archive.org/metadata/<id>` | 18,257 RO-related videos incl. TV news recordings, travel/documentary items | No-auth APIs (search + metadata + downloads) | Varies per item (PDM/CC/collections) — must read per-item license | **New API family** (curated queries + license filter) | Live: numFound 18,257; docs returned (TVRI 2026 recordings) |

*(Openverse has no video tier yet — images+audio only. Stock-video APIs (Pexels/Pixabay) all require free keys → same tier as Europeana.)*

### (c) Spectacole / concerte / muzică (events)

| Source | What it gives | Access model | Terms | Integration class | Proof |
|---|---|---|---|---|---|
| **Calendarul evenimentelor culturale (CJ Cluj via CKAN)** `39a68ed3-…` (2025) + `c2b269f8-…` (2024) | County cultural calendar (concerts/festivals, XLSX, ~annual) | **Existing CKAN family switch-on** | **CC-BY-4.0** | Switch-on + RecordBrowser-style table | Verified in repo catalog (both datasets + XLSX resources) |
| Private aggregators (evenimenteculturale.ro, onevent.ro, festigo.ro, zilesinopti.ro, beethere.ro, vivago.ro) | National event listings | HTML, no API; restrictive commercial TOS | ❌ scraping would violate TOS | **Not eligible** (verdict: no national free events API exists today) | Search results surveyed; no free API surfaced on any |
| Existing surfaces (verification): Odeon events + CineMagia films + Agerpres feeds already integrated (STATUS.md T2.1 families `events/odeon`, `feeds/filme`) — events gap is for *live concerts*, best free layer = county calendars above + Agerpres cultural agenda articles via existing feed family | | | | | |

### (d) Live public-transport GPS (vehicle position + heading)

| Source | Endpoint | What it gives | Access model | Terms | Integration class | Proof |
|---|---|---|---|---|---|---|
| **gtfs.tpbi.ro** (existing) | `/regional/` GTFS + GTFS-RT (vehicle positions, trip updates, alerts) | Bucharest–Ilfov live fleet (already in app) | No-auth | mo-bi.ro/node/17 terms — already honored ("Nu se revând datele TPBI") | Already integrated — **verified as the current source** (verify-source-errors family table) | scripts/verify-sweep-inventory.mjs coverage gate passes (38 families) |
| **Tranzy Opendata API** — ⚠ free-key verdict | `https://api.tranzy.ai/v1/opendata` (`/agency`, `/vehicles`, `/routes`, `/trips`, headers `X-API-KEY`, `X-Agency-Id`) | GTFS-shaped **live vehicle positions** (lat/lon + bearing per GTFS-RT vehicle-positions) for **30+ RO cities** incl. Cluj-Napoca (CTPCJ official partnership, ctpcj.ro open-data page), Brașov, Constanța, Iași, Timișoara, Sibiu, Oradea… | **Free API key via registration** — spec documents 403 "Invalid API Key" without it | Open-data philosophy stated on tranzy.ai/opendata ("freely used, re-used and redistributed… at most attribution and sharealike") | **Free-key tier** — one registration unlocks many cities; NOT anonymous → product decision (mirrors the user's note that private cos offer free access, but Tranzy's is key-gated) | OpenAPI spec fetched live (15646 bytes): endpoints, schemas, 403/429 semantics confirmed |
| Infofer-style realtime for trains → see (e) | | | | | |

### (e) Mersul trenurilor (CFR timetables)

| Source | Endpoint | What it gives | Access model | Terms | Integration class | Proof |
|---|---|---|---|---|---|---|
| **CFR + 8 private operators' timetables via data.gov.ro CKAN** ("Mers tren" × 9 datasets) | CKAN `c4f71dbb-…` (SNTFC "CFR Calatori", publisher **S.C. Informatică Feroviară S.A.** = the infofer company) + Astra Trans Carpatic, Regio Calatori, Transferoviar, Softrans, Interregional, Regiotrans, FEROTRAFIC, Calea Ferată din Moldova | **Official annual timetables as XML** (latest: "Mers tren - SNTFC 2025-2026") — stations, routes, departure/arrival times for the whole passenger network | **Existing CKAN family switch-on** (XLSX/XML resource downloads) | `uk-ogl` (OGL-ROU) | **CKAN switch-on + one XML parser** → timetable family (planned-times model mirrors the existing GTFS snapshot approach) | All 9 datasets verified in repo catalog; CFR dataset details read (13 resources, 2025-2026 XML latest) |
| `mersultrenurilor.infofer.ro` (IRIS) community API — ⚠ risky | Documented reverse-engineered API (github traisansf/cfr-alert `docs/infofer-api.md`; FlashWebIT/cfr-iris-scraper) | **Live** train positions/delays (JSON POST endpoints) | Token+cookie harvested from GET page; **ReCaptcha can engage under load** | Unofficial; scraping-gray | **Defer** — fragile; official CKAN XML covers planned times; no clean live layer exists | Community docs found + surveyed via search (indexed doc content) |
| `cfr.ro/cauta-tren` + cfrcalatori.ro | HTML search — official but no API; scraping-gray; covered better by CKAN XML | | | | searched, not fetched (no API; CKAN supersedes) |

### (f) Flights (arrivals/departures + ADS-B for RO airspace)

| Source | Endpoint | What it gives | Access model | Terms | Integration class | Proof |
|---|---|---|---|---|---|---|
| **adsb.lol API v2** | `https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}` (+ `/v2/callsign/{cs}`, `/v2/mil`, `/v2/squawk/{code}`) | **Live aircraft over RO** with the exact GPS+trajectory fields wanted: `lat`, `lon`, `track`, `true_heading`, `mag_heading`, `track_rate`, `alt_baro`, `gs`, vertical rates, registration, flight — everything for an arrivals-style board **plus** trajectories | **No-auth**, plain JSON | Free/community; attribution of feeders appreciated; data as-is (confirm wording at integration) | **New realtime family** (point query per airport/city; JSON — no protobuf needed) | Live fetch: RYR2288/THY479 over Bucharest area with lat/lon/track/heading, HTTP 200 |
| **OpenSky Network** | `https://opensky-network.org/api/states/all?lamin=…&lomin=…&lamax=…&lomax=…` | State vectors (lat/lon/alt/velocity/**heading**/vertical-rate arrays) boxed over RO | No-auth anonymous (documented quota ~400 credits/day, 10s spacing) | CC BY 4.0 (attribution: OpenSky Network, opensky-network.org) | Backup/second ADS-B family or fallback when adsb.lol rate-capped | Live fetch: ELY572/THY4QN states over RO bbox, HTTP 200 |
| **Bucharest Airports (CNAB) official FDS API** — ⚠ Cloudflare-gated | `https://bucharestairports.ro/wp-json/fds/v1/flights?airport=henri-coanda&language=ro` (+ `/all-airlines`, `/all-airline-logos`; airport=baneasa-aurel-vlaicu for BBU) | Official board JSON: flightNumber, airline (RO/EN + logo URL), origin/destination, scheduled/estimated/actual times, status (arrived/delayed…), gate, check-in counter, baggage belt, aircraft type | Works in-browser; **403 Cloudflare "Just a moment" for programmatic fresh sessions** (curl + datacenter fetcher both blocked; real-browser challenge clears) | Airport's own public site data; no published API terms | **ghRelayed** (AFIR precedent: scheduled runner fetches → seed route). Effort small once relay pattern reused | In-browser session captured the endpoint HTTP 200 with 272KB of flight rows (arrival OS699 full object); fresh curl → 403 challenge page |
| **airplanes.live** — ❌ recently gated | `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}` | ADS-B same family | Free tier now **blocked pending contact** ("Please contact us at contact@airplanes.live" error JSON) | — | **Disqualified** (adsb.lol + OpenSky cover it) | Live fetch returned the contact-us error |

### (g) Real estate + rentals (chirii) — honest verdict

**❌ No free, no-auth national source exists for listings.** Surveyed: imobiliare.ro (largest portal — restrictive TOS on automated extraction; the existence of a commercial scraper market on Apify confirms there is no public API), OLX/publi24 (same class), "târguri"/government listing venues (none national). ANAF publishes only dignitary asset declarations — not a market layer, and personal-data-heavy → excluded on principle. What IS free and clean (already in the CKAN snapshot):

| Source | What it gives | License | Integration | Proof |
|---|---|---|---|---|
| **ANCPI ipotecas-stats (CKAN)** — "Dinamica ipotecilor imobilelor" ×6 datasets | Monthly mortgage dynamics intra/extra-milan (counts/values) — honest *market temperature*, not listings | uk-ogl | CKAN switch-on (table/RecordBrowser) | Verified in repo catalog (ANCPI org, 57 'imobil'-titled datasets; mortgage series latest 2024) |
| ANCPI "extras carte funciară" / plot extracts | Cadastral/ownership extracts | **Paid + account** (ANCPI eTerra, ~5-10 min delivery) | ❌ disqualified as free source | Confirmed via ANCPI official site + resellers (digigov etc.) |
| ANL locuințe programs (CKAN) | Public housing placement sites (youth/social) — addresses, not market | ck listing | CKAN switch-on | Verified in repo catalog (ANL org, locuințe datasets) |
| **ANCPI cadastral plot VIEW (terenuri)** — ⚠ partial | Parcels viewable on geoportal (`ancpi.maps.arcgis.com` ArcGIS Online org; INSPIRE WMS layers `CP.CadastralParcel`, `CP.CadastralZoning`, `BU.Building`, `AU.AdministrativeUnit` — layer names confirmed via GIS trade docs; private portals render them browser-side) | View-only; extracts paid | **Not a clean API** — geoportal is a JS app, service endpoints undocumented for anonymous programmatic use; **plot geometry ≠ ownership** (ownership always paid) | ancpi.maps.arcgis.com surfaced via search; `geoportal.ancpi.ro` resolves (Cloudflare) but REST path returned empty; hub.arcgis.com shell is JS-rendered |

### (h) Spații de odihnă / adăpost (public shelters, rest areas)

| Source | Endpoint | What it gives | Access model | Terms | Integration class | Proof |
|---|---|---|---|---|---|---|
| **OpenStreetMap Overpass API** | `https://overpass-api.de/api/interpreter?data=[out:json];(node["amenity"="shelter"](bbox);node["highway"="rest_area"](bbox);node["tourism"~"alpine_hut\|wilderness_hut\|refuge"](bbox););out tags;` | Public shelters (bus/refuge), highway rest areas (spații de odihnă auto), mountain huts/refuges — name, type, coords, shelter tags; `refuge`/`alpine_hut` cover montan adăpost | No-auth (mirror kumi.systems as fallback; needs normal UA+Accept — fetcher default headers got 406; curl with UA worked instantly) | **ODbL** (attribution © OpenStreetMap contributors; existing places corpus already OSM-sourced — same license chain) | **Snapshot pull family** (import-transit precedent: pull → chunk → manifest; note: current 73-subcategory places corpus has NO shelter subcategory — genuine new corpus, not a switch-on) | Live query returned node 4324282099 `amenity=shelter` near Bucharest center, ODbL header in response |
| IGSU/community civil-protection shelter lists | No national open dataset found (county-level PDFs at best) | — | — | — | Not eligible this pass (search only) |

### (i) Justice additions

| Source | What it gives | Access model | License | Integration | Proof |
|---|---|---|---|---|---|
| **Notari publici (MJ via CKAN)** `dd622add-…` + **"Notari Publici 2025"** `bc69c898-…` | Alphabetical notary list (name, chamber, office) | Existing CKAN family | OGL-ROU / CC-BY-4.0 (2025 set) | **CKAN switch-on** → RecordBrowser directory family — fills feasibility flag #1 (professional notary registry; today only OSM „Notari" subcategory exists) | Live `package_show` HTTP success: title/license/org confirmed; latest monthly XLSX resource *Notari 04.11.2024* (⚠ monthly cadence appears stale on the old dataset; the 2025 dataset carries *Notari 23.01.2025*) → pair with CNPB for freshness |
| **CNPB notary search** `srv.cnpb.ro/notari/<Județ>.html` | Per-chamber notary lists, **"Actualizat la 05.10.2026"** (daily-fresh) | Public HTML per county | Public info (chamber publication) | HTML scrape family (like IFEP precedent) — small; or defer to CKAN-only | Search-indexed page title carries the live update stamp 05.10.2026; DNS resolves 212.146.101.254 |
| **Grila notarilor = Ordinul MJ nr. 177/C/2024** | Minimal notary fee grid (national law) | Public PDF (uniuneanotarilor.ro) + **legislatie.just.ro detail 278490** (already-integrated legal source!) | Public law | **Existing legal family switch-on** — the portal.just/legislatie fetch layer already handles MoJ orders; zero new infra | PDF + portal document found (uniuneanotarilor.ro/files/legi/Norma_onorarii_2024.pdf; legislatie.just.ro/Public/DetaliiDocument/278490) |
| **Experti judiciari (MJ via CKAN)** `74163e43-…` + 2025 `476a8363-…` | Judicial experts & specialists list (monthly XLSX; 2025 set *Experti judiciari 23.01.2025* CC-BY-4.0) | CKAN | CC-BY-4.0 | CKAN switch-on | Verified in repo catalog (17 resources; 2025 detail read) |
| **Expert[i] tehnici atestați (MDRAP via CKAN)** `d4ec31d5-…` + 2026 set | Technical experts list — **latest resource updated 2026-04-03** (act 7 nov 2025) | CKAN | CC-BY-4.0 | CKAN switch-on (fresh!) | Verified in repo catalog detail (last_modified 2026-04-03) |
| **Traducători și interpreți (MJ via CKAN)** `b1c5ffa9-…` | Translators/interpreters 2025 | CKAN | CC-BY-4.0 | CKAN switch-on | Verified in repo catalog detail |

### (j) Anything else free & verifiable

| Source | Note | Proof |
|---|---|---|
| mo-bi.ro/node/17 | TPBI GTFS terms page (already honored) | repo manifest cites it |
| `data.gov.ro` CKAN API freshness | Live `package_show` works from our vantage (no relay needed) — the CKAN family can switch on all of the above directly | Live HTTP success today |
| Openverse audio tier | Free anonymous (relevant if music/prelisten ever wanted) — not tested this pass beyond images | — |
| Agerpres/INP as Europeana providers | INP is a Europeana partner (the EDM museum export proves the mapping) — if Europeana key ever accepted, RO museum media comes with it | EDM resource in CKAN |

## TOP-10 ranked (impact × effort × license-cleanliness)

| # | Source | Impact | Effort | License | Rank rationale |
|---|---|---|---|---|---|
| 1 | **Wikimedia Commons API (photos + webm video, per place/museum)** | High (photos for any of the 178,868 places + museums; video bonus) | Low (one JSON API, extmetadata gives license+author) | CC BY-SA/PD per file — attribution coded once | Massive media win, trivial anonymous access, verified live |
| 2 | **adsb.lol (live flights GPS+heading over RO)** | High (exact lat/lon/track/heading the user asked for; immediate "planes over the city" surface) | Low (plain JSON point queries per city) | Public no-auth; feeder attribution note | Best effort:impact ratio in the whole list; verified live |
| 3 | **CFR "Mers tren" CKAN XML (9 operators)** | High (national rail timetable surface, all operators) | Medium (XML parse + annual-version snapshot) | OGL-ROU (clean) | Official timetables already sitting in the integrated catalog; verified in snapshot |
| 4 | **Justice registries CKAN switch-on (notari + experți ×2 + traducători)** | High (closes flagged notary-registry gap; 4 professional directories) | Low (existing directory/RecordBrowser patterns; XLSX already parsed elsewhere) | CC-BY-4.0/OGL | Almost pure switch-on; latest MDRAP set updated 2026-04 |
| 5 | **OSM Overpass snapshot (shelters/rest-areas/refuges)** | Medium-High (new "odihnă/adăpost" corpus; reusable machinery for any future POI family) | Medium (snapshot pull pipeline precedent exists) | ODbL — same chain as the places corpus | The only free source for (h); verified live; note fetcher-UA 406 quirk |
| 6 | **AIGA Ortoimagini 1:5000 (CKAN + INSPIRE WMS)** | Medium-High (aerial photo per place; ortho backdrop for places/map) | Medium (WMS/tile pull at snapshot; slow host) | CC-BY-4.0 | National coverage in one license; host latency is the main risk |
| 7 | **Tranzy Opendata (Cluj + 30-city live transit GPS)** | High (extends (d) nationwide beyond TPBI) | Low (JSON, GTFS-shaped) — **but requires free key** | Open-data pledge; key-gated | The user's exact Tranzy suggestion: works, but verdict = key needed (env-stored token decision) |
| 8 | **Openverse API (CC image search)** | Medium (fallback/complement when Commons thin; NC filter needed) | Low | CC per item; ready attribution strings | Anonymous verified; harmless add-on to family #1 |
| 9 | **Internet Archive (RO video clips + TV news)** | Medium (free video tier beyond Commons) | Medium (per-item license curation) | Varies (PDM/CC) | Anonymous verified; needs curation to stay license-clean |
| 10 | **KartaView (street-level imagery)** | Medium (street views of RO roads; OSM-adjacent) | Medium (sequence API, frame picking) | CC BY-SA 4.0 | The license-clean answer to "Mapillary without a token" |

**Ranked just outside:** BIA official flight board (ghRelayed — rich + official but Cloudflare-gated), OpenSky (backup ADS-B with quota), Cluj cultural calendar CKAN switch-on (small annual events layer), WLM monument-photo XML + INP museum EDM (switch-ons inside family #1/#4), Grila notarilor via existing legal family (near-zero cost), ANCPI mortgage stats (market-temperature honesty layer).

## Verdicts on the risky ones

- **Imobiliare/chirii: NO free anonymous source.** Listings live only behind restrictive-TOS commercial portals (imobiliare.ro TOS restricts automated extraction; a paid scraper market exists precisely because there's no API). Free public layers that DO exist: ANCPI mortgage dynamics (CKAN), ANL housing programs (CKAN) — recommended honest framing: "market indicators, not listings".
- **Mapillary: disqualified for no-auth** — v4 requires an access token on every request. Clean alternative: **KartaView** (public endpoints, CC BY-SA JPEGs).
- **Tranzy: key-gated** — free registration, then `X-API-KEY` header; anonymous gets documented 403. If the product accepts one stored token, it unlocks live transit GPS for ~30 RO cities in a single family.
- **BIA official arrivals: exists and is excellent** (wp-json FDS API, flights/airlines/logos) but **Cloudflare-challenge-gated** → AFIR-class ghRelayed candidate (scheduled runner does the browser-leg or carries the cleared session); otherwise ADS-B families (#2) carry flights.
- **infofer IRIS live trains: fragile** (token+cookie+ReCaptcha contingency) → keep official CKAN planned timetables; defer live-rail.
- **airplanes.live: free tier recently locked** (contact-us error) → use adsb.lol (+OpenSky fallback).
- **AIGA inspire.geomil.ro: slow/possibly geo-limited** from our vantage (timeouts on 3 attempts across fetchers) — pull via patient client or one-shot relay; the CKAN copy (zipped TIFFs) always works.

## Totals

- **Sources checked/catalogued: 29** (22 externally reached with proofs — live fetch, catalog-detail verification, or in-browser capture; 7 verdict-by-documentation/restriction: Mapillary, Europeana-nok key, infofer-IRIS docs, events aggregators, imobiliare TOS, IGSU absence, airplanes.live gate).
- Live proofs captured this session: Wikimedia Commons (photo+video), Openverse, adsb.lol, OpenSky, Overpass, Internet Archive, KartaView (200), Tranzy (OpenAPI spec), CKAN package_show (data.gov.ro), BIA FDS (in-browser), Europeana (401 behavior), airplanes.live (gate behavior), CNPB (freshness stamp), AIGA/geoportal (reachability behavior).
- Local-catalog switch-on candidates identified without any network cost: 16 CKAN datasets across justice/timetable/events/housing/ortho/museums (ids recorded above).

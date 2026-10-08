# Research — cinema & theatre program sources (București/national) + AIGA orthoimagery WMS

Date: 2026-10-08 · Mode: read-only research (no code changes) · Probes: curl (UA `Aflivra/1.0`, macOS, no `timeout`), DuckDuckGo search/fetch, check-host.net multi-vantage API (TCP + HTTP checks).

**Egress caveat (applies to every probe below):** all direct probes ran from a **US egress (170.40.228.29, United States)**. Several Romanian institutional sites geo-block or bot-challenge foreign traffic. Where a probe failed for that reason, the finding says so explicitly; a multi-vantage check (check-host.net, incl. EU nodes) was used to distinguish "dead" from "filtered from here".

---

## 0. How events integrate today (ground truth from code)

- **Venue registry:** `public/events/venues.json` — fields `id,name,short,type,city,county,address,latitude,longitude,url,kind,placeId`. Registry fields are **validated at commit time**: `address` against the institution's own published contact page, `placeId` against the committed OSM record id — never name-matched at runtime (`lib/live/events.ts:3-7`).
- **Loader kinds:** `'jsonld'` (fetch `venue.url` HTML, parse `<script type="application/ld+json">` blocks whose `@type` matches `/Event/`, requires `name`+`startDate`, event `url`/`image` must be **same-host** as the venue) and `'tribe-events-v1'` (fetch `venue.url + 'wp-json/tribe/events/v1/events?per_page=100&status=publish'`) — `lib/live/events.ts:11,16-46`. `localStamp` (`lib/live/events.ts:14`) **requires `YYYY-M-D[ T]HH:MM`** — date-only `startDate` values are dropped.
- Any venue in the registry is loadable on demand and via the federated search (`app/api/events/route.ts:12-16`); the scheduled sweep pre-warms only `events.odeon` (`lib/live/refresh-sweep.ts:33`).
- **Cinema leg (city):** `lib/live/cinema.ts` — Cinema City quickbook JSON API `https://www.cinemacity.ro/ro/data-api-service/v1/quickbook/10107/film-events/in-cinema/{cinemaId}/at-date/{date}?attr=` → `body.films` + `body.events` joined on `filmId`/`businessDay`. Sweep member = Park Lake only (`'cinema.bucuresti.today' → cinemaLoader('1824', todayIso())`, `lib/live/refresh-sweep.ts:34`). Registry: `public/cinema/cinemas.json` (all 25 RO Cinema City venues incl. 4 in București — 1806 AFI Cotroceni, 1818 Mega Mall, 1824 Park Lake, 1807 Sun Plaza; fetchedAt 2026-10-04).
- Spectacole leg today: Teatrul Odeon (`jsonld`) + Opera Cluj (`tribe-events-v1`).

**Verification this session:** quickbook live probe — `GET .../film-events/in-cinema/1824/at-date/2026-10-09?attr=` → **200 `application/json`, 63,122 bytes, 19 films / 62 events** (first event `2026-10-09T12:00:00`, film `8331s2r`). The 2026-10-08 payload returned an empty `{"body":...}` (0 films) — business-day edge, structure valid.

---

## Q1 — Q1 per-source table

### Cinemas (București)

| Source | URL(s) | Format | Evidence (HTTP status) | Difficulty | License/notes |
|---|---|---|---|---|---|
| **Cinema City / Cineworld RO** (4 venues in București) | quickbook API (above); sitemap `https://www.cinemacity.ro/ro/data-api-service/v1/sitemap.xml` | JSON API (public, unauthenticated) + XML sitemap; **no JSON-LD** on film/cinema pages | quickbook 200 (64 KB); sitemap 302 from `/sitemap.xml` → 200 (52,799 B, lists films+cinemas); `/xmedia/js/config.js` 200 confirms Cineworld platform (tenantId 10107 = RO) | **EASY — already integrated for 1824; expanding to 1806/1818/1807 is a registry/sweep change only** (cinemas.json already contains them) | Operator-run service, no documented ToS for reuse; data © Cinema City; the app already credits "materialul distribuit de operator" |
| **Hollywood Multiplex** (București Mall Vitan, hmultiplex.ro) | `https://hmultiplex.ro/` ; `https://hmultiplex.ro/calendar` | none found — JS-rendered calendar | both 200; `/calendar` 19 KB has zero server-rendered times, 0 JSON-LD, no API/`__NEXT_DATA__`/RSS/iCal markers | **HARD (scraping off-limits)** | — |
| **Cinema Elvire Popesco (Institutul Francez)** | own site `elvirepopesco.ro` **broken** (TLS cert does not cover hostname — `curl: (60)`; `www.` variant unroutable); program published at `https://eventbook.ro/program/elvirepopesco?lang=ro` (251 KB server-rendered HTML); institute site `https://institutfrancais.ro/bucuresti/` = WordPress (200; `wp-json/tribe/events/v1/events` → 404; JSON-LD on page = WebSite/WebPage/Organization only; a WP category feed for `program-cinema-elvire-popesco` exists as pages but feed endpoint unverified) | program = HTML on a ticketing platform, **no JSON-LD/iCal/RSS** on program page (checked: 0 ld+json, no `.ics`/webcal links) | eventbook 200; ifrance WP 200 | **HARD via Eventbook (no structured feed); institute WP has no TEC** | Eventbook = private platform; venue.url would be 3rd-party host, bending the registry contract |
| **Cinemateca (Eforie + Union)** | no own domain found (`cinemateca.ro` = NXDOMAIN on 8.8.8.8/1.1.1.1); program via `eventbook.ro/hall/cinema-eforie` + Facebook | same as above | eventbook hall pages 200 (via search cache) | **HARD** | — |
| **Cinema Muzeul Țăranului (Studioul Horia Bernea)** | own page `https://www.mntr.ro/proiectii-de-film` (200, 250 KB, 0 JSON-LD, not WP); Eventbook `eventbook.ro/program/muzeul-taranului-roman`; **TICS** `https://app.tics.ro/locatie/1120` | TICS (Laravel/Alpine): venue page carries JSON-LD **ItemList** of upcoming events (names+URLs, same-host), **event pages carry full Event JSON-LD** (`startDate: 2026-10-09T20:30:00+03:00` — ISO with offset!), plus `app.tics.ro/sitemap-events.xml` / `sitemap-venues.xml` (200; sitemap index 200, 796 B) | all 200 | **MEDIUM — needs a new loader kind (2-hop: ItemList → event pages)** | TICS is a private ticketing platform (runs Animest, KINOdiseea programs here); reuse rights not stated — confirm before adding; venue.url on 3rd-party host bends registry contract |
| **Cinema PRO** | no own domain found (`cinemapro.ro` NXDOMAIN) | — | — | not researched further (no source to integrate) | — |
| **Cinemagia** (national cinema listings portal) | `https://www.cinemagia.ro/program-cinema/<cinema>-bucuresti/` | unknown | **403 to US egress** (curl and fetch proxy both) — geo/bot-blocked; RSS/iCal could not be verified from this vantage | **UNKNOWN from here** — if it has per-cinema RSS it would need an RO vantage to verify; treat as blocked/unverified | portal is private, crowd/operator-fed, not an official source |

### Theatres / institutions (spectacole)

| Institution | URL | Format | Evidence | Difficulty |
|---|---|---|---|---|
| **Teatrul de Artă București** | `https://teatruldearta.ro/` | **WordPress 6.9 + 12 JSON-LD blocks on home, `@type: Event`**; event pages (`/events/<slug>`) carry Event schema: name, date, url, offers (price/currency/availability/url), location Place w/ address | home 200; event page 200 (137 KB). **Caveat: `startDate` is date-only** (`2026-10-11`), no HH:MM — current `localStamp` (lib/live/events.ts:14) would drop every item | **EASY-MEDIUM — best candidate** (same `jsonld` kind as Odeon; needs a parser extension to accept date-only `startDate`) |
| Teatrul Național „I.L. Caragiale" (TNB) | `https://www.tnb.ro/ro/calendar?view=list` | behind a **JS proof-of-work bot challenge** ("Verifying your browser…", 503 + PoW script) | 503 from US curl **and** from the fetch proxy; TNB IP 193.151.29.12 | **HARD/BLOCKED for server-side fetch** (a Worker fetch would face the same challenge). Ticketing mirror `bilet.ro/venue/tnb` = 1.9 MB plain HTML, 2 unparsable ld blocks |
| Teatrul Bulandra | `https://www.bulandra.ro/` | WordPress 7.1.3; `wp-json` root open (200); **tribe v1 = 404**; home JSON-LD = non-Event | 200 home (445 KB) | **HARD** (repertory is HTML; no event CPT in REST) |
| Teatrul Nottara | `https://nottara.ro/program/` | WordPress 7.1.3; tribe 404; `wp-json/wp/v2/types` 200 = **no event CPT** (post/page/attachment/popup-maker only) | 200 (395 KB) | **HARD** (program server-rendered HTML) |
| Teatrul Metropolis | `https://teatrulmetropolis.ro/` | WordPress 7.1.3; tribe 404 | 200 | HARD |
| Teatrul Godot | `https://www.teatrulgodot.ro/` | WordPress 7.1.3; tribe 404 | 200 (165 KB) | HARD |
| Teatrul de Comedie | `https://comedie.ro/` (NOT teatruldecomedie.ro = NXDOMAIN) | WordPress; tribe 404; `/spectacol/<slug>` pages; JSON-LD = WebPage only | 200 (121 KB) | HARD |
| Teatrul Mic | `https://teatrulmic.ro/` | **Queue-it virtual waiting room** (302 to queueittoken) | 302 | HARD/BLOCKED (anti-bot queue) |
| Teatrul Național de Operetă „Ion Dacian" | `https://www.opereta.ro/` (calendar at `/calendar/`) | WordPress 6.9; tribe 404; no Event JSON-LD on calendar | 200 (313 KB; calendar 262 KB) | HARD |
| Opera Națională București | `https://operanb.ro/` (legacy `operanationala.ro` still up) | WordPress 7.1.3; tribe 404; JSON-LD = CollectionPage/BreadcrumbList | 200 (122 KB) | HARD |
| Teatrul Țăndărică | `https://www.teatrultandarica.ro/program/` | server-rendered HTML 613 KB, 0 JSON-LD (not probed deeper) | 200 | HARD (unverified deeper) |
| ARCUB | `https://arcub.ro/` | custom SPA; 0 JSON-LD on home; API not exposed in HTML | 200 (37 KB) | HARD/unknown |
| MNAC | `https://mnac.ro/` | Angular SPA shell (runtime/polyfills/main.js; 4.3 KB root) | 200 | HARD/unknown |
| MNIR (Muzeul Național de Istorie a României) | `https://www.mnir.ro/` | WordPress 6.9.10; tribe 404 | 200 (477 KB) | HARD |
| ICR | `https://www.icr.ro/` | custom; 0 JSON-LD | 200 (101 KB) | HARD |
| TIFF (Transilvania FF) | `https://tiff.ro/` | no JSON-LD on root; festival platform (deep program pages unprobed) | 200 (88 KB) | unknown, LOW priority (festival, not steady calendar) |
| Teatrul Odeon / Opera Națională Cluj | already in registry (reference implementations) | jsonld / tribe-events-v1 | — | — |

**National tribe check (for the "nationally if easy" leg):** `tnc.ro` (Teatrul Național Cluj) unreachable from US egress (000); `tnrs.ro` (TN Radu Stanca Sibiu) reachable but tribe 404. **The Events Calendar with REST exposed is rare in RO — Opera Cluj is the exception, not the pattern.** Cheap capability probe for any future candidate: `GET {site}/wp-json/tribe/events/v1/events?per_page=1` (one request per venue).

### Ticketing aggregators (checked, none usable as a structured feed)

| Platform | Evidence | Verdict |
|---|---|---|
| eventbook.ro | program pages 200, server-rendered, 0 JSON-LD, no iCal/RSS | no public feed; scraping off-limits |
| TICS (app.tics.ro) | see Cinema Muzeul Țăranului row — ItemList + Event JSON-LD + sitemaps | **the only aggregator with structured data** (MEDIUM) |
| bilet.ro | venue page 1.9 MB plain HTML | no |
| bilete.ro | home JSON-LD = WebSite/Organization only | no |
| iabilet.ro | 347 KB HTML, 0 JSON-LD (Cloudflare-fronted) | no |
| goout.ro | JS SPA (17 KB shell) | no public API known |
| teatrul.ro | parked page ("teatrul.ro" title + /privacy; TLS broken on https) | **not an aggregator** |
| Cinemagia | 403 geo-block from US | unverifiable from this vantage |

### Top-3 recommendations (in venue/JSON-LD pattern)

1. **Teatrul de Artă București** (`jsonld` kind, `id:"dearta"`). Live Event JSON-LD on home + event pages, same-host urls, offers.url present, location address published (Str. Sfântul Ștefan). One code change required: extend `localStamp`/`parseEvents` to accept date-only `startDate` (their schema publishes no time — render as "date announced, time TBD" or drop-in at 00:00 — a product decision). Then the standard registry leg applies: address validated against their own contact page, placeId = OSM node (e.g. the committed OSM record for Teatrul de Artă), and both the per-venue API `/api/events?venue=dearta` and the federated search pick it up automatically; the watch kind `'venue'` already validates refs against the registry (`lib/live/watch-sweep.ts:60`).
2. **TICS venues — start with Cinema Muzeul Țăranului** (`app.tics.ro/locatie/1120`). Event pages carry complete Event JSON-LD (ISO datetime + tz offset → passes `localStamp` unmodified), venue page gives a same-host ItemList of upcoming event URLs, sitemaps give discovery. Cost: a new `kind:"tics"` loader (2-hop: venue page → event pages) — the existing kinds' single-fetch contract doesn't cover it. Two product calls to make explicitly: (a) `venue.url` points at a third-party platform, bending the registry's "institution's own calendar" contract; (b) TICS is a private platform without stated reuse terms. If accepted, this also unlocks the Animest/KINOdiseea circuits hosted there.
3. **Scale Cinema City from 1 to 4 Bucharest venues (optionally all 25 RO sites).** The proven quickbook pattern needs only registry/sweep entries — `cinemas.json` already contains every venue with coordinates and addresses (1806 AFI Cotroceni, 1818 Mega Mall, 1807 Sun Plaza in București; national set incl. Cluj/Constanța/Iași/Timișoara…). Cheapest real expansion of "ce programe de cinematograf" — same chain, but genuine coverage. (Same-chain caveat: it does not add *operators*; Hollywood Multiplex and the arthouse circuit remain the gaps, per the table.)

Explicitly **not integrable now** (so nobody re-litigates without new evidence): TNB (bot-challenge), Bulandra/Nottara/Metropolis/Godot/Comedie/Opereta/Operanb/MNIR/MNAC (WordPress family with TEC REST disabled and no Event JSON-LD), Teatrul Mic (Queue-it), Hollywood Multiplex and Eventbook-hosted cinemas (no structured feed), Cinemagia (geo-blocked/unknown), teatrul.ro (parked).

---

## Q2 — AIGA orthoimagery WMS (verdict + plan)

### What the app uses today

- `AIGA_WMS = 'https://inspire.geomil.ro/network/rest/services/INSPIRE/OI_View/MapServer/WmsServer'` (`app/public-map.tsx:12`); layer name is **auto-discovered** from GetCapabilities (`app/public-map.tsx:32-45`, picks `/orto|imag/i` else first published layer); `AIGA_DATASET` = CKAN `ortofotoplan-scara-1-5000-pentru-teritoriul-romaniei`, credit "Ortoimagini 1:5000 · AIGA / MApN · CC BY 4.0". Tiles are fetched browser-side, and there is already graceful error + retry UI (`app/public-map.tsx:46-70,83`). Dataset vintage per CKAN: collection 2017-2020, org = **Ministerul Apărării Naționale**, **license CC-BY-4.0**, tags incl. `HVD`/`HVDRegulation138`.

### Verdict: no live official endpoint found as of 2026-10-08 — the AIGA data plane is a single unreachable IP

Evidence chains:

1. **The registered endpoint is unreachable globally, not just from one vantage.**
   - `inspire.geomil.ro` and the whole service plane (`portal.geomil.ro`, `gis.geomil.ro`) resolve to **one IP: 195.242.244.182** (whois: STS — Serviciul de Telecomunicații Speciale, route 195.242.244.0/22). `https://inspire.geomil.ro/` :443 — TCP connect timeout 12 s from US egress; `http://` :80 also timeout. `portal.geomil.ro`/`gis.geomil.ro` same IP, same result.
   - **check-host.net TCP (8 nodes):** port 443 connect **succeeds only from ir5 (Iran, 0.20 s) and ru3 (Russia, 0.18 s)** — the host is physically up; it times out from AU/CH×2/other-IR/SE.
   - **check-host.net HTTP on the exact GetCapabilities URL (8 further nodes: DE×2, ID, IL, IR, IT, JP, KZ, NL): all "Connection timed out"** — no node completes TLS+HTTP.
   - Conclusion: the host answers SYNs from a couple of sources only; for every probed vantage (incl. the app's users and the Cloudflare Workers network per the app comment `app/public-map.tsx:9-11`) the service is effectively down. Days-long, consistent with the user report.
2. **data.gov.ro (the CKAN record, which itself works fine) still points at the dead host.** `GET https://data.gov.ro/api/3/action/package_show?id=ortofotoplan-scara-1-5000-pentru-teritoriul-romaniei` → 200. Resources: 2 GeoTIFF zips hosted on data.gov.ro (reachable), `Ortoimagini vizualizare` → `https://inspire.geomil.ro/network/rest/services/INSPIRE/OI_View/MapServer` (dead), ATOM download on same host (dead), viewer app → `https://gis.geomil.ro/portal/apps/mapviewer/index.html?webmap=6ac3540f196f450d992d3afbe2373902` (dead, same IP). Record last modified 2025-05-08 — no updated URL recorded there.
3. **The successor Portal exists (indexed by Bing) but is on the same dead IP.** Bing indexes `https://portal.geomil.ro/server/rest/services/INSPIRE` (folder INSPIRE, ArcGIS "Current Version: 10.91", services incl. `INSPIRE/OI_View (MapServer)`) — i.e., AIGA did stand up a Portal for ArcGIS with the same service set; also `www.geomil.ro` (agency site, different IP 193.231.151.21, AS3233) answers :80 with 301→:443 but :443 also times out from US. Everything AIGA sits on STS networks and is currently unreachable from outside RO-favored paths. The WMS pattern for the new portal would be `https://portal.geomil.ro/server/services/INSPIRE/OI_View/MapServer/WmsServer?service=WMS&request=GetCapabilities` — **unverifiable until the network recovers; do not switch blindly.**
4. **ANCPI alternatives are also in incident/transition:**
   - `geoportal.ancpi.ro` and `gis.ancpi.ro` (the historical WIGOS-WMS host) are **NXDOMAIN** — gone from DNS entirely (verified on 8.8.8.8, 1.1.1.1, and 7 check-host nodes). NOT a live alternative.
   - `www.ancpi.ro` (Cloudflare) is up and carries a live notice: platforms incl. **Geoportal, RTI, MyEterra, Registrul proprietarilor** "vor fi repuse în funcțiune etapizat, după finalizarea verificărilor necesare" — ANCPI is in a restore phase.
   - `geoportal.gov.ro` resolves to ANCPI's own IP 195.138.192.9 and times out from US egress.
   - **ANCPI does not host the 1:5000 orto as a service anyway**: its ArcGIS Online org (`ancpi.maps.arcgis.com`, org id `tt6hwS9xmcvnRjQC`) has **0 ortho items** (org-scoped AGOL search); AIGA has no AGOL org at all (global AGOL search "geomil" = 2 unrelated Dutch layers). The AIGA ortho exists as a WMS only on the STS network, plus bulk GeoTIFF zips on data.gov.ro.
5. **Community hosting (geo-spatial.org)** runs a GeoServer (`https://services.geo-spatial.org/geoserver/wms`, reachable) with administrative/census/geomorphometry/historical-map workspaces — **no 1:5000 ortho**; not a substitute and not CC-BY-4.0-AIGA.

### Recommended plan (monitored fallback)

1. **No code change is required for resilience** — the ortho toggle already degrades with an honest error + retry (`app/public-map.tsx:46-70`). Keep `AIGA_WMS` as-is: it is still the chain's registered, CC-BY-4.0 source, and the layer-name auto-discovery means the same constant works the moment the host answers again.
2. **Monitor, don't guess:** schedule a daily probe of `GET {AIGA_WMS}?service=WMS&request=GetCapabilities` (30 s timeout). Because a single-vantage probe is confounded by geo-filtering, prefer a multi-vantage method — the free check-host.net API (`check-tcp`/`check-http`, used above) or any uptime monitor with an EU/RO node — and treat "success from ≥1 EU/RO node" as the recovery signal. Alert on state change; resume expectation: it's an infrastructure incident on STS networks, also affecting ANCPI (DNS removals + restore notice), which suggests a coordinated government-network event rather than a service retirement.
3. **On recovery, verify before switching anything:** (a) `inspire.geomil.ro` GetCapabilities (the old path may simply resume — Bing's cached index shows `OI_View` layers `OI.OrthoimageCoverage`/`OI.MosaicElement`); (b) if only the new portal answers, validate `https://portal.geomil.ro/server/services/INSPIRE/OI_View/MapServer/WmsServer?service=WMS&request=GetCapabilities` (Esri WMS on the hosting server) — same service, same license note; the app's `/orto|imag/i` discovery won't match `OI_View`, but the existing "first published layer" fallback (`app/public-map.tsx:42`) already handles that.
4. **Interim offline alternative (not a drop-in):** the bulk 2017-2020 GeoTIFF zips remain downloadable from data.gov.ro (reachable, direct links in the CKAN record); caching and tiling them into R2 is a license-clean but heavyweight path — only worth doing if the outage outlives weeks.
5. **Do not switch** to non-AIGA imagery (Esri World Imagery etc.) without a license/attribution decision — the current credit and dataset link are part of the CC-BY-4.0 compliance story.

---

## Probe inventory (for reproducibility)

- geomil family: `inspire.geomil.ro` :443/:80 timeout (×3 paths); `portal.geomil.ro` timeout; `gis.geomil.ro` timeout; `www.geomil.ro` :80 301, :443 timeout; DNS resolved for all data hosts (195.242.244.182).
- check-host.net: TCP inspire.geomil.ro:443 (8 nodes, 2 OK), HTTP GetCapabilities URL (8 nodes, all timeout), HTTP gis.ancpi.ro WIGOS (7 nodes, DNS failure).
- DNS: `geoportal.ancpi.ro`, `gis.ancpi.ro` NXDOMAIN (8.8.8.8 + 1.1.1.1); `geoportal.gov.ro` → 195.138.192.9 (ANCPI net, unreachable :443/:80 from US).
- data.gov.ro CKAN `package_show` → 200 (JSON, 18,313 B) — resource URLs captured.
- ArcGIS Online: `www.arcgis.com/sharing/rest/search?q=geomil` (200, total 2, unrelated); `ancpi.maps.arcgis.com/sharing/rest/portals/self` (200, org tt6hwS9xmcvnRjQC); org-scoped ortho search (200, total 0).
- Q1 hosts probed with HTTP status recorded per-row above; vantage = US egress, UA `Aflivra/1.0`, `curl --connect-timeout 8 --max-time 18`, politeness budget ≤10 requests/host respected (cinemacity.ro ≈ 10 incl. quickbook + sitemap + config + venue pages; every other host ≤5).

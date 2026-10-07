# Media Expansion Analysis

Session: media-expansion-analysis — 2026-10-06 · mode: read-only analysis on `main` (no git ops, no installs, no other file edited)

## Architect Findings

### Tech stack (context)
TypeScript strict + Cloudflare Workers via vinext (React 19, Playwright e2e, D1 + drizzle, corepack pnpm). Deploy = `scripts/deploy.mjs` over a vinext-generated `dist/server/wrangler.json`. Full house conventions: `ssnc-agent-orch/2026/10/06/sweep-federated-search/STATUS.md` (≤2 direct fetches/family, honest-degrade never 5xx, closed stub-resolver rule for new lib modules, countText, motion gating).

---

### 1. Media architecture today (exact, file:line)

**Serving.** All media are static files under `public/media/` shipped as **Workers Static Assets** (binding `ASSETS`, `vite.config.ts:18`; deploy asserts `assets:{binding:'ASSETS',directory:'../client'}` at `scripts/deploy.mjs:5`). Routes read corpora through `env.ASSETS.fetch` with SHA-256 proofs (e.g. `app/api/places/route.ts:11`, `app/api/catalog/route.ts:10`). **No R2 in the deployed worker today.**

**The four media manifests (all in `public/media/`):**
- `category-manifest.json` — **29 entries** = 14 categories × (primary + `galleryOrder:2` secondary) + `editorial-hero`. Every entry: `{category,file,caption,sourceUrl,credit,license,licenseUrl,originalUrl?,changes?,galleryOrder?,displayChanges}` — all Wikimedia Commons CC-licensed. `scripts/verify-catalog.mjs:3` pins count=29, requires credit+license+licenseUrl+sourceUrl per image, checks RIFF/WEBP magic, and pins the hero credit (xulescu_g / CC BY-SA 2.0) stays exported.
- `manifest.json` — the **attested-photo register**: per asset `{app_id, app_file, subject, caption_ro, original_title, source_page_url, original_image_url, downloaded_image_url, author, license, license_url, attribution, attribution_html, role(main|gallery|hero), width, height, bytes, sha256, retrieval_date, changes}`; `explore-*` assets additionally carry **`source_record` (the OSM node/way/relation URL) + `commons_page_id`** — each photo is matched to an exact OSM record. Exported on the about page via `AssetExport path="/media/manifest.json" title="Autorii și licențele fotografiilor"` (`app/page.tsx:146`) and fetched for the hero at `app/page.tsx:71`.
- `category-illustrations.json` — **16 AI editorial covers (15 distinct assets; `vreme`/`povesti` remap to mediu/cultura)** with full generation `prompt`, `provenance` (tool, mode, referenceImages, `generationCallsForAsset:1`), and `qa` blocks. Gate: `scripts/verify-catalog.mjs:9` asserts 16/15-distinct-sha256, bytes, WEBP magic, caption contains "AI", prompt present.
- `hero-style.json` + `weather-manifest.json` — AI-stylization record for the hero (sourcePhoto → changes → `webpExport.sha256`) and 5 weather-condition backdrop illustrations.

**Rendering surfaces:**
- `app/public-media.tsx:5` **`PublicMediaGallery`** — the universal gallery component. Items: `{kind:'image'|'video'|'embed', url, caption, sourceUrl, credit?, license?, licenseUrl?, watchUrl?, poster?}`; embedded players only for verified providers; per-item honest failure state ("Materialul N nu poate fi încărcat acum") + retry; every figcaption carries credit · license · "Proveniența materialului" · "Condițiile licenței" links.
- `app/category-photo.tsx:8` **`CategoryPhoto`** — `cover=true` renders the AI illustration with an explicit "Ilustrație AI" badge; non-cover renders the CC photo grid + full-photo lightbox dialog with complete provenance.
- `lib/live/media.ts` — the safety layer for all external media: `publicUrl` (https-only, no credentials, :3), `publicImageUrl` (rewrites Commons `File:` pages to `Special:FilePath?width=720` thumbs, blocks Google-album pages, :22), `youtubeVideoId`/`embeddedMedia` (strict YouTube-nocookie/Vimeo allowlist, :5-20), `recordMedia` (scans arbitrary record JSON — OSM tags, registry fields — for image-ish values, :30), `feedMedia` (RSS/HTML media extraction, :31).

**What a "gallery" requires, in data terms — four provenance classes already established:**
1. **Attested-local (curated)**: `Place.images[]` referencing `manifest.json` `app_id`s (`app/v2-model.ts:2`); `public/places/exploration.json` = 28 places each with `recordId`+`recordChunk` anchoring an **exact OSM record** in `public/places/records/` + full attribution; + 6 editorial originals = **34 photographed destinations**. Proof harness: `scripts/verify-exploration-media.mjs:54-63` (record parity name/lat/lon/sourceUrl + per-image sha256 + license fields + '[...originalPlaces,...expandedPlaces]' + 'Locuri cu galerii' pins).
2. **Hotlinked-from-source (OSM tags)**: `scripts/finalize-places.py:51-64` copies OSM `image` (https) or `wikimedia_commons` File: tags into index rows as `Special:FilePath?width=1000` URLs → `EntityCard` renders via `publicImageUrl` (`app/places-workspace.tsx:36`), fallback link "Galeria foto indicată de sursă" (:39). **`/api/places?photos=true`** filters to photographed places only (`app/api/places/route.ts:8`; PlacesWorkspace sends it at `app/places-workspace.tsx:67`). Record detail additionally runs `recordMedia(data.tags, data.sourceUrl)` (:25).
3. **Operator-published** (the class for institutional material without CC): cinema posters credited "Cinema City · materialul distribuit de operator" + trailer embeds (`lib/live/cinema.ts:8`); Odeon event images credited "Teatrul Odeon · materialul publicat de instituție" (`lib/live/events.ts:10`). **This is the precedent an institutional-logo/materiales expansion must ride.**
4. **AI editorial illustrations**: labeled, prompt-logged, sha-proven (category covers, hero, weather backdrops) — the fallback for categories with no attested photo, never presented as photography.

**Where galleries exist today:** places (34 curated + tag-derived for tagged records), cinema (poster + trailer per film), events (19 Odeon events, image per event), films (1,870 Wikidata, hotlinked posters where present — `lib/live/feeds.ts:20`), stories (`feedMedia` from Wikisource HTML), directory records (`recordMedia` — currently yields nothing: registries carry no image fields), category pages + home hero + weather scenes.

---

### 2. Storage: ASSETS vs "Cloudflare buckets" (R2)

- **No committed wrangler config exists.** vinext (site-creator) generates `dist/server/wrangler.json`; `scripts/deploy.mjs:5-7` hard-asserts its shape: exactly 1 D1 binding (`DB`), assets binding `ASSETS` → `../client`, crons merged from `lib/live/refresh-groups.json` (**max 5 cron groups — free plan cap enforced at deploy.mjs:9**), database_id never placeholder.
- **An R2 binding hook already exists but is off**: `vite.config.ts:11` reads `{d1, r2}` from `.openai/hosting.json`; `:30-37` renders `r2_buckets: r2 ? [{binding: r2, bucket_name: 'site-creator-r2'}] : []` for the dev/miniflare config. Today `.openai/hosting.json` = `{"d1":"DB","r2":null}`. **Turning R2 on = 4 touchpoints:** set the binding name in hosting.json; extend `scripts/deploy.mjs` EXPECTED/assert (currently `assertBuildConfig` checks only the keys of EXPECTED + D1 explicitly — an `r2_buckets` pass-through or explicit clause); `cloudflare-env.d.ts` gains the binding type; buckets are created via `wrangler r2 bucket create` (outside the repo). No existing-media migration is required — ASSETS keeps serving `public/`.
- **Size math (the decisive constraint is the FILE COUNT, not bytes).** Workers Static Assets limits: **20,000 files per project**, 25 MiB per file. Current shipped-file census ≈ **6,440** (5,251 catalog `datasets/*.json.gz` + 299 places record chunks + ~548 index/spatial shards + 233 story texts + 95 media files + transit/cinema/legal/courts/catalog roots). Headroom ≈ **13,500 files**. At the pipeline's 1024px/WebP-q80 output (57 KB–286 KB observed in `manifest.json`), 10k curated photos ≈ 1–3 GB — comfortably inside; ~13.5k files is the hard ceiling; **50k local photos is impossible via ASSETS**.
- **"Every place and institution must have an image" (178,868 places) can never be local storage** (178,868 × ~200 KB ≈ 36 GB). The architecture already answers it in tiers: (a) hotlink Commons thumbs for every OSM-tagged record (mechanism live, zero storage), (b) curate attested local WebP for the editorial/verified subset (34 today, expandable to ~10–13k within ASSETS), (c) operator-published material for institutions. **R2 becomes necessary only for locally-stored copies beyond ~13k files**: R2 free tier 10 GB-month storage + zero egress; bulk ingest belongs in CI (`wrangler r2 object put`) or a seed route mirroring the AFIR relay pattern (`app/api/seed/afir/route.ts` is the auth/validation/D1-write template) — never per-request worker writes.
- **Commons etiquette is already a live constraint**: `exploration-import.json` records HTTP 429 rejections; `import-exploration.py` runs `maxParallelRequests=3`, User-Agent branded, 1440px `thumburl`, CC/PD license regex gate (line 85). Any scaling pass must keep that discipline (the 429 message explicitly recommends listed thumbnail sizes).

---

### 3. Corpus inventories relevant to the user's wants (exact current state)

| Corpus | Count | Media today | Fields that matter |
|---|---|---|---|
| places (OSM) | 178,868 in 16 categories | `image?` on index rows (Commons hotlinks) where tagged; 34 attested | cultura 8,655 (subcats **Muzee, Locuri de vizitat, Puncte panoramice, Săli de concerte, Teatre, Galerii, Biblioteci, Cinematografe**), justitie 2,411 (**Avocați, Notari**, Instanțe), local 21,657, firme 54,428, transport 46,227 (Gări/Autogări/Aeroporturi), sanatate 9,702, educatie 7,113; record = 16 fields + full OSM tags. Photo coverage = `photos=true` server filter over tagged rows |
| Institutions registries | **13,132** = 4,117 CNAS clinics + 2,284 pharmacies + 731 hospitals + 6,000 schools | **none — XLSX registries carry no image/logo fields (source-side gap)** | RecordBrowser title-extraction chain; compact school rows |
| Courts (justiție) | 246 | none — registry is `{id,label}` only (a dosar-picker, not a facility directory) | used by LegalWorkspace + dosar model |
| Events (spectacole) | **19** — Teatrul Odeon only | 1 institution image per event | `{id,title,content,start,end,url,media,sourceName}`; coverage **anchored to Odeon's own coordinates** (44.43667/26.09738, `app/events-workspace.tsx:12`) — one institution, locality-scoped; excluded from federated search v1 (flag #2) |
| Cinema | 30 sites (Cinema City network) + per-day program | **poster + trailer embed per film** (cinema.ts:8) | sites `{externalCode,name,uri,latitude,longitude,address}`; films link to operator pages (tickets live there) |
| Films | 1,870 (Wikidata) | hotlinked posters where Wikidata has images (feeds.ts:20) | id/title/date/directors/url/media; trailer = cinema program only |
| Lawyers | 15 (IFEP search page 1) | none, text-only | id/name/title/url/details/rights/paragraphs/updatedAt |
| Notaries | places subcategory „Notari" only | via OSM tags | no professional registry (standing flag #1) |
| Transport realtime | TPBI vehicles, 30 s poll | n/a | **`lat, lon, bearing, speed, occupancy, occupancyPercentage, licensePlate, vehicleName, currentStatus, wheelchairAccessible` already parsed** (`lib/live/transit-realtime.ts:15`) — **live GPS + heading data layer is DONE**; map draws route polylines + vehicle circle markers (`app/public-map.tsx:10`, vehicles auto-open the map, `transit-workspace.tsx:37`) **but bearing is not visualized** (no rotated marker) |
| Absent today | ANCPI terenuri · ANAF experți (justiție) · imobiliare/chirii · muzică/concerte (only OSM Săli de concerte) · mersul trenurilor CFR (only OSM Gări; GTFS = TPBI buses) · avioane (only OSM Aeroporturi) · odihnă/adăpost (OSM Cazare/Băi/Toalete subcats exist, no dedicated surface) | — | each would be a new loader family (see §4) |

**Ticket deep links**: cinema film `url` → operator page (booking there), event `url` → Odeon page — all destinations already link out to the institution; a visible "Bilete la operator" affordance is presentational, not data work.

---

### 4. Category/domain extension points — the registration checklist

A new domain or data family touches this **closed set** (all gates exist and bite — `scripts/verify-sweep-inventory.mjs` fails on any unhandled key in either direction):

1. **`app/v2-model.ts`** `domains[]` (16 today) — id/name/short/icon/accent/items/source/intro; `federatedGroups` mirrors it exactly (offline sync gate in `verify-federated-search.mjs`).
2. **`lib/dashboard-topics.ts`** — `topicGroup` mapping + `topicSections[domain]` (46 sections across 16 domains); every section id must resolve in `app/domain-workspace.tsx:13-33 content()`.
3. **`app/category-photo.tsx:7` mapping** + `public/media/category-manifest.json` (category photos ×2 — `verify-catalog.mjs` pins 29) + optionally `category-illustrations.json` (pins 16/15-distinct — pin updates ride the same change).
4. **Places-backed domains**: a category + indices in `public/places/manifest.json` (regenerated by `scripts/finalize-places.py`); `verify-sweep-inventory` asserts manifest categories == domains with a places section and subcategory lists ⊆ the 73-label master.
5. **Data family**: `lib/live/<family>.ts` loader (Loader contract: key/name/url/version/ttl/load) + adapter wiring + D1 via `readSource`; membership in `lib/live/refresh-groups.json` — **exactly 5 cron groups allowed (free plan)**, so new families join existing groups or ride `seedBacked` (verified-at-load voluminous statics) / `onDemand` / `ghRelayed`.
6. **Parity harness**: a row in `scripts/verify-source-errors.mjs` families table (19 families × 6 scenarios = 114 cells today) + fixtures + route compile entry; the `--live` mode adds the deployed-worker leg.
7. **Coverage gate**: registry key → `{harness, parity family}` in `scripts/verify-sweep-inventory.mjs`; orphan Parität families fail it.
8. **Federated search family** (optional but expected): `lib/live/federated.ts:73-87` `federatedFamilies` (13 today) + target mapping; `validDomainTab` gates any `tab` hash param.
9. **ghRelayed simplification** — for sources that block Workers egress (the AFIR class): seed route (`app/api/seed/afir/route.ts` = auth + validation + D1 publish template) + `scripts/relay-<x>.mjs` + GitHub Actions workflow + two harnesses (`verify-afir-relay.mjs` route gate, `verify-relay-afir.mjs` runner gate). Consumes no cron budget.
10. **CI/observability**: `pr-validation.yml` battery line + README battery list (repo rule: same change); e2e baseline 28 tests/9 specs; `AssetExport` entries on about for any new public manifest.

---

### Extension map

**Already exists (zero build):** live-vehicle GPS+bearing parsed; route polylines on map; cinema posters+trailers; event images; film posters; OSM-tag photo galleries + `photos=true` filter; 34 attested photos; AI cover system; full license exports; AFIR relay template; ASSETS/D1/R2 binding hook.

**1-swimlane (one aligned change, no new infra):**
- **Vehicle headings on the live map** — `public-map.tsx` marker variant (rotated arrow from `bearing`, already in the payload) + speed/occupancy in the popup. Small diff, flagship visible upgrade.
- **Scale attested place photos** — extend `import-exploration.py` selection beyond Muzee/Locuri de vizitat/Puncte panoramice (add Săli de concerte, Teatre, Galerii, Biblioteci, Cinematografe…) to thousands of Commons-matched places, within the ~13.5k ASSETS file headroom; AssetsExport + verify-exploration-media pins ride along.
- **More category photography** (category-manifest entries per new category) + new curator subcategory filters (existing sub filtering needs no code).
- **Ticket-link affordance** (external chips on cinema/event cards — links already in data).
- **Notaries registry** (UNNPR as a new lawyers-like loader family) — data work only, checklist §4 applies.

**Multi-wave (several registries and/or infra):**
- **Events/spectacole beyond Odeon** — each institution calendar is a loader family (odeonLoader pattern, geo-anchored like cinema sites); a locality-scoped events aggregation surface (cultura `events` tab exists) + optional federated family reversal of flag #2.
- **R2 media bucket at scale** — hosting.json binding + deploy.mjs assert + `cloudflare-env.d.ts` + read route(s) + CI ingestion path (relay-seed pattern); needed only past ~13k local files.
- **New domains** (Imobiliare/Călătorii/etc.) — full §4 checklist ×N; each ghRelayed-eligible source simplifies refresh (no cron budget).
- **ANCPI terenuri · ANAF experți · CFR timetables · flights** — new loaders each, egress-class assessment first (relay vs direct), sources not yet vendored.

### Top-3 extension recommendations (user-visible impact order)
1. **Fotografii peste tot, pe sistemul existent** — scale `import-exploration.py` to the full Commons-tagged OSM subset (all image-bearing cultura + Gări/Aeroporturi/Concerte rows), attesting top ~10k into local WebP within ASSETS headroom; every other tagged record already renders hotlinked today. Every place/institution image request becomes true-or-honest instantly, with attribution everywhere ("lumea să se uite" effect).
2. **Harta live cu direcția vehiculelor** — bearing arrows + speed/occupancy popups; the data is already flowing (`transit-realtime.ts:15`), one component change (`public-map.tsx`).
3. **Spectacole = mai mult decât Odeon** — additional institution calendar families (teatre/filarmonici/săli, operator-published media class) on the existing events tab + cinema-like site registry; today the "spectacole" surface covers one theater's 19 events.

### Key files (for every downstream agent)
1. `app/public-media.tsx` — PublicMediaGallery + provenance UI
2. `lib/live/media.ts` — URL/embed safety layer + recordMedia/feedMedia
3. `app/category-photo.tsx` — category photos / AI covers / lightbox
4. `public/media/manifest.json` — attested-photo register (sha256 + license + source_record)
5. `public/media/category-manifest.json` — 29 CC category photos (count pinned)
6. `public/media/category-illustrations.json` — AI cover manifest (provenance-gated)
7. `app/v2-model.ts` — 16-domain registry + Place type (images[]→app_ids)
8. `public/places/exploration.json` + `public/places/manifest.json` — curated photo places + the 178,868 corpus spine
9. `scripts/import-exploration.py` — Commons ingestion pipeline (license gate, rate discipline)
10. `scripts/finalize-places.py` — corpus builder (index image hotlinks)
11. `scripts/verify-exploration-media.mjs` — gallery/record-parity proof harness
12. `scripts/verify-catalog.mjs` — manifest/license gates (29/16 pins)
13. `lib/live/cinema.ts` + `lib/live/events.ts` — operator-published media classes
14. `lib/live/transit-realtime.ts` — live vehicles (lat/lon/bearing/speed)
15. `app/public-map.tsx` — points/paths/vehicle markers (heading extension point)
16. `lib/live/refresh-groups.json` — 5-cron family registry + seedBacked/onDemand/ghRelayed
17. `app/api/seed/afir/route.ts` + `scripts/relay-afir.mjs` — runner-relay ingestion template
18. `vite.config.ts` + `.openai/hosting.json` + `scripts/deploy.mjs` — ASSETS/D1/R2 binding story (r2:null today)
19. `lib/live/federated.ts` — 13 search families + validDomainTab
20. `lib/dashboard-topics.ts` + `app/domain-workspace.tsx` — domain/section registry spine

### Feasibility flags (carried forward)
1. **Max 5 cron groups** (deploy.mjs asserts) — every new refresh family joins an existing group or rides seedBacked/onDemand/ghRelayed; new cron groups are not available on the free plan.
2. **ASSETS file ceiling ~13.5k more files** — the photos-at-scale plan's local tier must be count-bounded; R2 is the overflow valve, not the default.
3. **Commons 429s already observed** (`exploration-import.json`) — keep maxParallelRequests=3, use listed thumb widths, cache imageinfo (the pipeline already does).
4. **Source-side image gap for institutions** — CNAS/schools/courts registries publish no logos; institutional imagery must ride the operator-published credit class (link-out, own material) or stay AI-illustrated; no scraping into local files.
5. Events remain locality/day-scoped by design (federated flag #2) — a national "spectacole" search would reverse a recorded product decision, not just add code.

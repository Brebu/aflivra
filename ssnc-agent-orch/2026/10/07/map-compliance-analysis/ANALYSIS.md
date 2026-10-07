# Map Compliance Analysis — 2026-10-07

Read-only analysis of the two map surfaces and the two reported bugs:
(1) vehicles/trains don't show exact positions on the map — only planes do;
(2) the map shows only nearby elements and ignores the radius selection (e.g. 100 km).

## Architect Findings

**Mode:** standalone read-only analysis on `main` (verified `.git/HEAD` = `refs/heads/main`).
**Detected stack:** Next.js (App Router) + React, Leaflet (client dynamic import), Cloudflare Workers runtime (`cloudflare:workers` env, Static Assets + gz/SHA-proven corpora under `public/`), TypeScript. No spec-kit session; this file is the single sanctioned deliverable.

### 1. Cartography of the maps — which layer renders on which surface

**Surface A — `RomaniaMap`** (SVG, `app/v2-charts.tsx:57-89`). National static map. Country polygons from `/data/v2/map.json` (Natural Earth, `v2-charts.tsx:62,83`). Renders ONLY static `Pin[]` circles with a declutter pass (`v2-charts.tsx:26-56,86`) — the `Pin` type (`v2-charts.tsx:16`) has no `vehicle`/`bearing`; this surface **cannot** draw arrows, and no caller passes anything but static pins. Mounted at `app/page.tsx:129` (home discovery), `:142` (`#view=map`), `:146` (place detail, region pins).

**Surface B — `PublicMap`** (Leaflet, `app/public-map.tsx:15-62`). OSM tiles (`:17`) + optional AIGA 1:5000 ortho WMS (`:12,39`). Draws `paths` as polylines (`:57`) and points: `vehicle:true` + finite `bearing` → rotated SVG-arrow `divIcon` markers (`:57`, the only arrow code in the app); vehicle w/o bearing → circleMarker r9; places → circleMarker r6.

| Layer | Data source | Render surface | Component + file:line rendering it |
|---|---|---|---|
| Repere (≈267 static exploration places: 6 curated + OSM-derived `exploration.json`, `app/v2-model.ts:1-3`) | static corpus | Surface A (`#view=map`, home, place detail) | `RomaniaMap` via `localPlaces` = `places.filter(p=>!geo.hasLocal\|\|nearbyRecord(p,geo.center))` — `app/page.tsx:105` |
| Flights (ADS-B, adsb.lol 4-point ×250 NM merge, national box 43-49/20-31, weekly relay fallback) | live/relay (`lib/live/flights.ts:12-15,45-60`, poll 30 s) | Surface B — FlightsWorkspace (`#view=domain&id=transport&tab=flights`, `app/domain-workspace.tsx:32`) | `<PublicMap points={rows.map(...bearing:r.track...)}>` — `app/flights-workspace.tsx:40`; **map default ON** (`:30`), renders ALL rows unconditionally (live or stale) |
| Transit vehicles — TPBI (Bucharest–Ilfov GTFS-RT) | live (`lib/live/transit-realtime.ts:24-29`, ttl 30 s) | Surface B — TransitWorkspace `tab=vehicles` (TPBI-covered only) — `app/transit-workspace.tsx:52` | `{ld.isLive&&<PublicMap points={vehicleRows.filter(v=>Date.now()-Date.parse(v.observedAt)<120000)...bearing...}` (`:52`); the wave-2 "rotated-arrow markers by track" arrows live in `public-map.tsx:57` |
| Transit vehicles — Tranzy (rest of country, city-resolved) | live, needs `TRANZY_API_KEY` (`lib/live/transit-realtime.ts:33-34,70-73`) | Surface B — TransitWorkspace `tab=vehicles` (uncovered branch) — `app/transit-workspace.tsx:49` | `{ld.isLive&&<PublicMap points={tranzyRows.filter(...<120000)...}` (`:49`); Tranzy rows carry `bearing:null` (`transit-realtime.ts:54`) → **dots, not arrows** |
| Transit network routes/stops (planned GTFS) | static corpus `public/transit/` | Surface B — only inside the per-route dialog | `RouteReader` stops+shape: `app/transit-workspace.tsx:29-31`; network list itself has no map |
| Trains (CFR mers-tren, planned) | static corpus `public/trains/stations.json.gz` + 128 board shards | **NO map on any surface** | `TrainsWorkspace` = station list + planned boards only — `app/trains-workspace.tsx:34-47`; no `PublicMap` import; corpus `TrainStation={code,name,search,operators,trains,shard}` has **no coordinates** (`lib/live/trains.ts:17`) |
| Places / shelters (181k OSM national corpus, gz chunks + spatial index) | static corpus `/api/places` (`app/api/places/route.ts`, `lib/places-query.ts`) | Surface B — PlacesWorkspace (`#view=domain&id=<cat>&tab=places`, plus home/explore mounts `app/page.tsx:127,137`) | `{view==='map'&&<PublicMap points={result.items...}>}` — `app/places-workspace.tsx:79`; per-place detail map `:28` |
| Cinema (single selected cinema), entity detail (single place) | connected network / corpus | Surface B — single pin | `app/cinema-workspace.tsx:27`; `app/places-workspace.tsx:28` |
| Heat / other layers | — | none exist anywhere | confirmed by sweep (`grep` heat/rotate/bearing across `app/`) |

All workspaces mount through `DomainWorkspace` tab dispatch (`app/domain-workspace.tsx:14-36`); tab catalog in `lib/dashboard-topics.ts:8` (transport → network/vehicles/arrivals/alerts/trains/flights/places).

### 2. Bug #1 root cause — vehicles and trains without live positions on the map

**One-liner:** planes render nationally, unconditionally, with no geo and no freshness gates (`flights-workspace.tsx:40`, `app/api/flights/route.ts:8-16`), while vehicles render behind three gates — coverage, a hardcoded 15 km server filter, and a 120-second freshness rule — and trains have no positional data at all (no coordinates in the corpus, no real-time source).

The gates, file:line:

1. **Coverage gate.** TPBI serves Bucharest–Ilfov only (`lib/transit-location.ts:4`, bounds from `public/transit/coverage.json`). Outside it, the vehicles tab falls to Tranzy, which requires `TRANZY_API_KEY` (`lib/live/transit-realtime.ts:33-34`) and resolves the *chosen locality* to a Tranzy agency by name tokens (`:77-83`); most localities resolve to nothing → `"Niciun operator Tranzy... Fluxul altui oraș nu este interogat."` and zero rows (`app/api/tranzy-live/route.ts:11-12`). The other transit tabs (network/arrivals/alerts) outside coverage render "Nu avem încă o sursă validată…" + a PlacesWorkspace fallback (`app/transit-workspace.tsx:48`) — no live positions anywhere.
2. **Radius cap.** Both live-vehicle APIs drop every vehicle more than 15 km from the client's point, server-side, with no radius parameter: `nearbyRecord(r,point)` default 15 (`app/api/transport-live/route.ts:13,15`; `app/api/tranzy-live/route.ts:14`; `lib/geographic-scope.ts:47`). The client always sends a point (`geographicParams(geo,'context',true)` — `lib/geographic-scope.ts:18`; `app/transit-workspace.tsx:39`).
3. **Freshness gates.** The vehicle map renders only when the feed is `isLive` (observed < 120 s: `app/transit-workspace.tsx:49` for Tranzy, `:52` for TPBI; computed at `app/api/transport-live/route.ts:15`, `app/api/tranzy-live/route.ts:14`) and then still drops each vehicle whose own `observedAt` is older than 120 s (`:49`,`:52` — `Date.now()-Date.parse(v.observedAt)<120000`). A stale feed = an absent map. The flights map, by contrast, **always draws its rows** — live or weekly-relay stale — and only changes the caption (`flights-workspace.tsx:39-41`; `app/api/flights/route.ts:11-15` reports `isLive`/`stalenessMinutes` but never filters rows). That asymmetry is exactly "only the planes have exact positions".

**Trains — honestly separate "cannot" from "not wired":**
- **Cannot (no source):** live train positions. The public CFR/Infofer editions are planned timetables only (note in `app/api/trains/route.ts:9`); no GTFS-RT source exists for CFR (IRIS/ReCaptcha walls, per the 2026-10-06 media-expansion research). No honest live position is possible today.
- **Not wired (data absent at import):** even *station-level* spatiality. `TrainStation` carries no `lat/lon` (`lib/live/trains.ts:17`); `scripts/import-mers-tren.mjs` never reads coordinates, so nothing exists to place on a map. If a future Infofer edition exposes station coordinates, this flips to "not wired". No route polylines exist either — the transit shapes in `public/transit/shapes` are TPBI bus shapes, unrelated to rail.

### 3. Bug #2 root cause — radius ignored on the map

**One-liner:** the radius selector (2–100 km, `app/places-workspace.tsx:75`) IS threaded into `/api/places` (`:67`; validated 1–100 at `app/api/places/route.ts:9`; used in `lib/places-query.ts:11,16`) — but the map draws only `result.items`, one page of `size=18` (`lib/places-query.ts:9,21,24`), so the map paints the 18 nearest pins *at any radius* and the pin count never responds to the selection.

Mechanics, file:line:

- Places map render: `{view==='map'&&<PublicMap points={result.items...}>}` — `app/places-workspace.tsx:79`; `result.items` = current page only (18/page, `lib/places-query.ts:9`). In nearby scope the page is distance-sorted, so at 100 km with thousands of totals the map still shows the 18 closest — indistinguishable from "radius ignored".
- Default scope is `context`; with an active device/manual location it becomes `nearby` with default radius `'15'` (`app/places-workspace.tsx:60,65`) — the resting state is precisely "only nearby elements".
- The radius selector itself only appears when `activeScope==='nearby'` (`:75`).
- **No other surface has a radius.** Every other geo filter in the app is the hardcoded `nearbyRecord` default 15 km, with no selector: national repere map `app/page.tsx:105` (copy "raza de 15 km" `:136,:158`); transit routes/stops client filter `<=15` (`app/transit-workspace.tsx:43`, text `:52`); transit live-vehicle server filter (§2); cinema `app/cinema-workspace.tsx:17,26-27`; events `app/events-workspace.tsx:16,20`; catalog tabular rows `lib/tabular-geography.ts:8,13`; only weather stations use 50 (`app/weather-workspace.tsx:18`). A radius chosen in the places tab genuinely has no effect on any of those surfaces — separate maps, separate filters.

### 4. Fix plan — minimal honest wiring (per fix estimates, swimlanes)

**Vehicles (Bug #1):**

1. **Render-and-label stale vehicle positions** ~1–2 h — Builder; ~30 min — Validator (e2e/probe: leaflet marker count > 0 on a stale feed, staleness caption present). Adopt the flights pattern in both vehicle branches: drop the `ld.isLive&&` render gate and the per-vehicle 120 s drop, keep/label age ("poziții de acum ~X min", mirroring `flights-workspace.tsx:39` staleness copy; drop vehicles with no finite lat/lon only). Files: `app/transit-workspace.tsx:49,52`. Honesty is preserved by the label, not by an empty map.
2. **Thread radius into the live-vehicle APIs** ~1 h — Builder (+30 min Validator). Add optional `radius` (validated 1–100) to `readGeographicContext`/`geographicParams` (`lib/geographic-scope.ts:18-26`), pass it into the two `nearbyRecord` calls (`app/api/transport-live/route.ts:13,15`; `app/api/tranzy-live/route.ts:14`), and expose the same 2–100 selector in the vehicles view (`app/transit-workspace.tsx`). Note honestly in the help copy: radius extends the *filtering* distance; it cannot extend TPBI network coverage beyond Bucharest–Ilfov or invent a Tranzy operator for an uncovered locality.
3. **Trains: register honestly** ~15 min copy — copy change stating that the published editions carry planned times only and no positional source exists (extend the existing note at `app/api/trains/route.ts:9` into the workspace help, `app/trains-workspace.tsx`). Optional follow-up (2–4 h, only if the Infofer XML editions actually expose station coordinates — verify first; the current corpus has none, `lib/live/trains.ts:17`): extend `scripts/import-mers-tren.mjs` + `TrainStation` with lat/lon and render station pins via `PublicMap` in `TrainsWorkspace` — **station boards spatially, never fake live positions**. Route polylines: do not exist in any source; not renderable honestly.

**Radius (Bug #2):**

4. **Map-aware page size for the places map** ~1–2 h — Builder; ~30 min — Validator (e2e `e2e/places-workspace.spec.ts` currently asserts the copy at `:43`; add an assertion that pin count grows with radius). Add a validated `pageSize`/`maxItems` param to `/api/places` (`app/api/places/route.ts:8-9`; `lib/places-query.ts:9,21,24` — e.g. 18 for cards, 200 when the map view is active) and request the map-sized page when `view==='map'` (second `useSource` at `app/places-workspace.tsx:67` or a `view`-derived size). The map then visibly responds to the radius (nearest ≤200 pins within the chosen radius), and the total stays labeled.
5. **Radius selector on the national repere map** ~1 h — Builder. Surface the same radius selector next to `RomaniaMap` in `#view=map` (`app/page.tsx:142`), store it with `useLocationState` (`app/location-scope.tsx:7`), and pass it into `localPlaces`'s `nearbyRecord` (`app/page.tsx:105` → `nearbyRecord(p,geo.center,radius)`); make the "raza de 15 km" copy dynamic (`:136,:158`).
6. **Leave the remaining 15 km surfaces as they are** (transit lists, cinema, events, catalog tables): they are connected-network surfaces whose publishers set their own coverage; a radius selector there is scope creep (YAGNI). Raise, don't build.

**Swimlane summary:** Builder: fixes 1–5 (≈5–7 h total). Validator: e2e for 1, 2, 4 (≈1.5 h). Copy/Scribe: fix 3 note (15 min). Specialists recommended if the fixes proceed: `orchestrate-api` (radius param contract touches 3 API routes), `orchestrate-performance` (pageSize 200 chunk reads in `queryPlaces` — bounded batches already exist at `lib/places-query.ts:14-23`), `orchestrate-uiux` only if the radius selector is added to `#view=map`.

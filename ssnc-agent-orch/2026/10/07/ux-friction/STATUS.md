# STATUS — ux-friction session (branch fix/ux-friction-v1)

## Builder Findings (preloads)

**Status: DONE** (preloads scope). Tasks 1–4 complete; all gates green. No git commits made (session rule). The worktree had other agents' concurrent changes (`app/modern.css`, `app/polish.css`, `e2e/mobile-nav-taps.spec.ts`, `e2e/map-markers.spec.ts`) — untouched by me.

### Root cause + fix per resource

**Font `/fonts/InterVariable.woff2` (warning ×3 on live):**
- The preload link in `app/layout.tsx` already had `crossorigin` — the classic missing-crossorigin cause was NOT it. Two real mechanisms combined:
  1. **Double declaration**: React-19 SSR hoists every preload link rendered in the tree BOTH into the HTML head AND into the HTTP `Link` response header (`reactMaxHeadersLength` path in vinext). Live served the font preload twice per response — verified on `https://aflivra.brebu.workers.dev` responses: `<link rel="preload" … as="font" crossorigin>` in the HTML **plus** `link: </fonts/InterVariable.woff2>; rel=preload; as="font"; crossorigin …` in the header.
  2. **Service worker interception**: `public/sw.js` precaches exactly this URL and answers every fetch for it from CacheStorage. In a returning user's real Chrome, the SW-served CSS font load cannot claim the preloaded response → the preload is orphaned → "preloaded using link preload but not used" (reproduced per returning-user state: warmed SW controlling from navigation start). The ×3 count matches a session with multiple loads/double declaration; with every declaration removed it is moot.
- **Fix**: removed the manual `<head><link …/></head>` from `app/layout.tsx` (root layout now renders `<html><body>` only). The font loads once via `@font-face` (`font-display: swap`), instantly from the SW's CacheStorage for returning users. Verified: with the tag removed, BOTH the HTML tag and the `Link` header entry disappear (dev + built worker) — the tag was the single source of both.

**Hero `/media/hero-graphite-blue.webp` (warning on deep links):**
- Root cause: React DOM 19.2 auto-preloads **every eager SSR'd `<img>`** (not only `fetchPriority=high` — verified in `react-dom-server`: exclusion requires `loading="lazy"`, `fetchPriority="low"`, or picture/noscript scope). Hash routing is client-only, so the root layout SSRs the **home** view for every URL; on `#view=domain&id=transport:1` the home hero unmounts at hydration, orphaning its image preload. Live route: React emitted it as `Link: </media/hero-graphite-blue.webp>; rel=preload; as="image"; fetchpriority="high"` — on every response, consumed only on home.
- **Fix**: wrapped the hero img in a bare `<picture>` (no `<source>` — renders and fetches identically, CSS unaffected; all `.hero-photo` selectors are class-based) which opts the img out of the React auto-preload, while `fetchPriority="high"` stays **on the img element itself** — the task's "make the img fetchpriority work naturally without preload". Home loses nothing (the hero is the first body content; the img fetch starts at parse, at high priority); deep links no longer generate a preload orphan (the parser img fetch on the SSR home view doesn't warn and is inherent to hash-SSR routing).
- Considered and rejected: `loading="lazy"` (wrong for an above-fold LCP img, racy on deep links), `fetchPriority="low"` (deprioritizes the real fetch), client-only hero render (post-hydration pop-in on the primary view).

**Audit of the other head preload surfaces** (live HTML + headers, before → after):
- `link rel="modulepreload"` for all framework/runtime chunks — used on every load on every view (client entry executes them). KEPT. One duplicate modulepreload for the entry chunk (`index-*.js` emitted twice, once `fetchPriority=low`) is framework-level (vinext/React shell) and *used*, so no warning; not app-fixable in my partition.
- `link rel="stylesheet"` ×3, icons, manifest — used on every view. KEPT.
- No `as="image"` preload other than the hero; no other `as="font"` preloads.

### Evidence (artifacts in `ssnc-agent-orch/2026/10/07/ux-friction/`)

Headless Chromium cannot surface the browser-internal "preloaded but not used" console text (Playwright console + CDP `Log.entryAdded` both empty — verified), so proof is structural — every channel that could declare the preloads, checked before/after on dev, on the local built worker, and (before only) on live:

| Check | Before (live / dev) | After (dev / prod worker :8787) |
|---|---|---|
| Live `Link` header | font + hero preloads on every response | **absent** (both dev + built worker) |
| HTML font preload tag | present (tag **and** header = double) | **absent** |
| HTML image preload link | present (`as="image" href=…hero-graphite…`) | **absent** |
| Deep-link font fetch | initiator `link` (preload), 1 preload copy in DOM | initiator **`css`** — single fetch via @font-face, 0 preload copies |
| Deep-link hero fetch | initiator `link` (orphan; heroImg absent) | initiator **`img`** (parser fetch of the SSR home hero; no orphanable preload) |
| Home font | `Inter Aflivra:loaded`, body in Inter Aflivra | identical |
| Home screenshot | — | **pixel-identical: 0 / 1,024,000 px differ** (`before-dev-home.png` vs `after-dev-home.png`, `/tmp/pngcmp.py` decode+compare) |

Files: `before-live.json`, `before-live-cdp.json`, `before-dev.json` (console/network/head inventory including `fontPreloadCopies:1`, hero `initiator:link`), `after-dev.json`, `after-prod.json` (post-fix, both environments), `before/after-dev-home.png`, probe scripts (`preload-probe.mjs`, `-cdp`, `-sw`).

### TDD cycle

- **RED**: `e2e/preload-audit.spec.ts` (3 tests) written first; run against unmodified code → **3 failed** exactly on the bug (HTML tag + Link header preloads present; hero fetched via `link` initiator on deep link; fetchPriority assertion). Log preserved in session (`playwright` output, test-results dirs).
- **GREEN**: `app/layout.tsx` preload `<head>` removed; `app/page.tsx` hero img in `<picture>` with `fetchPriority="high"` → **3 passed**.
- **REFACTOR**: investigation disproved the initial "fetchPriority alone triggers the preload" theory (React preloads ALL eager imgs) — assertions revised to the real contract (no preload declarations in HTML/headers/DOM, no link-initiated fetches, font via CSS exactly once) while keeping the same user-facing guarantee. All still green after the revision.

### Gates (run this session, from worktree root)

- `corepack pnpm exec tsc --noEmit` → **exit 0, 0 errors** (one transient error in another agent's `e2e/mobile-nav-taps.spec.ts` disappeared when they fixed it concurrently; my two `initiatorType` typing errors fixed).
- `corepack pnpm lint` → **exit 0, 0 errors, 116 warnings** (budget ≤117; exact count 116).
- `corepack pnpm test:e2e` → **exit 0, 71 passed** (includes the 3 new preload-audit tests; playwright reused my dev server on :5173).
- `corepack pnpm build` → **exit 0**; built worker served locally (`pnpm start`, wrangler :8787) and audited (see table).
- No verify/gate specifically touches layout/head beyond the above (`home-smoke` PWA head assertions pass unchanged; `audit-controls.mjs` still passes — the hero src assertion unaffected).

### Files modified (mine only)

- `app/layout.tsx` — removed manual `<head>` font preload link (source of the double declaration + the orphan under SW).
- `app/page.tsx` — hero img: `<picture>` opt-out of React's SSR auto-preload, `fetchPriority="high"` retained on the img, + one business-rule comment. (Hero only; nav/bottom-nav/public-map/transit surfaces untouched per partition.)
- `e2e/preload-audit.spec.ts` — NEW regression suite (3 tests): no font/hero preload declarations in served HTML/headers, natural img-level priority on home, deep-link fetch audit (no link-initiated fetches, font once via CSS, no page errors).

### Revert Conflicts (LATER VALUE KEPT) / Revert Verification

Not a revert task — no target commit to restore; nothing to record. (No `[revert-guard]` block in the prompt; confirmed N/A rather than skipped.)

### Operational notes

- Found a pre-existing dev server on :5173 (PID 34348, another session's; the context brief said none was running). Used it for the before-capture; it was shut down externally at 05:01 ("Tunnel closed" in its log — graceful, unrelated to my changes; normal 200s until then). I then started my own (`/tmp/alfivra-dev-builder.log`) and killed **only mine** (top-level + children; the other agent's `wrangler --remote --port 8799` left untouched).
- The literal console warning text is browser-internal and not capturable by Playwright/CDP in headless; the fix removes every declaration that can produce it (verified across HTML, response headers and DOM post-hydration), and the deployed worker will pick it up on next deploy — nothing was committed or deployed in this session.

## Builder Findings
(Reserved header per output contract — findings for this scope are recorded above under the task-assigned section.)

## Debugger Findings (bottom nav taps)

**Issue (verbatim):** "pe mobil, pe bara de jos de obicei când trec din categorii sau alte pagini
încărcate și dau click pe bara de jos nu merge din prima, trebuie să dau de mai multe ori" — on
mobile, after switching into categories / loaded views, the first tap(s) on the bottom bar are
ignored; only repeated taps register.

### Root cause (two compounding, both app-level, both in my partition)

1. **Dead hit band at the base of the bar** — `app/polish.css:19` (mobile ≤640px block) puts the
   safe-area padding on the **nav**, not the buttons: `.v2 .vbottom-nav{padding:8px 8px
   calc(8px + env(safe-area-inset-bottom))}` while buttons end at `min-height:60px`. The band below
   the buttons is `8px + env(safe-area-inset-bottom)` tall — **8px in emulation, ~42px on a real
   iPhone** (34px home-indicator inset) — roughly half the bar height. A thumb landing there
   produces a click on the `NAV.vbottom-nav` root (no onClick → `go()` never runs) → tap truly
   ignored. Proven: `elementFromPoint(nav.bottom-4)` returned `NAV.vbottom-nav`, `onBtn:false`,
   hash unchanged; RED spec leg received `Expected: "dashboard", Received: "saved"` after a
   low-band tap.
2. **Confirmation feedback hostage to the heavy view commit** — `app/page.tsx` renders the whole
   SPA in one component; the nav's `.active` class, `data-view` and the destination view all land
   in **the same React commit**, which at phone-class CPU blocks the main thread ~0.8–1.2s per
   navigation (measured @4× throttle: tap→click 112ms, click→`.active`+view flip **+833ms**;
   longtasks up to 1.19s, docs 52k px tall). The bar buttons have **no `:active` style at all**
   (only `[data-slot=button]` and `.chip-row` buttons get one in `modern.css`) and
   `-webkit-tap-highlight-color:transparent` is set globally → zero perceptible acknowledgement
   until the giant commit lands. Users read 1–3s of nothing as "the first taps were eaten" and
   re-tap — the reporter's exact words.

Secondary (engine-level, documented, not app-fixable): on iOS Safari a tap landing while the tall
page still has scroll momentum is consumed to stop the scroll (tap-to-stop-scroll) — one genuinely
eaten first tap in the wildest case. Every successful tap now answers instantly (see fix), so the
symptom no longer compounds.

Evidence excluded by probes: nothing ever overlays the bar (elementFromPoint sampler at 30ms
cadence, 0 covered samples across all flows — no scrim/gesture-layer/leaflet element above it,
z-index 40 holds); no `startViewTransition` usage; no 300ms tap delay (meta viewport correct);
clicks never retarget during re-renders (bar buttons are outside the route conditionals and keep
their DOM nodes).

### Fix applied (minimal, 3 pieces)

- `app/page.tsx` — **deferred mount of the heavy view** (the mission's "defer-mount"): added
  `const dRoute=useDeferredValue(route),dEntity=useDeferredValue(entity);` after `openDomain`
  (on its own line between the state cluster and `useExperienceMotion`); `<main data-view={dRoute}>`
  and all 14 view conditionals inside `<main>` read `dRoute` (lines 106–148, incl. line 128's
  `map` conditional — prefix token only, map wiring untouched, disjoint from the map agent);
  `place`/`domain` lookups and `CompanyView key={entity}` read `dEntity`;
  `useExperienceMotion(prefs.motion,dRoute,dEntity)` so the reveal scan runs when the deferred
  content actually mounts. The bottom nav (line 149), header nav and footer keep live `route` —
  the urgent commit is tiny and answers the tap immediately; the old view stays visible while the
  destination renders as a transition (intermediate hammer-taps collapse instead of mounting
  serially).
- `app/polish.css:19` (mobile block) — buttons now `position:relative` plus
  `button::after{content:'';position:absolute;left:0;right:0;bottom:calc(-8px - env(safe-area-inset-bottom));height:calc(8px + env(safe-area-inset-bottom))}`
  — the safe-area band below each button belongs to that button (pseudo-element hit-testing
  resolves to the origin button). Zero layout change; taps in the band resolve to the button.
- `app/modern.css:8` — instant pressed feedback next to the active rule:
  `.v2 .vbottom-nav button:active{color:#0d356c;background:#edf1f7;transition:none}` (matches the
  `.active` visual; `transition:none` only while pressed — press paints instantly even on a busy
  main thread because :active applies at touchstart; release fades via the base `.v2 button`
  transition).

### Verification (RED → GREEN, gates, probes)

- **RED before fix** (all three legs failed for the right reasons): low-band elementFromPoint hit
  `NAV`; `activeBeforeView` showed the bar highlight landed in the same commit as the view
  (`Expected: "domain", Received: "dashboard"`); low-band tap left `data-view` at `saved`.
- **GREEN after fix** — `e2e/mobile-nav-taps.spec.ts` (new suite leg, real mobile emulation
  390×844/isMobile/hasTouch, 3 tests): every button covers the full bar height incl. the safe-area
  band; after entering a category the first bar tap highlights in < 300ms under 4× CPU throttle
  while `data-view` still shows the origin view, and the destination arrives + renders; a full
  left→right tour plus low-band taps navigates every time (5/5 clicks on buttons, low-band taps
  included).
- **Full suite:** 71 passed, 0 failed (68 pre-existing + 3 new legs).
- **Gates:** `tsc --noEmit` → exit 0 (**0 errors**; two transient errors in
  `e2e/preload-audit.spec.ts` appeared and were fixed by the parallel preload agent mid-session —
  not my surface, verified standalone-compilable and 0 in the final run). `pnpm lint` → **0
  errors, 116 warnings** (≤117 baseline; my CSS/page.tsx/spec added 0).
- **Probe transcript (post-fix, 4× CPU throttle, 3 iterations × 4 reporter flows):**
  `test-results/probe-nav-taps-postfix.json` — **51 bar taps, 0 ignored** (incl. low-band taps;
  pre-fix the band taps were structurally ignored and feedback lagged the whole commit). Tap→click
  +1…12ms; first bar-active flip +128–349ms (worst case, mid-heavy-render origin view) vs **+833ms
  pre-fix** at identical throttle; `activeWhileOldView` = the origin view every time (decoupled
  commit proven). Screenshots: `test-results/probe-nav-bar-mobile.png` (390×844@3x, bar visible),
  `test-results/mobile-nav-bar.png`.

**STATUS: RESOLVED — root cause: (1) safe-area padding owned by the nav instead of the buttons
left a dead ~42px tap band above the home indicator, and (2) the bar's nav feedback was held
hostage to the multi-second single-commit render of the destination view (no :active, .active
applied only in the same commit); fixed by ::after hit-area extension + instant :active style +
useDeferredValue route/entity (deferred view mount) in my surface; RED→GREEN proven, full suite
71/0, tsc 0, lint 0 errors. Engine-level iOS momentum tap-swallow documented as secondary.**

## Performance Findings

**Report:** "mi se pare lentă interfața, greoaie" on mobile. **Status: ISSUES FOUND — 7 bottlenecks; 1 fixed at the build/media tier (cold-load −41.3%), 6 registered for app-code owners below.**

### 1. Mobile measurement (iPhone 13 emulation 390×844 DPR3, CPU×4 via CDP, SW cold, single cold load + hash-route view entries)

| Metric | local dev :5173 (unbundled) | local built worker :8787 (before fixes) | live (current deploy) | owner-visible symptom |
|---|---|---|---|---|
| TTFB (HTML) | 35 ms | 24 ms | **1510 ms** | white screen on every open; curl breakdown: connect+TLS ≈110 ms, **1.0–1.4 s is live Worker SSR compute** (the 195 KB home shell renders in 18–24 ms on the local worker) |
| DCL / load | 689 / 764 ms | 77 / 362 ms | 1900 / 1970 ms | long blank tab |
| LCP (hero img every time) | 684 ms | 276 ms | **1924 ms** | hero paints late |
| JS decoded at load | 7028 KB / 119 files | **1990 KB / 9 files** | 1990 KB / 9 files | "greoaie": ~2 s TaskDuration before the app feels alive |
| CSS decoded | 597 KB | 364 KB (73 KB gz wire) | 364 KB | — |
| HTML decoded | 214 KB | 195 KB (27 KB gz) | 195 KB | SSR home view = 179.7 KB markup, 26 imgs in the shell |
| Images+font at load (7 files) | 1161 KB | **1161 KB** | 1161 KB (wire ~1.1 MB — webp/font don't compress) | every open pays for it |
| Longtasks >100 ms cold (max) | 5 (559 ms) | 4 (471 ms) | 3 (471 ms) | janky first scroll |
| Script/TaskDuration (CPU×4) | 1.92 / 3.21 s | 0.91 / 2.01 s | 0.91 / 2.0 s | hydration+mount cost |
| Bottom-nav tap→.active (post-hydration) | — | 3–45 ms | 7–47 ms (first tap after load 534–569 ms while hydration tail runs) | the debugger's useDeferredValue fix holds; first-tap gap = remaining JS weight |
| places view enter (flip / data) | 1113 ms / 252 KB | 577 ms / 122 KB | 542 ms / 122 KB | decent |
| **transport domain enter (data)** | 323 ms / **2.86 MB** | 51 ms / **2.86 MB** (243 KB gz live) | 29 ms / 2.86 MB | every "transport" open pulls manifest.json 1664 KB + network.json 1193 KB |
| **map view, 12 000 px scroll** | 0 KB* | **250 req / 33.2 MB** | **250 req / 33.2 MB** | scroll load spirals; *dev run rendered no pin-photos (local places state differs) |

Artifacts: `m-local-dev.json`, `m-local-prod.json`, `m-local-prod-after.json`, `m-live.json`, `after-perf-home-mobile.png`, probe `after-audit.mjs` (all in this session dir).

### 2. Top offenders (ranked by user-felt impact, evidence)

1. **Map view scrolls 33.2 MB of photos in 250 requests** — `app/page.tsx:129` `.map-result img` renders every `localPlaces` row with a **1280–1400 px, 150–350 KB file into a 43×43 CSS px (~129 device px) thumbnail, eagerly (no loading="lazy", no srcset)** → ~30× oversampling. Measured built+live: 250 req / 33.19 MB vs dev-run baseline without photos. REGISTERED (page.tsx map wiring = map agent's surface).
2. **1.99 MB of eager JS on every load on every view** — `live-data-23br4P9P.js` is **1,140 KB and contains recharts** (statically imported `DataChart` via `app/v2-charts.tsx:4` ← `app/live-data.tsx:6` + `app/page.tsx:19`), modulepreloaded by the shell for every hash route incl. places/legal/saved where no chart renders. Contributes the 0.91 s ScriptDuration @4× CPU and the 534–569 ms first-tap gap on live. REGISTERED (app code — lazy `import()` of DataChart/RomaniaMap).
3. **Transport domain-enter pulls 2.86 MB of JSON (243 KB gz live)** — `app/transit-workspace.tsx` fetches `/transit/manifest.json` (1664 KB; 1663 KB of it is `tripRoutes`, unused client-side beyond lookups of `routes`/`counts`/`fetchedAt`) + `/transit/network.json` (1193 KB) on every entry. REGISTERED (transit surface).
4. **Cold-load static weight 1784 KB wire / 3711 KB decoded** — font 344 KB (full Latin+Greek+Cyrillic variable font at `app/globals.css:23`, single @font-face, no subsetting), hero 311 KB at 1864 px into a 390×556 CSS slot, 5 rail covers 507 KB at 1672 px into 356×180 CSS slots. **FIXED (mine) — see §3.**
5. **Live TTFB 1.0–1.4 s = SSR compute** — the live Worker renders the whole home view (179.7 KB markup, 26 imgs) per request; the identical local build renders it in 18–24 ms. REGISTERED (SSR architecture: shell caching / streaming / view-splitting).
6. **page.tsx:73 fetches `/media/manifest.json` (1.04 MB decoded, 122 KB gz) on every hydration** for lightbox photo/video credits (`assets` state used only when a lightbox opens). REGISTERED (lazy fetch on first lightbox open).
7. **HTML+CSS payload: 195 KB SSR shell + 364 KB CSS decoded (73 KB gz)** — inherent to the single-component SPA; part of #2/#5's view-splitting work. REGISTERED (bundled).

### 3. Fixed at my tier (build/media), before → after (same probe, built worker, DPR3)

| Fix | Before | After | Δ |
|---|---|---|---|
| Variable-font subset (in place, same URL; Latin+Latin-Ext-A/B+punct/currency, both axes kept) | 344 KB | **165 KB** | **−52%** |
| Hero width variants 960w/1170w (object-position-aware crops, left=round((1864−w)·0.59)) + srcset/sizes gated `(max-width:640px) 100vw, 1170px` | 311 KB fetched (1864 px) | **133 KB** (1170 variant) | **−57%** |
| 16 AI-illustration 960w variants + cover srcset/sizes (`sizes="(max-width:640px) 92vw, 25rem"`) | 507 KB (5 covers at load) | **130 KB** | **−74%** |
| Images+font at cold load | 1161 KB | **423 KB** | **−63.6%** |
| Home full-scroll image weight | 2094 KB | **591 KB** | **−71.8%** |
| **Total cold-load wire (HTML+JS+CSS+img+font, local worker)** | **1784 KB** | **1048 KB** | **−41.3%** (decoded 3711→2978 KB, −19.8%) |

Correctness proof, not just numbers:
- Font: advance widths identical to the full font at 12/15/24/43 px for weights 400/500/700 (canvas measureText, all five probe strings equal); pixel diff vs full font (6.4% >24δ) equals the **same-font control diff (6.4%)** — pure vertical-grid rasterization noise. Browsers fall back per-glyph for any codepoint outside the subset. [A 104 KB opsz-instanced variant was built and **rejected**: identical metrics, but pinning opsz changes display-size typography.]
- Hero: offset-search best fit dx≈2 device px, MAD 1.94/255 — same visible slice under `object-position:59% center`, differences are re-encode noise. The 59%-fraction crop identity `left=(srcW−varW)·f` holds for every DPR.
- Provenance registers extended: every variant carries bytes+SHA-256 in `hero-style.json`/`category-illustrations.json`; `verify-media-budget.mjs` now claims + hash-proves variants and asserts the render wiring offers them (register↔render contract).
- SW: `aflivra-static-v19` (font bytes changed; cache-first fetch path must not serve the old 344 KB file to returning users).

### 4. Registered for app-code owners (do NOT re-implement here)

1. **recharts lazy-load** (`app/v2-charts.tsx` / `app/live-data.tsx:6` / `app/page.tsx:19`) — dynamic `import()` for `DataChart` (+`RomaniaMap` if desired): live-data chunk ~1.14 MB → ~200–300 KB; biggest single hydration win (~500–600 KB gz off every load).
2. **Map sidebar thumbnails** (`app/page.tsx:129`): add `loading="lazy"` + srcset on `.map-result img`; needs a ~270 px variant tier for the wlm-*/explore-* corpus (the variant pipeline script `scripts/build-media-variants.mjs` now exists as the template — extend it, and the gate claims, for that tier). 33.2 MB → expected ~2–3 MB per full scroll.
3. **`/media/manifest.json` lazy fetch** (`app/page.tsx:73`) — fetch credits on first lightbox open instead of every load.
4. **Transit payload split** (`app/transit-workspace.tsx` + `scripts/import-transit.py`): 2.86 MB on domain-enter; `tripRoutes` (1.66 MB) is not needed client-side in full.
5. **Live SSR cost** (vinext/server): cache or stream the home shell; live TTFB 1.0–1.4 s vs 18–24 ms locally on the same build.
6. **View-level code splitting** (architectural): `page.tsx` 157-line single component → per-view lazy chunks would cut the 388 KB page chunk + 171 KB live-data.css from first paint.

### 5. Gates (all green, run from worktree root)

- `corepack pnpm exec tsc --noEmit` → **exit 0, 0 errors**.
- `corepack pnpm lint` → **exit 0, 0 errors, 116 warnings** (baseline ≤116, unchanged by my edits incl. the new script).
- `corepack pnpm test:e2e` → **71 passed, 0 failed** (incl. the 3 preload-audit tests — font URL/same CSS path unchanged; srcset added without touching `src`/`loading`/`fetchpriority`).
- `corepack pnpm build` → green; `scripts/deploy.mjs --dry-run` → **wrangler exit 0** (7569 asset files, 13.3 MB / 4.8 MB gz upload).
- `node scripts/verify-media-budget.mjs` → **green: 683 files (cap 15 500), 610 manifest rows, 676 binaries all claimed — including the 17 new variant files with byte+SHA-256 proofs; census 7447/20 000.**
- `node scripts/audit-controls.mjs` → green.

### 6. Files modified (mine only; nav/layout/view-conditional regions untouched except two additive img attributes)

- `public/fonts/InterVariable.woff2` — glyph subsetting in place (342 996→165 112 bytes, axes preserved).
- `public/sw.js` — precache cache name v18→v19 (audit: precache list itself is tiny — 3 files ≈347 KB → now ≈168 KB; no MB-scale precaching found).
- `public/media/hero-graphite-blue-960.webp`, `-1170.webp`, `illustration-*-960.webp` ×16 — NEW width variants, registered.
- `public/media/hero-style.json`, `public/media/category-illustrations.json` — variant registers (bytes/SHA-256/width/objectPositionX).
- `scripts/build-media-variants.mjs` — NEW repeatable variant pipeline (sharp, deterministic, register-writing).
- `scripts/verify-media-budget.mjs` — extended: variant claims + bytes/SHA proofs + render-wiring assertions.
- `app/page.tsx` — hero `<img>`: `srcSet` + `sizes` attributes only (inside the preload agent's `<picture>`; src/loading/fetchPriority/picture untouched).
- `app/category-photo.tsx` — cover-branch `<img>`: `srcSet` + `sizes` from the register.
- No git commits (session rule). Deploy not run — live numbers above are the pre-fix deploy; the live deltas land on next `pnpm deploy`.

**Bottom line for the reporter:** the nav-latency fix (previous section) already removed the tap-lag; what remains "greoaie" is chiefly the 2 MB eager JS (registered #1/#2), the 33 MB map scroll (registered #2), and the 1–1.4 s live TTFB (registered #5) — plus the −41.3% cold-load weight reduction now shipped at the build/media tier.**

**PERFORMANCE STATUS: ISSUES FOUND — 7 bottlenecks (1 fixed: cold-load −41.3% wire/−19.8% decode, font −52%, hero −57%, covers −74%; 6 registered with file:line). Gates 71/0, tsc 0, lint 0/116, build+dry-run green, media budget green (683 files, 676 binaries claimed).**

## Debugger Findings (pin overlap)

**Issue (verbatim from the live MCP capture):** clicking the Castelul Peleș pin on
`#view=map` times out — `<circle r="3">` from `<g aria-label="Selectează Mănăstirea
Sinaia" transform="translate(338.50,314.55)">` "subtree intercepts pointer events",
with Peleș at `translate(338.12,314.17)` (Δ≈0.4 svg units). Follow-up of the
"Raised (not fixed)" pin-overlap item from the map-markers wave.

### Root cause (three compounding, all local, all in my partition)

1. **Sub-pin-size stacking with paint-order hit-testing.** `RomaniaMap`
   (`app/v2-charts.tsx` — not `public-map.tsx`: that file renders the leaflet transit
   map; the `#view=map` pins are the hand-drawn SVG `g.map-pin` set) projects each pin
   with `(lon−20)×61, (49.1−lat)×84` and relied on **per-`<g>` onClick**, so selection
   follows SVG paint order. The Sinaia cluster stacks **three genuinely distinct
   places** — Castelul Peleș ↔ Castelul Pelișor (309 m, Δ0.24u) ↔ Mănăstirea Sinaia
   (700 m, Δ0.54u) — inside one r=11 pin disk. Mănăstirea Sinaia paints last (OSM order
   v2-model.ts:165: editorial first, exploration.json after), so its `<circle r=3>`
   intercepts every click aimed at the other two. Both overlap and pin size scale with
   the same `scale(zoom)` transform and max zoom is 2.8, so **zoom can never separate
   them** (separation/diameter ratio is scale-invariant: need zoom ≈ 22/0.54 ≈ 41×) —
   a collision-offset scheme could not converge within this map's range.
   Measured at desktop (CTM 1.281 px/u): the trio is **0.3–0.7 CSS px apart** —
   pointer events land on integer pixels, so the stack is *sub-pixel* and no tap can
   discriminate it; the honest pointer contract is deterministic
   nearest-pin-to-clicked-point.
2. **True same-place duplicates in the merged set** (editorial + OSM, `v2-model.ts:165`
   `[...originalPlaces,...expandedPlaces]` = 273 entries): Ateneul Român (ed 'ateneu' ↔
   osm-w16291602, 3 m), Castelul Bran (ed ↔ osm-r3300200, 19 m), Grădina Botanică
   (osm-n2634651900 ↔ osm-w23557199, Bucharest, 245 m), Podul lui Traian
   (osm-n1419098099 ↔ osm-r20620026, 973 m), Salina Praid (osm-n2180418244 ↔
   osm-w1308097888, 880 m) — the same monument split into an OSM node plus its way or
   relation — and Izbucul Bigăr (osm-n2295508687) 147 m from Cascada Bigăr
   (osm-n2295508683): the spring feeds that one waterfall (two names for one visiting
   site). The editorial duplicates (Ateneul, Bran) painted UNDER their OSM twins: two
   identical-label pins and sidebar rows, the top one uneditable-invisible.
3. **Sticky/fixed band interception of scroll landings.** The app header
   (`position:sticky;top:0;z-index:35;background:rgba(255,255,255,.937)+blur(18px)`,
   76–84 px) and the mobile bottom nav (fixed, 97 px) cover pins that
   `scrollIntoViewIfNeeded` lands at the viewport edges: on mobile 390×844 the cluster
   pin landed at y=824 **under the bottom bar — the tap was swallowed entirely** (probe
   `probe-pin-overlap-before.json` leg C: no navigation at all). No z-index/pointer-events
   change on the map can honestly fix this (the bands must own their area; the header
   is near-opaque under blur(18px)); `html` had `scroll-padding-top/bottom: auto`, so
   programmatic scrolls did not reserve the bands.

### Fix applied (minimal, 3 pieces)

- `app/v2-model.ts` (merge point) — **one pin per physical place**: the merged set now
  drops an entry that repeats an already-kept place **under the same normalized name
  within 1 km** (name equality + proximity = same attraction seen twice; distance is
  required so same-name museums in different cities — Muzeul de Artă ×3,
  Muzeul de Etnografie ×2 — correctly survive), with the editorial set always kept and
  one attested alias: `izbucul bigar → cascada bigar` (the spring/waterfall site).
  **6 duplicates dropped, 273 → 267 rendered pins.** Kept: editorial Ateneul+ Bran;
  first-in-file OSM entry for Grădina Botanică, Podul lui Traian, Salina Praid,
  Cascada Bigăr.
- `app/v2-charts.tsx` (`RomaniaMap`) — **nearest-pin-to-point resolution** at the svg
  layer: the per-`<g>` onClick is removed (role/button/tabIndex/aria-label/Enter-key
  handler stay — keyboard activation of a covered pin keeps working), one `onClick` on
  the `<svg>` inverse-maps the click through `getScreenCTM()` into map units and
  selects the nearest pin inside `tol = max(12.5×zoom, 24 CSS px)` — at least the drawn
  disk at any zoom plus a fixed 24 px touch slop (≈39 map units at 390 px width, a
  ~48 px effective tap target on phones, where the drawn disk is ~13 px). Outside the
  tolerance nothing is selected. A press→click movement guard (>5 px) stops a pan drag
  that ends over a pin from selecting it. Deterministic: strict `<` keeps the first
  (editorial-before-OSM) pin on exact ties.
- `app/globals.css` — `html{scroll-padding-top:96px;scroll-padding-bottom:130px}` so
  scrollIntoViewIfNeeded/hash landings reserve the sticky header and the mobile bottom
  nav bands.

### Verification (RED → GREEN, probe, gates)

- **RED (final legs, app fixes stashed)**: 4 failed for the right reasons — Corvinilor
  pixel click opened **Parcul Dendrologic Simeria** (12.09u apart, Simeria's disk covers
  Corvinilor's centre and paints on top); the sub-pixel-cluster leg failed (pre-fix every
  cluster click opened the top-painted Sinaia); duplicates rendered (273 pins, Ateneul
  ×2, Izbucul Bigăr present); mobile tap swallowed by the bottom bar (no navigation).
  The earlier RED run of the first formulation additionally captured the live smoking
  gun locally: **clicks at Peleș and Pelișor centres both opened Mănăstirea Sinaia**.
- **GREEN**: `e2e/map-markers.spec.ts` extended from 2 to **9 legs**, all passing:
  2 originals + overlap-pair clicks (each pin of the Corvinilor↔Simeria pair opens
  itself at its own pixel) + sub-pixel cluster (for each of Peleș/Pelișor/Sinaia, an
  integer pixel that no other of the 267 pins is nearer to opens that place, twice per
  pixel — determinism) + keyboard-activation of the covered Peleș pin + far-click
  no-op guard (>22u from any pin selects nothing) + one-pin-per-place inventory
  (267 pins; the 5 same-name + Bigăr-alias pairs single; Izbucul gone; sidebar uniques;
  trio all present) + mobile 390×844 touch: the cluster tap navigates to one of the
  trio, identical across 3 repeats.
- **Probe** (`probes/probe-pin-overlap-{before,after}.json`): before — 273 pins,
  Sinaia's r=3 dot on top at Peleș centre, mobile tap swallowed; after — 267 pins,
  duplicates collapsed (remaining same-name labels are genuinely different-city
  museums), clicks resolve to the pin nearest the clicked pixel (all cluster clicks
  open cluster members; the deterministic per-pin proof is the e2e owned-pixel legs),
  `scrollPaddingTop: 96px` live and the scrollIntoViewIfNeeded-landed pin sits at
  y=419 clear of both bands (was y=824 under the bottom bar).
- **Gates**: `tsc --noEmit` **0 errors**; `pnpm lint` **0 errors, 116 warnings**
  (baseline ≤116, unchanged); `pnpm test:e2e` **78 passed / 0 failed** (71 pre-existing
  + net 7 new map legs); `verify-model-contracts`, `verify-sweep-inventory`,
  `verify-exploration-media`, `verify-expanded` all **exit 0 untouched-green** (they pin
  the raw exploration.json + records corpora, which this change does not touch —
  exploration-media itself re-states "editorial 6 + 267 = 273" raw, the dedup is
  runtime-only at the v2-model merge); `pnpm build` green.

### Conventions applied

**Source:** `.specify/memory/conventions.md` — **absent in this repo** (checked before
coding; no conventions file exists, so the repo's own CLAUDE-level conventions were
followed: business-rule comments only, no ticket IDs in code, one focused change per
surface, regression test first).

### Files modified (mine only)

- `app/v2-model.ts` — duplicate suppression at the editorial+OSM merge (business-rule
  comment + attested alias), pins 273 → 267.
- `app/v2-charts.tsx` — `RomaniaMap`: svg-level nearest-pin-to-point click resolution
  with zoom/disk-aware tolerance + touch slop, pan-drag guard; per-pin keyboard
  activation kept; per-pin onClick removed.
- `app/globals.css` — `scroll-padding-top/bottom` on `html` (sticky header + mobile
  bottom-nav band landings).
- `e2e/map-markers.spec.ts` — 7 new legs (overlap pair ×2, sub-pixel cluster
  determinism, covered-pin keyboard, far-click guard, one-pin-per-place inventory,
  mobile cluster tap).
- `ssnc-agent-orch/2026/10/07/ux-friction/probes/probe-pin-overlap.mjs` +
  `-before.json` + `-after.json` + `pin-overlap-{before,after}-mobile-tap.png`.

**STATUS: RESOLVED — root cause: (1) three genuinely distinct places of the Sinaia
cluster stack inside one pin disk at every reachable zoom and selection followed SVG
paint order (the top-painted Mănăstirea Sinaia intercepted every click aimed at Peleș
and Pelișor), (2) the merged editorial+OSM set carried 6 true same-place duplicates
rendering stacked or invisible twin pins, (3) scroll landings under the sticky header /
mobile bottom nav swallowed taps; fixed by nearest-pin-to-point resolution at the svg
layer (tolerance = drawn disk ∨ 24 px touch slop, deterministic), name+1 km duplicate
suppression with one attested alias at the v2-model merge (273→267), and
scroll-padding for both bands; RED (4 legs, incl. the live smoking gun reproduced:
Peleș/Pelișor clicks → Sinaia) → GREEN (map spec 9/9, full suite 78/0), tsc 0, lint
0/116, all corpus gates untouched-green, build green.**

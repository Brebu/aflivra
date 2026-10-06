# Design-alignment pass — findings (2026-10-06)

## Scope executed
Systematic layout/behavior audits (Playwright, computed-layout mathematics + a11y snapshots +
interaction probes + raw-HTML + image/font checks) across all hash views (home, explore, map,
place, dashboard, company, money, domain×4, compare, recommendations, saved, planner, about,
catalog) at 1280×800 and 390×844, on the LOCAL dev server, then on LIVE
(aflivra.brebu.workers.dev) and on the ORIGINAL reference deployment
(reper-romania.xywex.chatgpt.site).

## Parity result: ours ≡ original (Chromium, both viewports, evidence-backed)
- Header at 390px: byte-identical geometry/classes/font sizes (brand 250×44 fs28 at l16,
  „Pentru tine" 44×44 at l278, „Deschide meniul" 44×44 at l330).
- Hamburger („Deschide meniul"): WORKS on both — sheet opens, same content.
- Cards/actions navigate to identical hashes (#view=domain&id=local etc.).
- Zero JS console/page errors on both; fonts loaded identically (Inter, count 1);
  0 broken images; tabs-list geometry identical (w358, scrollW356 both).
- Raw HTML: SSR content identical markers, 129k both, diff ≈209 bytes (1 extra script on
  original — ChatGPT Sites analytics/auth).
- earlier false alarms (verified-by-geometry): select-field „jitter" (invisible absolute
  native select overlay), pagination/entity-location „spreads" (midY/bottom alignment
  perfect), place-image „overlapping buttons" (intentional floating save button),
  plan-stop SVG overlap (decorative false positive).

## Real issues found in OUR repo (present on BOTH sites — reference inheritance)
1. Tabs lists on mobile: `w-fit + justify-center + nowrap` → classic center-overflow clip
   on place detail („Planifică vizita"/„Surse" pushed to x>449 on 390px) and wrapping on
   domain views. Confirmed geometry. Fix: small-screen `justify-content:flex-start` +
   overflow scroll (the seam: components/ui/tabs.tsx variants + app/v2.css mobile block).
2. `UNGARIA` SVG label clipped (text 55-62px in 51px box) — app/v2-charts.tsx:25 + map CSS.
3. /downloads/source-packages.json 404 (about view inventory fetch; file is generated,
   not committed) — functional, product decision needed (serve archives vs graceful UI).
4. Minor wraps (pagination row on mobile, panel-top action rows) — polish candidates.

## The user-reported breakage (buttons, hamburger, "alignment") — UNRESOLVED, environment-specific
In Chromium (mobile + desktop geometry, events, screenshots probes), ours behaves identically
to the original the user holds as reference. The user insists ours is visibly broken on their
setup. Missing data: device/browser (iPhone Safari/PWA? Android Chrome? desktop Safari?) and
one concrete screen+symptom. HYPOTHESES (unverified): (a) iOS Safari/WebKit-specific rendering
(Cannot be probed with the Chromium MCP), (b) user's device hit the app during the first
minutes after deploy (edge cert window / empty D1 cache renders), (c) state compounded by the
rate-limit storm below.

## Self-inflicted: API rate-limit storm (user-visible 429/„Limită temporară")
Cause: the comparison batteries loaded both deployments ~40× in minutes; every load
re-verifies live sources under the per-source hourly budgets (open-meteo 400/h, legislation
120/h, anaf 120/h, courts 60/h, ckan 500/h). Budgets exhausted → upstream 429 → the app
serves cached/gated states BY DESIGN („Ultima copie validă rămâne disponibilă"). Budgets
reset hourly; recovery is automatic. Lesson recorded: bulk parity batteries must load
each view ONCE per site and reuse cached API responses (SW or route interception), not
fresh fetches per load.

## Tooling note
The Playwright MCP browser profile lock died mid-battery (race between pkill and server
respawn) — browser probing unavailable until session restart. All further verification to be
done sparingly per the user's explicit request.

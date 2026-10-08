# Formats audit — content-enrichment-ux (Wave A2, point 9)

**Generated**: 2026-10-08 by Builder-B (Wave A2) — the audit pass over every
surface where raw source formats could leak into visible typed rows.

**Principle** (honest disclosure, unchanged): the raw `MetadataFields` panels
("Toate datele publicate de sursă") stay raw by design — they are the contract
with the source. This audit only promotes the **typed** rows to human formats;
it never changes data and never replaces a raw disclosure.

## Method

Full enumeration over `app/*.tsx` surfaces of (a) date/time-ish interpolations
rendered without a typed formatter (`{x.updatedAt}` / `{x.At}` /
`{x.date}`-shaped braces without `dateText`/`weatherDate`), (b) epoch/unix-
seconds or bare-ISO values reaching typed rows, (c) the flight/epoch precedents
(ft→m, kt→km/h, epoch→ISO) for stragglers, (d) the deliberate time-only
displays (`HH:MM` slices) which are a format, not a leak.

## Findings — raw leaks fixed this pass (3 surfaces, display-side only)

| Surface | Was leaking | Fix (alongside the raw disclosure) |
|---|---|---|
| `app/lawyers-workspace.tsx` — typed registry row | the IFEP update stamp `dd-mm-yyyy HH:mm` rendered raw | typed `dateText` reading + the registry's published form kept inline („forma publicată de registru"); new `dd-mm-yyyy[ HH:MM]` shape in `lib/live/date.ts` (registry local wall-clock, no zone shift, structurally-invalid stamps stay raw) |
| `app/live-company.tsx` — identity facts table | `Data înregistrării` and `Interogare fiscală` rendered bare `YYYY-MM-DD` | typed `dateText` on both cells; the raw ANAF response stays disclosed on the fiscal tab (`RegistryFields` renders `data_inregistrare` as published) and in the full export |
| `app/live-company.tsx` — contact tab verification line | `Verificare fiscală: 2026-10-08` bare ISO | typed `dateText` |

Pinned by two new e2e legs in `e2e/sweep-regressions.spec.ts`
("Typed date display on venue facts"): the lawyers row shows the parsed stamp
**and** the registry's published form; the company identity facts render locale
dates while the fiscal tab still carries the raw registry shape. RED against
the unmodified display, GREEN after the fix.

## Verified clean (no action)

- **Typed rows everywhere else** use `dateText`/`displaySourceDate` or
  `weatherDate`: courts (hearings, documents, appeals), events, cinema day,
  stories revision, places (`updatedAt`, extract dates), transit live
  (`observedAt` per vehicle), flights (`observedAt` per aircraft — the loader
  converts epoch-ms to ISO; the UI types it), trains editions, watch events,
  freshness lines, legal consolidation (`versionDate`/`asOf`/`checkedAt`).
- **Deliberate time-only displays** (a format, not a leak): cinema
  `eventDateTime.slice(11,16)` (HH:MM, program hours are the display),
  courts `{h.time}` (published hearing hour), trains `tt` planned times,
  GTFS `readableTransitTime`.
- **Precedents audit, no stragglers**: altitude ft→m and ground speed kt→km/h
  conversions applied on every flights row; epoch values (Open-Meteo
  `time`/`sunrise`/`sunset`, adsb.lol `now`, GTFS-RT header/vehicle timestamps,
  Tranzy seconds-ago) all convert to ISO inside the loaders before rows reach
  surfaces; no non-converted epoch reaches a typed row today.
- **By-design raw panels** (never touched): `MetadataFields` on every surface,
  station `details` blocks in weather, `RegistryFields` fiscal table — the
  source's own shape is the disclosure.

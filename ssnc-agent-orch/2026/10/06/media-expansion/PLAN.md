# Implementation Plan — media-expansion

## Goal
Galleries with real photos/clips everywhere, live vehicle headings on the map, justice registries (notari + experți), CFR train timetables — then Wave 2 (flights, shelters-related UI, spectacole calendars, orthophoto, ANL/ANCPI layers).

## User decisions (2026-10-06, binding)
- Tranzy key-gated integration: YES — user registers the free key (pending); integration ships env-gated
- Imobiliare: honest layers only (ANL programs + ANCPI mortgage stats via CKAN); NO scraping of TOS-restrictive portals
- Storage: ASSETS only for now (R2 only past ~20k files)
- Evidence base: ../media-expansion-analysis/{ANALYSIS.md, RESEARCH.md} (also under 2026/10/06/media-expansion-analysis)

## Waves
- **Wave 1a (parallel, disjoint)**: A=media scale (Commons extmetadata pipeline widening + WLM curation from own CKAN snapshot, ASSETS budget respected, license gates, true-or-honest image everywhere); B=vehicle headings/speed/occupancy on live map + OSM shelters/rest-areas/refuges corpus ingest; C=justice registries (notari grid Ordin 177/C/2024 + experți judiciari/tehnici/traducători CKAN) + CFR mers-tren family (9 operators XML) with domains/tabs/federated wiring (single writer of shared registration files)
- **Wave 1b (serial)**: DevOps battery/CI/sweep-inventory/parity alignment + Tranzy env-gated wiring + README
- **Wave 2 (next)**: adsb.lol flights + BIA ghRelayed + spectacole calendars + AIGA orthophoto + ANL/ANCPI layers

## Quality targets
e2e green and growing · battery all exit 0, zero continue-on-error · tsc 0 · lint 0 errors (≤113 warnings) · ASSETS: ≤20,000 files, per-file <25 MiB, deploy size delta measured+reported · Commons ingest rate-polite (existing discipline)

# Session Provenance

## Metadata
- **Session**: search-ux-validation-pass
- **Started**: 2026-10-06 (afternoon)
- **Invoking skill**: direct /build (post-/analyse)
- **Branch**: fix/search-ux-validation-v1
- **Worktree**: /Users/cbrebu/Projects/alfivra
- **Jira**: (none)

## Original Prompt

Verbatim user directives (translated to English for the record; originals in Romanian):

1. "I want the search ones — Castelul Peleș, Brașov etc. — to redirect exactly where they should, because currently they don't send correctly."
2. "Then take every page and every element and where there's download-as-PDF see what it downloads and make it consistent and useful; if not, it is not needed."
3. "Consider yourself a user, a person who wants to use this app... why would you use it? for notifications if something changes, alerts if a dosar completes, news in an area of interest, a company's data updates... I want parsing and display to be grammatically perfect, no glued words, no ugly writing. Validate that I can access all resources and get no 500s — but when I open them in the browser they work."
4. (latest) "Remember: take every category, every subcategory, every element — if it downloads from the source and gives a 5** error, why? Validate that the source gives the same error when tried separately; if not, the problem is ours. I want perfect UI/UX, results visible, everything beautifully arranged — a dream design, arranged and aligned. Together with what you find now and what's above, start the implementation."

## Clarifying Exchange
(Requirements taken from the /analyse session synthesis — ssnc-agent-orch/2026/10/06 analysis agents, both
reports — plus the direct directives above. Notifications remain deferred to a future /brainstorm per the
analysis recommendation; this build covers the five concrete fix areas.)

## Final Scope Summary
- Semantic chip/typed search routing + region matching + geo-gating fixes
- Romanian plural helper (~15 sites) + missing-value phrase unification
- Downloads honesty: remove broken zip inventory, surface real PDF guides, footer relabel, README links
- scripts/verify-source-errors.mjs: app-route-vs-direct-source 5xx parity (budget-aware)
- UI/UX polish: UNGARIA clip + post-fix visual re-audit findings

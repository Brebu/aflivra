# /analyse + build — datasets-modals-packaging (user-approved, blanket: "toate, nu te mai oprești")

1. dialogurile se închid prematur (fetch/refresh în spate) — ROOT CAUSE (Architect): geo.key
   cuantizat ~100m din watchPosition drift → useLocationState reset + 6 efecte de reset
   (record-workspace:19/21/23, transit-workspace:62, cinema-workspace:23, catalog-workspace:16,
   events venue :34) închid dialogul + pornesc refetch-urile. FIX: cheie semantică de zonă
   (localitate/județ) în reseturi; cheia-celulă rămâne doar unde coordonatele contează (rază, viewKey).
2. locația mea efectivă pe hartă (cerință nouă, user): strat „ești aici" pe PublicMap — punct
   + cerc de precizie din position real, doar în browser, nimic persistat.
3. XML la resursele de date: strat de tabel în parseResource (rând-dominant + atribute/copii
   dot-path) pe tokenizer-ul source-xml.ts (Xxe păzită), normalizare formate (XML., XSLX...),
   netabelabilul rămâne document onest; ~46% din inventar e XML.
4. Packaging M1 repo-only: assetlinks serving-proof + scaffold, proiect Bubblewrap + poarta
   verify-twa (targetSdk 36), CI AAB unsigned (repo public = gratuit), graphic 1024×500,
   A2HS/iOS install-hints + ghid. M2 Play = user consolă (cont existent). M3 iOS store = $99/an,
   recomandare A2HS — decis de user la punct.

House: fără README/pr-validation.yml direct de la builderi (orchestrator la exit); without new crons
(cap 5 înghețat); battery registration via STATUS; politeness ledger; probe locale, nu de producție.

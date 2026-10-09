# iOS — „Adaugă la ecranul principal" (fără App Store)

Aplicația e instalabilă azi, fără magazin și fără a conta Apple Developer:

Pașii sunt afișați și în aplicație: **Despre → Ghidurile platformei → „Aplicația iOS · din Safari”** — cardul care spune gestul exact (Safari → Distribuie → Adaugă la ecranul de start), fără link fals de descărcare.

1. Deschide `https://aflivra.brebu.workers.dev` în **Safari**.
2. Butonul **Distribuie** (pătratul cu săgeata în sus) → **Adaugă la ecranul
   de start**.
3. Iconița Aflivra apare între aplicații; aplicația pornește fără barele
   Safari (`appleWebApp` capable + iconița 180×180 sunt deja conectate în
   `app/layout.tsx`).

## Notificările funcționează fără App Store

Web Push pe iOS **16.4+** pentru aplicațiile web instalate pe ecranul de
start — exact fluxul VAPID pe care Aflivra îl folosește. Abonarea se face în
„Ce urmărești" din aplicație, ca oriunde.

# Decizia de 99 USD/an — rămasă la utilizator

Magazinul Apple pentru această formă are risc real de respingere
(App Review 4.2 — „repackaged website", 4.2.7(e) — „thin clients"), iar
mitigarea înseamnă funcționalitate nativă reală (tab bar nativ, widget-uri,
App Intents) — proiect de produs, nu de ambalare. Apple însăși indică web-ul
pentru acest caz. Recomandarea de până acum: fără magazin, A2HS oficial.

Dacă devii necesar: cont Apple Developer 99 USD/an → TestFlight/Ad Hoc
(100 dispozitive) rămân mijlocul onest; App Store doar cu plan de valoare
nativă și buget de respingere.

# Indiciul în aplicație (stare)

Un indiciu iOS specific există deja lângă notificări: `app/watch-center.tsx`
(„Instalează aplicația și activează notificările: meniul Safari → Adaugă la
ecranul de start"). Un indiciu general de instalare pe home (nu doar la
notificări) rămâne de conectat de orchestrator — suprafața existentă e
`watch-center.tsx`, în proprietatea ferelor de dialog.

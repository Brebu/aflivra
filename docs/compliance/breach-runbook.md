# Registru de reacție la incidente de securitate a datelor — art. 33/34 GDPR

Operator: Aflivra (operator individual, România) · Contact operator: [contactretetesecrete@gmail.com](mailto:contactretetesecrete@gmail.com)
Notificare ANSPDCP: https://www.anpdcp.ro/ (formularul de notificare a unei încălcări a securității datelor) — **maximum 72 de ore** de la conștientizare (art. 33 GDPR).
Ultima actualizare: 7 octombrie 2026.

## 0. Ce poate părea incident, dar nu este (verificat înainte de orice escaladare)

- **Jurnalele turei programate** (`watch_sweep_state_write_failure`, `watch_push_error`, `watch_push_failure` — `lib/live/watch-sweep.ts`, `lib/live/web-push.ts`) sunt evenimente tehnice, fără implicare de date. Se tratează ca defecțiune, nu ca incident.
- **Curățarea abonamentelor la 404/410** (`web-push.ts:71`) este funcționarea normală a aplicației.
- O eroare a sursei publice (5xx de la ANAF/portal.just etc.) nu atinge datele utilizatorilor.

## 1. Detectare

| Canal | Ce se vede | Unde se verifică |
| --- | --- | --- |
| Alerte ale platformei Cloudflare (email la contul operatorului) | anomalii de trafic, erori Worker, evenimente de securitate | tabloul de bord Cloudflare — Workers Analytics + Security Events |
| Starea turei de urmărire | `lastOk: false`, `failed`/`degraded` crescute, note de tură | `watchSweepPublicState` (`lib/live/watch-sweep.ts`) — vizibil și în aplicație; detaliile în înregistrarea `sweep:watch` din D1 |
| Semnalarea unui utilizator | orice semnal la contactretetesecrete@gmail.com | căsuța de email a operatorului |
| Observație proprie | modificări neașteptate în D1 / .dev.vars / reguli de deploy | `wrangler d1 execute aflivra --remote --command "SELECT COUNT(*) FROM watch_items"` (și `watch_events`, `push_subs`) |

**Conștientizarea** = momentul în care operatorul are un indiciu rezonabil că s-a produs o încălcare — de la el curge termenul de 72 de ore, nu de la confirmarea completă.

## 2. Evaluare (sub 24 de ore de la conștientizare)

Se răspunde în scris, în acest registru (tabelul de la §5), la întrebările art. 33(3):

1. **Ce categorii de date?** Înventarul real este limitat la: `watch_items` (referințe publice urmărite), `watch_events` (titluri/descrieri schimbări), `push_subs` (adrese de abonament + chei publice de criptare per browser), identificatorul anonim de instalare. **Nu există** nume, conturi, parole, emailuri, poziții precise (nicio coloană de poziție — `drizzle/0000_thin_demogoblin.sql`) sau date de plată.
2. **Câți subiecți?** Numărul de instalații atinse = numărul de `install_id` distincte implicate.
3. **Cauza și amploarea** (ce rânduri, ce interval, citite sau modificate, expuse terților?).
4. **Efecte probabile asupra persoanelor** — de exemplu: dacă `watch_items` ale unor instalații devin publice, se dezvăluie ce dosare/firme urmăresc acele dispozitive (deși referințele sunt date publice, asupra lor există risc de inferență).
5. **Măsuri de reducere** (§3).

Numărarea la sânge se face cu interogări parametrizate prin `wrangler d1`, niciodată cu SQL concatenat.

## 3. Contenție și remediere (imediat)

- Dacă implică secrete de deploy (`.dev.vars` pierdut, chei VAPID/`REFRESH_TOKEN` compromise): **rotirea secretelor** (`wrangler secret put ...`), verificarea jurnalelor `POST /api/refresh` pentru folosirea abuzivă (ruta este fail-closed pe Bearer — `app/api/refresh/route.ts:10`), și `--dry-run`-ul din `pr-validation` confirmă integritatea configului.
- Dacă implică acces neautorizat la D1: revocarea cheilor de API Cloudflare, apoi auditul tabelelor trei (`watch_items`, `watch_events`, `push_subs`) pe intervalele vizate.
- Dacă un subansamblu de date este compromis iremediabil: purjarea instalațiilor vizate prin același mecanism cu „Șterge-mi datele" (`purgeInstall` — `lib/live/watch-sweep.ts:130`) — șterge integral cele trei tabele pentru fiecare `install_id` vizat.
- Păstrarea probelor: exportul rândurilor vizate **înainte** de purjare (rândurile vizate, exportate ca dovadă, într-un director privat, criptat, șters după închiderea dosarului).

## 4. Notificare

### ANSPDCP (art. 33) — dacă incidentul este susceptibil să genereze un risc pentru drepturile persoanelor

- Termen: **72 de ore** de la conștientizare; dacă depășirea e iminentă, se notifică **parțial, cu motivele întârzierii** și completarea urmează.
- Conținut (art. 33(3)): natura încălcării, categoriile și numărul aproximativ de subiecți/înregistrări, datele de contact ale operatorului (contactretetesecrete@gmail.com), consecințele probabile, măsurile luate/remediate (incluzând rostogolirea secretelor și purjarea).
- Canal: formularul ANSPDCP; se atașează extrasul din §5.

### Persoanele vizate (art. 34) — dacă riscul este RIDICAT

Persoanele nu pot fi contactate direct (nu există emailuri în sistem!). Canalele oneste:

1. **Anunț în aplicație**, vizibil imediat pe pagina principală și la deschiderea „Ce s-a schimbat" — aceeași cale prin care ajung deja toate mesajele utilizatorilor; textul arată ce s-a întâmplat, ce date, ce măsuri și ce poate face fiecare („Șterge-mi datele" — `app/watch-center.tsx:93`).
2. Dacă un flux de notificări push este funcțional în acel moment, o notificare către abonamente — mesaj criptat capăt-la-capăt prin lanțul existent (`lib/live/web-push.ts`).
3. Notificarea publică include adresa de contact pentru întrebări — este singura rută inversă pe care o au subiecții.

### Fără notificare?

Dacă evaluarea (§2) concluzionează „risc puțin probabil pentru drepturi", notificarea ANSPDCP poate fi omisă, **dar** raționamentul se consemnează în §5 — decizia se păstrează împreună cu probele, nu doar în memorie.

## 5. Registrul dosarelor de incident

Un rând per incident, adăugat la conștientizare și completat la închidere. Doar fapte, fără date personale în exces.

| # | Data conștientizării | Categorii de date | Subiecți (instalații) | Cauza | Măsuri | ANSPDCP (72h)? | Persoane vizate? | Închis la |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | (gol — nu a existat niciun incident până la 7 octombrie 2026) | | | | | | | |

## 6. După incident

- Verificarea că măsura rapidă chiar rezistă: `node scripts/verify-watch-sweep.mjs` (tura + retenția) și `corepack pnpm exec tsc --noEmit` + `corepack pnpm test:e2e` înainte de orice deploy de remediere.
- Post-mortem scurt în acest fișier sub tabel: cauza rădăcină, ce poartă de grijă pe viitor, ce verificare automată ar fi prins-o (dacă se poate, se adaugă în `scripts/` sau `e2e/`).
- Acest registru nu pleacă niciodată de pe infrastructura operatorului în formă integrală; ANSPDCP primește exactul necesar.

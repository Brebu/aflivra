# Watch („Urmărește") v1 — STATUS

## Builder-A Contract (watch backend — frozen for the UI builder)

All routes `Cache-Control: no-store`, JSON throughout, Romanian error messages.
`installId` is the client-generated **UUIDv4** (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) — every route validates it at the boundary and scopes **every** query by it (no cross-install reads possible).

**kinds**: `dosar` | `firma` | `localitate` | `act` | `venue` | `meteo`
- `dosar` — ref = case number `123/45/2026[/P]` (portal.just format)
- `firma` — ref = CUI (`1`–`999999999`, no leading zero)
- `localitate` — ref = locality name present in the national registry (e.g. `Cluj-Napoca`)
- `act` — ref = act id (`https://legislatie.just.ro/Public/DetaliiDocument…` or `law-<64hex>`)
- `venue` — ref = venue id from the validated calendar registry (`odeon`, `operacluj`, …)
- `meteo` — ref = județ (`Cluj`, `București`, `Ilfov`, …) — **VERDICT: REGISTERED**, ANM publishes machine-readable avertizări XML (already cached by the sweep)

**label?** = optional display name (≤200 chars). Stored and returned verbatim; never used for matching.

### POST /api/watch — add a watch
Body: `{installId, kind, ref, label?}` (JSON, body ≤8 KB). Per-kind `ref` validated at the boundary; unknown kind/shape → `400 {"error": "…"}`.
Limits: ≤**100** active watches/install → `400 Limita de 100 de urmăriri…`. Duplicate (installId+kind+ref) → idempotent `200` returning the existing row.
Success `200`: `{"watch": {"id","kind","ref","label","createdAt","muted":false}}`.
**Baseline semantics: NO events on the first sweep after subscribing — the first check records the current state; changes after that produce events.**

### DELETE /api/watch — remove a watch
Query: `?installId&kind&ref` → `200 {"deleted": true|false}`. Deleting does NOT delete past events (purge does).

### GET /api/watch — list + badge counts + subscribe info
Query: `?installId` →
```json
{
  "watches": [{"id","kind","ref","label","createdAt","muted","lastEventAt":null|"ISO","unseenCount":0}],
  "sweepState": {"runsPerDay": 3, "timesUtc": "04:28, 10:28, 16:28", "lastRunAt": null|"ISO", "lastEvents": 0, "lastPushes": 0, "lastOk": true, "note": "verificăm de 3 ori pe zi"},
  "notification": {"vapidPublicKey": "<base64url 65 bytes>" | null},
  "kinds": ["dosar","firma","localitate","act","venue","meteo"]
}
```
`vapidPublicKey` is the `applicationServerKey` to pass to `pushManager.subscribe` (નnull when push is not configured — subscriptions then fail honestly until VAPID is set). Subscriptions only when `vapidPublicKey != null`.

### GET /api/watch-events?installId&since? — the change feed
Newest-first, **≤50 events**: `{"events":[{"id","kind","ref","title","body","url","createdAt","seen"}], "hasMore": true|false}`.
`since` = event id (charset-validated) → only strictly newer events than the row of that id (unknown id → plain newest-50).
Event **url** = deep link `/#view=watch&event=<event id>` (the centru routes onward per kind).

### POST /api/watch-events/ack — mark seen
Body `{installId, ids: [...]}` — **≤200 ids**, id charset `[0-9a-zA-Z_-]{1,64}` → `200 {"acked": n}`.

### POST /api/watch/subscribe — register push
Body `{installId, subscription: {endpoint: "https://…", keys: {p256dh, auth}}}`
Validation: endpoint must be `https://` (≤2000 chars), keys base64url (43–87 chars) — bad shape → 400. `p256dh` is stored raw; `auth` is stored raw (never logged).
Idempotent (endpoint unique — upsert). Cap ≤5 subscriptions/install → 400. `200 {"subscribed": true}`.

### POST /api/watch/purge — „Șterge-mi datele"
Body `{installId}` → deletes ALL rows for the install: watches + events + push subscriptions.
`200 {"purged": {"watches": n, "events": n, "subscriptions": n}}`.

### Push notification payload (sent per new event to that install's subscriptions)
`{"title", "body", "url"}` — `url` = same deep link as the event. Push is **best-effort**: the events feed + badge is the source of truth; pushes land only while VAPID is configured and the sweep's send budget allows. Silent in-app fallback: none expected — the UI reads the feed.

### Addendum v1 — 2026-10-07 (Builder-C): mute setter + server-side unsubscribe + SW receiving leg

Two gaps B flagged at their freeze are closed backend-side; the SW receiving leg is reconciled to the task letter. **All routes keep the frozen conventions** (no-store, JSON, Romanian errors, UUIDv4 installId at the boundary, every query parameterized and install-scoped).

**POST /api/watch/mute** — body `{installId, kind, ref, muted:boolean}` → `200 {"muted": true|false}`.
Boundary: installId UUIDv4 · kind in cele 6 feluri · `ref` validat per fel (aceleași reguli ca adăugarea/ștergerea) · `muted` obligatoriu boolean. Urmărirea inexistentă **sau rândul altei instalații** → `400 {"error":"Urmărirea specificată nu există pentru această instalație."}`. Semantica: **muted oprește DOAR push-ul** — evenimentele și insigna continuă (tura onorează exact asta; dovedit de leg-ul existent din verify-watch-sweep). Raza: comutarea e mărginită de existența rândului (≤100/instalație) — fără plafon separat.

**DELETE /api/watch/subscribe?installId&endpoint** → `200 {"removed": true|false}`.
Server-side unsubscribe — închide lacuna „off-toggle clears the server row". Endpoint-scoped, nu doar installId: oprirea e **per dispozit** (un install poate avea ≤5 rânduri; un `?installId` singur ar tăia notificările tuturor dispozitivelor instalației — greșit pentru un buton pe acest dispozitiv). Boundary: installId UUIDv4 · endpoint `https://` ≤2000 (aceeași formă ca la abonare). Zero onest `{removed:false}` la a doua oprire sau pe endpoint străin — rândul celeilalte instalații nu poate fi scos de aici (scoped). UI: off-toggle face `subscription.unsubscribe()` client, apoi DELETE best-effort; un eșec aici NU e un eșec al opririi (dispozitivul s-a oprit local) — 410/purge rămân plasa de siguranță.

**SW receiving (public/sw.js)** — payloadul `{title,body,url}` afișat prin `showNotification` cu: **iconița aplicației PWA `/icon-192.png`** (intrarea de 192 din manifest; badge idem), **tag = url-ul evenimentului** (dedublare: push-uri repetate pe același url înlocuiesc notificarea), `requireInteraction:false`, `data.url`; fallback de titlu „Aflivra — Ce s-a schimbat" dacă payloadul vine mut. `notificationclick` → focus client fereastră existent + `navigate(data.url)`, altfel `openWindow(url)` (deep-link-ul `/#view=watch&event=<id>` e deschis de centru și rutat pe suprafață + ack). CACHE **v20→v21** (disciplina: orice schimbare de octeți serviți ridică versiunea — v18→v19 precedentul; fără intrări noi de precache: iconița e adusă de suprafața OS-ului, nu de pagină). Comportamentul existent (precache offline + activate cleanup + /data/ cache) neatins.

### Honesty: „verificăm de 3 ori pe zi"
The watch sweep runs on the Worker cron trigger `28 0,4,10,16 * * *` (UTC) — the registers tour keeps its daily 00:28 UTC run; 04:28/10:28/16:28 UTC (07:28/13:28/19:28 EEST, 06:28/12:28/18:28 EET) carry the watch sweep, each with its own free-plan subrequest budget. The free plan allows **5 cron triggers total** (already frozen in `verify-refresh-sweep.mjs` + enforced in `scripts/deploy.mjs`), so the watch rides the registers trigger with an hour-gated dispatch instead of a 6th trigger — still exactly 5 deployed crons.
Per-span caps (bounded, honest): dosar ≤20 per sweep (oldest-checked first, per-dosar failure skips), global fetch budget ~40/sweep (skips deferred to the next run and reported in sweep state), pushes ≤15/sweep.

## Builder-A Findings (watch backend)

**Stat: DONE** — contract implementat integral, verificat offline (2 harness-uri × exit 0) și live pe serverul de dezvoltare; toate porțele verzi. O singură abatere de la litera task-ului (cronul, mai jos), decisă și documentată — restul 1:1.

### Cron-ul — abaterea documentată (ura decisă)
Task-ul cerea „add ONE worker cron trigger (e.g. `30 2,10,18 * * *`)". Contul are **exact 5 crons — plafonul planului gratuit** — toate ocupate de cele 5 ture de familii, iar `verify-refresh-sweep.mjs` le îngheață byte-cu-byte și `deploy.mjs` refuză >5 grupuri („un deploy înlocuiește TOATE crons"). O a șasea expresie ar fi blocat publicarea. Hotărârea: **declanșătorul existent al grupului registers s-a lărgit** din `28 0 * * *` în `28 0,4,10,16 * * *` — aceeași expresie poartă tura de registre la 00:28 UTC (neschimbată, dimineața) și cele **trei turi de urmărire la 04:28/10:28/16:28 UTC (07:28/13:28/19:28 EEST)**, cu dispatch pe ora programată în `build/sites-worker.ts` (`runsWatchSweep(controller)` — ora 0 UTC = registers, orice altă oră = urmărire). Rămân exact 5 crons publicate; fiecare firing de urmărire are propriul buget de invocare (detecții ≤25 + push ≤15 accesări estimate), deci nu se share-uiește bugetul cu nicio tură de familii. Pin-ul înghețat din `verify-refresh-sweep.mjs` s-a realiniat (linia crons, cu comentariul care explică regula); `verify-sweep-inventory.mjs` (grupuri=5) a rămas verde neatins. README: rândul din tabelul cron, proza turelor, secțiunea de simulare locală (curl registers actualizat cu expresia lărgită + explicația dispatch-ului pe oră; tura de registre rămâne oricând declanșabilă explicit prin `POST /api/refresh?source=registers`) și runbook-ul (VAPID secrets) — actualizate. Simularea locală a turei de urmărire a rulat live: `GET /cdn-cgi/handler/scheduled?cron=28+0%2C4%2C10%2C16+*+*+*` → 200 `ok`, rândul `sweep:watch` scris (`watch.sweep.v1`), `GET /api/watch` expune `sweepState.lastRunAt` + eticheta onestă „verificăm de 3 ori pe zi" derivată din cron (nnu scrisă de mână).

### Meteo — verdict FEZABIL, înregistrat
Fluxul ANM `https://www.meteoromania.ro/avertizari-xml.php` este **machine-readable** (XML cu `<avertizare fenomen intensitate localitate dataStart dataStop …/>`), deja adus în cache de tura weather (`weather.alerts`, ttl 300s) — detecția citește exact acest cache (1 acces per tură), potrivește județul pe tokenii atributului `localitate` ("Cluj, București - Ilfov") și emite pe schimbare de semnătură per avertizare. Kind-ul `meteo` e înregistrat în contract și implementat + testat (Leg 4/5 din verify-watch-sweep). Expirarea unei avertizări nu generează eveniment (doar apariția/schimbarea) — notat onest în harness.

### TDD (RED → GREEN → REFACTOR)
- `scripts/verify-watch-sweep.mjs` — scris ÎNTÂI; RED real (ENOENT + cronul neaplicat), apoi GREEN exit 0 ×1 buclă de debug. 10 legs: dispatch pe oră + schedule derivat din cron; validarea referințelor per fel la graniță; linia de bază fără evenimente la prima verificare; **exact 1 eveniment per schimbare reală × 6 feluri** (firmă prin ANAF cu `date_generale`, dosar prin SOAP-ul portalului pe ambele operații, act prin căutarea Portal Legislativ, venue pe calendarul jsonld odeon, localitate prin clasificarea geografică a fluxului MAI, meteo pe avertizările ANM); **re-verificarea fără schimbare = 0 evenimente noi** (dedublare pe semnătură stabilă `(instalație, fel, element)` + lista de semnături anterioară, ca elementele rămase din listă să nu se reanunțe); **push**: antet `Authorization: vapid t=<jwt>, k=<public expus>` cu JWT ES256 **verificabil la receptor** + `{"typ":"JWT","alg":"ES256"}` byte-exact (ordinea din RFC 8292), `aud`/`exp` 12h/`mailto:`, corp `aes128gcm` (salt 16 + rs 4096 BE + idlen 65 + cheie efemeră P-256 necomprimată + criptotext) **decriptat integral de un receptor de test** (ECDH+HKDF „WebPush: info aes128gcm"+AES-GCM cu nonce derivat din salt — totul WebCrypto, zero dependențe noi) și payloadul `{title,body,url}` egal cu rândul evenimentului; **410 → push_subs curățat, celelalte abonamente primesște**; buget global de detecții (25) + plafon 20 dosare → amânare onestă raportată (`budgetSkipped`), reluarea din „checked_at" cel mai vechi; **muted = eveniment fără notificare**; `purgeInstall` complet și per instalație.
- `scripts/verify-watch-api.mjs` — scris ÎNAINTELE rutelor; RED real ( „route does not exist"), apoi GREEN exit 0. 9 legs: contractul public întreg (GET listă + sweepState + vapidPublicKey + kinds; POST adăugare idempotentă; DELETE; events ≤50 + `since` pe rând + hasMore; ack ≤200 pe charset validat; subscribe cu validare https/base64url + plafon 5 + **fail-closed onest fără VAPID**; purge cu contabile zero); definirea la graniță a UUIDv4 (regex v4 strict) și a fiecărui fel de referință; **izolarea între instalații pe fiecare rută** (query parametric, zero SQL concatenat); zero atingeri ale `source_cache` din rute; `Cache-Control: no-store` pe fiecare răspuns.
- Debug onest (toate prinse de harness-uri,BootTest-side fix-uri la 3 fixture-uri proprii + 1 greșeală de nivel de obiect la assert; 2 bug-uri REALE de implementare reparate prin RED→GREEN: remiterea elementelor rămase din listă la prima schimbare → coloana `sigs` cu lista anterioară; și DER-wrap-ul semnăturii ES256 → forma brută r||s a JOSE, demonstrată cu matrix de verificare node crypto).

### Livrabile (fișiere)
- `drizzle/0000_thin_demogoblin.sql` (+3 tabele: `watch_items` [unique(install_id,kind,ref)+fingerprint+sigs], `watch_events` [**unique(install_id,sig)**=dedublarea, id determinist sha256(install+sig), url deep-link, seen], `push_subs` [endpoint unique]) + `db/schema.ts` sincron. **Idempotent dovedit ×2 (`db-migrate --local` no-op)**; pe DB deja populat aplică per-declarație doar tabelele lipsă.
- `scripts/db-migrate.mjs` — corecție de defect pre-existent descoperit de migrația mea: **garda SQL era hardcoded pe cele 2 tabele originale** → orice tabel nou adăugat la fișier era raportat „nu s-a aplicat complet" DEȘI se aplicase. Garda acum derivă lista din propriile declarații ale fișierului (același contract, generalizat corect).
- `lib/live/web-push.ts` (nou): VAPID ES256 prin WebCrypto (perechea se auto-verifică la prima folosire — `watch_vapid_pair_mismatch` dacă secretul și publicul nu se potrivesc și notificările se omit, nu se trimit semnate strâmb), JWT cu exp 12h + contact `mailto:contact@aflivra.brebu.workers.dev` (marcat de înlocuit cu un contact real — singurul inventat de mine), criptare RFC 8291 aes128gcm, `sendPush` cu 404/410=curățare abonament, best-effort, jurnal structurat fără niciun secret.
- `lib/live/watch-sweep.ts` (nou): validatorii + stratul de date + tura. Reuse integral al încărcătoarelor/familiilor existente: feeds `feed:*` prin `readSource(waitForRefresh)`, AFIR **citit din copia brută** (clasa egress-blocat — interogarea directă ar fi respinsă de sursă), `weather-alerts`, `company:<cui>` ANAF, `law:search.v5:<title>` SOAP, `court:records.v5` SOAP, `events:<venue>`. Ordinea: meteo→localitate→venue→act→firmă→dosar, cel mai vechi verificat mai întâi (`ORDER BY COALESCE(checked_at,created_at)`); diful doar pe surse `fresh|cached` (o copie „stale" nu generează niciodată eveniment fals — degrade onest semnalat); plafoane: 20 dosare, 8 acte, 6 firme, 6 venue-uri, 6-8 evenimente/watch/tură, 15 push-uri; stare de tură în `source_cache` la cheia `sweep:watch` (`watch.sweep.v1`) — `sweepState` public = {runsPerDay, timesUtc, lastRunAt, lastEvents, lastPushes, lastOk, note} pt. „verificăm de 3 ori pe zi".
- `app/api/watch/route.ts` (GET/POST/DELETE), `app/api/watch-events/route.ts` (GET), `app/api/watch-events/ack/route.ts` (POST), `app/api/watch/subscribe/route.ts` (POST), `app/api/watch/purge/route.ts` (POST) — house style (`force-dynamic`, no-store, erori românești, 503 fără D1, validare totală la graniță).
- `build/sites-worker.ts`: dispatch `runsWatchSweep(controller)` înainte de `groupForCron`, jurnal `watch_sweep_completed` structurat; `lib/live/refresh-groups.json`: cronul registers lărgit; `scripts/verify-refresh-sweep.mjs`: pin realiniat + comentariul regulii; `lib/geographic-scope.ts`: `export {countyLookup}` (singletonul existent, pentru validarea localităților); `cloudflare-env.d.ts`, `.dev.vars` (perechea locală), `.dev.vars.example` (placeholder + procedura de generare), `.github/workflows/pr-validation.yml` (+2 linii baterie), `README.md` (paragraph verify + tabel cron + proză ture + sim locală + runbook VAPID).

### Porți (comenzi rulate, Ieșiri reale)
| Poartă | Rezultat |
| --- | --- |
| `tsc --noEmit` | **0 erori** |
| `eslint .` | **0 erori, 117 avertismente = baseline-ul exact** (fișierele mele contribuie 0) |
| Bateria `pr-validation` (26 scripturi, ordine CI) | **26 PASS** + `verify-downloads` PASS + `verify-legal-pdf` SKIP documentat (pypdf absent local; CI îl instalează) — inclusiv `verify-refresh-sweep` (pin realiniat), `verify-sweep-inventory` (5 grupuri, neatins), `verify-watch-sweep` + `verify-watch-api` (noi) |
| `node scripts/db-migrate.mjs --local` ×2 | **ambele no-op** (idempotent) |
| `corepack pnpm build` | **complet** (ruterele + workerul compilează în pipeline-ul de producție; churn-ul de 2 octeți din `seed-snapshots.json` revertat, ca la fiecare build) |
| `node scripts/deploy.mjs --dry-run` | **exit 0** — triggers.crons = 5 expresii cu registers lărgit, DB aflivra, Total Upload 13.432 KiB |
| Live :5173 (serverul fratelui, reutilizat cu eticheta portului) | GET/POST/DELETE/ack/events/purge + **cron sim lărgit → 200 `ok` + rând `sweep:watch` (`watch.sweep.v1`) + `sweepState.lastRunAt` prin API**; zero fetch-uri live (masa de watch goală la sim — regula de dev respectată; detecția e dovedită pe fixture-uri de harness) |
| `corepack pnpm test:e2e` (o dată) | **76/111 trecute; 35 eșuate — TOATE în fișierele surorii UI aflate în zbor** (`e2e/watch-flows.spec.ts` nou, 12 legs, butoanele UI neîncă randate; + `mobile-nav-taps.spec.ts` **modificat de ea** pentru badge). **Zero erori la nivel de rețea pe rutele mele** (grep pe error-context-uri: doar locatori UI „not found"); **e2e neatins de mine** (0 dintre cele 35 sunt în fișierele mele; specificațiile ei îmi pinned contractul exact — „installId UUIDv4 + kind + ref + label", `/#view=watch&event=<id>`, forma de listare) |

### Auto-review (4 lentile)
1. **Completitudine** — toate cele 8 sarcini livrate: contract în STATUS în primele minute; D1 ×3 tabele idempotent (pool-fix la db-migrate în plus); securitatea install-id la graniță pe fiecare rută (regex v4 + scope pe fiecare query + plafoane 100/50/200/5); detecția pe toate cele 6 feluri incl. verdictul meteo (FEZABIL, înregistrat, testat); push sender VAPID+RFC8291 zero-dependențe cu auto-verificare pereche; cron pun 3×/zi cu dispatch pe oră + stare onestă; 2 harness-uri ×2 rulări; sweep-inventory verde fără înregistrări noi (urmărirea nu e familie de sursă — reface încărcătoarele existente, toate deja acoperite). Zero TODO/stub-uri.
2. **Calitate** — convențiile casei pe fiecare fișier (no-store, erori românești, structured logs fără secrete, query parametrizate, import json ca sursă unică pentru cron); reîntrebuințare înainte de invenție (încărcătoarele existente, `classifyGeography`, `canonicalUrl`, regexul numărului de dosar, registrele venues/countyLookup); busines rule-uri comentate în română acolo unde sunt reguli (dispatch pe oră, buget, mesaj „best-effort").
3. **Discipline** — RED→GREEN→REFACTOR pe ambele harness-uri (RED-uri reale capturate: ENOENT + cron pin + „route does not exist"); ficou în interiorul partiției date (singurul fișier partajat extins: `geographic-scope.ts` +1 linie export, `countyLookup` era deja încărcat singleton); abaterea de cron decisă explicit și pe deși documentată (ar fi fost mai rău un deploy blocat la T3).
4. **Testare** — harness-urile exersează comportament real (fixture-uri byte-exact pe SOAP ANAF/portal/legislație, decriptare reală a corpului push, verificare reală a semnăturii JWT), nu mock-uri goale; fiecare debug iterat a fost test-side sau reparat în implementare cu harness-ul martor.

Note pentru valurile următoare: (1) **RFC 8291 known-answer**: harness-ul dovedește rotunjimea ECDH+HKDF+AES-GCM și layout-ul de octeți, dar vectorul oficial RFC n-a fost înglobat din memorie (risc de tipar în stringul info „WebPush: info aes128gcm" ar produce pachete pe care browserele nu le pot decripta — simptom: notificări trimise 201 dar niciodată afișate); prima abonare reală pe telefon, pe deploy, confirmă; verificarea prin „text clarification" e pasul de railing. (2) Contactul VAPID `mailto:contact@aflivra.brebu.workers.dev` e inventat — de înlocuit cu un contact real la deploy și de notat în runbook (o linie). (3) **Deployerul (T3)**: după deploy rulează `wrangler secret put VAPID_PRIVATE` + `VAPID_PUBLIC` (perechea din `.dev.vars` e validă pentru producție dacă vrei să o refolosești, dar o generație de producție separată e mai curată) + `db:migrate:prod` (va aplica per-declarație cele 3 tabele noi pe D1-ul populat). (4) `mobile-nav-taps` e2e: modificat de sora UI (badge) — pică pe componenta ei, nu pe backend (grep error-context confirmat).

**Builder-A: DONE — backend „Urmărește" complet: contract respectat 1:1 (o abatere documentată — cronul pe 5 sloturi), 2 harness-uri noi în baterie ×exit 0, tsc/lint/battery/deploy-dry-run/build toate verzi, e2e: 76 trecute, toate cele 35 de eșieri în fișierele UI aflate în zbor (0 la nivel de API), migrația idempotent ×2, live-proofs pe :5173 incl. cron-sim lărgit.**

## Builder-B Findings (watch UI)

**Stat: DONE** — toate suprafețele UI + centrul + push UX livrate RED→GREEN, contractul Builder-A respectat 1:1 (zero forme inventate), suita e2e integral verde pe arborele combinat.

### Livrabile (fișiere)
- `app/install-id.ts` (nou) — UUIDv4 client (`crypto.randomUUID`, fallback `getRandomValues` cu biții de versiune/variantă corecți), persistat în `aflivra.install.v1` (convenția numelui: `aflivra.<concept>.vN`). Zero PII. **Identitate leneșă, onestă**: fără id stocat, providerul NU întreabă serverul deloc (prima vizită = zero cereri `/api/watch` — pin în e2e leg 10); id-ul se creează la primul gest de urmărire/abonare și se ȘTERGE la „Șterge-mi datele" (nimic nu leagă instalația veche de cea nouă).
- `app/watch-state.tsx` (nou) — WatchProvider (react context, pe `AflivraPage` lângă LocationProvider): listă/badge/sweepState/vapid, `add`/`remove`/`purge`/`loadEvents`/`ackEvents`/`optimisticSeen`/`subscribePush`, toate pe rutele exacte din contract, `installId` în query/body oriunde îl cere contractul. Reîmprospătare la foreground/online (ca hook-urile live existente), fără interval de polling (reader-driven; push-ul anunță). După primul `add` se trage o dată lista (navigarea hash nu remontează providerul — altfel badge/sweep ar rămâne goale până la reload; bug prins de e2e).
- `app/watch-button.tsx` (nou) — butonul reutilizabil „Urmărește", în lanțul de interacțiune SaveButton: `ControlHint` tooltip + `aria-pressed` + icon Bell umplut la stare + cuvânt de stare + toast la ambele comutări. Variante per fel (vizibil/aria): dosar „Urmărește dosarul"/„Dosar urmărit", firmă „Urmărește firma"/„Firmă urmărită", localitate „…localitatea"/„Localitate urmărită", act „…actul"/„Act urmărit", venue „Urmărește spectacolele de la <short|name>"/„Spectacole urmărite". **React 19**: proprietatea se numește `target`, nu `ref` — `ref` e rezervat (string pe `ref` ar strica butonul la runtime + ar aprinde regula react-hooks/refs).
- `app/watch-center.tsx` (nou) — centrul „Ce s-a schimbat" + `PushSection`. Detaliate mai jos.
- `app/page.tsx` — WatchProvider; ruta `watch`; `openWatchTarget(kind,ref,label)` (dosar→`go('domain','justitie',seed courtNumber)`, firmă→`go('company',cui)`, localitate→selectCity+local, act→search seedat cu titlul, venue→selectCity(orașul instituției)+events, meteo→vreme/weather); articolul 6 în bara de jos cu `vb-badge` (totalul `unseenCount`); intrare în meniul „Explorează Aflivra"; `watch` în lista rutelor valide.
- Butoane pe cele 5 suprafețe: `court-history-panel.tsx` (header „Parcursul dosarului" — un buton per dosar, ref=numărul), `live-company.tsx` (sub tag-urile firmei, ref=CUI, label=denumirea), `location.tsx` (în LocationCityPicker — comutatorul de localitate din preferințe, ref/label=numele localității active), `legal-workspace.tsx` (în LawText, după act-facts, ref=act.id, label=titlul), `events-workspace.tsx` (panel-top lângă „Spectacole la <venue>", ref=venue.id din registru, label=venue.name).
- `public/sw.js` — **primirea push** (payload `{title,body,url}` → `showNotification` cu tag/data.url) + `notificationclick` (focus client existent + `navigate(url)`, altfel `openWindow`) — adânc-linkul `/#view=watch&event=<id>` e deschis de centru și rutat pe suprafață + ack. CACHE `aflivra-static-v19`→`v20`.
- CSS: `v2.css` bara de jos `repeat(5,1fr)`→`repeat(6,1fr)`; bloc „Watch" în `workspaces.css` (limbajul panelurilor existente; nimic exotic).

### Centrul „Ce s-a schimbat"
- **Plasare**: bara de jos (mobil), al 6-lea articol între „Compară" și „Salvate", icon Bell, eticheta „Urmărite", badge cu totalul nevizultat — singurul loc care numără schimbările în timpul navigării; desktop: `#view=watch` + meniuSheet. 6 coloane pe 390px rămân apăsabile (specul mobile-nav actualizat 5→6 verifică geometria + safe-area + turul complet).
- Listă urmăriri: chip de fel + nume/label + ref (‘CUI 427282’ la firme), „Urmărit de la …", „ultima schimbare …", **numărător de schimbări sosită nevizitată** derivat din feedul încărcat (fotografie la sosire — stabil post-ack, nu clipește), acțiuni „Deschide"/„Elimină" cu aria pe numărul concret.
- Feed evenimente: cele mai recente ≤50, markers „Nou" persistente pentru cele sosite nevăzute, `hasMore` onest („sunt și schimbări mai vechi"), note onestă despre baseline (prima verificare constată starea; schimbările apar de la următoarea). Deschiderea feedului = **ack exact al evenimentelor nevăzute** (cutia poștală: badgele se curăță la vizionare), scădere locală + recounted la următoarea listă de pe server.
- Cadența onestă din `sweepState` (nu scrisă de mână): „Verificăm de {runsPerDay} ori pe zi · {timesUtc} UTC · ultima tură: … (+schimbări/push-uri la ultima tură)", iar `lastOk:false` → „ultima tură nu a reușit complet; reluăm la următoarea oră".
- „Șterge-mi datele": confirmare explicită (dialog, „Păstrează"/„Șterge-mi datele", descriere onestă: server + identitatea anonimă se schimbă, nerecuperabil) → `POST /api/watch/purge` + reset local (watches, feed, **installId șters**) + empty state onest („Nu urmărești nimic încă" + unde sunt butoanele).
- Deep-link push `#view=watch&event=<id>`: caută în feed, ack pe acel id, rutare pe suprafața felului; eveniment dispărut (>50) → mesaj onest, rămâi în centru.

### Push UX (onest pe platformă)
- **Doar din gest explicit**: butonul „Activează notificările" cere permisiunea la click; niciodată la montare. Adevărul e în `requestPermission()`: în Chromium headless `Notification.permission` citește „denied" chiar și după `grantPermissions` (pinat cu micro-sondă) — fluxul continuă doar pe răspunsul real „granted", copilăria statică nu mai blochează butonul.
- **iOS realist**: `/iphone|ipad|ipod/i` + `!standalone` → „Pe iPhone și iPad, notificările sosesc în aplicația instalată pe ecranul de start." + „**Instalează aplicația și activează notificările**" (pașii meniului Safari). Fără buton de abonare, `Notification.requestPermission` NU e chemat (pin în e2e). Într-o PWA instalată pe iOS — calea normală.
- **VAPID null** (contract fail-closed): „Notificările push nu sunt configurate pe server acum. Schimbările rămân vizibile aici, în centru." — dezactivat onest, fără buton mort. Cheia `applicationServerKey` se decodifică base64url→Uint8Array 65 octeți (0x04+point) — **pinată byte-cu-byte în e2e**.
- **Per dispozitiv**: „Notificările sunt active pe acest dispozitiv." + „Oprește notificările pe acest dispozitiv" (unsubscribe client; rândul serverului trăiește până la purge sau 410 — sweep-ul lui Builder-A curăță endpointurile moarte; copiul e onest cu asta). Peste: limita de 5 abonamente/instalație + validarea formei sunt în contract, server-side.
- Payload `{title,body,url}` primit de sw.js-ul meu exact cum l-a înghețat contractul.

### e2e (RED-first, suita de casă)
- **`e2e/watch-flows.spec.ts` (nou, 10 legs)** — scris ÎNTÂI: RED real (10 failed — fără UI), apoi GREEN iterativ. Stub-uri de rețea pe `page.route(/\/api\/watch/)` — **regex, nu glob**: `**/api/watch*` nu prindea `/api/watch/subscribe|purge` și `/api/watch-events/ack` (`*` nu bate `/` în globul Playwright — cursă reală de 3 runde). Stub-ul e **stateful** (POST adaugă/DELETE scoate/purge curăță, GET listează rămășițele — lista de după primul add nu poate întoarce gol), răspunsul POST respectă forma `{watch:{…}}` a contractului.
  1. dosar: formular seedat → POST {installId UUIDv4, kind, ref, label} + persistare + comutare aria-pressed/text + centrul listează cu installId-ul corect;
  2. localitate (din preferințe); 3. venue (ref din registru); 4. act (ref law-<64hex> + titlu label) — fiecare cu forma exactă + comutarea;
  5. centru: badge „2" pe bara de jos de acasă → listă 2 urmăriri + „2 schimbări nevizitate" + market „Nou" selectiv + cadența „de 3 ori pe zi"/UTC → ack exact {evt-1,evt-2} scoped pe instalație → badge curățat → click eveniment → dosar deep-link (`#view=domain&id=justitie` + formular seedat, fără auto-submit — limbajul federat existent);
  6. push deep-link `#view=watch&event=evt-f` → ack acel id + navigare firma (`#view=company&id=427282`) + buton firmă deja apăsat;
  7. eliminare (DELETE cu query-urile exacte) + „Șterge-mi datele" (anulare fără apel, confirmare → purge {installId} → empty state + identitate ștearsă din localStorage);
  8. abonare: permisiune din click → abonamentul exact `{endpoint, keys:{p256dh,auth}}` + **octeții applicationServerKey = cheia VAPID a serverului** → stare activă → oprire locală;
  9. iOS copie onestă, fără requestPermission;
  10. VAPID null dezactivat onest + **prima vizită fără identitate = zero cereri către /api/watch** (nu se inventează id până nu există gest).
- **Edite de consecvență (necesare schimbării, comportament păstrat)**: `mobile-nav-taps.spec.ts` 5→6 (BAR_ITEMS, geometrie, „all six taps", finalul turei rămâne pe starea low-band = compare); `getByLabel('Localitate')` → `{exact:true}` în 5 specificații existente (aria noului buton „Urmărește localitatea …" conține substringul — strict-mode violation reală prinsă în cursă).
- Sonde: `probe-watch-center.png` (2 urmăriri + „Nou" + linia de cadență) + `probe-dosar-toggled.png` (butonul dosarului în starea apăsată) — păstrate în `ssnc-agent-orch/2026/10/07/watch-v1/probe/` (test-results/ se curăță la fiecare rulare).

### Porți (rulate după DONE-ul lui Builder-A, arbore combinat)
| Poartă | Rezultat |
| --- | --- |
| `corepack pnpm exec tsc --noEmit` | **0 erori** |
| `corepack pnpm lint` | **0 erori, 117 avertismente = baseline-ul exact** (prima trecere a mea: 5 erori — toate ale mele, toate reparate: `ref` rezervat React 19, `"„…"` drept în JSX, setState sincron în efect; ultima: o dependență lipsă) |
| `corepack pnpm test:e2e` (complet) | **108/108 trecute** (22 fișiere) — două rulări integrale verzi; două rulări intermediare au avut **câte 1 flake timing** în fișiere NEatinse de mine (map-markers sub-pixel, transit live-vehicles), ambele **verificate 4/4 și 13/13 verde în izolare** pe server liniștit |
| Probe screenshot | centru + buton comutat, aserțiuni explicit trecute + PNG-uri păstrate |

### Auto-review (4 lentile)
1. **Completitudine** — toate cele 5 sarcini livrate: installId (modul + plumbing + zero PII + identitate leneșă/ștersă la purge), butonul reutilizabil pe 5 suprafețe cu variantele cerute de nume, centrul cu badge/sweep onest/feed/ack/deep-link/remove/purge/countText/stări goale/offline-friendly (SW offline + refresh la foreground/online), push UX cu permission-doar-la-gest + copil platformă onest + mute randat, e2e RED-first cu toate fluxurile cerute. Zero TODO/stub-uri.
2. **Calitate** — convențiile casei peste tot (SaveButton language, live-freshness/panel CSS, house error style românesc, localStorage `aflivra.*`, `page.route` stub-uri, countText pentru numărători); reutilizare înainte de invenție (ControlHint, geo.cities/selectCity pentru deep-link-uri, topicSections/validDomainTab pentru rute, venues.json pentru orașul institutionii).
3. **Disciplină** — RED→GREEN→REFACTOR: specificația scrisă prima + RED real capturat (10 failed), implementarea adusă la GREEN în iterații mici, dovezi la fiecare; partiția respectată strict (nicio atingere a fișierelor lui Builder-A); editele în fișiere de-ale altora sunt doar de consecvență strictă (nav 5→6 + exact label), comportament păstrat, documentate aici.
4. **Testare** — legs-urile exersează comportament real prin componenta reală: forme byte-exacte pe fir, octeții VAPID comparați, ack scoped pe instalație, identitate ștearsă verificată, permisiunea iOS nefolosită (nu mock-uri de stare).
- **Done-with-concerns (2 lacune ale contractului înghețat, oneste, nu măsurători mascate)**: (a) **nu există rută de setare `muted`** — câmpul există în rânduri, sweep-ul Builder-A îl onorează la trimitere, dar v1 nu are buton „oprește notificările pentru elementul acesta"; centrul randează starea `muted` („notificările sunt oprite pentru acest element") pentru când va exista setter; per-item UI rămâne „Elimină". (b) **nu există rută de dez-abonare server-side** — oprirea e `pushSubscription.unsubscribe()` client (adevărată pe dispozitiv; rândul serverului moare la purge sau la 410, pe care sweep-ul îl curăță dovedit). Ambele notate pentru un val viitor — instant fix la nivel de backend, zero inventare în UI de față.

**Builder-B: DONE — watch UI complet pe contractul înghețat: 5 suprafețe + buton reutilizabil, centrul „Ce s-a schimbat" cu badge/ack/deep-link/purge onest, push UX platform-honest, installId leneș zero-PII, sw push v20, e2e RED-first 10 legs noi + 6 edite de consecvență, tsc 0 / lint 0 erori (117=baseline) / 108-108 e2e verde.**

## Builder-C Findings (SW push + micro-routes)

**Stat: DONE** — ambele lacune marcate de B închise backend (setter `muted` + dez-abonare server-side), piciorul SW reconciliat la litera task-ului, contractul extins prin addendum datat (mai sus). RED→GREEN demonstrat pe fiecare piesă; toate porțile verzi.

### Livrabile (fișiere)
- `app/api/watch/mute/route.ts` (nou) — setter-ul `muted`, convențiile înghețate ale lui Builder-A 1:1 (force-dynamic, no-store, erori românești, 503 fără D1, `validInstallId`+`WATCH_KINDS`+`watchRefError` la graniță, UPDATE parametrizat scoped pe `install_id=? AND kind=? AND ref=?`).
- `app/api/watch/subscribe/route.ts` (+DELETE) — dez-abonarea server-side, `DELETE ... WHERE install_id=? AND endpoint=?`, endpoint validat la aceeași formă ca la abonare (https, ≤2000). Zero onest `{removed:false}`.
- `public/sw.js` — iconița notificării `/favicon.svg` → **`/icon-192.png`** (PWA icon din manifest; badge idem) + `requireInteraction:false` explicit; **CACHE `v20`→`v21`** (disciplinaOcteți serviți — v18→v19 precedentul citit din git; fără intrări noi de precache — iconița nu e asset de pagină). Handlerul push/click rămâne cel lui B (payload {title,body,url}, tag pe url, data.url; focus-sau-openWindow) — netechiat comportamental, doar iconița + explicitarea lui requireInteraction. Precache/activate intacte.
- `app/watch-state.tsx` (+2 funcții plumbing: `setMuted` — POST mute + update local pe rând; `unsubscribePush` — DELETE cu {installId,endpoint}, best-effort ca ack-urile) — suprafața e a lui B, atinsă minim exact pentru cablajul lacunei pe care ei au marcat-o ca a mea.
- `app/watch-center.tsx` (atingere minimă permisă) — butonul per element **„Mutează"/„Reia"** (aria „Mutează/Reia notificările pentru <fel> <ref>", icon BellOff/Bell, toast la ambele comutări, convenția rândurilor existente) + off-toggle-ul capturează `subscription.endpoint` înainte de `unsubscribe()` și curăță rândul serverului. Statusul „notificările sunt oprite pentru acest element" era deja randat de B; acum are comutator.
- `scripts/verify-watch-api.mjs` — extins ÎNTÂI (RED): +`watch/mute` în routePaths/names + **Leg 10** (setter: validare la graniță — instalație/fel/referință/muted-boolean/json invalid; comutare reată reflectată pe rândul ei; urmărire inexistentă → 400 „nu există"; izolare cross-install — rândul 'other' neatins) + **Leg 11** (dez-abonare: 2 abonamente, endpoint non-https/lipsă/peste limită → 400; DELETE scoate doar rândul endpointului instalației; a doua oprire = `{removed:false}`; endpoint străin nu poate fi scos). `verify-watch-sweep.mjs` **neatins** — el dovedește deja „muted = eveniment fără notificare" (leg existent, linia 237); rulat ×2 verde. Interpretarea „verify-watch-* extended cu cele două rute + muted semantics": extinderea e în verify-watch-api (rutele + muted la granița API), sweep-ul rămâne dovada semantic push — ambele ×2 exit 0.
- `e2e/watch-flows.spec.ts` — stub-urile extinse (POST `/api/watch/mute` stateful pe rândurile stub; `/api/watch/subscribe` devine method-aware: POST subscribe / DELETE → `{removed:true}`) + **leg nou mute** (corpul exact `{installId, kind, ref, muted:true|false}` scoped pe instalație, „Mutează"→„notificările sunt oprite pentru acest element", „Reia" le aduce înapoi) + **leg 8 extins** (după off-toggle assert DELETE cu query-urile exacte installId+endpoint) + **lacuna SW înregistrată în comentariu datat** la finalul fișierului.

### TDD (RED → GREEN → REFACTOR)
- **Mute route**: harness Leg 10 scris întâi → **RED real** (`RED: app/api/watch/mute/route.ts nu există încă`, exit 1) → ruta implementată → **GREEN** (Leg 10 „acord").
- **Unsubscribe**: cu mute implementat, Leg 11 → **RED real** (`TypeError: routes.watch/subscribe.DELETE is not a function`) → DELETE adăugat → **GREEN** (Leg 11 „acord"). ×2 exit 0 după.
- **e2e mute + off-toggle**: legs scrise întâi → **RED real** (butonul „Mutează…" inexistent la locator; `Ruta de urmărire așteptată nu a fost chemată` pe DELETE) → cablajul UI → **GREEN** (2/2).
- **e2e SW push leg** — **LACUNĂ ÎNREGISTRATĂ cu probe, nu test fals**: Playwright nu poate livra Web Push real; dispecerul sintetic `new PushEvent('push',{data})` funcționează, DAR în Chromium headless `showNotification` din SW e respins cu „No notification permission has been granted for this origin" CHIAR și după `grantPermissions(['notifications'])` (cu origin și fără) și după `requestPermission()` real care întoarce „granted"; `permissions.query({name:'notifications'})` în SW raportează „granted" în timp ce `Notification.permission` citește „denied" (exact ciudățenia pe care a pinat-o B în leg-ul 8; aici blochează și suprafața reală). În plus `waitUntil` pe eveniment construit în script aruncă `InvalidStateError` („Can not call waitUntil on a script constructed ExtendableEvent"). Două sonde rulate, outputele înregistrate aici; spec-ul de probă șters. Reconcilierea sw.js (iconiță 192 + requireInteraction + CACHE v21) stă pe litera task-ului + citirea codului; confirmarea reală rămâne pe un dispozitiv abonat la deploy — **pereche cu nota RFC 8291 first-real-phone confirm din Builder-A Findings** (toată piciorul de livrare push se confirmă la deploy, o singură ceremonie).

### Porți (comenzi rulate, Ieșiri reale)
| Poartă | Rezultat |
| --- | --- |
| `corepack pnpm exec tsc --noEmit` | **0 erori** |
| `corepack pnpm lint` | **0 erori, 117 avertismente = baseline-ul exact** (fișierele mele contribuie 0) |
| `node scripts/verify-watch-api.mjs` ×2 | **ambele exit 0** (9 legs existente + Leg 10 + Leg 11) |
| `node scripts/verify-watch-sweep.mjs` ×2 | **ambele exit 0** (neatins — dovada că nu am stricat contractul turei; muted→fără push rămâne acoperit) |
| Bateria pr-validation (26 scripturi, ordine CI) | **26 PASS** + `verify-downloads` PASS + `verify-legal-pdf` SKIP documentat (pypdf absent local; CI îl instalează) — identic cu Bateria lui A |
| `node scripts/db-migrate.mjs --local` ×2 | **ambele no-op** (idempotent; zero schimbare de schemă — coloana `muted` exista deja în migrația lui A) |
| `corepack pnpm test:e2e` (integral) | **109/109 trecute, exit 0** (a 2-a rulare; prima rulare: 108 trecute + 1 eșuat — `transit-view.spec.ts` „live vehicles", **flake-ul de timing documentat de B, fișier neatinț de mine**, verificat **4/4 verde în izolare** imediat după — natura flake-ului de timing, nu de cod) |
| Sonde SW (2, spec temporar șters) | ambele au statuat blocajul headless (detaliat la TDD); deloc lăsate în suită |

### Auto-review (4 lentile)
1. **Completitudine** — toate cele 5 sarcini: handlerul SW reconciliat (iconiță PWA 192 + tag per url + requireInteraction:false + data.url + focus-sau-openWindow + CACHE v21 fără intrări noi de precache); ambele micro-rute implementate cu validare la graniță și limite sănătoase (mute e mărginit de existența rândului ≤100/instalație; unsubscribe e endpoint+install scoped); contract extension notat prin addendum datat în secțiunea contractului; e2e RED-first pentru ambele rute + lacuna SW înregistrată cu rațiune și probe (task-ul cerea fix asta când suită nu poate onest); toate porțile verzi. Zero TODO/stub-uri.
2. **Calitate** — convențiile înghețate pe fiecare fișier (stilul rutelor lui A: reject/json helpers, erori românești, 503 fără D1; stilul butoanelor rândurilor lui B: variant ghost + aria pe numărul concret + toast la comutări; stub-urile e2e stateful pe pattern-ul ei). Interogările parametrizate 100%; fiecare query scoped pe installId.
3. **Disciplină** — RED→GREEN pe fiecare piesă cu RED-uri reale capturate (exit 1 „route does not exist", TypeError DELETE, locator e2e, „ruta așteptată nu a fost chemată"); partiția: `lib/live/watch-sweep.ts` neatins (datele mute/subs duc în rută, la mine), UI atins doar în acordul explicit (buton mute minimal + off-toggle) cu plumbing minimal în watch-state; abaterea de forma task-ului (`DELETE ?installId` → `?installId&endpoint`) decisă explicit și documentată în addendum (per-dispozit, altfel un buton „pe acest dispozitiv" ar tăia toate dispozitivele instalației).
4. **Testare** — harness-ul exersează comportamentul real (UPDATE/DELETE reale pe SQLite, izolare cross-install, zero onest); e2e exersează corpul exact pe fir (mute true/false, query-urile DELETE); lacuna SW NU e mascată — e înregistrată cu outputul probelor.

**Builder-C: DONE — mute setter + dez-abonare server-side (contract extins prin addendum datat), SW push reconciliat (icon 192, tag url, requireInteraction false, CACHE v21), e2e 109/109 integral verde (flake-ul transit documentat, 4/4 în izolare), 2 harness-uri ×2 exit 0, baterie 26/26, tsc 0 / lint 0 (117 baseline), db-migrate ×2 no-op, lacuna e2e SW înregistrată cu probe (confirmarea push rămâne pe dispozitiv real la deploy, pereche cu nota RFC 8291 a lui A).**

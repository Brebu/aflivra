# Registrul activităților de prelucrare — art. 30 GDPR

Operator: Aflivra (operator individual, România) · Contact: [contactretetesecrete@gmail.com](mailto:contactretetesecrete@gmail.com)
Autoritatea de supraveghere: ANSPDCP — https://www.anpdcp.ro/
Ultima actualizare: 7 octombrie 2026. Fiecare rând indică mecanismul real din cod (`fișier:linie` la data actualizării); când mecanismul se schimbă, registrul se schimbă odată cu el.

## Sistemele implicate

| Sistem | Rol | Unde |
| --- | --- | --- |
| Cloudflare Worker `aflivra` (aflivra.brebu.workers.dev) | aplicația (operator) | `scripts/deploy.mjs:4` |
| Cloudflare D1 `aflivra` | date persistente; **regiunea Europa de Vest (WEUR), UE** — decizia operatorului | 5 tabele: `drizzle/0000_thin_demogoblin.sql` |
| Cloudflare Static Assets | fișiere publice statice | `dist/server/wrangler.json` (`assets`) |
| Memoria browserului (localStorage) | preferințe, exclusiv pe dispozitiv | tastele în `app/page.tsx:75-78`, `app/location.tsx:13`, `app/install-id.ts:6`, `app/legal-workspace.tsx:49` |

Cloudflare este împuternicit (procesator) în sarcinile de gazdă și stocare; acoperirea contractuală este actul de prelucrare Cloudflare (https://www.cloudflare.com/cloudflare-dpa/), acceptat în tabloul de bord. Nu există alți destinatari care să prelucreze datele în scopuri proprii.

## Activitățile de prelucrare

### 1. Funcția „Urmărește" — urmăririle și schimbările

- **Scop**: verificarea automată a surselor publice (ANAF, portal.just, Portal Legislativ, fluxuri, ANM, calendare) și afisarea schimbărilor elementelor alese de utilizator.
- **Categorii de persoane**: utilizatori anonimi ai dispozitivului (fără cont).
- **Categorii de date**: identificator anonim de instalare (UUID generat pe dispozitiv, la prima urmărire — `app/install-id.ts:1-38`); referințele urmărite: numere de dosar, CUI, localități, identificatori de acte, instituții, județe (`lib/live/watch-sweep.ts:21` — `WATCH_KINDS`); evenimentele: titlu, descriere, adresă, dată (`watch_events`).
- **Temei**: consimțământul — fiecare urmărire este o acțiune explicită pe buton („Urmărește", cu scopul spus la momentul colectării — `app/watch-button.tsx:37`); retragerea prin „Nu mai urmări" / „Șterge-mi datele".
- **Destinatari**: niciunul în scopuri proprii; Cloudflare ca împuternicit.
- **Retenție**: până la ștergerea de către utilizator; automat, o urmărire fără nicio interacțiune de **180 de zile** se elimină la tura de verificare, iar evenimentele se elimină la **365 de zile** (`lib/live/watch-sweep.ts:42` — `WATCH_INACTIVE_DAYS=180`, `EVENT_RETENTION_DAYS=365`; aplicarea în tura `:157-169`). „Șterge-mi datele" (`app/watch-center.tsx:93`, ruta `app/api/watch/purge/route.ts`, implementarea `purgeInstall` — `lib/live/watch-sweep.ts:130`) șterge integral `watch_items`, `watch_events`, `push_subs` pentru instalație și resetează identificatorul.
- **Drepturi**: toate exercitabile din aplicație (eliminare per element, „Șterge-mi datele") sau prin contact; fără profilare, fără decizii automate.

### 2. Notificările Web Push

- **Scop**: trimiterea notificărilor cu schimbările elementelor urmărite.
- **Categorii de date**: abonamentul push (adresa endpointului și cheile de criptare `p256dh`/`auth` ale browserului) + identificatorul de instalare.
- **Temei**: consimțământul explicit — abonamentul se creează doar din „Activează notificări" plus permisiunea browserului (`app/watch-center.tsx:174-194`); dezabonarea din „Oprește notificările" șterge și rândul de pe server.
- **Destinatari**: serviciul de livrare push al platformei utilizatorului (Google/Mozilla/Apple) primește mesajul **criptat** (RFC 8291 — `lib/live/web-push.ts:49-62`), fără să îi poată citi conținutul; antetul VAPID poartă contactul operatorului (`lib/live/web-push.ts:12`).
- **Retenție**: până la dezabonare; abonamentul raportat dispărut (HTTP 404/410 — `lib/live/web-push.ts:71`) se șterge automat la următoarea tură (`lib/live/watch-sweep.ts` — ramura `pushGone`).

### 3. Poziția aproximativă (contextul geografic)

- **Scop**: date locale relevante — vreme și prognoză, context geografic al datelor (registre, spectacole, transport).
- **Categorii de date**: coordonate **rotunjite pe dispozitiv** înainte de a pleca: 2 zecimale (~1,1 km) către ruta de vreme (`app/local-weather.tsx:9`), 3 zecimale (~110 m) în parametrul de context geografic (`lib/geographic-scope.ts:18` — `geographicParams`); pe dispozitiv se salvează doar localitatea aleasă manual sau modul (`app/location.tsx:19-36`).
- **Temei**: consimțământul — cerută doar de la butonul „Folosește locația mea"/„Actualizează poziția" + permisiunea browserului (`app/location.tsx:21-34`); refuzul degradează onest la România/București, fără să limiteze aplicația (`app/location.tsx:30-32`).
- **Persistență server**: **nimic** — în D1 nu există nicio coloană sau tabel de poziție (`drizzle/0000_thin_demogoblin.sql`); cererile de prognoză pleacă de la Worker către Open-Meteo cu coordonatele deja rotunjite (`app/api/weather/route.ts:6` + pipeline-ul `readSource`).
- **Destinatari**: Open-Meteo primește poziția aproximativă a cererii **serverului**, nu a dispozitivului.

### 4. Manifestele și durata de verificare (surse publice)

- **Scop**: publicarea integrală a surselor, frecvenței de reîmprospătare și a stării lor — arhiva de transparență (`app/sources-registry.tsx`), inclusiv starea turei de urmărire („verificăm de X ori pe zi" — `lib/live/watch-sweep.ts`, `watchSweepPublicState`).
- **Categorii de date**: metadate de sursă (adrese, licențe, data publicării), fără date personale.

### 5. Jurnalele tehnice de securitate

- **Scop**: detectarea abuzului și a erorilor; funcționarea platformei.
- **Categorii de date**: adresa IP a cererii, momentul, adresa cerută (jurnalele Cloudflare și ale Workerului; `console.log`-ul turei programate — `build/sites-worker.ts:31-41`).
- **Temei**: interes legitim (securitate și prevenirea abuzului), echilibrat prin durată scurtă de păstrare (limita platformei) și prin minimizare — **doar adrese de rută**, niciodată corpuri de cerere sau date de utilizator.
- **Transfer**: jurnale Cloudflare, ca împuternicit, în condițiile DPA; datele persistente de utilizator rămân în D1 UE.

## Observații de conformitate onestă

- **Cookie-uri: zero.** Nicio valoare `Set-Cookie` nu pleacă de la aplicație (audit pe `app/` — fapt verificat în sesiunea de cercetare din 2026-10-07); memoria browserului este strict funcțională (preferințe), motiv pentru care aplicarea Legii 506/2004 art. 5 alin. (3) nu impune banner de consimțământ — nu există stocare/accesare în afara servicilor cerute explicit.
- **Profilare / decizii automate: zero.** Nu există niciun mecanism care să evalueze sau să clasifice persoane.
- **Fără cont**: nimic nu conectează un dispozitiv de altul; identificatorul este aleator și local generat.
- **Interogarea periodică este onestă**: „Urmărește" verifică sursele prin interogări mărginite de buget (`DETECTION_FETCH_BUDGET`, `PUSH_SEND_BUDGET` — `lib/live/watch-sweep.ts:44`), cu starea turei publicată (numărul de verificări pe zi derivat din cron, nu scris de mână).
- Politica publică, în română, completă pentru art. 13: pagina `/confidentialitate` (`app/confidentialitate/page.tsx`); termenii serviciului: `/termeni` (`app/termeni/page.tsx`). Cifrele de retenție din politică sunt exact constantele din `lib/live/watch-sweep.ts:42`.

## Verificarea mecanismelor

- `scripts/verify-watch-sweep.mjs` — tura „Urmărește" pe un compilat al lanțului de live, cu fetch controlat: picioarele Leg 1–11, inclusiv retenția (Leg 11: urmărirea fără interacțiune de 180 de zile eliminată, evenimentul de 365 de zile eliminat, cele proaspete păstrate) și contactul VAPID real (Leg 6).
- `scripts/verify-watch-api.mjs` — rutele publice de urmărire, cu plafoanele per instalație și curățarea completă.
- `e2e/legal-pages.spec.ts` — paginile juridice servesc în SSR elementele art. 13 (contact, retenție 180/365, ANSPDCP, „Șterge-mi datele", rotunjirile 2/3 zecimale, Uniunea Europeană) + subsolul cu legăturile legale pe toate paginile + notele de primă folosire.

# Actualizare prin MCP și HTTP

Cele 41 de tool-uri publice rămân accesibile fără autentificare. Operatorul trimite
`Authorization: Bearer <REFRESH_TOKEN>` la fiecare cerere către `/api/mcp`.
Numai atunci `tools/list` include cele trei tool-uri de mai jos. Tokenul nu este
argument MCP, nu se include în rapoarte și nu se transmite surselor externe.

| Tool privat | Argumente | Rezultat |
| --- | --- | --- |
| `refresh_sources` | `group` sau `member`, opțional `force` | Acceptare și ID-uri de job salvate în D1; nu certifică o actualizare reușită. |
| `refresh_status` | Opțional `jobId` | Membrii configurați, ultimele 100 de joburi sau un job, rezultatul fiecărei surse și următorul moment de încercare. |
| `refresh_corpora` | `source`: `all`, `situr`, `amccrs`, `eida`, `lmi` | Acceptarea workflow-ului fix din GitHub și adresa rulărilor. Importul, PR-ul și deploy-ul rămân etape distincte. |

Un client cu token greșit primește suprafața publică. Apelul unui tool privat nu
execută nimic. Autorizarea se verifică din nou în rutele HTTP administrative.

## Un exemplu de lucru

1. Apelează `refresh_status` și consultă `members`.
2. Apelează `refresh_sources` cu `{"member":"weather.alerts","force":true}`.
3. Păstrează `jobs[0].id` și apelează `refresh_status` cu acel `jobId`.
4. Verifică `status`, `result.status`, `lastSuccessAt`, `error` și `nextAttemptAt`.
5. Citește datele prin tool-ul public corespunzător după încheierea jobului.

Fără `group` și `member`, se înregistrează joburi pentru cei 25 de membri din
`lib/live/refresh-groups.json`. Grupurile valide sunt `pulse`, `living`, `feeds`,
`research`, `registers`. Un URL, un CUI sau o localitate arbitrară nu poate fi
folosită ca `member`; cheile la cerere și relay-urile au politici separate.

`force` ignoră TTL-ul unei copii valide. Păstrează pauza cerută de sursă,
bugetele, lease-ul unui alt worker și intervalul minim de 30 de secunde dintre
încercările manuale. Trigger-urile simultane pentru același membru folosesc
același job activ. Un trigger forțat poate promova și un job aflat în execuție.

| Stare job | Semnificație |
| --- | --- |
| `queued` | Salvat durabil; poate aștepta lease-ul sau backoff-ul sursei. |
| `running` | Revendicat atomic de un consumer; nu înseamnă că sursa a răspuns. |
| `completed` | Citire validă `fresh` sau `cached`. Fără `force`, un cache încă valid poate fi suficient. |
| `failed` | Rezultat `stale`/`unavailable`, eroare de execuție sau trei lease-uri întrerupte. Copia validată anterioară rămâne disponibilă. |

Rezultatul operațional exclude `data`, pentru a nu duplica payload-uri mari.
Istoricul joburilor încheiate se păstrează șapte zile. Un ID necunoscut întoarce
404; absența tabelei D1 întoarce 503, nu o listă fictivă de succese.

## Echivalente HTTP

| Rută | Comportament |
| --- | --- |
| `POST /api/refresh?async=true&member=weather.alerts&force=true` | 202 după persistarea jobului. |
| `GET /api/refresh/status?jobId=<uuid>` | Stare, rezultat și acoperirea configurată. |
| `POST /api/refresh?source=pulse` | Modul sincron existent; rezultat pentru grup. |
| `POST /api/refresh/corpora?source=amccrs` | 202 dacă GitHub a acceptat workflow-ul. |

Toate cer tokenul operatorului. `async` și `force` acceptă numai `true`/`false`.
Nu trimite tokenul într-un parametru URL.

Pentru bugetul de 5 USD, există maximum **20 de trigger-uri manuale de surse**
și **4 de corpus** pe zi UTC, comune tuturor clienților. `force`, modul sincron
și cererile care reutilizează un job consumă aceeași cotă. Limita e atomică în D1;
epuizarea întoarce 429 și `Retry-After`, iar imposibilitatea verificării întoarce
503. `refresh_status` expune limitele. Cronurile păstrează propriile politici.
Profilul de deploy limitează CPU la 10.000 ms/invocație și logs la sampling 10%.
[Bugetul Cloudflare](cloudflare-budget.md) explică cotele și riscul depășirilor;
aceste protecții nu sunt un plafon al facturii pentru traficul public.

## Activarea execuției rapide

Migrarea `0002_source_refresh_jobs.sql` trebuie aplicată înainte de folosirea
joburilor. Deploy-ul existent o aplică prin `scripts/db-migrate.mjs`.

Pentru Cloudflare Queues, creează coada în contul aplicației, apoi configurează
`AFLIVRA_REFRESH_QUEUE_NAME` în mediul care execută `scripts/deploy.mjs`:

```bash
corepack pnpm exec wrangler queues create aflivra-source-refresh
AFLIVRA_REFRESH_QUEUE_NAME=aflivra-source-refresh node scripts/deploy.mjs --dry-run
```

Configurația rezultată conține producer-ul `REFRESH_QUEUE` și consumer-ul din
`build/sites-worker.ts`: lot de maximum trei mesaje, un consumer concurent,
trei retry-uri de livrare. Comanda de mai sus validează deploy-ul fără publicare.
Deploy-ul efectiv trebuie să folosească aceeași variabilă; omiterea ei produce
configurația fără binding-ul Queue.

D1 este outbox-ul durabil. Dacă livrarea în Queue eșuează, cron-ul recuperează
joburile; dacă binding-ul lipsește, se încearcă execuția prin `waitUntil` și apoi
prin cron. Fără Queue, un trigger cu multe surse nu promite execuție imediată:
execuția oportunistă preia cel mult trei joburi și poate fi întreruptă de runtime.

## Activarea importului de corpusuri

`refresh_corpora` necesită în Worker secretul `CORPORA_GITHUB_TOKEN`, cu drept de
scriere pentru GitHub Actions numai în `Brebu/aflivra`. Rutarea folosește exclusiv
workflow-ul `corpora-refresh.yml`, ref-ul `main` și lista fixă de corpusuri.
Lipsa secretului sau a D1 întoarce 503; o declanșare în ultimul minut întoarce
429. POST-ul către GitHub nu se repetă automat: după timeout, consultă rulările
înainte de a-l relansa, deoarece GitHub poate fi acceptat deja cererea.

Pentru PR-urile generate de workflow, activează politica repository-ului
„Allow GitHub Actions to create and approve pull requests” sau configurează
secretul Actions `CORPORA_PR_TOKEN` cu drepturile necesare. Acesta este separat
de secretul Worker folosit la declanșare. Un `GITHUB_TOKEN` obișnuit poate să nu
declanșeze workflow-uri suplimentare la PR-ul pe care îl creează; verifică
efectiv rulările de validare înainte de integrare.

Workflow-ul descarcă numai corpusul cerut, validează integritatea, păstrează
un artifact pentru 14 zile și deschide sau actualizează PR-ul zilnic. Un import
reușit nu schimbă copia din aplicație până la integrarea PR-ului și deploy.

## Ce măsoară prospețimea

`fresh` certifică preluarea reușită, nu că publicația este cea mai nouă existentă.
Perioada de referință a datelor și data modificării metadatelor sunt informații
distincte. Corpusurile SITUR, AMCCRS, EIDA și LMI expun timestamp-ul integral
`fetchedAt`, `corpusAgeSeconds` și `updateRequired`; după 24 de ore, copia este
etichetată `stale`, fără eliminarea rândurilor.

Importurile neschimbate pot păstra vechiul `fetchedAt`, deoarece deduplicarea
snapshot-urilor nu publică un commit numai pentru o reverificare. În acel caz,
starea este conservatoare: metadatele copiei publicate nu atestă verificarea
recentă. Rularea Actions poate constitui o dovadă separată; un viitor manifest
runtime cu `lastCheckedAt` va închide această diferență.

Aceste mecanisme sunt pregătite în PR. Configurarea secretelor, crearea Queue,
migrarea și deploy-ul producției trebuie verificate în contul aplicației înainte
de măsurarea latenței reale.

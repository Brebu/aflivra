# Buget operațional: 5 USD/lună

Verificat la 11 octombrie 2026. Scopul este să rămână suficient abonamentul de bază Workers Paid, folosind cotele incluse. Limitele aplicației nu reprezintă un plafon impus facturii de Cloudflare. Depășirile, alte produse și taxele fiscale pot modifica totalul.

## Domeniu

Documentul folosește tarifele publicate pentru Workers Paid Standard și limitele din cod. Nu publică factura, datele reînnoirii, utilizarea sau configurația internă a contului. Verificarea efectivă a facturării rămâne o operație administrativă separată.

## Cotele folosite pentru proiectare

| Resursă | Inclus lunar | Cost la depășire |
| --- | --- | --- |
| Abonament Workers Paid | 5 USD, preț minim al contului | Utilizare peste cotele de mai jos |
| Cereri Workers | 10 milioane | 0,30 USD / milion suplimentar |
| CPU Workers | 30 milioane ms | 0,02 USD / milion ms suplimentar |
| D1: rânduri citite | 25 miliarde | 0,001 USD / milion |
| D1: rânduri scrise | 50 milioane | 1 USD / milion |
| D1: stocare | 5 GB | 0,75 USD / GB-lună |
| Queue: operații | 1 milion | 0,40 USD / milion |
| Workers Logs, până la 30 noiembrie 2026 | 20 milioane evenimente | 0,60 USD / milion |

Surse oficiale: [Workers și Logs](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/). Requests către active statice sunt gratuite; timpul de așteptare a rețelei nu este CPU. Cotele se împart la nivel de cont. Logs își schimbă modelul de preț de la **1 decembrie 2026**; bugetul trebuie reevaluat atunci.

## Protecții implementate în PR

- **20 de trigger-uri manuale pentru surse pe zi UTC**, comune MCP/HTTP și tuturor izolatelor. Cererile valide consumă o unitate chiar dacă se deduplică sau eșuează ulterior. Un trigger poate selecta maximum cei 25 de membri configurați. După epuizare: HTTP 429 și `Retry-After` până la următoarea zi UTC.
- **4 trigger-uri manuale de corpus pe zi UTC**, plus cooldown-ul global de un minut. Rezultatele incerte ale dispatch-ului consumă buget.
- Verificare atomică în `source_budget`; imposibilitatea verificării oprește trigger-ul cu 503. Cronurile și interogările publice păstrează TTL-urile și bugetele pe sursă existente, fără a consuma bugetul administrativ.
- Deploy cu `limits.cpu_ms=10000`. `AFLIVRA_WORKER_CPU_MS` acceptă întregi între 1000 și 10000. Protecția este pe invocație; un parser care depășește limita poate fi întrerupt. Canary-ul trebuie să includă cel mai mare import folosit.
- Logs la **10%**, cu sumarul fiecărei ture păstrat în D1. Queue opțională, consumer cu concurență 1, batch maximum 3 și maximum 3 retry-uri.
- Istoric terminal de șapte zile și expirarea copiilor nepublicate. Fluxul nu adaugă Containers, Browser Rendering sau inferență AI.

La limita de 20 trigger-uri × 25 membri × 31 zile, ruta poate trimite cel mult **15.500 mesaje Queue/lună**. Pentru UUID-uri mici, trei operații normale plus trei citiri de retry înseamnă aproximativ **93.000 operații**, sub milionul inclus. Limita nu acoperă alți producători din cont sau CPU-ul consumer-ului. Recuperarea cron continuă după epuizarea retry-urilor de transport.

## Operare în buget

Păstrează importurile mari în GitHub Actions și copiile validate; repo-ul este public. Queue poate accelera actualizările manuale în cota inclusă, după validarea planului contului. Urmărește CPU, cereri, D1, Queue și Logs pe **ciclul real de facturare**, cu avertizare la 70% și intervenție la 80%: oprește importurile/force inutile, redu polling-ul și servește copiile existente. Aceste praguri sunt recomandări operaționale, nu alerte deja configurate.

Traficul public poate continua să consume cote după atingerea limitelor administrative. **PR-ul nu garantează o factură fixă de 5 USD pentru trafic nelimitat** și nu configurează oprirea automată a Worker-ului. Un plafon strict cere restricționarea serviciului înainte de epuizarea cotelor și un control bazat pe metricele reale de facturare; acestea trebuie verificate în contul aplicației.

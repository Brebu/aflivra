# Aflivra: probe și date pentru remediere offline

Data verificării: **10 octombrie 2026**. Baseline: repository `Brebu/aflivra`, commit `12a12999d1f0f5762357c6156992fb2747c8cca9`.

Planul complet este în `Aflivra_Plan_Implementare_Fixuri_2026-10-10.md`. Pachetul conține sursele descărcate, comparațiile și un corpus EIDA candidat deja corectat. Nu trebuie să ai acces la site-urile instituțiilor pentru a verifica aceste probe sau pentru a dezvolta remedierile.

## Ce este verificat

| Date | Verificare efectuată | Limită |
|---|---|---|
| SITUR cazare | 32.058 rânduri, 18 coloane, identice cu baseline | Clasificări/licențe; nu probează funcționarea în ziua interogării |
| SITUR alimentație | 9.063 rânduri, 13 coloane, identice; 387 în București | Filtrul live București întoarce încă zero |
| SITUR agenții | 3.104 rânduri, 13 coloane, aceleași valori și duplicate | Două rânduri și-au schimbat ordinea; nu există o diferență semantică |
| EIDA evenimente | Toate cele 1.157 de rânduri returnate pe feliile 2015–2025, comparate câmp cu câmp | M≥3 în dreptunghiul 43–49°N / 20–30°E; felia 2026 a răspuns HTTP 204, inconcludent |
| EIDA stații | Toate cele 150 de înregistrări de stație/perioadă; antetul eliminat | Nu sunt neapărat 150 de stații fizice distincte sau active |
| LMI București | PDF oficial complet; 12 rânduri de pe pagina PDF 28 / foliul 525 inspectate vizual | 10 din 12 diferă de baseline; restul celor 2.651 de rânduri extrase nu sunt validate semantic integral |
| SEN | URL configurat: HTTP 404; URL rădăcină: HTTP 200, JSON și câmpuri numerice validate | Ora sursei se interpretează în Europe/Bucharest ca presupunere declarată |

## Verificare fără internet

Din directorul dezarhivat:

```bash
python3 verify_offline.py
```

Scriptul folosește numai biblioteca standard Python 3. Verifică amprentele tuturor fișierelor, integritatea XLSX, egalitatea tuturor rândurilor normalizate SITUR cu baseline-ul, fiecare câmp EIDA față de textul FDSN și probele LMI. Conversia inițială XLSX → valori afișate a fost efectuată cu SheetJS și este păstrată în fișierele `validated/situr-*.json`; verificatorul offline nu pretinde că implementează toate regulile de formatare Excel.

## Migrare locală EIDA

Mai întâi verifică fără să scrii:

```bash
python3 apply_eida_candidate.py /cale/catre/aflivra
```

După implementarea și testarea cititorului/parserului v2 din plan, poți scrie **în copia locală de lucru**:

```bash
python3 apply_eida_candidate.py /cale/catre/aflivra --write
```

Scriptul scrie doar `public/eida/seismic.json.gz` și intrarea corespunzătoare din `public/data/snapshot-transport.json`. Refuză un corpus diferit de baseline-ul verificat, validează SHA și dimensiunile și recunoaște o migrare deja aplicată. Nu execută commit, push sau deploy. Cele două fișiere trebuie incluse în același commit, împreună cu parserul și cititorul corectate; nu publica între cele două înlocuiri locale. Scriptul a fost verificat într-un repository temporar, inclusiv pentru reluare și refuzul unui input necunoscut.

## Conținut

- `sources/`: trei XLSX SITUR, PDF LMI complet, JSON SEN, răspunsul 404 folosit ca probă și textele FDSN pentru stații și 12 ani.
- `baseline/`: corpusurile comparate, extrase din commitul indicat, și numai dovezile SHA relevante. Manifestul parțial de aici **nu înlocuiește** manifestul complet din repository.
- `validated/`: tabele normalizate, comparații, 12 corecții LMI de referință, coordonate de cuvinte și imaginea paginii inspectate, probe MCP și reproducerea defectului de workflow.
- `candidates/`: corpus EIDA v2 JSON/gzip și dovada de transport aferentă. Datele candidate au fost validate; remedierile din aplicație nu sunt încă implementate prin acest pachet.
- `source-probes.json`: URL-uri, ore, statusuri HTTP, dimensiuni și SHA-256 ale descărcărilor reușite.
- `source-retries.json`: prima încercare SITUR cazare a expirat, a doua a reușit; istoricul este păstrat.
- `manifest.json`: integritatea fișierelor livrate; nu se inventariază pe sine.

Fișierele sunt probe și fixture-uri de dezvoltare. Metadatele originale de proveniență și limitele de acoperire sunt păstrate. Acest pachet nu reprezintă o actualizare continuă a surselor după data verificării.

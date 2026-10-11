# Rapoarte integrate Firme / Bani

În Firme sau Bani, secțiunea „Raport integrat” descarcă un PDF și un JSON cu răspunsurile Aflivra folosite. Alege poziția curentă, altă localitate și o rază de 1–100 km, sau România. Localitatea alternativă nu schimbă poziția principală a aplicației.

Raportul include punctele cartografice din selecție, imagine ilustrativă din colecția Aflivra, bilanțurile pentru maximum 8 CUI-uri introduse, grafice și comparații pe cel mai recent an comun, context INS, ANCPI și POSF. Scenariile financiare apar numai dacă utilizatorul introduce ipotezele; valorile lipsă rămân distincte de zero.

Aria se aplică punctelor cartografice. CUI-urile sunt selectate explicit și nu sunt atribuite automat unui brand sau unui punct OSM. INS, ANCPI și POSF au acoperire teritorială proprie, explicată în raport. Căutarea text nu este un recensământ al firmelor. Se preiau cel mult 600 de puncte, iar acoperirea și eventualul eșantion sunt declarate.

PDF-ul se generează în browser, din API-urile și activele Aflivra. Nu există apel către un serviciu AI sau o sursă comercială suplimentară. Fiecare răspuns păstrează starea, data preluării și erorile sursei; anexa PDF și JSON-ul permit verificarea provenienței. Fotografia este ilustrativă și are credit/licență, iar distribuția punctelor este o schemă, nu o hartă de măsurare.

Verificări: `node scripts/verify-business-report.mjs` controlează lipsurile, comparația pe ani comuni, selecția geografică, eșantionarea, anularea și exportul PDF. `pnpm test:e2e e2e/business-report.spec.ts` verifică descărcarea PDF, datele indisponibile, accesul din ambele categorii și ecranul mobil.

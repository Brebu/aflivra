'use client';
import Link from 'next/link';
import '../aflivra.css';
import {SiteFooter} from '../site-footer';

// Politica de confidentialitate — informațiile complete cerute de art. 13 din
// Regulamentul (UE) 2016/679 (GDPR), scrise împotriva adevărului verificat din cod:
// cifrele de retenție sunt cele ale turei de urmărire, rotunjirile coordonatelor sunt
// cele trimise efectiv de pagini, iar poziția nu are nicio coloană în baza de date.
export default function Confidentialitate(){
  return <>
  <main className="v2"><div className="vwrap">
    <Link className="catalog-home" href="/">Aflivra · Înapoi la platformă</Link>
    <div className="page-intro"><span className="kicker">PROTECȚIA DATELOR TALE</span><h1>Confidentialitate</h1>
      <p>Aflivra funcționează fără cont, fără cookie-uri și fără instrumente de urmărire. Această pagină spune exact ce date pleacă de la dispozitivul tău, de ce, pe ce temei, cui ajung, unde stau și cât timp le păstrăm — și cum le ștergi tu însuți, în orice moment.</p></div>
    <div className="two-columns">
      <article className="vpanel"><h2>Cine prelucrează datele și cum ne poți contacta</h2>
        <p>Aplicația Aflivra este operată de un operator individual, în România. Nu am desemnat un responsabil cu protecția datelor — proiectul e personal, iar adresa de contact de mai jos primește orice cerere legată de datele tale.</p>
        <p><strong>Contact operator: <a href="mailto:contactretetesecrete@gmail.com">contactretetesecrete@gmail.com</a></strong></p>
        <p>Scrie-ne pentru orice drept din lista de mai jos — inclusiv pentru acces, ștergere sau o plângere. Răspundem în termenele GDPR.</p>
        <p>Autoritatea de supraveghere din România este <a href="https://www.anpdcp.ro/" target="_blank" rel="noreferrer">ANSPDCP</a> (Autoritatea Națională pentru Supravegherea Prelucrării Datelor cu Caracter Personal); ai dreptul să îi adresezi o plângere.</p>
      </article>
      <article className="vpanel"><h2>Drepturile tale</h2>
        <p>Ai drepturile GDPR: <strong>acces</strong>, <strong>rectificare</strong>, <strong>ștergere</strong>, <strong>restricționare</strong>, <strong>opoziție</strong>, <strong>portabilitate</strong>, precum și <strong>retragerea consimțământului</strong> în orice moment, fără să afecteze prelucrarea anterioară.</p>
        <p>Majoritatea le poți exercita singur, direct din aplicație: „Șterge-mi datele” din „Ce s-a schimbat” șterge pe server toate urmăririle, evenimentele și abonamentele notificărilor acestui dispozitiv și schimbă identificatorul anonim; eliminarea unei urmăriri și oprirea notificărilor funcționează individual, pentru fiecare element.</p>
        <p>Pentru orice cerere pe care nu poți să o faci tu însuți, scrie la <a href="mailto:contactretetesecrete@gmail.com">contactretetesecrete@gmail.com</a>. Nu există taxe pentru exercițiul drepturilor din aplicație.</p>
      </article>
    </div>
    <div className="two-columns">
      <article className="vpanel"><h2>Ce date preluăm și pentru ce</h2>
        <p>Nimic nu pleacă de la dispozitivul tău decât la acțiunea ta explicită. Pe fiecare funcție:</p>
        <h3>Identificatorul anonim al dispozitivului</h3>
        <p>Un identificator aleator (UUID), generat pe dispozitivul tău abia la prima urmărire, fără cont și fără vreo informație despre tine. Leagă urmăririle, schimbările și abonamentele de acest dispozitiv, ca să funcționeze „Ce s-a schimbat”. Se schimbă la „Șterge-mi datele”.</p>
        <h3>Cele ce le urmărești</h3>
        <p>Referințele elementelor pe care le alegi tu: numere de dosar în justiție, CUI de firme, localități, acte normative, instituții pentru spectacole, județe pentru avertizări meteo. Sunt referințe către date publice, dar le tratăm ca date personale — arată ce interesează dispozitivul tău. Se salvează pe server, legate de identificatorul anonim.</p>
        <h3>Schimbările detectate</h3>
        <p>Titlul, descrierea scurtă și data fiecărei schimbări găsite la verificările automate ale surselor publice.</p>
        <h3>Abonamentul de notificări</h3>
        <p>Adresa abonamentului de push și cheile lui de criptare, furnizate de browserul tău la abonare. Se folosește doar pentru a-ți trimite notificările pe care le-ai permis.</p>
        <h3>Poziția aproximativă</h3>
        <p>Doar dacă o ceri tu — „Folosește locația mea”/„Actualizează poziția” — și dacă permiți în browser. Coordonatele sunt <strong>rotunjite pe dispozitiv</strong> înainte să plece: la <strong>2 zecimale</strong> (aproximativ 1,1 km) pentru vreme și prognoză, la <strong>3 zecimale</strong> (aproximativ 110 m) pentru contextul geografic al altor date — și <strong>nu sunt salvate pe server</strong>: în baza de date nu există nicio coloană de poziție. Punctul „Ești aici” de pe hartă este desenat din poziția raportată chiar de dispozitivul tău, numai în pagina ta, și nu pleacă nicăieri. Pe dispozitiv rămâne doar localitatea aleasă manual sau modul ales, în memoria browserului.</p>
        <h3>Preferințele și colecțiile</h3>
        <p>Localitatea preferată, planul de explorare, elementele salvate și marcajele din cititorul de acte rămân exclusiv în memoria browserului tău — nu pleacă niciodată către server și le ștergi din setările browserului.</p>
      </article>
      <article className="vpanel"><h2>Cât timp păstrăm datele</h2>
        <p>Regulile de retenție sunt aceleași în cod și pe această pagină — tura de verificare le aplică automat:</p>
        <ul>
          <li><strong>Urmăririle tale:</strong> până le ștergi. În plus, o urmărire fără nicio interacțiune (fără nicio schimbare detectată) de mai mult de <strong>180 de zile</strong> se elimină automat la tura de verificare.</li>
          <li><strong>Schimbările detectate (evenimentele):</strong> maximum <strong>365 de zile</strong>, după care se elimină automat.</li>
          <li><strong>Abonamentele de notificări:</strong> până te dezabonezi. Un abonament pe care serviciul de livrare îl raportează dispărut se șterge automat la următoarea verificare.</li>
          <li><strong>„Șterge-mi datele”:</strong> șterge imediat și integral urmăririle, schimbările și abonamentele acestui dispozitiv și schimbă identificatorul anonim — înainte de asta nu există nicio cale de a asocia un dispozitiv vechi cu unul nou.</li>
        </ul>
        <p>Salvarea pe dispozit (preferințele, colecțiile) nu are termen — rămâne până o ștergi din browser.</p>
      </article>
    </div>
    <div className="two-columns">
      <article className="vpanel"><h2>Temeiul legal</h2>
        <p>Pentru fiecare funcție care prelucrează date, temeiul este <strong>consimțământul</strong> tău, cerut chiar în momentul acțiunii:</p>
        <ul>
          <li><strong>Notificări push:</strong> apeși „Activează notificările”, browserul îți cere permisiunea, abia apoi se salvează abonamentul. Permisiunea browserului nu e suficientă singură — abonamentul se creează doar din buton. Retragerea: „Oprește notificările” sau dezabonarea din setările browserului.</li>
          <li><strong>Urmărire:</strong> fiecare „Urmărește” pe care îl apeși. Retragerea: „Nu mai urmări” sau eliminarea tuturor prin „Șterge-mi datele”.</li>
          <li><strong>Poziția:</strong> butonul de localizare plus permisiunea browserului; refuzul nu limitează aplicația — ea continuă cu România și localitatea aleasă manual. Retragerea: „Oprește localizarea” sau din setările browserului.</li>
        </ul>
        <p>Memoria funcțională strictă de pe dispozit (preferințele) este necesară exact serviciului pe care ți-l ceri și nu cere consimțământ separat — nu o folosim pentru niciun alt scop. Jurnalele tehnice de securitate ale platformei (adrese de cerere și ore) se păstrează pe temei de interes legitim, un scurt timp, pentru detectarea abuzului și a defecțiunilor.</p>
      </article>
      <article className="vpanel"><h2>Cui ajung datele și unde stau</h2>
        <p>Datele tale nu sunt vândute, închiriate sau partajate cu terți pentru scopurile lor. Constructorul și administratorul tehnologic este <strong>Cloudflare</strong>, care prelucrează doar ca împuternicit (procesator), în condițiile actului de prelucrare Cloudflare.</p>
        <p>Două excepții oneste, amândouă mărginite de scop:</p>
        <ul>
          <li><strong>Prognoza meteo:</strong> coordonatele deja rotunjite ajung, de pe serverul nostru, la serviciul public Open-Meteo — care primește poziția aproximativă a cererii noastre, nu a dispozitivului tău.</li>
          <li><strong>Notificările:</strong> mesajul criptat trece prin serviciul de livrare push al platformei tale (Google, Mozilla sau Apple), care nu îi poate citi conținutul — criptarea unui capăt în altul face parte din standard.</li>
        </ul>
        <p>Unde stau: aplicația rulează pe Cloudflare Workers, iar datele persistente (urmăriri, schimbări, abonamente) sunt păstrate în baza de date Cloudflare D1 din <strong>Uniunea Europeană</strong> (regiunea Europa de Vest). Cererile trec prin rețeaua globală Cloudflare, ca împuternicit, în condițiile actului de prelucrare; noi nu facem nicio transferare a datelor tale în afara UE.</p>
      </article>
    </div>
    <div className="two-columns">
      <article className="vpanel"><h2>Cookie-uri, statistici, profilare</h2>
        <p><strong>Zero.</strong> Aplicația nu folosește niciun cookie, niciun instrument de statistică, urmărire, profilare sau reclame, și nu încarcă cod de la terți care să facă asta. Nu vezi un banner de cookie-uri tocmai pentru că nu există nimic de consimțit dincolo de acțiunile tale explicite.</p>
        <p>Niciun mecanism al aplicației nu ia decizii automate despre tine și nu îți creează un profil. Ce vezi este determinat exclusiv de sursele publice și de alegerile de pe acest dispozitiv.</p>
      </article>
      <article className="vpanel"><h2>Sursa informației și schimbările politicii</h2>
        <p>Datele descrise aici provin exclusiv de la tine (alegerile de pe dispozitiv) — nu colectăm niciodată date despre tine de la terți. Fiecare afirmație tehnică de pe această pagină corespunde mecanismului real din aplicație; dacă mecanismul se schimbă, pagina se schimbă odată cu el.</p>
        <p>Publicăm orice modificare pe această pagină. Termenii de utilizare ai aplicației sunt pe pagina <a href="/termeni">Termeni</a>.</p>
        <p className="field-help">Ultima actualizare: 8 octombrie 2026.</p>
      </article>
    </div>
    <div className="service-links"><a href="/termeni">Termeni de utilizare</a><Link href="/#view=about">Despre date & platformă</Link><Link href="/">Înapoi la platformă</Link></div>
  </div></main>
  <SiteFooter/>
  </>;
}

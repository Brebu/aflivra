'use client';
import Link from 'next/link';
import '../aflivra.css';
import {SiteFooter} from '../site-footer';

// Termenii de utilizare — natura serviciului (agregator de date publice oficiale,
// fără garanții de actualitate), limitele de răspundere, licențele per sursă și
// folosirea corectă a bugetelor publice ale surselor.
export default function Termeni(){
  return <>
  <main className="v2"><div className="vwrap">
    <Link className="catalog-home" href="/">Aflivra · Înapoi la platformă</Link>
    <div className="page-intro"><span className="kicker">TERMENII SERVICIULUI</span><h1>Termeni de utilizare</h1>
      <p>Folosind Aflivra ești de acord cu termenii de mai jos. Sunt scurți pentru că serviciul e simplu: un agregator de date publice oficiale, fără cont, fără plată și fără reclame.</p></div>
    <div className="two-columns">
      <article className="vpanel"><h2>Ce este Aflivra</h2>
        <p>Un <strong>agregator de date publice oficiale ale României</strong>: cursuri BNR, observații și avertizări ANM, firme după CUI de la ANAF, dosare din portalul instanțelor, acte normative din Portalul Legislativ, fluxuri ale ministerelor, calendare publice, transport, cinematografe și altele — aduse la un loc, fiecare cu sursa, licența și data publicării la vedere.</p>
        <p>Serviciul se folosește direct din browser, fără cont. Poți instala aplicația pe ecranul de start al telefonului; ea rămâne aceeași aplicație web.</p>
      </article>
      <article className="vpanel"><h2>Sursa oficială rămâne adevărul de referință</h2>
        <p>Informația din Aflivra are două date evidente: data sursei și data ultimei verificări. Aplicația <strong>prezintă date publice „așa cum sunt publicate”</strong>, reîmprospătate automat de mai multe ori pe zi — publicarea unei ediții noi depinde de instituția care o produce, nu de noi.</p>
        <p><strong>Fără garanții de actualitate sau de completețe.</strong> Când o sursă nu răspunde, afișăm ultima copie validă, marcată clar ca atare. Pentru formele oficiale și obligatorii — acte normative, fișe de dosar, situații financiare — consultă întotdeauna sursa: fiecare element din aplicație poartă legătura curentă către ea, iar inventarul complet al surselor, cu adresele lor, este în <a href="/catalog">Catalogul surselor</a>. Aplicația nu este consultanță juridică, fiscală sau de alt fel.</p>
      </article>
    </div>
    <div className="two-columns">
      <article className="vpanel"><h2>Răspunderea</h2>
        <p>Serviciul este pus la dispoziție „ca atare”, gratuita, în scopuri informative și personale. În limitele permise de lege, operatorul nu răspunde pentru daune directe sau indirecte care decurg din folosirea aplicației sau din încredințarea deciziilor datelor afișate.</p>
        <p>Deciziile cu efecte juridice sau financiare — termene de judecată, termene fiscale, stadiul unui dosar, o situație de fapt — se verifică la sursa oficială, înainte, nu după.</p>
      </article>
      <article className="vpanel"><h2>Folosirea corectă</h2>
        <p>Datele vin de la instituții publice, prin bugete mărginite de cereri. Nu folosi aplicația pentru <strong>cereri automate masive</strong> sau repetitive care să dubleze căutările asupra surselor sau să împovăreze serviciul: plafoanele aplicației (maximum 100 de urmăriri și 5 abonamente de notificări pe dispozitiv) există tocmai pentru asta.</p>
        <p>Respectă termenii de utilizare ai surselor externe pe care le vizitezi prin legăturile din aplicație — legăturile trimit la instituții, iar relația ta cu ele este a ta, pe adresa lor.</p>
      </article>
    </div>
    <div className="two-columns">
      <article className="vpanel"><h2>Proprietate intelectuală și licențe</h2>
        <p>Datele agregate aparțin instituțiilor emitente și poartă licențele pe care fiecare instituție le publică — inventarul complet, cu licența fiecărei surse, este în <a href="/catalog">Catalogul surselor</a> și în exportul <strong>„Surse și licențe”</strong> din pagina de explorare a aplicației.</p>
        <p>Fotografiile poartă autorul și licența alături; ilustrațiile editoriale sunt generate cu ajutorul inteligenței artificiale și sunt etichetate ca atare, cu procesul lor de creare la vedere. Interfața aplicației este a operatorului.</p>
      </article>
      <article className="vpanel"><h2>Datele tale și schimbările termenilor</h2>
        <p>Ce preluăm de la dispozitivul tău, de ce și cât păstrăm — totul pe pagina <a href="/confidentialitate">Confidentialitate</a>, care face parte din acești termeni.</p>
        <p>Termenii se pot schimba odată cu serviciul; versiunea curentă este întotdeauna această pagină, cu data de mai jos. Schimbările care îți reduc drepturile asupra datelor tale sunt anunțate în aplicație înainte de a intra în vigoare.</p>
        <p className="field-help">Ultima actualizare: 7 octombrie 2026. Contact pentru orice întrebare: <a href="mailto:contactretetesecrete@gmail.com">contactretetesecrete@gmail.com</a>.</p>
      </article>
    </div>
    <div className="service-links"><a href="/confidentialitate">Confidentialitate</a><Link href="/#view=about">Despre date & platformă</Link><Link href="/">Înapoi la platformă</Link></div>
  </div></main>
  <SiteFooter/>
  </>;
}

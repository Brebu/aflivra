'use client';
import Link from 'next/link';
import {Compass,ShieldCheck} from 'lucide-react';

// Subsolul paginilor statice (cele servite ca rute proprii): aceleași legături legale
// și același contact de operator ca pe subsolul platformei — pagina juridică trebuie
// să existe pe fiecare pagină, nu doar pe cea principală.
export function SiteFooter(){
  return <footer className="vfooter"><div className="vwrap">
    <div><Link className="vbrand" href="/"><Compass size={25}/><span>aflivra.</span></Link><p>România, mai aproape de tine.</p><span className="footer-caption">DATE PUBLICE · SURSE VIZIBILE</span></div>
    <div className="footer-links"><Link href="/#view=about">Despre date & platformă</Link><a href="/catalog">Catalogul surselor</a><a href="/confidentialitate">Confidentialitate</a><a href="/termeni">Termeni</a><a href="mailto:contactretetesecrete@gmail.com">Contact: contactretetesecrete@gmail.com</a></div>
    <div className="footer-note"><ShieldCheck size={20}/><span>Fără cont.<br/>Preferințele rămân la tine.</span></div>
  </div></footer>;
}

'use client';
import {BookOpen} from 'lucide-react';
const GUIDES=[
 {revision:'35',file:'Aflivra_v35_Documentatie.pdf',summary:'fond și apel legate prin date și trimiteri oficiale'},
 {revision:'34',file:'Aflivra_v34_Documentatie.pdf',summary:'dosare urmărite la toate instanțele și ședințe păstrate integral'},
 {revision:'33',file:'Aflivra_v33_Documentatie.pdf',summary:'categorii și subcategorii după locația activă'},
 {revision:'32',file:'Aflivra_v32_Documentatie.pdf',summary:'cuprins apăsabil și copii consolidate confirmate'},
 {revision:'30',file:'Aflivra_v30_Documentatie.pdf',summary:'explorare, vreme și trailere'}];
export function SourcePackages(){return <section className="live-section"><div className="panel-top"><div><span className="kicker">DOCUMENTAȚIA PLATFORMEI</span><h2>Ghidurile platformei</h2><p>Ghidul complet de folosire, publicat ca PDF odată cu fiecare revizie. Fiecare ediție documentează platforma așa cum a fost lansată la revizia ei și rămâne disponibilă aici.</p></div><BookOpen size={26}/></div><div className="source-downloads">{GUIDES.map(g=><article className="source-download" key={g.file}><span>Ghidul platformei · revizia {g.revision}<small>{g.summary}</small></span><a className="text-link" href={'/downloads/'+g.file} download={g.file}>Descarcă PDF</a></article>)}</div></section>}

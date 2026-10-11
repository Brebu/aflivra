'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Download,FileText,LoaderCircle,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {SelectField} from './select-field';
import {LocationCityPicker,useLocation} from './location';
import {collectReport,type BusinessReport,type ReportRequest} from '@/lib/business-report';
import categoryMedia from '@/public/media/category-manifest.json';

async function read(path:string,args:Record<string,string>,signal:AbortSignal){
 const response=await fetch(path+'?'+new URLSearchParams(args),{signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])});
 const data:any=await response.json();if(!response.ok)throw Error(data.error||'Datele nu au putut fi citite.');return data;
}
async function asset(path:string,signal:AbortSignal){const response=await fetch(path,{signal});if(!response.ok)throw Error('Fișierul pentru export nu poate fi citit.');return new Uint8Array(await response.arrayBuffer());}
async function reportPhoto(signal:AbortSignal){
 const media=categoryMedia.find(item=>item.category==='companies');if(!media)return undefined;
 try{const response=await fetch('/media/'+media.file,{signal});if(!response.ok)return undefined;const bitmap=await createImageBitmap(await response.blob());
  try{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=212;const context=canvas.getContext('2d');if(!context)return undefined;
   const scale=Math.max(canvas.width/bitmap.width,canvas.height/bitmap.height);context.drawImage(bitmap,(canvas.width-bitmap.width*scale)/2,(canvas.height-bitmap.height*scale)/2,bitmap.width*scale,bitmap.height*scale);
   const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));if(!jpeg)return undefined;
   return {bytes:new Uint8Array(await jpeg.arrayBuffer()),caption:media.caption+' · fotografie ilustrativă',credit:media.credit,license:media.license,sourceUrl:media.sourceUrl};
  }finally{bitmap.close()}
 }catch{signal.throwIfAborted();return undefined}
}
export function BusinessReportWorkspace({initialCui=''}:{initialCui?:string}){
 const geo=useLocation(),id=useId(),[scope,setScope]=useState<'current'|'other'|'national'>('current'),[other,setOther]=useState(geo.city),[radius,setRadius]=useState('15'),[activity,setActivity]=useState(''),[title,setTitle]=useState('Raport integrat de cercetare comercială'),[cuis,setCuis]=useState(initialCui),[model,setModel]=useState(false),[inputs,setInputs]=useState({monthlyRevenue:'',fixedCosts:'',variableCostPercent:'',investment:''});
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[report,setReport]=useState<BusinessReport|null>(null),[downloads,setDownloads]=useState<{pdf:string;json:string;name:string}|null>(null),active=useRef<AbortController|null>(null),urls=useRef<string[]>([]);
 function release(){for(const url of urls.current)URL.revokeObjectURL(url);urls.current=[];}
 useEffect(()=>()=>{active.current?.abort();for(const url of urls.current)URL.revokeObjectURL(url)},[]);
 async function generate(){
  active.current?.abort();const controller=new AbortController();active.current=controller;setError('');setBusy(true);setReport(null);setDownloads(null);release();
  try{
   const city=scope==='other'?other:geo.city,center=scope==='other'?other:geo.center;
   const request:ReportRequest={title:title.trim(),activity:activity.trim(),cuis:[...new Set(cuis.split(/[\s,;]+/).map(value=>value.trim()).filter(Boolean))],area:{scope:scope==='national'?'national':'nearby',locality:city.name,county:city.county||'',lat:center.lat,lon:center.lon,radius:Number(radius)},...(model?{assumptions:Object.fromEntries(Object.entries(inputs).map(([key,value])=>{if(!value.trim())throw Error('Completează toate ipotezele sau dezactivează scenariile.');return [key,Number(value.replace(',','.'))]})) as ReportRequest['assumptions']}: {})};
   const data=await collectReport(request,read,controller.signal,setProgress);controller.signal.throwIfAborted();setProgress('Se construiește PDF-ul cu tabele, grafice și surse…');
   const [{createBusinessReportPdf},regular,semibold,photo]=await Promise.all([import('@/lib/business-report-pdf'),asset('/fonts/Inter-Regular.ttf',controller.signal),asset('/fonts/Inter-Semibold.ttf',controller.signal),reportPhoto(controller.signal)]);
   const bytes=await createBusinessReportPdf(data,{regular,semibold},photo,controller.signal);controller.signal.throwIfAborted();
   const pdf=URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/pdf'})),json=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));urls.current=[pdf,json];
   const name='Aflivra_raport_'+(scope==='national'?'Romania':city.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_'))+'_'+data.generatedAt.slice(0,10);setReport(data);setDownloads({pdf,json,name});setProgress('Raportul este pregătit pentru descărcare.');
  }catch(reason){if(controller.signal.aborted){if(active.current===controller)setProgress('Generare anulată.');}else setError(reason instanceof Error?reason.message:'Raportul nu a putut fi generat.');}
  finally{if(active.current===controller){active.current=null;setBusy(false)}}
 }
 const selected=scope==='other'?other:geo.city;
 return <section className="live-section business-report" aria-labelledby={id+'-heading'}>
  <h2 id={id+'-heading'}><FileText size={24}/>Raport integrat PDF</h2>
  <p>Alege aria și activitatea, apoi adaugă firmele pe care vrei să le compari. Raportul reunește date Aflivra, grafice, imagine, tabele și proveniența fiecărei surse.</p>
  <form onSubmit={event=>{event.preventDefault();if(!busy)void generate()}}>
   <fieldset disabled={busy} className="report-fields"><legend>Aria și selecția</legend>
    <div className="entity-filters">
     <label><span className="control-label">Aria raportului</span><SelectField aria-label="Aria raportului" value={scope} onChange={event=>setScope(event.target.value as typeof scope)}><option value="current">Localitatea actuală</option><option value="other">Altă localitate</option><option value="national">România</option></SelectField></label>
     {scope!=='national'&&<label><span className="control-label">Rază în km</span><Input aria-label="Rază în km" type="number" min="1" max="100" value={radius} onChange={event=>setRadius(event.target.value)} required/></label>}
    </div>
    {scope==='other'&&<LocationCityPicker value={other} onSelect={setOther}/>}
    {scope!=='national'&&<p className="small-muted">Centru: {scope==='current'&&geo.position?geo.label:selected.name}{selected.county?' · '+selected.county:''}{scope==='current'&&!geo.hasLocal?' · centru implicit București; poți alege altă localitate':''}. Distanțe în linie dreaptă.</p>}
    <div className="entity-filters">
     <label><span className="control-label">Activitate sau nume de căutat</span><Input aria-label="Activitate sau nume de căutat" placeholder="De exemplu: cafenea, mobilă, hotel" maxLength={100} value={activity} onChange={event=>setActivity(event.target.value)} required/></label>
     <label><span className="control-label">Titlul raportului</span><Input aria-label="Titlul raportului" value={title} maxLength={160} onChange={event=>setTitle(event.target.value)} required/></label>
    </div>
    <label className="report-cuis"><span className="control-label">CUI-uri de comparat · opțional, maximum 8</span><Input aria-label="CUI-uri de comparat" value={cuis} onChange={event=>setCuis(event.target.value)} placeholder="Cifre, separate prin virgulă sau spațiu"/></label>
    <p className="small-muted">Căutarea pe hartă identifică locuri. CUI-urile identifică firmele selectate de tine; bilanțurile lor acoperă întreaga entitate fiscală.</p>
   </fieldset>
   <fieldset disabled={busy} className="report-fields"><legend>Scenarii financiare opționale</legend>
    <label className="report-toggle"><input type="checkbox" checked={model} onChange={event=>setModel(event.target.checked)}/><span>Include ipotezele mele și sensibilitatea ±20%</span></label>
    {model&&<div className="entity-filters">{([{key:'monthlyRevenue',label:'Venit lunar RON'},{key:'fixedCosts',label:'Costuri fixe lunare RON'},{key:'variableCostPercent',label:'Cost variabil % din venit'},{key:'investment',label:'Investiție inițială RON'}] as const).map(field=><label key={field.key}><span className="control-label">{field.label}</span><Input aria-label={field.label} inputMode="decimal" required value={inputs[field.key]} onChange={event=>setInputs(old=>({...old,[field.key]:event.target.value}))}/></label>)}</div>}
    <p className="small-muted">Ipotezele tale rămân separate de datele observate. Nu sunt prognoze sau costuri confirmate.</p>
   </fieldset>
   <div className="report-actions"><Button type="submit" disabled={busy}>{busy?<LoaderCircle className="animate-spin" size={17}/>:<FileText size={17}/>} {busy?'Se generează…':'Generează raportul PDF'}</Button>{busy&&<Button type="button" variant="outline" onClick={()=>active.current?.abort()}><X size={17}/>Anulează</Button>}</div>
  </form>
  {progress&&<p role="status" aria-live="polite">{progress}</p>}{error&&<p role="alert">{error}</p>}
  {downloads&&report&&<div className="report-result"><h3>{report.request.title}</h3><p>{report.places.length} locuri incluse{report.placesTotal!==null?' din '+report.placesTotal:''} · {new Set(report.financials.map(row=>row.cui)).size} firme cu bilanțuri · {report.sources.length} răspunsuri Aflivra.</p>
   <div className="report-actions"><Button asChild><a href={downloads.pdf} download={downloads.name+'.pdf'}><Download size={17}/>Descarcă PDF</a></Button><Button asChild variant="outline"><a href={downloads.json} download={downloads.name+'_date.json'}>Descarcă datele și sursele</a></Button></div>
   <div className="report-table-scroll"><table className="facts-table"><thead><tr><th>Sursă</th><th>Stare</th><th>Publicare</th></tr></thead><tbody>{report.sources.map(source=><tr key={source.id}><td>{source.id} · {source.tool}</td><td>{source.status}{source.error?' · eroare':''}</td><td>{source.publishedAt||'Nefurnizată'}</td></tr>)}</tbody></table></div>
   <p className="small-muted">Sursele indisponibile și datele vechi sunt semnalate în PDF. Căutarea include maximum 600 locuri; totalul și acoperirea sunt afișate explicit.</p>
  </div>}
 </section>;
}

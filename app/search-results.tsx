'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,ExternalLink,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {federatedSearch,federatedCollect,federatedFamilies,type FederatedItem,type FederatedSearchResult,type FederatedStory,type FederatedPlace} from '@/lib/live/federated';
import {countText} from '@/lib/live/query';
import {snapshotJson} from './snapshot-store';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';

const familyById=new Map(federatedFamilies.map(f=>[f.id,f]));
const externalLinkKinds=['article','dataset','story'];

export function FederatedResults({term,gallery,onNavigate,onReset}:{term:string;gallery:readonly FederatedPlace[];onNavigate:(item:FederatedItem)=>void;onReset:()=>void}){
 const [stories,setStories]=useState<readonly FederatedStory[]|null>(null);
 useEffect(()=>{const c=new AbortController();snapshotJson<any>('/stories/manifest.json',undefined,c.signal).then(m=>snapshotJson<any>('/stories/index.json',m.index,c.signal)).then(d=>{if(Array.isArray(d.items))setStories(d.items)}).catch(()=>{});return()=>c.abort()},[]);
 const [settled,setSettled]=useState(term);
 useEffect(()=>{const t=setTimeout(()=>setSettled(term),300);return()=>clearTimeout(t)},[term]);
 const base=useMemo(()=>federatedSearch(settled,{gallery,stories:stories||[]}),[settled,gallery,stories]);
 const [result,setResult]=useState<FederatedSearchResult>(base);
 useEffect(()=>{
  const runs=base.requests.map(request=>{const c=new AbortController();return{c,promise:fetchWithServerRetry(request.url,{signal:c.signal,cache:'no-store'}).then(r=>r.json()).then(payload=>{if(c.signal.aborted)return;setResult(prev=>federatedCollect(prev.term===base.term?prev:base,request.family,payload))}).catch(()=>{})}});
  return()=>{runs.forEach(run=>run.c.abort())};
 },[base]);
 const trimmed=term.trim();
 if(!trimmed||!result)return null;
 const current=result.term===settled?result:base;
 if(base.note)return <section className="live-section federated-results" data-testid="federated-results"><div className="panel-top"><div><span className="kicker">O CAUTARE, TOATE SURSELE</span><h2>Rezultate pentru „{trimmed}”</h2></div><Search size={26}/></div><p className="reader-note" role="status" data-testid="federated-note">{base.note}</p></section>;
 const groups=current.groups,pending=current.families.filter(f=>f.status==='pending');
 const pendingInGroup=(id:string)=>pending.filter(f=>familyById.get(f.family)?.category===id);
 const foundAnywhere=groups.some(g=>g.count>0);
 return <section className="live-section federated-results" data-testid="federated-results" aria-label="Rezultatele căutării în toate categoriile">
  <div className="panel-top"><div><span className="kicker">O CAUTARE, TOATE SURSELE</span><h2>Rezultate pentru „{trimmed}”</h2><p>Inventarul național de locuri, catalogul de date publice, registrele profesionale, poveștile integrale și anunțurile oficiale, într-o singură listă grupată pe categorii.</p></div><Search size={26}/></div>
  {pending.length>0&&<p className="live-loading" role="status" data-testid="federated-busy">Se caută acum în sursele conectate — {countText(pending.length,'sursă este','surse sunt')} în curs de verificare.</p>}
  {groups.map(group=>{
   const waiting=pendingInGroup(group.id);
   return <article key={group.id} className="federated-group" data-testid="federated-group" data-group={group.id}>
    <header><h3>{group.label}</h3><span className="small-muted">{countText(group.count,'rezultat','rezultate')}</span></header>
    {group.items.length>0?<ul className="federated-rows">{group.items.map((item,index)=><li key={item.family+':'+item.id+':'+index}>
     <button type="button" className="federated-row" data-testid="federated-row" onClick={()=>onNavigate(item)}>
      <span className="federated-row-main"><strong>{item.title}</strong>{item.subtitle&&<small>{item.subtitle}</small>}{item.snippet&&<p>{item.snippet}</p>}</span>
      <span className="federated-row-side"><small>{[item.subcategory&&item.subcategory!==item.title?item.subcategory:undefined,item.source].filter(Boolean).join(' · ')}</small><span className="federated-row-open">Deschide <ArrowUpRight size={15}/></span></span>
     </button>
     {item.url&&externalLinkKinds.includes(item.kind)&&<a className="federated-row-source text-link" href={item.url} target="_blank" rel="noreferrer">La sursă <ExternalLink size={14}/></a>}
    </li>)}</ul>:<p className="live-empty">Nicio potrivire în această categorie.</p>}
    {group.families.map(f=>{
     if(f.status==='gate'&&f.note)return <p key={f.family} className="small-muted" role="status">{familyById.get(f.family)?.label}: {f.note}</p>;
     if(f.status==='unavailable')return <p key={f.family} className="source-warning" role="status">{familyById.get(f.family)?.label}: {f.note||'Sursa nu a răspuns pentru această căutare.'}</p>;
     const shown=group.items.filter(item=>item.family===f.family).length;
     if(f.status==='done'&&typeof f.total==='number'&&f.total>shown)return <p key={f.family} className="small-muted">{familyById.get(f.family)?.label}: {countText(f.total,'rezultat găsit la sursă','rezultate găsite la sursă')} — afișăm primele {countText(shown,'potrivire','potriviri')}.</p>;
     return null;
    })}
    {waiting.map(f=><p key={f.family} className="small-muted" role="status">Se caută și în {familyById.get(f.family)?.label}…</p>)}
   </article>;
  })}
  {!foundAnywhere&&!pending.length&&<div className="live-empty federated-empty" data-testid="federated-empty"><p>Nicio categorie conectată nu are potriviri pentru „{trimmed}”. Verifică scrierea sau încearcă un termen mai scurt.</p><Button variant="outline" onClick={onReset}>Resetează căutarea</Button></div>}
 </section>;
}

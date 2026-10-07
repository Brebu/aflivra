'use client';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Bell,BellOff,History,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {useWatch,type WatchEvent,type WatchKind,type WatchRow} from './watch-state';
import {WatchButton,watchKindNoun,watchOpenAria} from './watch-button';
import {dateText} from './live-data';
import {countText} from '@/lib/live/query';

// The watch center „Ce s-a schimbat": the per-watch list with the changes that arrived
// unseen, the newest-first event feed, the honest sweep cadence from the backend and
// the push/purge controls. Opening the feed acknowledges exactly the events that were
// unseen — viewing is what clears the badge.
function unseenCountText(n:number){return countText(n,'schimbare nevizitată','schimbări nevizitate')}

export function WatchCenter({onOpen}:{onOpen:(kind:WatchKind,ref:string,label:string|null)=>void}){
  const watch=useWatch();
  // Stable provider callbacks + an onOpen ref keep the feed load from re-running on every
  // context value change (the badge re-render would otherwise re-fetch the feed in a loop).
  const loadEvents=watch.loadEvents,ackEvents=watch.ackEvents,optimisticSeen=watch.optimisticSeen;
  const onOpenRef=useRef(onOpen);
  useEffect(()=>{onOpenRef.current=onOpen});
  const [events,setEvents]=useState<WatchEvent[]|null>(null),[hasMore,setHasMore]=useState(false);
  const [feedError,setFeedError]=useState(''),[eventMiss,setEventMiss]=useState('');
  const [purgeOpen,setPurgeOpen]=useState(false),[purgeBusy,setPurgeBusy]=useState(false);
  const pendingEvent=useRef<string|null>(null),serial=useRef(0);
  const loadFeed=useCallback(()=>{
    const n=++serial.current;
    void loadEvents().then(result=>{
      if(serial.current!==n)return;
      setFeedError('');
      if(!result){setEvents([]);setFeedError('Schimbările nu pot fi încărcate acum. Reîncearcă.');return}
      setEvents(result.events);
      setHasMore(result.hasMore);
      const unseenEvents=result.events.filter(event=>!event.seen);
      const asked=pendingEvent.current;
      pendingEvent.current=null;
      if(document.visibilityState!=='visible'){if(asked)pendingEvent.current=asked;return}
      // The center is the reader: viewed events are acked, per the notification contract.
      if(asked){
        const found=result.events.find(event=>event.id===asked);
        if(found){
          void ackEvents([asked]);
          optimisticSeen([found]);
          onOpenRef.current(found.kind,found.ref,found.title);
          return;
        }
        setEventMiss('Schimbarea cerută nu mai este între cele mai recente '+countText(result.events.length,'schimbare mai recentă','schimbări mai recente')+'. Deschide lista de mai jos.');
      }else if(unseenEvents.length){
        void ackEvents(unseenEvents.map(event=>event.id));
        optimisticSeen(unseenEvents);
      }
    });
  },[loadEvents,ackEvents,optimisticSeen]);
  // A push deep link lands as #view=watch&event=<id>: keep the id, then load the feed.
  useEffect(()=>{
    const read=()=>{
      const params=new URLSearchParams(location.hash.slice(1));
      if(params.get('view')==='watch'&&params.get('event')){
        pendingEvent.current=params.get('event');
        loadFeed();
      }
    };
    read();
    window.addEventListener('hashchange',read);
    return()=>{window.removeEventListener('hashchange',read)};
  },[loadFeed]);
  useEffect(()=>{loadFeed()},[loadFeed]);
  useEffect(()=>{
    const wake=()=>{if(document.visibilityState==='visible')loadFeed()};
    document.addEventListener('visibilitychange',wake);
    return()=>{document.removeEventListener('visibilitychange',wake)};
  },[loadFeed]);
  const rows=watch.watches;
  const unseenByWatch=new Map<string,number>();
  for(const event of events||[])if(!event.seen)unseenByWatch.set(event.kind+'|'+event.ref,(unseenByWatch.get(event.kind+'|'+event.ref)||0)+1);
  const confirmPurge=async()=>{
    setPurgeBusy(true);
    const done=await watch.purge();
    setPurgeBusy(false);
    setPurgeOpen(false);
    if(done){setEvents([]);setHasMore(false);toast.success('Datele urmărite au fost șterse')}
    else toast(watch.error||'Datele nu au put fi șterse acum.');
  };
  return <div className="watch-center">
  <div className="page-intro row-intro">
    <div><span className="kicker">CE S-A SCHIMBAT ÎN CE URMĂREȘTI</span><h1>Ce s-a schimbat.</h1>
    <p>Schimbările elementelor urmărite, cu sursa la vedere. Fără cont — legătura rămâne la acest dispozitiv, iar datele șterse nu pot fi recuperate.</p></div>
    <div className="watch-controls">
      <Button variant="outline" onClick={()=>{watch.refresh();loadFeed()}} disabled={watch.busy}><History size={17}/>{watch.busy?'Se verifică…':'Reîncarcă'}</Button>
      <Button variant="outline" className="watch-purge" onClick={()=>setPurgeOpen(true)} disabled={!rows.length&&!events?.length}><Trash2 size={17}/>Șterge-mi datele</Button>
    </div>
  </div>
  {watch.error&&<div className="live-error" role="alert"><p>{watch.error}</p><Button onClick={()=>watch.refresh()}>Reîncearcă</Button></div>}
  {watch.sweepState&&<div className="live-freshness watch-sweep" aria-label="Cadența verificării"><div><span className="source-chip">{watch.sweepState.lastOk?'Verificare automată':'Ultima verificare incompletă'}</span><strong>Verificăm de {watch.sweepState.runsPerDay} ori pe zi</strong></div><p>Orele verificării: {watch.sweepState.timesUtc} UTC · Ultima tură: {dateText(watch.sweepState.lastRunAt)}{watch.sweepState.lastEvents>0&&' · '+countText(watch.sweepState.lastEvents,'schimbare','schimbări')+' la ultima tură'}{watch.sweepState.lastOk?'':' · ultima tură nu a reușit complet; reluăm la următoarea oră'}</p></div>}
  <PushSection/>
  {eventMiss&&<p className="source-warning" role="status">{eventMiss}</p>}
  <section className="watch-list" aria-label="Elementele urmărite">
    <h2>Ce urmărești</h2>
    {watch.busy&&!rows.length?<p role="status">Se încarcă urmăririle…</p>:!rows.length?(
      <div className="watch-empty"><Bell size={28}/><h3>Nu urmărești nimic încă</h3><p>Apasă „Urmărește” pe un dosar în justiție, o firmă după CUI, localitatea ta din preferințe, un act normativ din cititor sau spectacolele unei instituții.</p></div>
    ):<div className="watch-items">{rows.map(row=><WatchItemRow key={row.kind+'|'+row.ref} row={row} unseen={(events?unseenByWatch.get(row.kind+'|'+row.ref)||0:row.unseenCount)} onOpen={onOpen}/>)}</div>}
  </section>
  <section className="watch-feed-section" aria-label="Schimbările recente">
    <h2>Schimbările</h2>
    {feedError&&<div className="live-error" role="alert"><p>{feedError}</p><Button onClick={loadFeed}>Reîncearcă</Button></div>}
    {!feedError&&events!==null&&<>
      {events.length?<>
        <p className="field-help">Primele {countText(Math.min(events.length,50),'schimbare mai recentă','schimbări mai recente')}, de la cea mai nouă la cea mai veche.{hasMore&&' Sunt și schimbări mai vechi decât cele mai recente 50.'}</p>
        <p className="field-help">Prima verificare după adăugare constată starea actuală a sursei; schimbările apar de la verificările următoare.</p>
        <div className="watch-feed">{events.map(event=><article key={event.id} className="watch-event" data-unseen={!event.seen}>
          <div className="watch-event-head"><span className="kicker">{watchKindNoun[event.kind]}</span>{!event.seen&&<span className="watch-unseen">Nou</span>}<small>{dateText(event.createdAt)}</small></div>
          <h3>{event.title}</h3>
          <p>{event.body}</p>
          <Button variant="outline" aria-label={watchOpenAria(event.kind,event.ref)} onClick={()=>onOpen(event.kind,event.ref,event.title)}>Deschide</Button>
        </article>)}</div>
      </>:<div className="watch-empty"><BellOff size={28}/><h3>Nicio schimbare de la ultima verificare</h3><p>Verificăm sursele publice de mai multe ori pe zi; afișăm doar ce s-a schimbat efectiv.</p></div>}
    </>}
  </section>
  <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}><DialogContent className="v2">
    <DialogHeader><DialogTitle>Ștergi toate datele urmărite?</DialogTitle>
    <DialogDescription>Se șterg de pe server {countText(rows.length,'element urmărit','elemente urmărite')}, evenimentele și abonamentele de notificări ale acestui dispozitiv. Identificatorul anonim al dispozitivului se schimbă; datele șterse nu pot fi recuperate.</DialogDescription></DialogHeader>
    <div className="reset-actions"><Button variant="outline" onClick={()=>setPurgeOpen(false)}>Păstrează</Button><Button onClick={()=>void confirmPurge()} disabled={purgeBusy}>{purgeBusy?'Se șterge…':'Șterge-mi datele'}</Button></div>
  </DialogContent></Dialog>
  </div>;
}

function WatchItemRow({row,unseen,onOpen}:{row:WatchRow;unseen:number;onOpen:(kind:WatchKind,ref:string,label:string|null)=>void}){
  const watch=useWatch();
  return <article className="watch-item" data-kind={row.kind}>
    <div className="watch-item-head"><span className="kicker">{watchKindNoun[row.kind]}</span>{unseen>0&&<span className="watch-unseen-count">{unseenCountText(unseen)}</span>}</div>
    <h3>{row.label||row.ref}</h3>
    <p className="watch-item-ref">{row.kind==='firma'?'CUI '+row.ref:row.ref}</p>
    <p className="watch-item-dates">Urmărit de la {dateText(row.createdAt)}{row.lastEventAt&&' · ultima schimbare: '+dateText(row.lastEventAt)}{row.muted&&' · notificările sunt oprite pentru acest element'}</p>
    <div className="watch-item-actions">
      <Button variant="outline" aria-label={watchOpenAria(row.kind,row.ref)} onClick={()=>onOpen(row.kind,row.ref,row.label)}>Deschide</Button>
      <Button variant="ghost" aria-label={(row.muted?'Reia notificările pentru ':'Mutează notificările pentru ')+watchKindNoun[row.kind]+' '+row.ref} onClick={()=>void watch.setMuted(row.kind,row.ref,!row.muted).then(done=>done&&toast(row.muted?'Notificările au fost reluate pentru acest element.':'Notificările au fost oprite pentru acest element.'))}>{row.muted?<><Bell size={17}/>Reia</>:<><BellOff size={17}/>Mutează</>}</Button>
      <Button variant="ghost" aria-label={'Nu mai urmări '+watchKindNoun[row.kind]+' '+row.ref} onClick={()=>void watch.remove(row.kind,row.ref).then(done=>done&&toast('Nu mai este urmărit'))}>Elimină</Button>
    </div>
  </article>;
}

// urlBase64 (65 bytes, no padding) → the raw applicationServerKey bytes pushManager.subscribe needs.
function applicationServerKey(value:string):Uint8Array<ArrayBuffer>{
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  const bytes=new Uint8Array(raw.length);
  for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);
  return bytes;
}

// Push opt-in starts only from the user's tap on the button. iOS Safari truth: web push
// exists only in the app installed to the home screen, so in the browser we say so
// instead of prompting. Without a server VAPID key, subscriptions are disabled honestly.
export function PushSection(){
  const watch=useWatch();
  const [state,setState]=useState<'checking'|'unsupported'|'ready'|'ios-browser'>('checking');
  const [subscribed,setSubscribed]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');
  useEffect(()=>{
    // Platform detection runs off the synchronous effect path: the setState cascade
    // is deferred so the first render commits before the branch re-renders.
    void Promise.resolve().then(()=>{
      const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone=(navigator as any).standalone===true||window.matchMedia('(display-mode: standalone)').matches;
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||typeof Notification==='undefined'){setState('unsupported');return}
      if(ios&&!standalone){setState('ios-browser');return}
      setState('ready');
      void navigator.serviceWorker.ready.then(registration=>registration.pushManager.getSubscription()).then(subscription=>setSubscribed(!!subscription)).catch(()=>{});
    });
  },[]);
  const enable=async()=>{
    if(!watch.vapidPublicKey){setNote('Notificările push nu sunt configurate pe server acum. Schimbările rămân vizibile aici, în centru.');return}
    setBusy(true);setNote('');
    try{
      // The static permission read can disagree with the real state; the user's tap asks the
      // browser directly, and only a real „granted" continues to the subscription.
      const granted=Notification.permission==='granted'?'granted':await Notification.requestPermission();
      if(granted!=='granted'){setNote('Notificările nu au fost permise. Le poți activa oricând din setările browserului.');return}
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(watch.vapidPublicKey)});
      const json=subscription.toJSON();
      if(!json?.endpoint||!json.keys?.p256dh||!json.keys.auth)throw Error('Browserul nu a furnizat un abonament complet.');
      await watch.subscribePush({endpoint:json.endpoint,keys:{p256dh:json.keys.p256dh,auth:json.keys.auth}});
      setSubscribed(true);
    }catch(error){
      setNote(error instanceof Error&&error.message?error.message:'Notificările nu au putut fi activate acum.');
    }finally{
      setBusy(false);
    }
  };
  const disable=async()=>{
    setBusy(true);setNote('');
    try{
      const registration=await navigator.serviceWorker.ready;
      const subscription=await registration.pushManager.getSubscription();
      if(subscription){
        const endpoint=subscription.endpoint;
        await subscription.unsubscribe();
        // The off toggle clears the server row for this device too (v1 addendum);
        // a failure there is not a failure to stop — the 410 sweep stays the safety net.
        await watch.unsubscribePush(endpoint);
      }
      setSubscribed(false);
    }catch{
      setNote('Notificările nu au putut fi oprite acum. Încearcă din nou.');
    }finally{
      setBusy(false);
    }
  };
  return <section className="watch-push" aria-label="Notificări">
    <h2>Notificări pe acest dispozitiv</h2>
    {state==='unsupported'&&<p className="field-help">Acest browser nu suportă notificări push. Schimbările rămân vizibile aici, în centru.</p>}
    {state==='ios-browser'&&<><p>Pe iPhone și iPad, notificările sosesc în aplicația instalată pe ecranul de start.</p><p className="field-help">Instalează aplicația și activează notificările: meniul Safari → „Adaugă la ecranul de start”, apoi deschide Aflivra din ecranul de start.</p></>}
    {state==='ready'&&!watch.vapidPublicKey&&<p className="field-help">Notificările push nu sunt configurate pe server acum. Schimbările rămân vizibile aici, în centru.</p>}
    {state==='ready'&&watch.vapidPublicKey&&<>
      {subscribed?<>
        <p>Notificările sunt active pe acest dispozitiv.</p>
        <p className="field-help">Primești o notificare la fiecare schimbare nouă, atât cât permite bugetul de trimitere al verificării; feedul de aici rămâne sursa completă.</p>
        <Button variant="outline" onClick={()=>void disable()} disabled={busy}><BellOff size={17}/>{busy?'Se oprește…':'Oprește notificările pe acest dispozitiv'}</Button>
      </>:<>
        <p className="field-help">Primești o notificare la fiecare schimbare nouă, dacă serverul o poate trimite. Cerem permisiunea browserului doar când apeși butonul.</p>
        <Button onClick={()=>void enable()} disabled={busy}><Bell size={17}/>{busy?'Se activează…':'Activează notificările'}</Button>
      </>}
    </>}
    {note&&<p role="status">{note}</p>}
  </section>;
}

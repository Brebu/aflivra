'use client';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import {ensureInstallId,readInstallId,clearInstallId} from './install-id';

// Client state for the frozen Builder-A watch contract:
// POST/DELETE/GET /api/watch, GET /api/watch-events, POST /api/watch-events/ack,
// POST /api/watch/subscribe, POST /api/watch/purge. Every request carries the
// anonymous installId; without a persisted one, nothing is asked of the server
// until the user's first watch action creates it.
export type WatchKind='dosar'|'firma'|'localitate'|'act'|'venue'|'meteo';
export type WatchRow={id:string;kind:WatchKind;ref:string;label:string|null;createdAt:string;muted:boolean;lastEventAt:string|null;unseenCount:number};
export type WatchEvent={id:string;kind:WatchKind;ref:string;title:string;body:string;url:string;createdAt:string;seen:boolean};
export type WatchSweepState={runsPerDay:number;timesUtc:string;lastRunAt:string|null;lastEvents:number;lastPushes:number;lastOk:boolean;note:string};
type WatchList={watches:WatchRow[];sweepState:WatchSweepState|null;notification:{vapidPublicKey:string|null};kinds:WatchKind[]};

type WatchState={
  id:string|null;
  watches:WatchRow[];
  sweepState:WatchSweepState|null;
  vapidPublicKey:string|null;
  busy:boolean;
  error:string;
  add:(kind:WatchKind,ref:string,label?:string)=>Promise<boolean>;
  remove:(kind:WatchKind,ref:string)=>Promise<boolean>;
  isWatched:(kind:WatchKind,ref:string)=>boolean;
  refresh:()=>void;
  purge:()=>Promise<boolean>;
  loadEvents:()=>Promise<{events:WatchEvent[];hasMore:boolean}|null>;
  ackEvents:(ids:string[])=>Promise<void>;
  optimisticSeen:(events:WatchEvent[])=>void;
  subscribePush:(subscription:{endpoint:string;keys:{p256dh:string;auth:string}})=>Promise<boolean>;
  setMuted:(kind:WatchKind,ref:string,muted:boolean)=>Promise<boolean>;
  unsubscribePush:(endpoint:string)=>Promise<void>;
};
const initial:WatchState={id:null,watches:[],sweepState:null,vapidPublicKey:null,busy:false,error:'',add:async()=>false,remove:async()=>false,isWatched:()=>false,refresh:()=>{},purge:async()=>false,loadEvents:async()=>null,ackEvents:async()=>{},optimisticSeen:()=>{},subscribePush:async()=>false,setMuted:async()=>false,unsubscribePush:async()=>{}};
const WatchContext=createContext<WatchState>(initial);

async function watchJson(url:string,init?:RequestInit):Promise<any>{
  const response=await fetchWithServerRetry(url,{...init,cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error||'Cererea de urmărire nu a reușit.');
  return data;
}

export function WatchProvider({children}:{children:React.ReactNode}){
  const [id,setId]=useState<string|null>(null),[state,setState]=useState<WatchList>({watches:[],sweepState:null,notification:{vapidPublicKey:null},kinds:[]});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const serial=useRef(0);
  const install=useRef<string|null>(null);
  const load=useCallback(async()=>{
    const current=install.current||(readInstallId());
    if(!current)return;
    const n=++serial.current;
    setBusy(true);
    try{
      const data=await watchJson('/api/watch?'+new URLSearchParams({installId:current}));
      if(serial.current!==n)return;
      install.current=current;
      setId(current);
      setState({
        watches:Array.isArray(data?.watches)?data.watches.filter((w:any)=>w&&typeof w.ref==='string'): [],
        sweepState:data?.sweepState&&typeof data.sweepState==='object'?data.sweepState:null,
        notification:data?.notification&&typeof data.notification==='object'?{vapidPublicKey:typeof data.notification.vapidPublicKey==='string'?data.notification.vapidPublicKey:null}:{vapidPublicKey:null},
        kinds:Array.isArray(data?.kinds)?data.kinds:[],
      });
      setError('');
    }catch(e){
      if(serial.current!==n)return;
      setError(e instanceof Error?e.message:'Urmăririle nu pot fi încărcate acum.');
    }finally{
      if(serial.current===n)setBusy(false);
    }
  },[]);
  useEffect(()=>{
    void load();
    // The badge is reader-driven: recheck on foreground/online like the live hooks do. No polling interval.
    const wake=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void load()};
    document.addEventListener('visibilitychange',wake);
    window.addEventListener('online',wake);
    return()=>{document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake)};
  },[load]);
  const add=useCallback(async(kind:WatchKind,ref:string,label?:string)=>{
    try{
      const installId=install.current||ensureInstallId();
      install.current=installId;
      setId(installId);
      const data=await watchJson('/api/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installId,kind,ref,label})});
      const watch=data?.watch;
      if(watch&&typeof watch.ref==='string'){
        setState(s=>({...s,watches:[...s.watches.filter(w2=>!(w2.kind===watch.kind&&w2.ref===watch.ref)),{...watch,label:watch.label??label??null}]}));
        // The first add creates the identity: pull the list once so the badge, the sweep
        // state and the push key are real from that moment (hash navigation never remounts).
        void load();
      }
      setError('');
      return true;
    }catch(e){
      setError(e instanceof Error?e.message:'Urmărirea nu a put fi salvată.');
      return false;
    }
  },[load]);
  const remove=useCallback(async(kind:WatchKind,ref:string)=>{
    const installId=install.current||readInstallId();
    if(!installId)return false;
    try{
      await watchJson('/api/watch?'+new URLSearchParams({installId,kind,ref}),{method:'DELETE'});
      setState(s=>({...s,watches:s.watches.filter(w2=>!(w2.kind===kind&&w2.ref===ref))}));
      setError('');
      return true;
    }catch(e){
      setError(e instanceof Error?e.message:'Urmărirea nu a put fi eliminată.');
      return false;
    }
  },[]);
  const purge=useCallback(async()=>{
    const installId=install.current||readInstallId();
    if(!installId)return false;
    try{
      await watchJson('/api/watch/purge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installId})});
      setState({watches:[],sweepState:null,notification:{vapidPublicKey:null},kinds:[]});
      // Full personal-data semantics: the identity goes too, so nothing links the old install to a new one.
      clearInstallId();
      install.current=null;
      setId(null);
      setError('');
      return true;
    }catch(e){
      setError(e instanceof Error?e.message:'Datele nu au put fi șterse.');
      return false;
    }
  },[]);
  const loadEvents=useCallback(async()=>{
    const installId=install.current||readInstallId();
    if(!installId)return null;
    try{
      const data=await watchJson('/api/watch-events?'+new URLSearchParams({installId}));
      const events=Array.isArray(data?.events)?data.events.filter((e:any)=>e&&typeof e.id==='string'):[];
      return {events,hasMore:data?.hasMore===true};
    }catch{
      return null;
    }
  },[]);
  const ackEvents=useCallback(async(ids:string[])=>{
    const installId=install.current||readInstallId();
    if(!installId||!ids.length)return;
    try{
      await watchJson('/api/watch-events/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installId,ids})});
    }catch{}
  },[]);
  // Optimistic decrement of the per-watch unseen counts once events were viewed;
  // the server recount on the next list load stays the source of truth.
  const optimisticSeen=useCallback((events:WatchEvent[])=>{
    if(!events.length)return;
    setState(s=>{
      const arrived=new Map<string,number>();
      for(const event of events){const key=event.kind+'|'+event.ref;arrived.set(key,(arrived.get(key)||0)+1)}
      return {...s,watches:s.watches.map(w=>({...w,unseenCount:Math.max(0,w.unseenCount-(arrived.get(w.kind+'|'+w.ref)||0))}))};
    });
  },[]);
  const isWatched=useCallback((kind:WatchKind,ref:string)=>state.watches.some(w=>w.kind===kind&&w.ref===ref),[state.watches]);
  // v1 addendum: per-item notifications toggle. The sweep keeps emitting events for a muted
  // watch (the feed and the badge stay truthful) — muted only stops the push for that row.
  const setMuted=useCallback(async(kind:WatchKind,ref:string,muted:boolean)=>{
    const installId=install.current||readInstallId();
    if(!installId)return false;
    try{
      await watchJson('/api/watch/mute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installId,kind,ref,muted})});
      setState(s=>({...s,watches:s.watches.map(w=>w.kind===kind&&w.ref===ref?{...w,muted}:w)}));
      setError('');
      return true;
    }catch(e){
      setError(e instanceof Error?e.message:'Starea de notificărilor nu a put fi salvată.');
      return false;
    }
  },[]);
  const subscribePush=useCallback(async(subscription:{endpoint:string;keys:{p256dh:string;auth:string}})=>{
    const installId=install.current||ensureInstallId();
    install.current=installId;
    setId(installId);
    await watchJson('/api/watch/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installId,subscription})});
    return true;
  },[]);
  // v1 addendum: the off toggle also clears this device's server row instead of waiting for
  // a 410 or purge. Best-effort like the ack calls: the device already unsubscribed locally,
  // and the sweep's 410 cleanup stays the safety net, so a failure here is not a user failure.
  const unsubscribePush=useCallback(async(endpoint:string)=>{
    const installId=install.current||readInstallId();
    if(!installId||!endpoint)return;
    try{
      await watchJson('/api/watch/subscribe?'+new URLSearchParams({installId,endpoint}),{method:'DELETE'});
    }catch{}
  },[]);
  const value=React.useMemo<WatchState>(()=>({id,watches:state.watches,sweepState:state.sweepState,vapidPublicKey:state.notification.vapidPublicKey,busy,error,add,remove,isWatched,refresh:()=>void load(),purge,loadEvents,ackEvents,optimisticSeen,subscribePush,setMuted,unsubscribePush}),[id,state,busy,error,add,remove,isWatched,load,purge,loadEvents,ackEvents,optimisticSeen,subscribePush,setMuted,unsubscribePush]);
  return <WatchContext.Provider value={value}>{children}</WatchContext.Provider>;
}
export const useWatch=()=>useContext(WatchContext);

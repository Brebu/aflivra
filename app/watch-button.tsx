'use client';
import React from 'react';
import {Bell} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {toast} from 'sonner';
import {ControlHint} from './control-hints';
import {useWatch,type WatchKind} from './watch-state';

// Kind nouns for visible labels and accessible names — one interaction language with
// the SaveButton precedent: aria-pressed + filled icon + a state word when toggled.
export const watchKindNoun:Record<WatchKind,string>={dosar:'dosarul',firma:'firma',localitate:'localitatea',act:'actul',venue:'spectacolele',meteo:'avertizările meteo'};
const kindState:Record<WatchKind,string>={dosar:'Dosar urmărit',firma:'Firmă urmărită',localitate:'Localitate urmărită',act:'Act urmărit',venue:'Spectacole urmărite',meteo:'Avertizări urmărite'};
const kindFollow:Record<WatchKind,string>={dosar:'Urmărește dosarul',firma:'Urmărește firma',localitate:'Urmărește localitatea',act:'Urmărește actul',venue:'Urmărește spectacolele',meteo:'Urmărește avertizările'};
// aria labels refer to the concrete thing being followed (name wins over the raw ref).
function ariaFollow(kind:WatchKind,name:string){return kind==='venue'?'Urmărește spectacolele de la '+name:'Urmărește '+watchKindNoun[kind]+' '+name}
function ariaUnfollow(kind:WatchKind,name:string){return kind==='venue'?'Nu mai urmări spectacolele de la '+name:'Nu mai urmări '+watchKindNoun[kind]+' '+name}
export function watchOpenAria(kind:WatchKind,ref:string){return kind==='venue'?'Deschide spectacolele de la '+ref:'Deschide '+watchKindNoun[kind]+' '+ref}

export function WatchButton({kind,target,name,label}:{kind:WatchKind;target:string;name:string;label?:string}){
  const watch=useWatch();
  if(!target)return null;
  const watched=watch.isWatched(kind,target);
  const text=watched?kindState[kind]:kind==='venue'?'Urmărește spectacolele de la '+name:kindFollow[kind];
  const toggle=async()=>{
    if(watched){
      const done=await watch.remove(kind,target);
      if(done)toast('Nu mai este urmărit');
      else toast(watch.error||'Urmărirea nu a put fi oprită acum.');
      return;
    }
    const done=await watch.add(kind,target,label||name);
    if(done)toast.success('Urmărit. Vezi schimbările în „Ce s-a schimbat".');
    else toast(watch.error||'Urmărirea nu a put fi salvată acum.');
  };
  return <ControlHint text={watched?'Oprim verificarea și notificările pentru acest element.':'Verificăm sursa publică de mai multe ori pe zi și îți arătăm schimbările în „Ce s-a schimbat", fără cont.'}>
    <Button variant="outline" className="watch-button" aria-label={watched?ariaUnfollow(kind,name):ariaFollow(kind,name)} aria-pressed={watched} onClick={e=>{e.stopPropagation();void toggle()}}><Bell size={17} fill={watched?'currentColor':'none'}/>{text}</Button>
  </ControlHint>;
}

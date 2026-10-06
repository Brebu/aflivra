'use client';
import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {Search} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export function SearchForm({value,onSearch,inputProps={},className='live-search',busy=false,resetKey}:{value:string;onSearch:(value:string)=>void;inputProps?:ComponentProps<typeof Input>;className?:string;busy?:boolean;resetKey?:unknown}){
 const [draft,setDraft]=useState(value),published=useRef(value),reset=useRef(resetKey);
 useEffect(()=>{if(value!==published.current||reset.current!==resetKey){published.current=value;reset.current=resetKey;setDraft(value)}},[value,resetKey]);
 return <form className={className} aria-busy={busy} onSubmit={event=>{event.preventDefault();const next=draft.trim();published.current=next;setDraft(next);onSearch(next)}}><Search size={18}/><Input {...inputProps} aria-label={inputProps['aria-label']} value={draft} onChange={event=>setDraft(event.target.value)}/><Button type="submit">Caută</Button></form>;
}

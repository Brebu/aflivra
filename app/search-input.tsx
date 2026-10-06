'use client';
import {startTransition,useEffect,useRef,useState,type ComponentProps} from 'react';
import {Input} from '@/components/ui/input';
type Props=Omit<ComponentProps<typeof Input>,'value'|'defaultValue'|'onChange'> & {value:string;onValueChange:(value:string)=>void;delay?:number};
export function SearchInput({value,onValueChange,delay=250,onKeyDown,...props}:Props){
 const [draft,setDraft]=useState(value),published=useRef(value),timer=useRef<ReturnType<typeof setTimeout>|null>(null),callback=useRef(onValueChange);callback.current=onValueChange;
 const clear=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null}};
 const commit=(next:string)=>{clear();if(next!==published.current){published.current=next;startTransition(()=>callback.current(next))}};
 useEffect(()=>{if(value!==published.current){clear();published.current=value;setDraft(value)}},[value]);
 useEffect(()=>()=>clear(),[]);
 return <Input {...props} aria-label={props['aria-label']} value={draft} onChange={event=>{const next=event.target.value;setDraft(next);clear();if(next!==published.current)timer.current=setTimeout(()=>commit(next),delay)}} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing)commit(draft);onKeyDown?.(event)}}/>;
}

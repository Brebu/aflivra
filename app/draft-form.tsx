'use client';
import {useEffect,useRef,useState,type Dispatch,type ReactNode,type SetStateAction} from 'react';
export function DraftForm<T>({value,onSearch,children,className}:{value:T;onSearch:(value:T)=>void;children:(draft:T,setDraft:Dispatch<SetStateAction<T>>)=>ReactNode;className?:string}){
 const [draft,setDraft]=useState(value),published=useRef(value);
 useEffect(()=>{if(value!==published.current){published.current=value;setDraft(value)}},[value]);
 return <form className={className} onSubmit={event=>{event.preventDefault();published.current=draft;onSearch(draft)}}>{children(draft,setDraft)}</form>;
}

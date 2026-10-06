'use client';
import {useState,type ReactNode} from 'react';
export function LazyDetails({summary,children,className}:{summary:ReactNode;children:ReactNode;className?:string}){const [open,setOpen]=useState(false);return <details className={className} open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open&&children}</details>}

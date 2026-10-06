'use client';
import {memo,useMemo,useState} from 'react';
import {createSearchIndex,searchIndex} from '@/lib/live/query';
import {sourceText} from '@/lib/live/text';
import {ExportActions} from './export-actions';
import {SearchInput} from './search-input';
import {LazyDetails} from './lazy-details';
const MetadataValues=memo(function MetadataValues({data,title}:{data:any;title:string}){const [q,setQ]=useState('');const values=useMemo(()=>Object.entries(data).map(([key,value])=>({key,value,text:value===null||value===undefined||value===''?'Nefurnizat de sursă':typeof value==='object'?JSON.stringify(value,null,2):sourceText(String(value))})),[data]);const index=useMemo(()=>createSearchIndex(values,row=>({[row.key]:row.value})),[values]);const fields=useMemo(()=>searchIndex(index,q),[index,q]);return <><ExportActions input={{title,data}} label="Descarcă toate câmpurile"/><SearchInput value={q} onValueChange={setQ} aria-label={'Caută în '+title.toLowerCase()} placeholder="Câmp sau valoare"/><p>{fields.length} din {values.length} câmpuri. Valorile structurate sunt păstrate integral.</p><dl className="record-fields">{fields.map(row=><div key={row.key}><dt>{row.key}</dt><dd>{typeof row.value==='object'&&row.value!==null?<pre>{row.text}</pre>:row.text}</dd></div>)}</dl></>});
export const MetadataFields=memo(function MetadataFields({data,title='Toate câmpurile publicate'}:{data:any;title?:string}){if(!data)return null;return <LazyDetails className="reader-provenance complete-metadata" summary={title}><MetadataValues data={data} title={title}/></LazyDetails>});

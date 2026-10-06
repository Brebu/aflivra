'use client';
import {useEffect,useState} from 'react';
import {snapshotJson} from './snapshot-store';
import {ExportActions} from './export-actions';
export function SourcePackages(){
 const [manifest,setManifest]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();snapshotJson('/downloads/source-packages.json?v=35',undefined,c.signal).then(setManifest).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort()},[]);
 return <section className="live-section"><h2>Inventarul aplicației</h2><p>Lista volumelor, numărul de fișiere, dimensiunile și valorile SHA-256 pot fi exportate ca PDF, CSV sau Excel. Datele și documentele se descarcă din categoria lor.</p><p><a className="text-link" href="/downloads/index.html">Descarcă toate volumele de cod și documentația PDF</a></p>{error&&<p role="alert">{error}</p>}{manifest&&<><ExportActions input={{title:'Inventarul aplicației Aflivra',data:manifest}} label="Descarcă inventarul complet"/><div className="source-downloads">{manifest.packages.map((p:any)=><article className="source-download" key={p.file}><span>{p.label}<small>{(p.bytes/1000000).toFixed(1)} MB · {p.files} fișiere</small></span><a className="text-link" href={'/downloads/'+p.file} download={p.file}>Descarcă ZIP</a></article>)}</div></>}</section>;
}

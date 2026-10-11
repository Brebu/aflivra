import {env} from 'cloudflare:workers';
import {loadSourceHealth} from '@/lib/live/source-health';
import Link from 'next/link';
export const dynamic='force-dynamic';
export default async function SourcesPage(){
 const health=env.DB?await loadSourceHealth(env.DB).catch(()=>null):null;
 return <main style={{padding:'2rem',maxWidth:1200,margin:'auto'}}><h1>Starea surselor</h1><p>Preluarea recentă și observația recentă sunt măsurate separat. Datele istorice păstrează perioada publicată de editor.</p><p><Link href="/">Înapoi la Aflivra</Link> · <a href="/api/sources-health">Date și diagnostic JSON</a></p>
 {health?<><p>{health.summary.total} surse: {health.summary.cached} copii actuale, {health.summary.stale} copii vechi, {health.summary.unavailable} indisponibile.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Sursă</th><th>Stare</th><th>Ultima preluare validă</th><th>Observație</th><th>Diagnostic</th></tr></thead><tbody>{health.sources.map(source=><tr key={source.member}><td>{source.name}</td><td>{source.status}</td><td>{source.lastSuccessAt||'—'}</td><td>{source.observedAt||'—'}</td><td>{source.diagnostic?.category||'—'} {source.diagnostic?.httpStatus||''}</td></tr>)}</tbody></table></div><p>{health.note}</p></>:<p>Starea surselor nu poate fi citită acum.</p>}</main>;
}

import {decodeHtmlEntities as decodeEntities} from './text';

export type LawConsolidation={kind:'consolidated'|'base';versionId:string;versionDate:string;asOf:string;checkedAt:string;sourceUrl:string;futureVersions:string[];versionHistory:{id:string;date:string;kind:'consolidated'|'base'}[]};
type Element={tag:string;attrs:Record<string,string>;start:number;openEnd:number;closeStart:number;end:number;parent:Element|null;children:Element[]};
type Version={id:string;date:string;kind:'consolidated'|'base'};
export type PortalLaw={text:string;title:string;issuer:string;publication:string;versions:Version[];relatedCodes:{id:string;title:string;sourceUrl:string}[]};
export const legalToday=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function officialLawUrl(value:string){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.hostname!=='legislatie.just.ro'||url.port||url.username||url.password||url.search||url.hash)return null;const id=url.pathname.match(/^\/Public\/DetaliiDocument(?:Afis)?\/(\d{1,9})$/)?.[1];return id?'https://legislatie.just.ro/Public/DetaliiDocument/'+id:null}catch{return null}}
const documentId=(url:string)=>officialLawUrl(url)?.split('/').at(-1)||'';
function portalLink(value:string){if(/^https?:\/\//i.test(value)){try{const url=new URL(value);url.search='';url.hash='';return officialLawUrl(url.href)}catch{return null}}if(value.startsWith('//')||!/^(?:~\/|\/|\.\.\/)/.test(value))return null;const path=value.match(/\/Public\/DetaliiDocument(?:Afis)?\/\d{1,9}(?=[?#]|$)/)?.[0];return path?officialLawUrl('https://legislatie.just.ro'+path):null}
function isoDate(value:string){const match=value.match(/\b(\d{2})[.\/-](\d{2})[.\/-](\d{4})\b/);if(!match)return '';const iso=match[3]+'-'+match[2]+'-'+match[1];return Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:''}
const classes=(node:Element)=>node.attrs.class?.split(/\s+/)||[];
const hasClass=(node:Element,value:string)=>classes(node).includes(value);
const sourceClasses=(node:Element)=>classes(node).filter(c=>/^S_[A-Z_]+$/.test(c));

// Only parse public markup as data. No scripts, styles, controls or remote HTML
// are ever executed or passed through to the reader.
function elements(html:string){
 const root:Element={tag:'root',attrs:{},start:0,openEnd:0,closeStart:html.length,end:html.length,parent:null,children:[]},stack=[root],all:Element[]=[];
 const tokens=/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][\w:.-]*(?:"[^"]*"|'[^']*'|[^'">])*?>/g;
 for(const match of html.matchAll(tokens)){const raw=match[0],name=raw.match(/^<\/?([\w:.-]+)/)?.[1]?.toLowerCase();if(!name)continue;
  if(raw.startsWith('</')){let index=stack.length-1;while(index>0&&stack[index].tag!==name)index--;if(index===0)continue;while(stack.length>index){const node=stack.pop()!;node.closeStart=match.index!;node.end=match.index!+raw.length}continue}
  const attrs:Record<string,string>={};for(const a of raw.slice(name.length+1,-1).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=decodeEntities(a[2]??a[3]??a[4]??'');
  const node:Element={tag:name,attrs,start:match.index!,openEnd:match.index!+raw.length,closeStart:match.index!+raw.length,end:match.index!+raw.length,parent:stack.at(-1)!,children:[]};node.parent!.children.push(node);all.push(node);
  if(all.length>400000||stack.length>180)throw Error('Structura actului oficial depășește limita de procesare.');
  if(!/\/$/.test(raw.slice(0,-1))&&!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name))stack.push(node);
 }
 // An unfinished normative span can indicate a truncated upstream response.
 if(stack.some(node=>sourceClasses(node).length||node.attrs.id==='istoric_fa'))throw Error('Portalul nu a transmis integral textul și istoricul actului.');
 return all;
}
const normalize=(text:string)=>text.replace(/\r\n?/g,'\n').replace(/[\t \u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function nodeText(node:Element,html:string):string{
 if(/^(?:script|style|noscript|button|input|select)$/.test(node.tag)||sourceClasses(node).some(c=>c.endsWith('_SHORT')))return '';
 if(node.tag==='br')return '\n';let out='',at=node.openEnd;
 const plain=(text:string)=>decodeEntities(text.replace(/<!--[\s\S]*?-->/g,''));
 for(const child of node.children){out+=plain(html.slice(at,child.start));out+=nodeText(child,html);at=child.end}out+=plain(html.slice(at,node.closeStart));
 if(node.tag==='a'&&/^[+−–-]$/.test(out.trim()))return '';
 if(node.tag==='sup')return '^'+out;
 const boundary=sourceClasses(node).some(c=>/_(?:TTL|DEN|PAR)$/.test(c)||/^S_(?:ART|ALN|LIT|LIN|NTA|HDR|EMT|PUB|ANX)$/.test(c))||/^(?:p|div|tr|li|h[1-6])$/.test(node.tag);
 return boundary?'\n'+out+'\n':node.tag==='td'||node.tag==='th'?out+'\t':out;
}
export function parsePortalLaw(html:string,url:string,baseDate=''):PortalLaw{
 const id=documentId(url);if(!id)throw Error('Actul nu are o adresă oficială verificabilă.');if(!/<\/html\s*>\s*$/i.test(html))throw Error('Pagina oficială a actului nu a fost transmisă integral.');
 const all=elements(html),sheet=all.find(n=>n.attrs.id==='fisaact'),history=all.find(n=>n.attrs.id==='istoric_fa');
 if(!sheet||!history)throw Error('Portalul nu a furnizat istoricul necesar verificării formei actuale.');
 const body=all.filter(n=>n.tag==='span'&&sourceClasses(n).length&&!(()=>{let parent=n.parent;while(parent){if(sourceClasses(parent).length)return true;parent=parent.parent}return false})());
 const text=normalize(body.map(n=>nodeText(n,html)).join('\n'));if(!text||!all.some(n=>hasClass(n,'S_HDR')||hasClass(n,'S_ART')||hasClass(n,'S_ANX_BDY')))throw Error('Textul normativ al paginii nu a putut fi identificat integral.');
 const inside=(node:Element,parent:Element)=>node.start>=parent.openEnd&&node.end<=parent.closeStart;
 const versions:Version[]=[];for(const node of all.filter(n=>n.tag==='a'&&inside(n,history))){const label=normalize(nodeText(node,html)),date=isoDate(label+' '+(node.attrs.title||'')),kind=/forma de baz[ăa]/i.test(label+' '+(node.attrs.title||''))?'base':'consolidated',href=node.attrs.href,source=href?portalLink(href):url,versionId=source?documentId(source):'';
  if(!versionId){if(date)throw Error('Istoricul conține o versiune fără adresă oficială verificabilă.');continue}const versionDate=date||(kind==='base'?baseDate.split('T')[0]:'');if(versionDate&&/^\d{4}-\d{2}-\d{2}$/.test(versionDate))versions.push({id:versionId,date:versionDate,kind});
 }
 // Some unchanged acts use a plain label for their only base version.
 const currentBase=all.some(n=>inside(n,history)&&/^Forma de baz[ăa]$/i.test(normalize(nodeText(n,html)))&&!(()=>{let parent:Element|null=n;while(parent&&parent!==history){if(parent.tag==='a'&&parent.attrs.href)return true;parent=parent.parent}return false})());
 if(currentBase&&!versions.some(v=>v.id===id)&&/^\d{4}-\d{2}-\d{2}$/.test(baseDate))versions.push({id,date:baseDate,kind:'base'});
 const dateLabels=[nodeText(history,html),...all.filter(n=>inside(n,history)).map(n=>nodeText(n,html))].join('\n');
 const dates=[...dateLabels.matchAll(/\b\d{2}[.\/-]\d{2}[.\/-]\d{4}\b/g)].map(m=>isoDate(m[0])).filter(Boolean),unlinked=[...new Set(dates.filter(date=>!versions.some(v=>v.date===date)))];
 if(unlinked.length===1)versions.push({id,date:unlinked[0],kind:'consolidated'});else if(unlinked.length>1)throw Error('Istoricul oficial are date de consolidare fără o versiune identificabilă.');
 const unique=[...new Map(versions.map(v=>[v.id+'|'+v.date,v])).values()];if(!unique.length||!unique.some(v=>v.id===id))throw Error('Data versiunii deschise nu a putut fi confirmată în istoricul oficial.');
 const value=(cls:string)=>all.filter(n=>hasClass(n,cls)).map(n=>normalize(nodeText(n,html))).filter(Boolean).join(' · ');
 const title=value('S_HDR')||decodeEntities(all.find(n=>n.tag==='meta'&&n.attrs.name==='title')?.attrs.content||'');
 const relatedCodes=text.length<1600?all.filter(n=>n.tag==='a'&&!inside(n,history)).map(n=>({title:normalize(nodeText(n,html)),sourceUrl:portalLink(n.attrs.href||'')})).filter(n=>n.sourceUrl&&/^COD (?:FISCAL\s+08\/09\/2015|PR CIVIL[AĂ]\s*(?:\(R\))?\s+01\/07\/2010)$/i.test(n.title)).map(n=>({id:n.sourceUrl!,title:n.title,sourceUrl:n.sourceUrl!})):[];
 return{text,title,issuer:value('S_EMT_BDY'),publication:value('S_PUB_BDY'),versions:unique,relatedCodes:[...new Map(relatedCodes.map(code=>[code.id,code])).values()]};
}
export function selectLawVersion(versions:Version[],asOf:string){const available=versions.filter(v=>v.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date));if(!available.length)throw Error('Actul are numai versiuni cu aplicare viitoare la data consultării.');const latest=available[0];if(available.some(v=>v.date===latest.date&&v.id!==latest.id))throw Error('Istoricul oficial conține versiuni ambigue pentru aceeași dată.');return latest}
export async function consolidateLaw(act:any,fetchPage:(url:string)=>Promise<string>,asOf=legalToday()){
 const base=officialLawUrl(act.sourceUrl||act.id||'');if(!base)throw Error('Sursa nu a furnizat o adresă oficială pentru verificarea consolidării.');
 const first=parsePortalLaw(await fetchPage(base),base,String(act.date||'').split('T')[0]),latest=selectLawVersion(first.versions,asOf),selected='https://legislatie.just.ro/Public/DetaliiDocument/'+latest.id;
 const page=selected===base?first:parsePortalLaw(await fetchPage(selected),selected,String(act.date||'').split('T')[0]);
 if(selected!==base&&!page.versions.some(v=>v.id===latest.id&&v.date===latest.date))throw Error('Pagina versiunii selectate nu confirmă data consolidării din istoricul oficial.');
 if(selectLawVersion(page.versions,asOf).id!==latest.id)throw Error('Istoricul actului s-a schimbat în timpul preluării. Reîncearcă verificarea.');
  const consolidation:LawConsolidation={kind:latest.kind,versionId:latest.id,versionDate:latest.date,asOf,checkedAt:new Date().toISOString(),sourceUrl:selected,futureVersions:[...new Set(first.versions.filter(v=>v.date>asOf).map(v=>v.date))].sort(),versionHistory:[...new Map(page.versions.map(v=>[v.id+'|'+v.date,v])).values()].map(v=>({id:v.id,date:v.date,kind:v.kind})).sort((a,b)=>a.date.localeCompare(b.date))};
 return{...act,id:act.id||base,sourceUrl:selected,baseSourceUrl:base,title:page.title||act.title,issuer:page.issuer||act.issuer||'',publication:page.publication||act.publication||'',text:page.text,textProvided:true,consolidation,_relatedCodes:page.relatedCodes};
}
export const verifiedConsolidation=(act:any)=>!!act?.textProvided&&!!officialLawUrl(act.consolidation?.sourceUrl||'')&&['consolidated','base'].includes(act.consolidation?.kind)&&/^\d{4}-\d{2}-\d{2}$/.test(act.consolidation?.versionDate||'')&&/^\d{4}-\d{2}-\d{2}$/.test(act.consolidation?.asOf||'')&&act.consolidation.versionDate<=act.consolidation.asOf&&Number.isFinite(Date.parse(act.consolidation?.checkedAt||''));
export function lawVersionText(act:any){if(!verifiedConsolidation(act))return 'Forma actuală nu a putut fi verificată.';const c=act.consolidation as LawConsolidation,date=(v:string)=>v.split('-').reverse().join('.');return(c.kind==='consolidated'?'Formă consolidată din ':'Formă de bază din ')+date(c.versionDate)+' · verificată pentru '+date(c.asOf)+'.'+(c.asOf<legalToday()?' Actualitatea pentru astăzi nu este confirmată.':'' )}

export function lawReadingStatus(act:any,source?:{status?:string;error?:string|null}|null){
 const verified=verifiedConsolidation(act),current=verified&&act.consolidation.asOf===legalToday()&&!!source&&['fresh','cached'].includes(source.status||'')&&!source.error;
 return{current,title:current?'Forma aplicabilă astăzi, confirmată în istoricul oficial':verified?'Ultima formă verificată · actualitatea de astăzi nu este confirmată':'Forma actuală nu a putut fi verificată',note:current?'Data formei arată când se aplică această versiune. Data consultării arată când a fost verificat istoricul oficial.':verified?'Textul și data ultimei verificări sunt păstrate. Portalul nu a confirmat o actualizare pentru această consultare.':'Data preluării unei copii istorice nu confirmă actualitatea textului.'};
}

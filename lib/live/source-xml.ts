import {SourceError} from './adapters';

export type XmlElement={name:string;body:string};
const tokens=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([A-Za-z_][\w:.-]*)(?=\s|\/?>)(?:"[^"]*"|'[^']*'|[^'">])*?\/?>/g;
/** Direct children only: a nested hearing's date is not the case's date. */
export function xmlChildren(raw:string):XmlElement[]{
  if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw new SourceError('Documentul XML conține declarații neacceptate.');
  const result:XmlElement[]=[],stack:{qualified:string;name:string;start:number}[]=[];
  let end=0;
  for(const token of raw.matchAll(tokens)){
    if(raw.slice(end,token.index).includes('<'))throw new SourceError('Documentul XML este incomplet.');
    end=token.index+token[0].length;
    if(!token[1])continue;
    const qualified=token[1],name=qualified.split(':').at(-1)!;
    if(token[0].startsWith('</')){
      const open=stack.pop();if(!open||open.qualified!==qualified)throw new SourceError('Documentul XML este incomplet.');
      if(!stack.length)result.push({name:open.name,body:raw.slice(open.start,token.index)});
    }else if(token[0].endsWith('/>')){
      if(!stack.length)result.push({name,body:''});
    }else{
      if(stack.length>=64)throw new SourceError('Documentul XML are o structură neacceptată.');
      stack.push({qualified,name,start:end});
    }
  }
  if(stack.length||raw.slice(end).includes('<'))throw new SourceError('Documentul XML este incomplet.');
  return result;
}
export const xmlChild=(elements:XmlElement[],name:string)=>elements.find(e=>e.name===name)?.body||'';

// Stratul tabular al resurselor XML: mulțimea dominantă de rânduri și aplatizarea rândului
// în coloane cu drumuri pe trei niveluri. Regulile, pinuite de celulele resource/xml-table
// din verify-source-errors.mjs:
//  - mulțimea dominantă = nivelul cel mai adânc la care un singur nume local acoperă cel
//    puțin 80% dintre frați, cu minimum două apariții sub același părinte; părinții
//    calificați cu același nume de rând se reunesc, listele concurente aleg cea cu mai
//    multe rânduri, iar la ex-aequo nimic nu se alege arbitrar — documentul onest servește;
//  - rândurile cu același nume de sub părinți nencalificați rămân în afara setului;
//  - coloanele: atributele (prefixate „@"), copiii cu text terminal, iar conținutul de
//    dincolo de al treilea nivel se lămurește în textul coloanei de la nivelul trei;
//  - copiii repețiți se enumerează determinist („Nume[1..n]") până la maximul publicat
//    în tot setul, fiecare valoare stă exact într-o coloană;
//  - fără mulțime dominantă, cu peste 128 de coloane rezultate sau fără nicio coloană,
//    conținutul rămâne la stratul de document, etichetat onest.

export type XmlRowTable={name:string;columns:string[];rows:string[][]};
export type XmlPart={name:string;tag:string;body:string;hasElements:boolean;start:number;openEnd:number;end:number};
const attributePattern=/([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const cdataPattern=/<!\[CDATA\[([\s\S]*?)\]\]>/g;
const commentPattern=/<!--[\s\S]*?-->/g;
const namedEntities:{[entity:string]:string}={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"};
const entityPattern=/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g;
// Entitățile standard se decodează; cele numerice cu punct de cod valid la fel, iar cele
// necunoscute rămân literale — nimic nu se inventează în locul lor.
const entityText=(raw:string)=>raw.replace(entityPattern,(whole,decimal?:string,hex?:string)=>{
  if(decimal||hex){const code=decimal?Number(decimal):parseInt(hex!,16);return code>0&&code<=0x10ffff?String.fromCodePoint(code):whole}
  return namedEntities[whole]||whole;
});
const plainText=(raw:string)=>entityText(raw.replace(commentPattern,'').replace(tokens,''));
/** Textul unui fragment: comentariile dispar, secțiunile CDATA rămân literale, etichetele dispar, entitățile se decodează. */
const fragmentText=(fragment:string)=>{
  let text='',at=0;
  for(const cdata of fragment.matchAll(cdataPattern)){
    text+=plainText(fragment.slice(at,cdata.index))+cdata[0].slice(9,-3);
    at=cdata.index+cdata[0].length;
  }
  return text+plainText(fragment.slice(at));
};
/** Atributele unei etichete de deschidere, cu valoarea decodată; declarațiile de spații de nume nu devin coloane. */
export function xmlTagAttributes(tag:string):Map<string,string>{
  const attributes=new Map<string,string>();
  for(const match of tag.matchAll(attributePattern)){
    const name=match[1];
    if(name==='xmlns'||name.startsWith('xmlns:'))continue;
    attributes.set(name,entityText(match[2]??match[3]??''));
  }
  return attributes;
}
/** Copiii direcți ai unui fragment, cu eticheta de deschidere, corpul și limitele lor în fragment. */
export function xmlParts(fragment:string):XmlPart[]{
  if(/<!DOCTYPE|<!ENTITY/i.test(fragment))throw new SourceError('Documentul XML conține declarații neacceptate.');
  const parts:XmlPart[]=[],stack:{part:XmlPart;qualified:string;children:number}[]=[];
  let end=0;
  for(const token of fragment.matchAll(tokens)){
    if(fragment.slice(end,token.index).includes('<'))throw new SourceError('Documentul XML este incomplet.');
    end=token.index+token[0].length;
    if(!token[1])continue;
    const qualified=token[1],name=qualified.split(':').at(-1)!;
    if(token[0].startsWith('</')){
      const open=stack.pop();if(!open||open.qualified!==qualified)throw new SourceError('Documentul XML este incomplet.');
      if(!stack.length)parts.push({...open.part,body:fragment.slice(open.part.openEnd,token.index),end,hasElements:open.children>0});
      else{stack.at(-1)!.children++}
    }else if(token[0].endsWith('/>')){
      const part:XmlPart={name,tag:token[0],body:'',hasElements:false,start:token.index,openEnd:end,end};
      if(!stack.length)parts.push(part);else{stack.at(-1)!.children++}
    }else{
      if(stack.length>=64)throw new SourceError('Documentul XML are o structură neacceptată.');
      stack.push({part:{name,tag:token[0],body:'',hasElements:false,start:token.index,openEnd:end,end},qualified,children:0});
    }
  }
  if(stack.length||fragment.slice(end).includes('<'))throw new SourceError('Documentul XML este incomplet.');
  return parts;
}
type TallyFrame={counts:Map<string,number>;elements:number;depth:number;ordinal:number;qualified:string;name:string;openEnd:number;tag:string};
type Dominance={depth:number;name:string;parents:Set<number>};
const scanDominance=(raw:string):Dominance|null=>{
  const levels=new Map<number,Map<string,{rows:number;parents:Set<number>}>>();
  const qualify=(frame:{counts:Map<string,number>;elements:number;depth:number;ordinal:number})=>{
    if(frame.elements<2)return;
    let best:{name:string;count:number}|null=null;
    for(const [name,count] of frame.counts)if(count>=2&&count*5>=frame.elements*4&&(!best||count>best.count))best={name,count};
    if(!best)return;
    const depth=frame.depth+1;
    let byName=levels.get(depth);
    if(!byName){byName=new Map();levels.set(depth,byName)}
    let candidate=byName.get(best.name);
    if(!candidate){candidate={rows:0,parents:new Set()};byName.set(best.name,candidate)}
    candidate.rows+=best.count;
    candidate.parents.add(frame.ordinal);
  };
  const virtual:{counts:Map<string,number>;elements:number;depth:number;ordinal:number}={counts:new Map(),elements:0,depth:-1,ordinal:-1};
  const stack:TallyFrame[]=[];
  let end=0,ordinal=0;
  for(const token of raw.matchAll(tokens)){
    if(raw.slice(end,token.index).includes('<'))throw new SourceError('Documentul XML este incomplet.');
    end=token.index+token[0].length;
    if(!token[1])continue;
    const qualified=token[1],name=qualified.split(':').at(-1)!;
    if(token[0].startsWith('</')){
      const open=stack.pop();if(!open||open.qualified!==qualified)throw new SourceError('Documentul XML este incomplet.');
      qualify(open);
      const parent=stack.at(-1)||virtual;
      parent.counts.set(name,(parent.counts.get(name)||0)+1);
      parent.elements++;
    }else if(token[0].endsWith('/>')){
      const parent=stack.at(-1)||virtual;
      parent.counts.set(name,(parent.counts.get(name)||0)+1);
      parent.elements++;
    }else{
      if(stack.length>=64)throw new SourceError('Documentul XML are o structură neacceptată.');
      stack.push({counts:new Map(),elements:0,depth:stack.length,ordinal:ordinal++,qualified,name,openEnd:end,tag:token[0]});
    }
  }
  if(stack.length||raw.slice(end).includes('<'))throw new SourceError('Documentul XML este incomplet.');
  qualify(virtual);
  const depths=[...levels.keys()].sort((a,b)=>b-a);
  if(!depths.length)return null;
  const byName=levels.get(depths[0])!;
  let winner:{name:string;rows:number;parents:Set<number>}|null=null,tie=false;
  for(const [name,candidate] of byName)if(!winner||candidate.rows>winner.rows){winner={name,...candidate};tie=false}else if(candidate.rows===winner.rows)tie=true;
  return winner&&!tie?{depth:depths[0],name:winner.name,parents:winner.parents}:null;
};
const flattenRow=(tag:string,body:string):Map<string,string[]>=>{
  const values=new Map<string,string[]>();
  const record=(path:string,value:string)=>{if(!value)return;const existing=values.get(path);if(existing)existing.push(value);else values.set(path,[value])};
  const walk=(part:XmlPart,depth:number,prefix:string)=>{
    for(const [attribute,value] of xmlTagAttributes(part.tag))record(prefix?prefix+'.@'+attribute:'@'+attribute,value);
    const ownKey=prefix||'#text';
    if(!part.hasElements){record(ownKey,fragmentText(part.body).trim());return}
    const parts=depth>=3?[]:xmlParts(part.body);
    let at=0,gaps='';
    for(const child of parts){gaps+=part.body.slice(at,child.start);at=child.end;walk(child,depth+1,prefix+'.'+child.name)}
    record(ownKey,fragmentText(depth>=3?part.body:gaps+part.body.slice(at)).trim());
  };
  for(const [attribute,value] of xmlTagAttributes(tag))record('@'+attribute,value);
  const parts=xmlParts(body);
  let at=0,gaps='';
  for(const child of parts){gaps+=body.slice(at,child.start);at=child.end;walk(child,1,child.name)}
  record('#text',fragmentText(gaps+body.slice(at)).trim());
  return values;
};
const scanRows=(raw:string,chosen:Dominance)=>{
  const rows:Map<string,string[]>[]=[];
  const stack:{qualified:string;name:string;depth:number;ordinal:number;tag:string;openEnd:number}[]=[];
  const isRow=(name:string,depth:number)=>depth===chosen.depth&&name===chosen.name&&chosen.parents.has(stack.at(-1)?.ordinal??-1);
  let end=0,ordinal=0;
  for(const token of raw.matchAll(tokens)){
    if(raw.slice(end,token.index).includes('<'))throw new SourceError('Documentul XML este incomplet.');
    end=token.index+token[0].length;
    if(!token[1])continue;
    const qualified=token[1],name=qualified.split(':').at(-1)!;
    if(token[0].startsWith('</')){
      const open=stack.pop();if(!open||open.qualified!==qualified)throw new SourceError('Documentul XML este incomplet.');
      if(isRow(open.name,open.depth))rows.push(flattenRow(open.tag,raw.slice(open.openEnd,token.index)));
    }else if(token[0].endsWith('/>')){
      if(isRow(name,stack.length))rows.push(flattenRow(token[0],''));
    }else{
      if(stack.length>=64)throw new SourceError('Documentul XML are o structură neacceptată.');
      stack.push({qualified,name,depth:stack.length,ordinal:ordinal++,tag:token[0],openEnd:end});
    }
  }
  if(stack.length||raw.slice(end).includes('<'))throw new SourceError('Documentul XML este incomplet.');
  return rows;
};
/** Setul dominant de rânduri aplatizat în foaie, sau null când conținutul rămâne document. */
export function xmlTableRowSet(raw:string):XmlRowTable|null{
  if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw new SourceError('Documentul XML conține declarații care nu sunt acceptate.');
  if(!raw.includes('<'))return null;
  let rows:Map<string,string[]>[],chosen:Dominance|null;
  try{
    chosen=scanDominance(raw);
    if(!chosen)return null;
    rows=scanRows(raw,chosen);
  }catch(error){if(error instanceof SourceError)return null;throw error}
  if(!rows.length)return null;
  const arity=new Map<string,number>(),order:string[]=[];
  for(const row of rows)for(const [path,values] of row){if(!arity.has(path))order.push(path);if(values.length>(arity.get(path)||0))arity.set(path,values.length)}
  const columns:string[]=[];
  for(const path of order){const max=arity.get(path)||1;if(max<=1)columns.push(path);else for(let at=1;at<=max;at++)columns.push(path+'['+at+']')}
  if(!columns.length||columns.length>128)return null;
  return{name:chosen.name,columns,rows:rows.map(row=>columns.map(column=>{
    const at=column.lastIndexOf('[');
    if(at<0)return row.get(column)?.[0]??'';
    const values=row.get(column.slice(0,at));
    return values?.[Number(column.slice(at+1,-1))-1]??'';
  }))};
}

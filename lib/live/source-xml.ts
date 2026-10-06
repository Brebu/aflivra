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

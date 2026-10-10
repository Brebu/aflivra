/** Read complete tags before looking for element boundaries inside source HTML. */
export type SourceElement={openTag:string;html:string;start:number};
const tagPattern=/<!--[\s\S]*?-->|<(script|style|noscript)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/\1\s*>|<\/?([A-Za-z][\w:.-]*)(?=\s|\/?>)(?:"[^"]*"|'[^']*'|[^'">])*?\/?>/gi;

export function sourceElements(html:string,name:string):SourceElement[]{
 const stack:{openTag:string;start:number;bodyStart:number}[]=[],elements:SourceElement[]=[];
 for(const match of html.matchAll(tagPattern)){
  if(match[2]?.toLowerCase()!==name.toLowerCase())continue;
  if(match[0].startsWith('</')){
   const open=stack.pop();
   if(open)elements.push({openTag:open.openTag,html:html.slice(open.bodyStart,match.index),start:open.start});
  }else if(!match[0].endsWith('/>'))stack.push({openTag:match[0],start:match.index,bodyStart:match.index+match[0].length});
 }
 return elements.sort((a,b)=>a.start-b.start);
}

/** Remove whole elements whose class matches: navigation, "do not export"
 * markers and metadata chrome get excised structurally (open tag, inner HTML,
 * close tag) before any text extraction — word lists never touch the corpus. */
export function stripClasses(html:string,pattern:RegExp):string{
 for(;;){
  let removed=false;
  for(const tag of ['div','section','aside','ul','nav','table','span']){
   const element=sourceElements(html,tag).find(candidate=>pattern.test(sourceAttributes(candidate.openTag).class||''));
   if(!element)continue;
   const innerEnd=element.start+element.openTag.length+element.html.length,close=html.slice(innerEnd).match(new RegExp('^</'+tag+'\\s*>','i'));
   html=html.slice(0,element.start)+html.slice(innerEnd+(close?close[0].length:0));
   removed=true;break;
  }
  if(!removed)return html;
 }
}

/** Attribute values stay encoded until the caller chooses text or URL decoding. */
export function sourceAttributes(openTag:string):Record<string,string>{
 const attributes:Record<string,string>={};
 for(const match of openTag.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g))attributes[match[1].toLowerCase()]=match[2]??match[3]??match[4]??'';
 return attributes;
}

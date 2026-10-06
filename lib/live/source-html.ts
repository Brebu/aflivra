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

/** Attribute values stay encoded until the caller chooses text or URL decoding. */
export function sourceAttributes(openTag:string):Record<string,string>{
 const attributes:Record<string,string>={};
 for(const match of openTag.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g))attributes[match[1].toLowerCase()]=match[2]??match[3]??match[4]??'';
 return attributes;
}

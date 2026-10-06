export type LawSection={id:string;title:string;text:string;body:string;kind:'intro'|'article'|'heading'};
export type LawParagraph={text:string;kind:'text'|'clause'|'list'|'note'|'title'};

/** Remove only the official portal's copied controls; retain literal ellipses and arithmetic. */
export function readableLawText(value:unknown){return String(value??'').replace(/\r\n?/g,'\n').replace(/(?:\u00a0|[\t ]{2,})\.\.\.(?:\u00a0|[\t ]{2,})/g,'\n\n').replace(/^[\t \u00a0]*\+[\t \u00a0]*(?:\n|$)/gm,'').replace(/(Not[ăa](?:[\t ]+\d+)?)[\t ]+\.\.\.(?=[\t ]*\n)/g,'$1').replace(/^[\t \u00a0]+|[\t \u00a0]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim()}

export function lawSections(value:unknown):LawSection[]{
 const text=readableLawText(value);
 // Official headings also use words (PRELIMINAR, GENERALĂ, SPECIALĂ) and
 // ordinal numbers (a 2-a). Recognize whole labels without matching citations.
 const label='(?:UNIC[ĂA]?|PRELIMINAR[ĂA]?|GENERAL[ĂA]?|SPECIAL[ĂA]?|FINAL[ĂA]?|(?:a[\\t \\u00a0]+)?\\d+(?:-[a-zăâîșț]+)?|[IVXLCDM]+)';
 const pattern=new RegExp('^(?:Articolul[\\t \\u00a0]+(?:UNIC|\\d+(?:[\\^.-]\\d+)*|[IVXLCDM]+)|(?:Cartea|Titlul|Capitolul|Sec[țţt]iunea|Subsec[țţt]iunea|Partea)(?:[\\t \\u00a0]+Partea)?[\\t \\u00a0]+'+label+')(?=[\\t \\u00a0\\n.:]|$)','gmi');
 let found=[...text.matchAll(pattern)];
 // In an Arabic-numbered act, Roman articles inside amendment notes belong to
 // the quoted law, not to this act's table of contents. Keep them in the body.
 const firstArticle=found.find(match=>/^Articolul/i.test(match[0]));
 if(firstArticle&&/^Articolul\s+\d/i.test(firstArticle[0]))found=found.filter(match=>!/^Articolul\s+[IVXLCDM]+$/i.test(match[0]));
 if(!found.length)return text?[{id:'intro',title:'Textul actului',text,body:text,kind:'intro'}]:[];
 const rows:LawSection[]=[],start=found[0].index!;
 if(text.slice(0,start).trim())rows.push({id:'intro',title:'Fișa și preambulul',text:text.slice(0,start).trim(),body:text.slice(0,start).trim(),kind:'intro'});
 let article=0,heading=0;
 found.forEach((match,i)=>{
  const section=text.slice(match.index,found[i+1]?.index??text.length).trim(),kind=/^Articolul/i.test(match[0])?'article':'heading';
  rows.push({id:kind==='article'?'article-'+article++:'heading-'+heading++,title:match[0].replace(/[\t \u00a0]+/g,' ').replace(/^Partea Partea /i,'Partea '),text:section,body:section.slice(match[0].length).trim(),kind});
 });
 return rows;
}

/** Presentation boundaries only: preserve every non-whitespace source character. */
export function lawParagraphs(value:string):LawParagraph[]{
 const text=value.replace(/[\t \u00a0]{3,}(?=\(\d+(?:\^\d+)?\))/g,'\n\n');
 const parts=text.split(/\n{2,}|\n(?=(?:\(\d+(?:\^\d+)?\)|[a-zăâîșț]\)|Not[ăa](?:\s|$)|\(la \d{2}[-.]\d{2}[-.]\d{4}))/i).map(p=>p.trim()).filter(Boolean);
 return parts.map((text,i)=>({text,kind:/^\(\d+(?:\^\d+)?\)/.test(text)?'clause':/^[a-zăâîșț]\)/i.test(text)?'list':/^(?:Not[ăa](?:\s|$)|\(la \d{2}[-.]\d{2}[-.]\d{4})/i.test(text)?'note':i===0&&parts.length>1&&text.length<180&&!/[.;:!?]$/.test(text)&&/^\(1\)/.test(parts[1])?'title':'text'}));
}

/** Keep a heading with the article it introduces; never split an article. */
export function lawPage(sections:LawSection[],page:number,size=12){
 const groups:LawSection[][]=[];let pending:LawSection[]=[];
 for(const section of sections){pending.push(section);if(section.kind==='article'){groups.push(pending);pending=[]}}
 if(pending.length){if(groups.length)groups[groups.length-1].push(...pending);else groups.push(pending)}
 const pages=Math.max(1,Math.ceil(groups.length/Math.max(1,size))),selected=Math.max(0,Math.min(page,pages-1));
 return{items:groups.slice(selected*size,(selected+1)*size).flat(),page:selected,pages,total:sections.length};
}

export function lawSectionLabel(section:LawSection){const first=lawParagraphs(section.body)[0];return first&&(section.kind==='heading'||first.kind==='title')?section.title+' · '+first.text.replace(/\s+/g,' ').slice(0,120):section.title}

export function lawDialogTitle(act:any){const type=String(act?.type||'').trim();if(/^COD/i.test(type))return type.charAt(0).toLocaleUpperCase('ro-RO')+type.slice(1).toLocaleLowerCase('ro-RO');return String(act?.title||'Act normativ').split(/\s+(?:EMITENT(?:UL)?|PUBLICAT(?:\s+ÎN)?)(?:\s|:)/i)[0].trim()}

export function openLawArticle(sections:LawSection[],id:string){return sections.find(section=>section.id===id&&section.kind==='article')||null}

export type LawNavigation={id:string;label:string;depth:number;outline:boolean;sectionIds:string[];firstArticleId:string;lastArticleId:string};
const headingDepth=(section:LawSection)=>/^Partea/i.test(section.title)?0:/^Cartea/i.test(section.title)?1:/^Titlul/i.test(section.title)?2:/^Capitolul/i.test(section.title)?3:/^Subsec/i.test(section.title)?5:4;
const numberKey=(value:string)=>value.replace(/^Articolul\s+/i,'').replace(/\s/g,'');

/** The printed outline and the normative body are distinct navigation sources.
 * Resolve outline ranges against actual articles, never against a repeated label.
 * Keep all original sections/text available for integral exports. */
export function lawNavigation(sections:LawSection[]):LawNavigation[]{
 const firstArticle=sections.findIndex(s=>s.kind==='article'),articles=sections.filter(s=>s.kind==='article');
 const ranges=new Map<string,{first:number;last:number}>(),outlines=new Set<string>();
 for(const [index,section] of sections.entries()){
  if(section.kind!=='heading'||index>=firstArticle)continue;
  const range=section.body.match(/\bart\.?\s*(\d+(?:\^\d+)?)(?:\s*[-–—]\s*(\d+(?:\^\d+)?))?\s*$/i);
  if(!range)continue;
  const first=articles.findIndex(a=>numberKey(a.title)===range[1]),last=articles.findIndex(a=>numberKey(a.title)===(range[2]||range[1]));
  if(first>=0&&last>=first){ranges.set(section.id,{first,last});outlines.add(section.id)}
 }
 // Outline part/book labels often have no explicit range of their own.
 for(let index=firstArticle-1;index>=0;index--){const section=sections[index];if(section.kind!=='heading'||outlines.has(section.id))continue;const depth=headingDepth(section);let children:LawSection[]=[];
  for(let j=index+1;j<firstArticle;j++){if(sections[j].kind==='heading'&&headingDepth(sections[j])<=depth)break;children.push(sections[j])}
  const childRanges=children.filter(s=>outlines.has(s.id)).map(s=>ranges.get(s.id)!);
  if(childRanges.length){outlines.add(section.id);ranges.set(section.id,{first:Math.min(...childRanges.map(r=>r.first)),last:Math.max(...childRanges.map(r=>r.last))})}
 }
 const body=sections.filter(s=>!outlines.has(s.id));
 const entries=body.map((section,index):LawNavigation=>{
  const depth=section.kind==='heading'?headingDepth(section):6;let end=index+1;
  if(section.kind==='heading'){end=body.findIndex((s,i)=>i>index&&s.kind==='heading'&&headingDepth(s)<=depth);if(end<0)end=body.length}
  const scope=body.slice(index,end),scopeArticles=scope.filter(s=>s.kind==='article');
  return{id:section.id,label:lawSectionLabel(section),depth,outline:false,sectionIds:scope.map(s=>s.id),firstArticleId:scopeArticles[0]?.id||'',lastArticleId:scopeArticles.at(-1)?.id||''};
 });
 const byId=new Map(sections.map(s=>[s.id,s])),entriesById=new Map(entries.map(e=>[e.id,e]));
 const actualHeadings=entries.filter(e=>byId.get(e.id)?.kind==='heading');
 const headingKey=(title:string)=>title.normalize('NFC').replace(/ţ/g,'ț').replace(/ş/g,'ș').toLocaleLowerCase('ro-RO');
 return sections.map(section=>{
  if(!outlines.has(section.id))return entriesById.get(section.id)!;
  const range=ranges.get(section.id)!,first=articles[range.first],last=articles[range.last];
  const exact=actualHeadings.find(e=>e.depth===headingDepth(section)&&e.firstArticleId===first.id&&headingKey(byId.get(e.id)!.title)===headingKey(section.title));
  const start=body.findIndex(s=>s.id===first.id),end=body.findIndex(s=>s.id===last.id);
  return{id:section.id,label:lawSectionLabel(section),depth:headingDepth(section),outline:true,sectionIds:exact?.sectionIds||body.slice(start,end+1).map(s=>s.id),firstArticleId:first.id,lastArticleId:exact?.lastArticleId||last.id};
 });
}

export function lawReadingSections(sections:LawSection[],navigation:LawNavigation[],id=''){
 const chosen=id?navigation.find(entry=>entry.id===id):null;
 if(id&&!chosen)return [];
 const ids=chosen?new Set(chosen.sectionIds):null,outlineIds=new Set(navigation.filter(entry=>entry.outline).map(entry=>entry.id));
 return sections.filter(section=>!outlineIds.has(section.id)&&(!ids||ids.has(section.id)));
}

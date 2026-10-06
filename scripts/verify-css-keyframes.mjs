import {readFile} from 'node:fs/promises';
import {readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const cssFiles=readdirSync(join(root,'app')).filter(f=>f.endsWith('.css')).map(f=>'app/'+f).sort();
if(!cssFiles.length){console.error('verify-css-keyframes: nicio foaie de stil în app/ — verificația nu mai are ce proba.');process.exit(1)}
const keywords=new Set(['none','initial','inherit','unset','revert','linear','ease','ease-in','ease-out','ease-in-out','step-start','step-end','infinite','normal','alternate','alternate-reverse','reverse','forwards','backwards','both','running','paused']);
const sources=new Map(),definitions=new Map(),references=[],violations=[];
for(const file of cssFiles){
  const text=await readFile(join(root,file),'utf8');
  sources.set(file,text);
  for(const m of text.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g))definitions.set(m[1],file);
}
const staticVar=name=>{
  const pattern=new RegExp('--'+name.slice(2).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*:\\s*([^;}]+)');
  for(const text of sources.values()){const m=text.match(pattern);if(m)return m[1]}
  return null;
};
/* Every custom ident left in an animation value must be an animation-name; CSS-wide and animation keywords, times, iteration counts and timing functions are excluded from the animation-name ident space by the CSS spec itself. A var() must resolve from the stylesheets or carry a literal fallback — the runtime (inline-style) side of the contract. */
const tokenize=value=>{
  const tokens=[];let depth=0,cur='';
  for(const c of String(value||'')){
    if(c==='('){depth++;cur+=c}
    else if(c===')'){if(depth)depth--;cur+=c}
    else if(depth>0)cur+=c;
    else if(c===','){if(cur)tokens.push(cur);cur=''}
    else if(/\s/.test(c)){if(cur)tokens.push(cur);cur=''}
    else cur+=c;
  }
  if(cur)tokens.push(cur);
  return tokens;
};
const identsOf=(value,where,depth=0)=>{
  const out=[],clean=String(value||'').replace(/!important/gi,'').replace(/[a-zA-Z-]+\([^()]*\)/g,m=>m.startsWith('var(')?m:' ');
  for(const token of tokenize(clean)){
    if(!token||keywords.has(token.toLowerCase())||/^[-+]?(\d+\.?\d*|\.\d+)(ms|s)?$/i.test(token)||token.startsWith('--'))continue;
    const varMatch=token.match(/^var\((.{1,120})\)$/);
    if(varMatch){
      const inner=varMatch[1],comma=inner.indexOf(','),name=inner.slice(0,comma<0?inner.length:comma).trim(),fallback=comma<0?null:inner.slice(comma+1).trim();
      const resolved=staticVar(name)||fallback;
      if(!resolved||depth>4){violations.push([where,token,'variabilă CSS nerezolvată static în animation — defini-o în foi sau dă-i o rezervă literală']);continue}
      out.push(...identsOf(resolved,where,depth+1));
      continue;
    }
    out.push(token);
  }
  return out;
};
for(const file of cssFiles){
  const lines=sources.get(file).split('\n');
  lines.forEach((line,i)=>{
    for(const m of line.matchAll(/(?:^|[{;])\s*animation(?:-name)?\s*:\s*([^;{}]+)/g)){
      for(const ident of identsOf(m[1],file+':'+(i+1))){
        references.push(ident);
        if(!definitions.has(ident))violations.push([file+':'+(i+1),ident,'animation referențiază @keyframes nedefinit în foi de stil — animația ar rămâne inertă: '+m[1].trim().slice(0,80)]);
      }
    }
  });
}
if(violations.length){
  console.error('verify-css-keyframes: '+violations.length+' probleme de animație CSS:');
  for(const [where,ident,detail] of violations)console.error('  '+where+' ['+ident+'] '+detail);
  process.exit(1);
}
const perFile=cssFiles.map(f=>f.replace('app/','')+':'+[...sources.get(f).matchAll(/@keyframes\s+/g)].length).join(', ');
console.log('Animațiile CSS verificate static: '+references.length+' referințe animation/animation-name în '+cssFiles.length+' foi de stil, fiecare ident cu definiție @keyframes prezentă. Definiții: '+definitions.size+' ('+perFile+'). Fără rețea, fără runtime.');

"use client";
import {fetchWithServerRetry} from '@/lib/http-retry.mjs';
import React,{useId,useState,useEffect,useMemo,useRef} from 'react';
import {AreaChart,Area,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,PieChart,Pie,Cell,Legend} from 'recharts';
import {ChartContainer} from '@/components/ui/chart';
import {Button} from '@/components/ui/button';
import {Plus,Minus,LocateFixed} from 'lucide-react';
import {format} from './v2-model';
const colors=['#345179','#ddaf68','#839eab','#ad829c'];
export function DataChart({data,keys=['value'],labels=['Valoare'],type='area',unit='',height=250}:{data:Record<string,any>[];keys?:string[];labels?:string[];type?:string;unit?:string;height?:number}){
 const id=useId().replace(/:/g,'');const config=Object.fromEntries(keys.map((k,i)=>[k,{label:labels[i],color:colors[i%4]}]));
 return <div className="data-chart"><ChartContainer config={config} className="chart-canvas" style={{height,width:'100%',aspectRatio:'auto'}} aria-label={'Grafic: '+labels.join(', ')+'. Unitate: '+unit}>
 {type==='pie'?<PieChart accessibilityLayer><Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={4} stroke="none" isAnimationActive={false}>{data.map((_,i)=><Cell key={i} fill={colors[i%4]}/>)}</Pie><Tooltip formatter={(v:any)=>[format(Number(v))+'%', 'Pondere']}/><Legend iconType="circle" iconSize={8}/></PieChart>:type==='bar'?<BarChart data={data} accessibilityLayer margin={{top:12,right:8,left:-15,bottom:0}}><CartesianGrid vertical={false} stroke="#e7e9ec"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#676e79'}}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#676e79'}}/><Tooltip formatter={(v:any,n:any)=>[format(Number(v),3)+' '+unit,labels[keys.indexOf(String(n))]||n]} contentStyle={{borderRadius:12,border:'1px solid #dfe2e5'}}/>{keys.map((k,i)=><Bar key={k} dataKey={k} fill={colors[i%4]} radius={[5,5,0,0]} maxBarSize={38} isAnimationActive={false}/>)}</BarChart>:<AreaChart data={data} accessibilityLayer margin={{top:12,right:8,left:-10,bottom:0}}><defs>{keys.map((k,i)=><linearGradient key={k} id={id+k} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[i%4]} stopOpacity={.23}/><stop offset="100%" stopColor={colors[i%4]} stopOpacity={.015}/></linearGradient>)}</defs><CartesianGrid vertical={false} stroke="#e7e9ec"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#676e79'}}/><YAxis domain={unit==='RON'?['auto','auto']:[0,'auto']} axisLine={false} tickLine={false} tick={{fontSize:12,fill:'#676e79'}}/><Tooltip formatter={(v:any,n:any)=>[format(Number(v),4)+' '+unit,labels[keys.indexOf(String(n))]||n]} contentStyle={{borderRadius:12,border:'1px solid #dfe2e5'}}/>{keys.map((k,i)=><Area key={k} type="monotone" dataKey={k} stroke={colors[i%4]} strokeWidth={2.5} fill={'url(#'+id+k+')'} isAnimationActive={false} connectNulls={false}/>)}</AreaChart>}
 </ChartContainer><details className="chart-table"><summary>Vezi valorile din grafic</summary><div className="table-scroll"><table><thead><tr><th>Etichetă</th>{keys.map((k,i)=><th key={k}>{labels[i]} ({unit||'%'})</th>)}</tr></thead><tbody>{data.map((r,i)=><tr key={i}><td>{r.name}</td>{keys.map(k=><td key={k}>{r[k]==null?'Indisponibil':format(Number(r[k]),4)}</td>)}</tr>)}</tbody></table></div></details></div>
}
export type Pin={id:string;name:string;lat:number;lon:number;label?:string};
function pinLabelLines(label:string){const lines:string[]=[];for(const word of label.split(/\s+/)){if(!lines.length||lines.at(-1)!.length+word.length>30)lines.push(word);else lines[lines.length-1]+=' '+word}return lines}
// Stacks of genuinely distinct places (two museums 120 m apart, a castle complex)
// can never be separated by zoom — separation and pin size scale together — so the
// render itself separates them: every colliding pair is displaced apart along its
// own axis (tightest pair first, one pair per pin, ties by array order), and a
// displaced pin can land stacked on a third pin, so residual pairs repair by
// pushing the later pin to target separation, capped to keep fans bounded. The
// collision threshold and the offsets both track the live zoom, so pairs the zoom
// can actually separate converge back onto their true positions.
function declutterPins(pins:Pin[],zoom:number,width:number){
  const k=Math.max(width,1)/640*zoom,stack=2/k,target=11.5/k,cap=23/k;
  const pos=pins.map(p=>{const x=(p.lon-20)*61,y=(49.1-p.lat)*84;return{id:p.id,x,y,ox:0,oy:0}});
  const disp=new Map<string,{ox:number;oy:number}>();
  const pairs:[number,number,number][]=[];
  for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){const d=Math.hypot(pos[i].x-pos[j].x,pos[i].y-pos[j].y);if(d<stack)pairs.push([i,j,d])}
  pairs.sort((a,b)=>a[2]-b[2]||a[0]-b[0]||a[1]-b[1]);
  const taken=new Array<boolean>(pos.length).fill(false);
  for(const[i,j,d]of pairs){
    if(taken[i]||taken[j])continue;
    taken[i]=taken[j]=true;
    const a=pos[i],b=pos[j],dx=d<1e-9?1:(a.x-b.x)/d,dy=d<1e-9?0:(a.y-b.y)/d,push=Math.max(0,target-d)/2;
    a.ox+=dx*push;a.oy+=dy*push;b.ox-=dx*push;b.oy-=dy*push;
  }
  for(let round=0;round<2;round++){
    const res:[number,number,number][]=[];
    for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){const d=Math.hypot(pos[i].x+pos[i].ox-pos[j].x-pos[j].ox,pos[i].y+pos[i].oy-pos[j].y-pos[j].oy);if(d<stack)res.push([i,j,d])}
    res.sort((a,b)=>a[2]-b[2]||a[0]-b[0]||a[1]-b[1]);
    for(const[i,j]of res){
      const b=pos[j],vx=(pos[i].x+pos[i].ox)-(b.x+b.ox),vy=(pos[i].y+pos[i].oy)-(b.y+b.oy),cur=Math.hypot(vx,vy);
      // Earlier pushes in this round move pins: recompute the pair here, or a stale
      // distance divides a moved delta into a non-unit vector and the push balloons.
      if(cur>=stack)continue;
      const dx=cur<1e-9?1:vx/cur,dy=cur<1e-9?0:vy/cur;
      const push=Math.min(target-cur,Math.max(0,cap-Math.hypot(b.ox,b.oy)));
      b.ox-=dx*push;b.oy-=dy*push;
    }
  }
  for(const q of pos)if(q.ox||q.oy)disp.set(q.id,{ox:q.ox,oy:q.oy});
  return disp;
}
export function RomaniaMap({pins,selected,onSelect,compact=false}:{pins:Pin[];selected?:string;onSelect?:(id:string)=>void;compact?:boolean}){
  const [geo,setGeo]=useState<any>(null),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const pinchBase=useRef<{dist:number;zoom:number;pan:{x:number;y:number}}|null>(null);
  const multiTouch=useRef(false);
  const gestureStart=useRef<{x:number;y:number}|null>(null);
  const svgRef=useRef<SVGSVGElement|null>(null);
  const [width,setWidth]=useState(640);
  useEffect(()=>{fetchWithServerRetry('/data/v2/map.json').then(r=>r.json()).then(setGeo).catch(()=>setGeo(false))},[]);
  useEffect(()=>{const el=svgRef.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(()=>setWidth(el.clientWidth||640));ro.observe(el);setWidth(el.clientWidth||640);return()=>ro.disconnect()},[]);
  const project=(lon:number,lat:number)=>[(lon-20)*61, (49.1-lat)*84];
  const offsets=useMemo(()=>declutterPins(pins,zoom,width),[pins,zoom,width]);
  // Stacked neighbours (distinct places within one pin disk at every zoom this map
  // offers) can never be separated by paint order: the click resolves to the pin
  // nearest to the click point among the RENDERED (decluttered) positions, and only
  // inside a tolerance that covers the drawn disk plus a fixed touch slop, so a
  // click far from every pin selects nothing.
  const resolvePin=(svg:SVGSVGElement,clientX:number,clientY:number)=>{
    const ctm=svg.getScreenCTM();if(!ctm)return;
    const click=new DOMPoint(clientX,clientY).matrixTransform(ctm.inverse());
    const tx=320*(1-zoom)+pan.x,ty=245*(1-zoom)+pan.y;
    const tol=Math.max(12.5*zoom,24*640/Math.max(svg.clientWidth,1));
    let best:Pin|null=null,bestD=tol;
    for(const p of pins){const [x,y]=project(p.lon,p.lat);const o=offsets.get(p.id);const d=Math.hypot((x+(o?o.ox:0))*zoom+tx-click.x,(y+(o?o.oy:0))*zoom+ty-click.y);if(d<bestD){best=p;bestD=d}}
    if(best)onSelect?.(best.id);
  };
  // Fingers pan and pinch the map like every interactive map: the svg surface owns
  // its gestures (touch-action:none keeps the browser from taking the drag for page
  // scroll), a drag may start on any element inside the svg — pins included, a
  // >5px drag stays a pan while a tap still selects the nearest rendered pin — and
  // two pointers pinch-zoom around their midpoint (clamped to the button range).
  const activePointers=()=>pointers.current;
  const onPointerEnd=(e:React.PointerEvent<SVGSVGElement>)=>{const svg=e.currentTarget as any;if(svg.hasPointerCapture?.(e.pointerId))svg.releasePointerCapture(e.pointerId);activePointers().delete(e.pointerId);if(activePointers().size<2)pinchBase.current=null;if(activePointers().size===1){const rest=[...activePointers().values()][0];svg._last={x:rest.x,y:rest.y}}else svg._last=null};
  const path=(geometry:any)=>{const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;return polygons.map((poly:any)=>poly.map((ring:any)=>ring.map(([lon,lat]:number[],i:number)=>{const [x,y]=project(lon,lat);return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1)}).join(' ')+'Z').join(' ')).join(' ')};
  return <div className={'romap '+(compact?'compact':'')}><div className="map-grid"/><svg ref={svgRef} viewBox="0 0 640 490" role="group" aria-label="Harta României cu repere selectabile" onPointerDown={e=>{const svg=e.currentTarget;svg.setPointerCapture(e.pointerId);activePointers().set(e.pointerId,{x:e.clientX,y:e.clientY});(svg as any)._last={x:e.clientX,y:e.clientY};const n=activePointers().size;if(n===2){const [a,b]=[...activePointers().values()];pinchBase.current={dist:Math.max(Math.hypot(a.x-b.x,a.y-b.y),1),zoom,pan:{x:pan.x,y:pan.y}};multiTouch.current=true}else if(n===1){multiTouch.current=false;gestureStart.current={x:e.clientX,y:e.clientY}}}} onPointerMove={e=>{const svg=e.currentTarget as any;if(!activePointers().has(e.pointerId))return;activePointers().set(e.pointerId,{x:e.clientX,y:e.clientY});if(activePointers().size===2&&pinchBase.current){const [a,b]=[...activePointers().values()];const base=pinchBase.current;const dist=Math.max(Math.hypot(a.x-b.x,a.y-b.y),1);const next=Math.min(2.8,Math.max(1,base.zoom*dist/base.dist));const ctm=(e.currentTarget as SVGSVGElement).getScreenCTM();if(ctm&&next!==zoom){const mid=new DOMPoint((a.x+b.x)/2,(a.y+b.y)/2).matrixTransform(ctm.inverse());setZoom(next);setPan({x:base.pan.x+(base.zoom-next)*(mid.x-320),y:base.pan.y+(base.zoom-next)*(mid.y-245)})}return}if(svg.hasPointerCapture(e.pointerId)&&svg._last&&activePointers().size===1){const dx=(e.clientX-svg._last.x)*640/svg.clientWidth,dy=(e.clientY-svg._last.y)*490/svg.clientHeight;setPan(p=>({x:p.x+dx,y:p.y+dy}));svg._last={x:e.clientX,y:e.clientY}}}} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onClick={e=>{if(multiTouch.current)return;const start=gestureStart.current;if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;resolvePin(e.currentTarget,e.clientX,e.clientY)}}><g transform={`translate(${320*(1-zoom)+pan.x} ${245*(1-zoom)+pan.y}) scale(${zoom})`}>

 {geo?.features?.map((f:any)=><path key={f.properties.ADMIN} d={path(f.geometry)} fill={f.properties.ADM0_A3==='ROU'?'#d9dfe7':'#e6eaf0'} stroke="#f6f8fb" strokeWidth={2} pointerEvents="none"/>)}
 <text x="270" y="68" className="map-country">UCRAINA</text><text x="53" y="150" className="map-country">UNGARIA</text><text x="310" y="455" className="map-country">BULGARIA</text><text x="574" y="338" className="map-country sea">MAREA</text><text x="574" y="354" className="map-country sea">NEAGRĂ</text>
 {pins.some(p=>offsets.has(p.id))&&<g className="map-leaders">{pins.map(p=>{const [x,y]=project(p.lon,p.lat),o=offsets.get(p.id);return o?<line key={p.id} className="map-leader" x1={x} y1={y} x2={x+o.ox} y2={y+o.oy} stroke="#8d9aab" strokeWidth={0.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" pointerEvents="none"/>:null})}</g>}
 {pins.map(p=>{const [x,y]=project(p.lon,p.lat),o=offsets.get(p.id),rx=x+(o?o.ox:0),ry=y+(o?o.oy:0),labelX=rx>320?-17:16;return <g key={p.id} role="button" tabIndex={0} aria-label={'Selectează '+p.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect?.(p.id)}}} className={'map-pin '+(selected===p.id?'chosen':'')} transform={`translate(${rx},${ry})`}><title>{p.name}</title><circle r={selected===p.id?15:11} fill={selected===p.id?'#d9ad68':'#233b5d'} stroke="white" strokeWidth={3}/><circle r="3" fill="white"/>{(pins.length<=8||selected===p.id)&&<text x={labelX} y={4} textAnchor={rx>320?'end':'start'} paintOrder="stroke" stroke="#edf1f7" strokeWidth={3} fill="#2b394d">{pinLabelLines(p.label||p.name).map((line,i)=><tspan x={labelX} dy={i?16:0} key={i}>{line}</tspan>)}</text>}</g>})}</g></svg>
 {geo===false&&<span className="map-fail">Fond de carte indisponibil. Reperele rămân selectabile.</span>}
 <div className="map-controls"><Button variant="outline" size="icon" aria-label="Mărește harta" onClick={()=>setZoom(z=>Math.min(2.8,z+.3))}><Plus size={17}/></Button><Button variant="outline" size="icon" aria-label="Micșorează harta" onClick={()=>setZoom(z=>Math.max(1,z-.3))}><Minus size={17}/></Button><Button variant="outline" size="icon" aria-label="Resetează harta" onClick={()=>{setZoom(1);setPan({x:0,y:0})}}><LocateFixed size={17}/></Button></div>
 <a className="map-credit" href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Natural Earth · domeniu public · repere orientative</a></div>
}

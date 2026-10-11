export type ReportArea={scope:'nearby'|'national';locality:string;county:string;lat?:number;lon?:number;radius:number};
export type ReportAssumptions={monthlyRevenue:number;fixedCosts:number;variableCostPercent:number;investment:number};
export type ReportRequest={title:string;activity:string;area:ReportArea;cuis:string[];assumptions?:ReportAssumptions};
export type ReportSource={id:string;tool:string;url:string;arguments:Record<string,string>;status:string;publishedAt:string|null;lastSuccessAt:string|null;error:string|null;data:any};
export type CompanyYear={cui:string;name:string;year:number;turnover:number|null;net:number|null;employees:number|null;margin:number|null;sourceId:string};
export type BusinessReport={request:ReportRequest;generatedAt:string;sources:ReportSource[];financials:CompanyYear[];places:any[];placesTotal:number|null;placesComplete:boolean;comparisonYear:number|null;scenarios:ReturnType<typeof scenarios>};
export function validateReportRequest(request:ReportRequest){
 if(!request.title.trim()||request.title.length>160||!request.activity.trim()||request.activity.length>100)throw Error('Introdu un titlu și activitatea analizată.');
 if(!['nearby','national'].includes(request.area.scope)||!Number.isFinite(request.area.radius)||request.area.radius<1||request.area.radius>100)throw Error('Raza trebuie să fie între 1 și 100 km.');
 if(request.area.scope==='nearby'&&(!request.area.locality.trim()||!Number.isFinite(request.area.lat)||!Number.isFinite(request.area.lon)||Math.abs(request.area.lat!)>90||Math.abs(request.area.lon!)>180))throw Error('Alege o localitate cu punct verificat pe hartă.');
 if(request.cuis.length>8||request.cuis.some(cui=>!/^\d{2,10}$/.test(cui)))throw Error('Poți compara maximum 8 CUI-uri valide.');
 const a=request.assumptions;if(a&&(![a.monthlyRevenue,a.fixedCosts,a.variableCostPercent,a.investment].every(Number.isFinite)||a.monthlyRevenue<0||a.fixedCosts<0||a.investment<0||a.variableCostPercent<0||a.variableCostPercent>=100))throw Error('Ipotezele trebuie să fie valori pozitive sau zero; costul variabil trebuie să fie sub 100%.');
}
const value=(entries:any[],code:string)=>{const entry=entries.find(item=>item.code===code||item.indicator===code);return typeof entry?.value==='number'&&Number.isFinite(entry.value)?entry.value:null};
export function companyYears(source:ReportSource):CompanyYear[]{
 const data=source.data;if(!data)return [];
 return (data.history||[]).filter((year:any)=>Number.isInteger(year.year)).map((year:any)=>{
  const entries=year.entries||[],turnover=value(entries,'I13'),profit=value(entries,'I18'),loss=value(entries,'I19'),net=profit===null||loss===null?null:profit-loss;
  return {cui:String(data.cui||source.arguments.cui),name:String(data.name||source.arguments.cui),year:year.year,turnover,net,employees:value(entries,'I20'),margin:turnover!==null&&turnover>0&&net!==null?net/turnover*100:null,sourceId:source.id};
 });
}
export function scenarios(a?:ReportAssumptions){
 if(!a)return [];
 const contribution=1-a.variableCostPercent/100,breakEven=contribution>0?a.fixedCosts/contribution:null;
 return [{name:'Sensibilitate -20%',factor:.8},{name:'Ipoteza de bază',factor:1},{name:'Sensibilitate +20%',factor:1.2}].map(s=>{
  const monthlyRevenue=a.monthlyRevenue*s.factor,monthlyOperating=monthlyRevenue*contribution-a.fixedCosts;
  return {name:s.name,monthlyRevenue,monthlyOperating,annualOperating:monthlyOperating*12,threeYearOperating:monthlyOperating*36,breakEven,paybackMonths:monthlyOperating>0?a.investment/monthlyOperating:null};
 });
}
export function assembleReport(request:ReportRequest,sources:ReportSource[]):BusinessReport{
 validateReportRequest(request);const financials=sources.filter(s=>s.tool==='company_profile').flatMap(companyYears),placesSource=sources.find(s=>s.tool==='places_search'),places=placesSource?.data?.items||[];
 const years=[...new Set(financials.map(row=>row.year))].sort((a,b)=>b-a),comparisonYear=years.find(year=>request.cuis.every(cui=>financials.some(row=>row.cui===cui&&row.year===year)))??null;
 const total=Number.isInteger(placesSource?.data?.total)?placesSource!.data.total:null;
 return {request,generatedAt:new Date().toISOString(),sources,financials,places,placesTotal:total,placesComplete:total!==null&&places.length===total,comparisonYear,scenarios:scenarios(request.assumptions)};
}
export type ReportFetch=(path:string,arguments_:Record<string,string>,signal:AbortSignal)=>Promise<any>;
export async function collectReport(request:ReportRequest,read:ReportFetch,signal:AbortSignal,onProgress?:(message:string)=>void){
 validateReportRequest(request);const area=request.area,sources:ReportSource[]=[];
 async function get(tool:string,path:string,args:Record<string,string>){
  signal.throwIfAborted();onProgress?.('Se citesc datele: '+tool);
  let response:any;try{response=await read(path,args,signal)}catch(error){signal.throwIfAborted();response={status:'unavailable',data:null,error:error instanceof Error?error.message:'Sursa nu poate fi citită.'}}
  const source:ReportSource={id:'S'+String(sources.length+1).padStart(2,'0'),tool,url:response.url||path,arguments:args,status:response.status||(response.error?'unavailable':'cached'),publishedAt:response.publishedAt||null,lastSuccessAt:response.lastSuccessAt||null,error:response.error||null,data:response.data??null};sources.push(source);return source;
 }
 const placeArgs:Record<string,string>={q:request.activity,scope:area.scope==='nearby'?'nearby':'all',pageSize:'200',view:'cards',sort:area.scope==='nearby'?'distance':'name',...(area.scope==='nearby'?{lat:String(area.lat),lon:String(area.lon),radius:String(area.radius)}:{})};
 const places=await get('places_search','/api/places',placeArgs);
 // Three bounded pages; preserve the declared total and expose sampling. OSM is
 // not a company census, and a map location does not identify its fiscal operator.
 if(places.data){const all=[...(places.data.items||[])];for(let page=1;page<Math.min(3,places.data.pages||1);page++){signal.throwIfAborted();const next=await get('places_search','/api/places',{...placeArgs,page:String(page)});if(!next.data)break;all.push(...(next.data.items||[]));}places.data={...places.data,items:[...new Map(all.map(item=>[item.id,item])).values()]};}
 const unique=[...new Set(request.cuis)];
 for(let at=0;at<unique.length;at+=2)await Promise.all(unique.slice(at,at+2).map(cui=>get('company_profile','/api/company',{cui})));
 await get('ins_series','/api/ins',{territory:area.scope==='national'?'TOTAL':area.county||area.locality});
 await get('ancpi_integrals','/api/ancpi',{});
 if(area.scope==='nearby'&&area.county)await get('energy_offers','/api/energy-offers',{county:area.county,consumptionMonthly:'200',currentBillLei:'300'});
 return assembleReport({...request,cuis:unique},sources);
}

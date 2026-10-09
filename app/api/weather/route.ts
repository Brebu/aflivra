import {readGeographicContext} from '@/lib/geographic-scope';
import {localWeatherAlerts} from '@/lib/weather-location';
import {readSource} from '@/lib/live/cache';
import {forecastLoader,alertsLoader} from '@/lib/live/weather';
export const dynamic='force-dynamic';
export async function GET(request:Request){const p=new URL(request.url).searchParams;if(p.get('kind')==='alerts'){const context=readGeographicContext(p);if(!context)return Response.json({error:'Locație invalidă.'},{status:400});const state=await readSource(alertsLoader);return Response.json({...state,data:localWeatherAlerts(state.data,context)},{headers:{'Cache-Control':'no-store'}});}const lat=Number(p.get('lat')),lon=Number(p.get('lon'));if(!p.has('lat')||!p.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return Response.json({error:'Alege coordonate geografice valide.'},{status:400});const hoursParam=p.get('hours'),hours=hoursParam!==null&&Number.isInteger(Number(hoursParam))&&Number(hoursParam)>=1&&Number(hoursParam)<=168?Number(hoursParam):null;
 const forecastState=await readSource(forecastLoader(lat,lon),{waitForRefresh:true});
 // Proiecția pe ore (conversații, tool-uri) păstrează starea curentă și taie
 // fereastra orară cerută din copia completă — fără să scurteze datele în cache.
 if(hours!==null&&forecastState.data){
  // Fereastra orară PORNEȘTE de la bucketul orar în curs (ora curentă), nu de la
  // începutul zilei sursei: o cerere de prognoză primește următoarele N ore
  // utile, iar windowStart publică prima oră servită.
  const data=forecastState.data as {hourly?:Array<{time?:string}>};
  const rows=Array.isArray(data.hourly)?data.hourly:[];
  const now=Date.now(),start=rows.findIndex(row=>{const stamp=Date.parse(String(row?.time||''));return Number.isFinite(stamp)&&stamp+3600000>now});
  const windowStart=start>=0&&rows[start]?.time?String(rows[start].time):null;
  const windowed=start>=0?rows.slice(start,start+hours):rows.slice(0,hours);
  return Response.json({...forecastState,data:{...forecastState.data,hourly:windowed,hoursApplied:hours,...(windowStart?{windowStart}:{})}},{headers:{'Cache-Control':'no-store'}})}
 return Response.json(forecastState,{headers:{'Cache-Control':'no-store'}})}

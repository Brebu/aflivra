import {getSource,SourceError} from './adapters';
import type {Loaded,Loader} from './types';
import {forecastConfig,parseForecast as parseForecastPayload} from './forecast';
import {withForecastSlot} from './weather-gate';
export {currentVariables,hourlyVariables,dailyVariables} from './forecast';
export function parseForecast(raw:string):Loaded{try{return parseForecastPayload(raw)}catch(error){/* A malformed body must never leak raw engine text; the structured validators keep their messages. */if(error instanceof SyntaxError)throw new SourceError('Răspuns neașteptat de la sursă la prognoză.');throw new SourceError(error instanceof Error?error.message:'Prognoza nu are o structură validă.')}}
export const forecastLoader=(lat:number,lon:number):Loader=>{const {requestUrl,...config}=forecastConfig(lat,lon);return{...config,load:()=>withForecastSlot(async()=>parseForecast(await getSource(requestUrl)))}};
export function parseAlerts(raw:string):Loaded{if(/<!DOCTYPE|<!ENTITY/i.test(raw)||!/<avertizari(?:\s[^>]*)?(?:\/>|>[\s\S]*<\/avertizari>)/i.test(raw))throw new SourceError('Structura avertizărilor ANM nu a putut fi confirmată.');const empty=/<avertizari(?:\s[^>]*)?\s*\/>/i.test(raw)||/<avertizari(?:\s[^>]*)?>\s*<\/avertizari>/i.test(raw);return{publishedAt:null,data:{empty,document:raw,note:empty?'Fluxul ANM nu conține avertizări la această verificare.':'Mesajele furnizate de ANM sunt afișate integral. Verifică intervalul de valabilitate din fiecare mesaj.'}}}
export const alertsLoader:Loader={key:'weather-alerts',name:'ANM · avertizări meteorologice',url:'https://www.meteoromania.ro/avertizari-xml.php',version:'anm.alerts.full-document.v1',ttl:300,load:async()=>parseAlerts(await getSource('https://www.meteoromania.ro/avertizari-xml.php'))};

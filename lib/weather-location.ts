import {mentionsLocation} from './location-context';
import {sourceElements} from './live/source-html';
import type {GeographicContext} from './geographic-scope';
/** Keep a warning only when its own message explicitly names the chosen zone. */
export function localWeatherAlerts(data:any,context:GeographicContext){
 if(!data||!context.active||data.empty)return data;
 const document=String(data.document||''),messages=[...new Set(['avertizare','mesaj','warning','alert','informare'].flatMap(tag=>sourceElements(document,tag).map(node=>node.openTag+node.html+'</'+tag+'>')))];
 const selected=messages.filter(text=>!!context.county&&mentionsLocation(text,context.county)||!!context.locality&&mentionsLocation(text,context.locality));
 return {...data,empty:selected.length===0,document:selected.length?'<?xml version="1.0"?><avertizari>'+selected.join('\n')+'</avertizari>':'',localUnavailable:!messages.length,note:messages.length?selected.length?'Mesaje ANM care precizează localitatea sau județul ales. Verifică zonele și intervalele fiecărui mesaj.':'Nu sunt mesaje cu localitatea / județul ales în copia primită. Unele avertizări pot avea o zonă care nu poate fi identificată automat.':'Fluxul primit nu permite identificarea sigură a avertizărilor locale. Selectează Toată România pentru documentul integral.'};
}

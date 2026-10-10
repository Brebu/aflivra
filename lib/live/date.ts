/** Calendar times without an offset are the local clock printed by the source. */
export function displaySourceDate(v:string|null|undefined){if(!v)return 'Nefurnizată de sursă';if(/^\d{4}$/.test(v)||v.includes('–')||/^\d{2}\.\d{2}\./.test(v))return v;
 // IFEP-style registry stamps print the local wall clock as „dd-mm-yyyy[ HH:MM]";
 // the typed reading renders that Romanian local time without any zone shift. A
 // structurally matching but semantically invalid stamp stays raw — never run it
 // through the lenient Date parser, which would mangle it into another date.
 const ro=v.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s(\d{2}):(\d{2}))?$/);
 if(ro){const day=Number(ro[1]),month=Number(ro[2]);if(month<1||month>12||day<1||day>31)return v;const d=new Date(Date.UTC(Number(ro[3]),month-1,day,Number(ro[4]||0),Number(ro[5]||0)));return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ro-RO',{dateStyle:'medium',...(ro[4]?{timeStyle:'short'}:{}),timeZone:'UTC'}).format(d):v}
 const localClock=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v),d=new Date(localClock?v+'Z':v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ro-RO',{dateStyle:'medium',...(v.includes('T')?{timeStyle:'short'}:{}),timeZone:localClock?'UTC':'Europe/Bucharest'}).format(d):v}

/** Calendar day in Europe/Bucharest — the day a person in Romania means by „azi".
 * UTC stays correct for observation timestamps; only calendar-day picks (cinema
 * „programul de azi") use the Romanian day, built from formatToParts so winter
 * and summer both render the local day after midnight. */
export function romanianDate(date:Date=new Date()){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';const year=get('year'),month=get('month'),day=get('day');return /^\d{4}$/.test(year)&&/^\d{2}$/.test(month)&&/^\d{2}$/.test(day)?`${year}-${month}-${day}`:date.toISOString().slice(0,10)}

/** A day that exists on the calendar — „2026-02-30" must be rejected before any
 * upstream call, because lenient Date parsing would silently rewrite it into March. */
export function isValidCalendarDate(v:string|null|undefined):boolean{
 if(!v||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v)!;
 const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}

/** History windows arrive as YYYY / YYYY-MM / YYYY-MM-DD prefixes: a calendar-valid
 * prefix expands to its real bounds (leap Februaries included), an impossible one
 * stays null so the caller answers with the invalid-argument contract, never a
 * silently widened range. */
export function calendarRange(prefix:string|null|undefined):{from:string;to:string}|null{
 if(!prefix)return null;
 if(/^\d{4}$/.test(prefix))return isValidCalendarDate(prefix+'-12-31')?{from:prefix+'-01-01',to:prefix+'-12-31'}:null;
 if(/^\d{4}-\d{2}$/.test(prefix)){
  const from=prefix+'-01';if(!isValidCalendarDate(from))return null;
  const lastDay=new Date(Date.UTC(Number(prefix.slice(0,4)),Number(prefix.slice(5,7)),0));
  const to=prefix+'-'+String(lastDay.getUTCDate()).padStart(2,'0');
  return isValidCalendarDate(to)?{from,to}:null;
 }
 return isValidCalendarDate(prefix)?{from:prefix,to:prefix}:null;
}

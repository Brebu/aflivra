/** Calendar times without an offset are the local clock printed by the source. */
export function displaySourceDate(v:string|null|undefined){if(!v)return 'Nefurnizată de sursă';if(/^\d{4}$/.test(v)||v.includes('–')||/^\d{2}\.\d{2}\./.test(v))return v;
 // IFEP-style registry stamps print the local wall clock as „dd-mm-yyyy[ HH:MM]";
 // the typed reading renders that Romanian local time without any zone shift. A
 // structurally matching but semantically invalid stamp stays raw — never run it
 // through the lenient Date parser, which would mangle it into another date.
 const ro=v.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s(\d{2}):(\d{2}))?$/);
 if(ro){const day=Number(ro[1]),month=Number(ro[2]);if(month<1||month>12||day<1||day>31)return v;const d=new Date(Date.UTC(Number(ro[3]),month-1,day,Number(ro[4]||0),Number(ro[5]||0)));return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ro-RO',{dateStyle:'medium',...(ro[4]?{timeStyle:'short'}:{}),timeZone:'UTC'}).format(d):v}
 const localClock=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v),d=new Date(localClock?v+'Z':v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ro-RO',{dateStyle:'medium',...(v.includes('T')?{timeStyle:'short'}:{}),timeZone:localClock?'UTC':'Europe/Bucharest'}).format(d):v}

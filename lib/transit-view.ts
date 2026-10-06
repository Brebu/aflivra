export function bucharestDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
export function runsOn(service:string,date:string,calendar:any[],exceptions:any[]){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const compact=date.replace(/-/g,''),exception=exceptions.find(x=>x.service_id===service&&x.date===compact);
 if(exception)return exception.exception_type==='1';
 const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00Z').getUTCDay()];
 return calendar.some(x=>x.service_id===service&&compact>=x.start_date&&compact<=x.end_date&&x[weekday]==='1');
}
export function readableTransitTime(text:string){if(!/^\d{2,3}:\d{2}:\d{2}$/.test(text||''))return text||'Nefurnizată';const [h,m]=text.split(':').map(Number);return String(h%24).padStart(2,'0')+':'+String(m).padStart(2,'0')+(h>=24?' (+'+Math.floor(h/24)+' zi)':'')}

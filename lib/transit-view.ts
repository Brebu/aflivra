export function bucharestDate(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
export function runsOn(service:string,date:string,calendar:any[],exceptions:any[]){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const compact=date.replace(/-/g,''),exception=exceptions.find(x=>x.service_id===service&&x.date===compact);
 if(exception)return exception.exception_type==='1';
 const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date+'T12:00:00Z').getUTCDay()];
 return calendar.some(x=>x.service_id===service&&compact>=x.start_date&&compact<=x.end_date&&x[weekday]==='1');
}
export function readableTransitTime(text:string){if(!/^\d{2,3}:\d{2}:\d{2}$/.test(text||''))return text||'Nefurnizată';const [h,m]=text.split(':').map(Number);return String(h%24).padStart(2,'0')+':'+String(m).padStart(2,'0')+(h>=24?' (+'+Math.floor(h/24)+' zi)':'')}
const CARDINALS=['nord','nord-est','est','sud-est','sud','sud-vest','vest','nord-vest'];
const emptyValue=(value:unknown)=>value===null||value===undefined||value==='';
export function bearingText(bearing:unknown):string|null{if(emptyValue(bearing))return null;const value=Number(bearing);if(!Number.isFinite(value))return null;const degrees=((value%360)+360)%360;return 'spre '+CARDINALS[Math.round(degrees/45)%8]}
export function speedText(speed:unknown):string|null{if(emptyValue(speed))return null;const value=Number(speed);return Number.isFinite(value)&&value>=0?(value*3.6).toFixed(1)+' km/h':null}
const OCCUPANCY:Record<string,string>={EMPTY:'Fără călători',MANY_SEATS_AVAILABLE:'Multe locuri libere',FEW_SEATS_AVAILABLE:'Puține locuri libere',STANDING_ROOM_ONLY:'Doar în picioare',CRUSHED_STANDING_ROOM_ONLY:'Aglomerat, doar în picioare',FULL:'Plin',NOT_ACCEPTING_PASSENGERS:'Nu mai urcă călători',NOT_BOARDABLE:'Fără îmbarcare'};
export function occupancyText(status:unknown,percentage:unknown):string|null{const label=OCCUPANCY[String(status||'')];if(!label)return null;if(emptyValue(percentage))return label;const value=Number(percentage);return Number.isFinite(value)&&value>=0&&value<=100?label+' · ocupare '+Math.round(value)+'%':label}

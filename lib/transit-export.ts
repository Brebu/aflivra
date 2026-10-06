import type {ExportSheet} from './data-export';
const table=(name:string,records:any[]):ExportSheet=>{
 const columns=[...new Set(records.flatMap(r=>Object.keys(r)))];return{name,columns,rows:records.map(r=>columns.map(k=>r[k]??''))};
};
export function transitExportSheets(data:any):ExportSheet[]{
 return [table('Linie',[data.route]),table('Operator',[data.agency]),table('Stații',Object.values(data.stops)),table('Curse',data.trips),{name:'Opriri și ore',columns:data.stopTimeFields,rows:Object.values<unknown[][]>(data.stopTimes).flat()},table('Trasee',Object.values<any[]>(data.shapes).flat()),table('Calendar',data.calendar),table('Excepții',data.calendarDates),table('Frecvențe',data.frequencies),table('Variante',data.variants.map((v:any)=>({...v,stopIds:v.stopIds.join(', '),tripIds:v.tripIds.join(', ')})))];
}
export function networkExportSheets(network:any):ExportSheet[]{return[table('Linii',network.routes.map((r:any)=>r.details)),table('Stații',network.stops)]}

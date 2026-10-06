export type CourtQuery={number:string;name:string;subject:string;institution:string;from:string;to:string};
export type CourtNumberScope='all'|'filtered';
export const normalizeCourtNumber=(number:string)=>number.trim().replace(/\s*\/\s*/g,'/');
/** An explicit case number follows the case, independently of device location. */
export function courtSearchPlan(query:CourtQuery,numberScope:CourtNumberScope='all'){
 const followsNumber=!!query.number&&numberScope==='all';
 return{followsNumber,query:followsNumber?{number:query.number,name:'',subject:'',institution:'',from:'',to:''}:query};
}

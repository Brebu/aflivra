import {readGeographicContext,countyName} from '@/lib/geographic-scope';
import {lawyerLoader,normalizeLawyerData} from '@/lib/live/lawyers';
import {readSource} from '@/lib/live/cache';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,q=(p.get('q')||'').trim(),page=Number(p.get('page')||0),sort=p.get('sort')||'recent',context=readGeographicContext(p);
 // Un județ explicit care nu există se respinge — nu se servește tăcut o selecție
 // națională sub un filtru care pretinde un județ.
 const rawCounty=(p.get('county')||'').trim();
 if(!context||q.length>160||q&&q.length<3||!Number.isInteger(page)||page<0||page>100000||!['name','recent'].includes(sort)||rawCounty&&!countyName(rawCounty))return Response.json({error:'Introdu cel puțin 3 caractere și filtre valide.'},{status:400});
 // Baroul se aplică pe serverul sursei (ddlCompany) ori de câte ori cererea e locală
 // — județ singur, localitate sau coordonate. Când electronul e național declarat
 // (geoScope=national), sensul explicit rămâne: fără barou, cu notiță onestă.
 // Independent de context.active: barul contează și fără localitate sau punct.
 const barCounty=context.scope!=='national'&&context.county?context.county:'';
 const source=await readSource(lawyerLoader(q,page,sort,barCounty));
 const data=normalizeLawyerData(source.data);
 if(data&&barCounty&&data.barScope!==barCounty){data.sourceTotal=data.total;data.items=data.items.filter((item:any)=>countyName(item.title.match(/baroul\s+([^\[,;\n]+)/i)?.[1])===context.county);data.note='Registrul nu a suportat filtrul pe baroul '+barCounty+'; afișăm doar potrivirile locale de pe pagina sursei — selecția completă rămâne necunoscută.'}
 return Response.json({...source,data},{headers:{'Cache-Control':'no-store'}});
}

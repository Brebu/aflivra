import {readSource} from '@/lib/live/cache';
import {resourceLoader,resourcePage,datastorePageLoader,expandDocument} from '@/lib/live/resources';
import {readGeographicContext} from '@/lib/geographic-scope';
export const dynamic='force-dynamic';
export async function GET(request:Request){const p=new URL(request.url).searchParams,id=p.get('id')||'',q=p.get('q')||'',page=Number(p.get('page')||0),sheet=Number(p.get('sheet')||0),sort=Number(p.get('sort')??-1),geographicContext=readGeographicContext(p);if(!geographicContext||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)||q.length>200||![page,sheet,sort].every(Number.isInteger)||page<0||page>100000||sheet<0||sheet>1000||sort< -1||sort>10000)return Response.json({error:'Parametrii resursei sunt invalizi.'},{status:400});const query={q,page,sheet,sort,desc:p.get('desc')==='1',geographicContext},state=await readSource(resourceLoader(id));try{
 // Pachetul Word Flat OPC: conversația servește textul extras, iar integralul
 // rămâne un fișier descărcabil pe ruta de export — nu un XML brut de sute de
 // mii de caractere duplicat în răspuns.
 const served=state.data?.kind==='datastore'?await readSource(datastorePageLoader(id,state,query)):await expandDocument(await resourcePage(state,query));
 const documentFile=state.data?.sourceShape==='word-flat-opc'?((d:any)=>{const {xmlDocument,...rest}=d;return {...rest,file:{url:new URL('/api/resource-file?id='+id+'&format=xml&download=1',request.url).href,mimeType:'application/xml',size:xmlDocument.length,integrity:{characters:d.originalCharacters,complete:true}}}})(state.data):null;
 return Response.json(documentFile?{...served,data:documentFile}:served,{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({...state,status:'unavailable',data:null,error:e instanceof Error?e.message:'Pagina nu poate fi citită acum.'},{headers:{'Cache-Control':'no-store'}})}}

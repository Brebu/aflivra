// Aflivra MCP endpoint — Streamable HTTP, one JSON-RPC endpoint exposing the
// platform's public routes as tools. The route wires the protocol server's
// callRoute seam to the real GET/POST handlers: no data logic lives here, only
// the mapping from tool paths to route modules. Origins are validated per the
// 2025-06-18 transport: same-origin browsers and Origin-less server-to-server
// clients pass, any other origin is refused; no auth in this turn — public
// read-only data, OAuth wiring for the marketplaces lands later.
import {handleRpc,MCP_PROTOCOL_VERSION,SUPPORTED_PROTOCOL_VERSIONS,type RouteCaller} from '@/lib/mcp/server';
import * as company from '../company/route';
import * as places from '../places/route';
import * as directory from '../directory/route';
import * as localities from '../localities/route';
import * as weather from '../weather/route';
import * as events from '../events/route';
import * as cinema from '../cinema/route';
import * as transportLive from '../transport-live/route';
import * as transportNetwork from '../transport/route';
import * as tranzyLive from '../tranzy-live/route';
import * as flights from '../flights/route';
import * as flightBoard from '../flight-board/route';
import * as trains from '../trains/route';
import * as legal from '../legal/route';
import * as domain from '../domain/route';
import * as catalog from '../catalog/route';
import * as resource from '../resource/route';
import * as resourceFile from '../resource-file/route';
import * as content from '../content/route';
import * as story from '../story/route';
import * as lawyers from '../lawyers/route';
import * as experts from '../experts/route';
import * as notaries from '../notaries/route';
import * as anl from '../anl/route';
import * as ancpi from '../ancpi/route';
import * as tourism from '../tourism/route';
import * as seismic from '../seismic/route';
import * as earthquakes from '../earthquakes/route';
import * as monuments from '../monuments/route';
import * as ins from '../ins/route';
import * as energyOffers from '../energy-offers/route';
import * as power from '../power/route';
import * as cinemas from '../cinemas/route';
import * as stories from '../stories/route';

export const dynamic='force-dynamic';

const ROUTES:Record<string,{GET?(request:Request):Promise<Response>;POST?(request:Request):Promise<Response>}>={
  '/api/company':company,'/api/places':places,'/api/directory':directory,'/api/localities':localities,'/api/weather':weather,
  '/api/events':events,'/api/cinema':cinema,'/api/transport':transportNetwork,'/api/transport-live':transportLive,'/api/tranzy-live':tranzyLive,'/api/flights':flights,
  '/api/flight-board':flightBoard,'/api/trains':trains,'/api/legal':legal,'/api/domain':domain,'/api/catalog':catalog,
  '/api/resource':resource,'/api/resource-file':resourceFile,'/api/content':content,'/api/story':story,'/api/lawyers':lawyers,
  '/api/experts':experts,'/api/notaries':notaries,'/api/anl':anl,'/api/ancpi':ancpi,'/api/cinemas':cinemas,'/api/stories':stories,
  '/api/tourism':tourism,'/api/seismic':seismic,'/api/earthquakes':earthquakes,'/api/monuments':monuments,'/api/ins':ins,'/api/energy-offers':energyOffers,'/api/power':power,
};

// Originea acceptată e originea proprie a aplicației; clienții server-to-server
// (conectori MCP, auditul live) nu trimit Origin deloc și rămân funcționali.
const originAllowed=(origin:string|null,url:URL)=>!origin||origin===url.origin;
const cors=(origin:string|null)=>({
  'Access-Control-Allow-Origin':origin||'*','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Session-Id','Access-Control-Expose-Headers':'Mcp-Session-Id, Mcp-Protocol-Version','Access-Control-Max-Age':'86400',
});
// A23: un export binar legitim — descărcare reușită cu MIME de fișier — e singura
// formă care devine BinaryExport; un 4xx/5xx fără Content-Type rămâne eroare.
// Exporturile binare reale (XLSX, PDF, XML-ul de document): CSV-ul rămâne TEXT
// în conversație — descrierea tool-ului cere text lizibil la csv, nu legătură.
const EXPORT_MIME=/^(application\/vnd\.openxmlformats|application\/pdf|application\/xml)/;

const makeCallRoute=(origin:string):RouteCaller=>async call=>{
  const routeModule=ROUTES[call.path];
  if(!routeModule)return {ok:false,status:404,body:{error:'Unknown route.'}};
  const url=new URL(call.path+'?'+new URLSearchParams(call.query),origin+'/');
  const handler=call.method==='POST'?routeModule.POST:routeModule.GET;
  if(!handler)return {ok:false,status:405,body:{error:'Method not supported for this route.'}};
  const request=call.method==='POST'?new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(call.body||{})}):new Request(url);
  const response=await handler(request);
  const contentType=response.headers.get('content-type')||'';
  if(response.ok&&EXPORT_MIME.test(contentType)){
    // Binar legitim (XLSX, PDF, XML, CSV): conținutul nu se decodifică ca text —
    // tool-ul primește o legătură de descărcare cu MIME și numele fișierului,
    // niciodată bytes stricate; răspunsurile eșuate trec mai departe ca erori.
    const disposition=response.headers.get('content-disposition')||'';
    const fileName=decodeURIComponent((disposition.match(/filename\*=UTF-8''([^;]+)/)||disposition.match(/filename="([^"]+)"/)||[])[1]||'export');
    const url=origin+call.path+(Object.keys(call.query).length?'?'+new URLSearchParams(call.query).toString():'');
    return {ok:response.ok,status:response.status,body:{},binary:{url,mimeType:contentType,fileName,rows:Number(response.headers.get('x-aflivra-rows'))||null,sheets:Number(response.headers.get('x-aflivra-sheets'))||null}};
  }
  const text=await response.text();
  let body:unknown=text;
  try{body=JSON.parse(text)}catch{}
  return {ok:response.ok,status:response.status,body};
};

const rpcError=(status:number,code:number,message:string,origin:string|null=null)=>Response.json({jsonrpc:'2.0',id:null,error:{code,message}},{status,headers:{...(origin===null?{}:cors(origin)),'Mcp-Protocol-Version':MCP_PROTOCOL_VERSION}});

export async function OPTIONS(request:Request){
  const origin=request.headers.get('origin');
  if(!originAllowed(origin,new URL(request.url)))return new Response(null,{status:403});
  return new Response(null,{status:204,headers:cors(origin)});
}
export async function GET(request:Request){const origin=request.headers.get('origin');if(!originAllowed(origin,new URL(request.url)))return rpcError(403,-32000,'Origin not allowed.');return rpcError(405,-32000,'Streamable HTTP requires POST; this server sends no server-initiated messages.',origin);}
export async function DELETE(request:Request){const origin=request.headers.get('origin');if(!originAllowed(origin,new URL(request.url)))return rpcError(403,-32000,'Origin not allowed.');return rpcError(405,-32000,'This server is stateless; no session to delete.',origin);}

export async function POST(request:Request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(!originAllowed(origin,url))return rpcError(403,-32000,'Origin not allowed.');
  // A24: headerul de versiune declarat dar nesuportat se respinge înainte de
  // dispatch — versiunea de răspuns e mereu cea negociată, nu ecoul cerut.
  const declared=request.headers.get('mcp-protocol-version');
  if(declared!==null&&!SUPPORTED_PROTOCOL_VERSIONS.includes(declared))return rpcError(400,-32001,`Unsupported MCP-Protocol-Version "${declared}"; supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,origin);
  let body:unknown;
  try{body=await request.json()}catch{return rpcError(400,-32700,'Parse error: the body must be JSON.',origin)}
  const handled=await handleRpc(makeCallRoute(url.origin),body);
  const headers={...cors(origin),'Mcp-Protocol-Version':MCP_PROTOCOL_VERSION};
  if(handled.body===null)return new Response(null,{status:handled.status,headers});
  return Response.json(handled.body,{status:handled.status,headers});
}

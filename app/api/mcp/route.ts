// Aflivra MCP endpoint — Streamable HTTP, one JSON-RPC endpoint exposing the
// platform's public routes as tools. The route wires the protocol server's
// callRoute seam to the real GET/POST handlers: no data logic lives here, only
// the mapping from tool paths to route modules. CORS open for connector
// clients (Claude, ChatGPT); no auth in this turn — public read-only data,
// OAuth wiring for the marketplaces lands with the marketplace-ready turn.
import {handleRpc,MCP_PROTOCOL_VERSION,type RouteCaller} from '@/lib/mcp/server';
import * as company from '../company/route';
import * as places from '../places/route';
import * as directory from '../directory/route';
import * as localities from '../localities/route';
import * as weather from '../weather/route';
import * as events from '../events/route';
import * as cinema from '../cinema/route';
import * as transportLive from '../transport-live/route';
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

export const dynamic='force-dynamic';

const ROUTES:Record<string,{GET?(request:Request):Promise<Response>;POST?(request:Request):Promise<Response>}>={
  '/api/company':company,'/api/places':places,'/api/directory':directory,'/api/localities':localities,'/api/weather':weather,
  '/api/events':events,'/api/cinema':cinema,'/api/transport-live':transportLive,'/api/tranzy-live':tranzyLive,'/api/flights':flights,
  '/api/flight-board':flightBoard,'/api/trains':trains,'/api/legal':legal,'/api/domain':domain,'/api/catalog':catalog,
  '/api/resource':resource,'/api/resource-file':resourceFile,'/api/content':content,'/api/story':story,'/api/lawyers':lawyers,
  '/api/experts':experts,'/api/notaries':notaries,'/api/anl':anl,'/api/ancpi':ancpi,
};

const CORS={
  'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Mcp-Protocol-Version, Mcp-Session-Id','Access-Control-Expose-Headers':'Mcp-Session-Id, Mcp-Protocol-Version','Access-Control-Max-Age':'86400',
};

const callRoute:RouteCaller=async call=>{
  const routeModule=ROUTES[call.path];
  if(!routeModule)return {ok:false,status:404,body:{error:'Unknown route.'}};
  const url=new URL(call.path+'?'+new URLSearchParams(call.query),'https://aflivra.brebu.workers.dev/');
  const handler=call.method==='POST'?routeModule.POST:routeModule.GET;
  if(!handler)return {ok:false,status:405,body:{error:'Method not supported for this route.'}};
  const request=call.method==='POST'?new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(call.body||{})}):new Request(url);
  const response=await handler(request);
  const text=await response.text();
  let body:unknown=text;
  try{body=JSON.parse(text)}catch{}
  return {ok:response.ok,status:response.status,body};
};

const rpcError=(status:number,code:number,message:string)=>Response.json({jsonrpc:'2.0',id:null,error:{code,message}},{status,headers:{...CORS,'Mcp-Protocol-Version':MCP_PROTOCOL_VERSION}});

export async function OPTIONS(){return new Response(null,{status:204,headers:CORS});}
export async function GET(){return rpcError(405,-32000,'Streamable HTTP requires POST; this server sends no server-initiated messages.');}
export async function DELETE(){return rpcError(405,-32000,'This server is stateless; no session to delete.');}

export async function POST(request:Request){
  const protocolVersion=request.headers.get('mcp-protocol-version')||MCP_PROTOCOL_VERSION;
  let body:unknown;
  try{body=await request.json()}catch{return rpcError(400,-32700,'Parse error: the body must be JSON.')}
  const handled=await handleRpc(callRoute,body);
  const headers={...CORS,'Mcp-Protocol-Version':protocolVersion};
  if(handled.body===null)return new Response(null,{status:handled.status,headers});
  return Response.json(handled.body,{status:handled.status,headers});
}

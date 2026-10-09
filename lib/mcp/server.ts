// Aflivra MCP server — Streamable HTTP transport, JSON-RPC 2.0. The server is
// stateless (no sessions): each POST carries a self-contained request or batch,
// which is what Claude and ChatGPT connectors use for public read-only tools.
// Route calls arrive through an injected seam so the protocol layer verifies
// offline, without the platform's data modules; the production route wires the
// seam to the real GET handlers.
import {TOOLS} from './tools';

export const MCP_PROTOCOL_VERSION='2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS=['2024-11-05','2025-03-26',MCP_PROTOCOL_VERSION];
export const SERVER_INFO={name:'aflivra',version:'1.0.0',title:'Aflivra',websiteUrl:'https://aflivra.brebu.workers.dev/'};
export const INSTRUCTIONS='Aflivra exposes Romanian public data: firm dossiers (ANAF, registries), live maps and transport, weather, flights, trains, events, legislation, justice registries, the open-data catalog with table readers, and public-domain stories. Data returns in Romanian with source provenance.';

export type RouteCall={path:string;query:Record<string,string>;method?:'POST';body?:Record<string,unknown>};
export type BinaryExport={url:string;mimeType:string;fileName:string;rows:number|null;sheets:number|null};
export type RouteCaller=(call:RouteCall)=>Promise<{ok:boolean;status:number;body:unknown;binary?:BinaryExport}>;

type RpcRequest={jsonrpc:'2.0';id?:string|number|null;method:string;params?:Record<string,unknown>};
type RpcResult={jsonrpc:'2.0';id:string|number|null;result:unknown}|{jsonrpc:'2.0';id:string|number|null;error:{code:number;message:string;data?:unknown}};

const isRpcRequest=(value:unknown):value is RpcRequest=>{
  const candidate=value as RpcRequest|null;
  return !!candidate&&typeof candidate==='object'&&candidate.jsonrpc==='2.0'&&typeof candidate.method==='string'&&(candidate.id===undefined||typeof candidate.id==='string'||typeof candidate.id==='number'||candidate.id===null);
};

const errorResponse=(id:string|number|null,code:number,message:string,data?:unknown):RpcResult=>({jsonrpc:'2.0',id,error:{code,message,...(data!==undefined?{data}:{})}});

export function validateArguments(tool:(typeof TOOLS)[number],args:unknown):{ok:true;args:Record<string,unknown>}|{ok:false;message:string}{
  if(args===undefined)args={};
  if(args===null||typeof args!=='object'||Array.isArray(args))return {ok:false,message:'Tool arguments must be a JSON object.'};
  const input=args as Record<string,unknown>;
  for(const name of tool.inputSchema.required||[]){
    const value=input[name];
    if(value===undefined||value===null)return {ok:false,message:`Missing required argument "${name}".`};
    // Prezent dar gol nu e lipsă: mesajul cere exact ce se așteaptă — un șir nevid.
    if(typeof value==='string'&&value.trim()==='')return {ok:false,message:`Argument "${name}" must be a non-empty string.`};
  }
  for(const [name,value] of Object.entries(input)){
    const schema=tool.inputSchema.properties[name];
    if(!schema)return {ok:false,message:`Unknown argument "${name}".`};
    const expected=schema.type;
    if(expected==='number'&&(typeof value!=='number'||!Number.isFinite(value)))return {ok:false,message:`Argument "${name}" must be a number.`};
    if(expected==='boolean'&&typeof value!=='boolean')return {ok:false,message:`Argument "${name}" must be a boolean.`};
    const maxLength=(schema as {maxLength?:number}).maxLength??500;
    if(expected==='string'&&(typeof value!=='string'||value.length>maxLength))return {ok:false,message:`Argument "${name}" must be a string of at most ${maxLength} characters.`};
    if(schema.enum&&typeof value==='string'&&!schema.enum.includes(value))return {ok:false,message:`Argument "${name}" must be one of: ${schema.enum.join(', ')}.`};
  }
  return {ok:true,args:input};
}

async function callTool(callRoute:RouteCaller,method:RpcRequest):Promise<RpcResult>{
  const name=(method.params?.name as string)||'';
  const tool=TOOLS.find(tool=>tool.name===name);
  if(!tool)return errorResponse(method.id??null,-32602,`Unknown tool "${name}".`);
  const validated=validateArguments(tool,method.params?.arguments);
  if(!validated.ok)return errorResponse(method.id??null,-32602,validated.message);
  const target=tool.build(validated.args);
  try{
    const response=await callRoute(target);
    if(response.binary){
      const binary=response.binary;
      const note=`Export binar: ${binary.fileName} — ${binary.rows} rânduri${binary.sheets?` pe ${binary.sheets} ${binary.sheets===1?'foaie':'foi'}`:''}. Descărcabil la ${binary.url} (tip ${binary.mimeType}); fișierul nu se citește ca text în conversație.`;
      return {jsonrpc:'2.0',id:method.id??null,result:{content:[{type:'resource_link',name:binary.fileName,uri:binary.url,mimeType:binary.mimeType},{type:'text',text:note}],structuredContent:{kind:'binary-export',...binary},isError:false}};
    }
    const text=typeof response.body==='string'?response.body:JSON.stringify(response.body);
    return {jsonrpc:'2.0',id:method.id??null,result:{content:[{type:'text',text}],...(response.ok&&response.body!==null&&typeof response.body==='object'?{structuredContent:response.body}:{}) ,isError:!response.ok}};
  }catch(error){
    return {jsonrpc:'2.0',id:method.id??null,result:{content:[{type:'text',text:`Tool call failed: ${error instanceof Error?error.message:String(error)}`}],isError:true}};
  }
}

function initialize(method:RpcRequest):RpcResult{
  const requested=(method.params?.protocolVersion as string)||MCP_PROTOCOL_VERSION;
  const negotiated=SUPPORTED_PROTOCOL_VERSIONS.includes(requested)?requested:MCP_PROTOCOL_VERSION;
  return {jsonrpc:'2.0',id:method.id??null,result:{protocolVersion:negotiated,capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:INSTRUCTIONS}};
}

async function dispatch(callRoute:RouteCaller,method:RpcRequest):Promise<RpcResult>{
  if(method.method==='initialize')return initialize(method);
  if(method.method==='ping')return {jsonrpc:'2.0',id:method.id??null,result:{}};
  if(method.method==='tools/list'){
    return {jsonrpc:'2.0',id:method.id??null,result:{tools:TOOLS.map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.inputSchema}))}};
  }
  if(method.method==='tools/call')return await callTool(callRoute,method);
  return errorResponse(method.id??null,-32601,`Method "${method.method}" is not supported.`);
}

export async function handleRpc(callRoute:RouteCaller,body:unknown):Promise<{status:number;body:RpcResult|null|RpcResult[]|{jsonrpc:'2.0';id:null;error:{code:number;message:string}}}>{
  if(Array.isArray(body)){
    if(!body.length)return {status:400,body:{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Empty batch.'}}};
    const entries=body.map(entry=>isRpcRequest(entry)?entry:null);
    if(entries.some(entry=>entry===null))return {status:400,body:{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Batch entries must be JSON-RPC 2.0 requests.'}}};
    const requests=(entries as RpcRequest[]).filter(entry=>entry.id!==undefined);
    const responses=await Promise.all(requests.map(entry=>dispatch(callRoute,entry)));
    return {status:200,body:responses.length?responses:null};
  }
  if(!isRpcRequest(body))return {status:400,body:{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request must be a JSON-RPC 2.0 object.'}}};
  if(body.id===undefined)return {status:202,body:null};
  const response=await dispatch(callRoute,body);
  return {status:200,body:response};
}

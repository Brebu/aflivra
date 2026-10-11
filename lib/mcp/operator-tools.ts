import type {ToolDef} from './tools';
// These tools are visible/callable only for an authenticated operator. The bearer
// stays in the HTTP transport; secrets and arbitrary upstream URLs are never arguments.
export const OPERATOR_TOOLS:ToolDef[]=[
 {
  name:'refresh_corpora',
  description:'Operator-only: trigger the fixed Brebu/aflivra GitHub Actions import workflow for one static corpus or all. Requires a server-side GitHub Actions token. Returns acceptance and a runs URL, not refreshed data: validation, a reviewed PR and deployment must finish before bundled datasets change.',
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  inputSchema:{type:'object',additionalProperties:false,properties:{source:{type:'string',enum:['all','situr','amccrs','eida','lmi'],description:'Static corpus to import; defaults to all.'}}},
  build:args=>({path:'/api/refresh/corpora',method:'POST',query:{source:typeof args.source==='string'?args.source:'all'}}),
 },
 {
  name:'refresh_sources',
  description:'Operator-only: durably queue a refresh of a configured group or one configured source member. Returns job IDs immediately, not a claim that the source has updated. force bypasses valid cache TTL, while Retry-After, budgets and concurrent leases still apply. Static corpora and external relays have separate pipelines.',
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
  inputSchema:{type:'object',additionalProperties:false,properties:{group:{type:'string',enum:['pulse','living','feeds','research','registers'],description:'One configured sweep group; omit group and member to refresh all configured members.'},member:{type:'string',maxLength:100,description:'One configured member from refresh_status, e.g. weather.alerts or cinema.bucuresti.today; mutually exclusive with group.'},force:{type:'boolean',description:'Revalidate before TTL expiry; does not bypass backoff, source budgets, active locks or the 30-second manual refresh interval.'}}},
  build:args=>({path:'/api/refresh',method:'POST',query:{async:'true',...(typeof args.group==='string'?{source:args.group.trim()}:{}),...(typeof args.member==='string'?{member:args.member.trim()}:{}),force:String(args.force===true)}}),
 },
 {
  name:'refresh_status',
  description:'Operator-only: inspect configured refresh members, recent durable jobs, their per-source outcomes, next retry time, and separate static/relayed/on-demand coverage. Optionally inspect one job ID returned by refresh_sources.',
  annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  inputSchema:{type:'object',additionalProperties:false,properties:{jobId:{type:'string',maxLength:36,minLength:36,description:'UUID returned by refresh_sources; omit to list the most recent jobs and coverage.'}}},
  build:args=>{const query:Record<string,string>={};if(typeof args.jobId==='string')query.jobId=args.jobId.trim();return {path:'/api/refresh/status',query}},
 },
];

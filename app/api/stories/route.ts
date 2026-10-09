import rawIndex from '@/public/stories/listing.json';

// Lista lucrărilor din domeniul public (Wikisource RO): lectura completă rămâne
// pe /api/story, aici se descoperă id-urile — derivată (listing.json) din index.json.gz, cu
// paritatea ținută de poarta verify-mcp.mjs.
export const dynamic='force-dynamic';
const INDEX=rawIndex as {count:number;items:{id:string;title:string;categories:string[];url:string}[]};

export async function GET(request:Request){
 const page=new URL(request.url).searchParams.get('page')||'0';
 const pageNumber=Number(page);
 if(page.trim()===''||!Number.isInteger(pageNumber)||pageNumber<0||pageNumber>1000)return Response.json({error:'Pagină invalidă.'},{status:400});
 const pageSize=20,start=pageNumber*pageSize;
 return Response.json({items:INDEX.items.slice(start,start+pageSize),total:INDEX.count,page:pageNumber,pageSize,pages:Math.max(1,Math.ceil(INDEX.count/pageSize)),note:'Lista lucrărilor din domeniul public, cu id-ul și categoria fiecăreia; textul integral se citește cu /api/story.'},{headers:{'Cache-Control':'public, max-age=3600'}});
}

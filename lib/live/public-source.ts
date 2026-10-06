/** Human-readable provenance. Machine endpoints stay in technical metadata. */
export function publicSourceLink(url:string,documentUrl?:string):{url:string;label:string}{
 const candidate=documentUrl||url;
 try{
  const u=new URL(candidate);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return{url:'',label:'Sursa'};
  if(/(?:\/feed\/?|\/rss(?:\.xml)?\/?|\.rss)(?:$|\?)/i.test(u.pathname))return{url:u.origin+'/',label:'Pagina publicației'};
  if(u.hostname==='data.gov.ro'&&u.pathname.startsWith('/api/3/action/')){const dataset=u.searchParams.get('id');return{url:u.origin+'/dataset'+(dataset?'/'+encodeURIComponent(dataset):''),label:dataset?'Fișa setului de date':'Catalogul sursei'}}
  if(u.hostname==='query.wikidata.org')return{url:'https://www.wikidata.org/',label:'Pagina sursei'};
  if(u.pathname.includes('/wp-json/'))return{url:u.origin+'/',label:'Pagina instituției'};
  if(u.hostname==='webservicesp.anaf.ro')return{url:'https://www.anaf.ro/',label:'Pagina ANAF'};
  if(u.hostname==='curs.bnr.ro')return{url:'https://www.bnr.ro/',label:'Pagina BNR'};
  return{url:u.href,label:documentUrl?'Documentul original':'Sursa'};
 }catch{return{url:'',label:'Sursa'}}
}

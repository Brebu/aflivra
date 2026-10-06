"""Import all reachable story-category pages and their full verified texts."""
import gzip, argparse, concurrent.futures, datetime, hashlib, json, pathlib, shutil, tempfile, time, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
class Text(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
        if tag in ('p','br','div','h1','h2','h3','h4','li','tr'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
        if tag in ('p','div','li'):self.parts.append('\n')
    def handle_data(self,data):
        if not self.hidden:self.parts.append(data)
def request(params):
    url='https://ro.wikisource.org/w/api.php?'+urllib.parse.urlencode({'format':'json',**params})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Aflivra/1.0 public domain story reader; source attribution preserved'}),timeout=20) as r:data=json.load(r)
            if data.get('error'):raise RuntimeError(str(data['error']))
            return data
        except Exception as e:
            if attempt==2:raise
            retry=int(e.headers.get('Retry-After','30')) if isinstance(e,urllib.error.HTTPError) and e.code==429 else 2+attempt
            time.sleep(min(max(retry,2),120))
def snapshot_bytes(path):
    return path.read_bytes() if path.exists() else gzip.decompress(pathlib.Path(str(path)+'.gz').read_bytes())
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='public/stories');parser.add_argument('--resume',action='store_true');args=parser.parse_args()
    previous={}
    if args.resume:
        previous={int(x['id']):x for x in json.loads(snapshot_bytes(pathlib.Path(args.output)/'index.json'))['items']}
    queue=['Categorie:Basme','Categorie:Povești','Categorie:Basme populare','Categorie:Legende'];seen=set();pages={};source_checks=[]
    while queue:
        category=queue.pop(0)
        if category in seen:continue
        seen.add(category);token={};count=0
        while True:
            result=request({'action':'query','list':'categorymembers','cmtitle':category,'cmnamespace':'0|14','cmlimit':'max',**token})
            for item in result['query']['categorymembers']:
                count+=1
                if item['ns']==14:queue.append(item['title'])
                else:
                    page=pages.setdefault(item['pageid'],{**item,'categories':[]});page['categories'].append(category.removeprefix('Categorie:'))
            if not result.get('continue'):break
            token=result['continue']
        source_checks.append({'category':category,'members':count})
        if len(seen)>500:raise RuntimeError('Unexpected category graph; no partial catalog will be published')
    if not pages:raise RuntimeError('Empty story catalog')
    out=pathlib.Path(args.output);stage=pathlib.Path(tempfile.mkdtemp(prefix='stories-',dir=out.parent));(stage/'texts').mkdir()
    fetched=datetime.datetime.now(datetime.timezone.utc).isoformat();failures=[]
    def write(path,value):
        raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();path.write_bytes(raw);return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    def load(item):
        ident,page=item
        if args.resume and previous.get(ident,{}).get('file'):
            meta=previous[ident];src=out/meta['file'];dst=stage/meta['file'];dst.write_bytes(snapshot_bytes(src));return meta
        time.sleep(2)
        try:
            response=request({'action':'parse','pageid':ident,'prop':'text|links|revid|images|categories','redirects':1});parsed=response['parse'];html=parsed['text']['*'];extract=Text();extract.feed(html)
            content='\n\n'.join(x.strip() for x in ''.join(extract.parts).splitlines() if x.strip())
            if len(content)<40:raise RuntimeError('Empty text')
            url='https://ro.wikisource.org/wiki/'+urllib.parse.quote(parsed['title'].replace(' ','_'));meta={**page,'id':str(ident),'title':parsed['title'],'url':url,'revision':parsed['revid'],'characters':len(content),'categories':list(dict.fromkeys(page['categories']))}
            author=[c['*'].replace('_',' ') for c in parsed.get('categories',[]) if c['*'].startswith(('Ion_','Petre_','Mihai_','Ioan_','Vasile_','Barbu_','Liviu_','Alexandru_'))];meta['authors']=author
            body={**meta,'content':content,'html':html,'textComplete':True,'fetchedAt':fetched,'license':'Textul original în domeniul public; contribuții editoriale Wikisource','licenseUrl':'https://ro.wikisource.org/wiki/Wikisource:Drepturi_de_autor','chapters':[x['*'] for x in parsed.get('links',[]) if x['ns']==0 and x.get('exists') is not None and x['*'].startswith(parsed['title']+'/')]}
            meta['file']='texts/'+str(ident)+'.json';meta['proof']=write(stage/meta['file'],body);meta['search']=content.casefold();return meta
        except Exception as e:
            failures.append({'id':ident,'title':page['title'],'error':str(e)});return {**page,'id':str(ident),'url':'https://ro.wikisource.org/?curid='+str(ident),'unavailable':True}
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:items=list(pool.map(load,pages.items()))
    # All catalog entries stay visible, including an explicit failed text state.
    index=write(stage/'index.json',{'items':sorted(items,key=lambda p:p['title'])})
    manifest={'schema':'aflivra-stories-v1','fetchedAt':fetched,'count':len(items),'completeTexts':len(items)-len(failures),'failures':failures,'sourceChecks':source_checks,'index':index,'sourceUrl':'https://ro.wikisource.org/wiki/Categorie:Basme','licenseUrl':'https://ro.wikisource.org/wiki/Wikisource:Drepturi_de_autor'};write(stage/'manifest.json',manifest)
    if out.exists():shutil.rmtree(out)
    stage.rename(out);print(json.dumps({k:manifest[k] for k in ('count','completeTexts','failures')},ensure_ascii=False),flush=True)
if __name__=='__main__':main()

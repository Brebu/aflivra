"""Finalize a complete staging import into bounded searchable category assets.

Accepts a staging directory made by import-places.py. Index rows are never
discarded. Full original tags remain in record chunks. Browser pages request
bounded server queries instead of downloading the entire national index.
"""
import argparse,collections,datetime,hashlib,json,math,pathlib,shutil,unicodedata
import osmium
def norm(s):return ''.join(c for c in unicodedata.normalize('NFD',s).lower() if not unicodedata.combining(c))
def main():
 p=argparse.ArgumentParser();p.add_argument('--stage',required=True);p.add_argument('--pbf',required=True);p.add_argument('--metadata',required=True);p.add_argument('--output',default='public/places');a=p.parse_args();stage=pathlib.Path(a.stage);meta=json.loads(pathlib.Path(a.metadata).read_text());rows=json.loads((stage/'index.json').read_text())['items']
 def write(path,value):
  raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();assert len(raw)<24_000_000;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(raw);return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 chunks={};images={};source_features=0
 for file in sorted((stage/'records').glob('*.json')):
  raw=file.read_bytes();chunks[file.stem]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
  for r in json.loads(raw)['items']:
   source_features+=1+len(r.get('relatedSources',[]));t=r['tags'];image=t.get('image') or ''
   if image.startswith('https://'):images[r['id']]=image
   elif t.get('wikimedia_commons','').startswith('File:'):
    from urllib.parse import quote
    images[r['id']]='https://commons.wikimedia.org/wiki/Special:FilePath/'+quote(t['wikimedia_commons'][5:])+'?width=1000'
 for r in rows:
  if r['id'] in images:r['image']=images[r['id']]
 (stage/'index.json').unlink();indices={};counts={};subs={};spatial=collections.defaultdict(list)
 for r in rows:spatial[(math.floor(r['lat']),math.floor(r['lon']))].append(r)
 def parts(label,selected):
  result=[]
  for at in range(0,len(selected),1800):
   part=selected[at:at+1800];path='indices/'+label+'/'+str(at//1800).zfill(4)+'.json';result.append({'file':path,'start':at,'count':len(part),**write(stage/path,{'items':part})})
  return result
 for category in ['local-all']+sorted(set(c for r in rows for c in r['categories'])):
  selected=rows if category=='local-all' else [r for r in rows if category in r['categories']];counts[category]=len(selected);indices[category]={'name':parts(category+'/name',selected),'recent':parts(category+'/recent',sorted(selected,key=lambda r:r['updatedAt'],reverse=True))};subs[category]=sorted(set(t['label'] for r in selected for t in r['types'] if category=='local-all' or t['category']==category))
 spatial_index=[]
 for (lat,lon),selected in sorted(spatial.items()):spatial_index.append({'lat':lat,'lon':lon,'parts':parts('spatial/'+str(lat)+'_'+str(lon),selected)})
 cities=[]
 for item in osmium.FileProcessor(a.pbf).with_filter(osmium.filter.KeyFilter('place')):
  if not isinstance(item,osmium.osm.Node):continue
  t=dict(item.tags)
  if t.get('place') not in ('city','town','village','hamlet') or not t.get('name') or not item.location.valid():continue
  lat,lon=item.location.lat,item.location.lon
  if 43<=lat<=49.2 and 20<=lon<=31:cities.append({'name':t.get('name:ro') or t['name'],'lat':round(lat,6),'lon':round(lon,6),'type':t['place'],'county':t.get('is_in:county',''),'sourceUrl':'https://www.openstreetmap.org/node/'+str(item.id)})
 with osmium.io.Reader(a.pbf) as reader:asof=reader.header().get('osmosis_replication_timestamp')
 manifest={'schema':'aflivra-places-v2','count':len(rows),'sourceFeatures':source_features,'source':'OpenStreetMap · extract Geofabrik România','sourceUrl':'https://download.geofabrik.de/europe/romania.html','licenseUrl':'https://opendatacommons.org/licenses/odbl/1-0/','attribution':'© OpenStreetMap contributors','fetchedAt':meta['fetchedAt'],'dataAsOf':asof,'pbf':meta,'categories':counts,'subcategories':subs,'contacts':{k:sum(bool(r[k]) for r in rows) for k in ('address','phone','email','website','openingHours')},'chunks':chunks,'indices':indices,'spatial':spatial_index,'cities':write(stage/'cities.json',{'items':sorted(cities,key=lambda c:norm(c['name']))}),'note':'Date cartografice comunitare, distincte de registrele oficiale. Sunt păstrate toate fișele cartografiabile selectate în export, fără a pretinde că fiecare instituție din România este cartografiată.'}
 write(stage/'manifest.json',manifest);(stage/'LICENSE.txt').write_text('© OpenStreetMap contributors\nODbL 1.0 https://opendatacommons.org/licenses/odbl/1-0/\nhttps://download.geofabrik.de/europe/romania.html\n')
 output=pathlib.Path(a.output)
 if output.exists():shutil.rmtree(output)
 stage.rename(output);print(json.dumps({'count':len(rows),'sourceFeatures':source_features,'cities':len(cities),'categories':counts,'contacts':manifest['contacts']},ensure_ascii=False),flush=True)
if __name__=='__main__':main()

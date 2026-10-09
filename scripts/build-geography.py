"""Derive locality names/counties from the verified SIRUTA copy and mapped cities."""
from pathlib import Path
import json,gzip,base64,unicodedata,hashlib,re
root=Path(__file__).resolve().parent.parent
def fold(s):
 value=' '.join(unicodedata.normalize('NFD',s).encode('ascii','ignore').decode().lower().replace('-',' ').split())
 value=re.sub(r'^(municipiul|municipiu|orasul|oras|comuna|satul|sat|localitatea)\s+','',value)
 return re.sub(r'^bucuresti(?: sector(?:ul)? \d)?$','bucuresti',value)
packed=json.loads((root/'lib/live/seed-snapshots.json').read_text())['server']
raw=gzip.decompress(base64.b64decode(packed['gzipBase64']))
assert hashlib.sha256(raw).hexdigest()==packed['sha256']
source=json.loads(raw)['siruta'];names={};urban_names={}
for item in source['data']['items']:
 name=fold(item['name']);county=item['county'].replace('JUDEŢUL ','').replace('JUDEȚUL ','').title()
 if name=='bucuresti':county='București'
 names.setdefault(name,set()).add(county)
 if item.get('environment')=='Urban':urban_names.setdefault(name,set()).add(county)
known={k:next(iter(v)) for k,v in names.items() if len(v)==1}
urban_known={k:next(iter(v)) for k,v in urban_names.items() if len(v)==1}
out=root/'public/data';out.mkdir(exist_ok=True)
proof={'sourceUrl':'https://data.gov.ro/dataset/siruta_s1-2026','fetchedAt':source['fetchedAt']}
(out/'locality-counties.json').write_text(json.dumps({**proof,'items':known,'urbanItems':urban_known},ensure_ascii=False,separators=(',',':'))+'\n')
cities=json.loads((root/'public/places/cities.json').read_text())['items']
# Registrul cartografiat cuprinde municipiile și orașele, plus satele pe care SIRUTA
# le poartă în mediul urban (componente ale unităților urbane) — restul satelor
# rămân onest fără punct geografic, nu se inventează nicio coordonată.
urban=[];seen=set()
for city in cities:
 folded=fold(city['name'])
 core=city.get('type') in ['city','town']
 if city.get('type') not in ['city','town','village','hamlet']:continue
 if not core and folded not in urban_names:continue
 county=city.get('county') or known.get(folded) or urban_known.get(folded) or ''
 key=(folded,county)
 if key in seen:continue
 seen.add(key)
 urban.append({k:city[k] for k in ['name','lat','lon']}|{'county':county,'type':city['type']})
(out/'geographic-localities.json').write_text(json.dumps({**proof,'items':urban},ensure_ascii=False,separators=(',',':'))+'\n')
network=json.loads((root/'public/transit/network.json').read_text());manifest=json.loads((root/'public/transit/manifest.json').read_text())
points=[(float(x['stop_lat']),float(x['stop_lon'])) for x in network['stops']]
coverage={'source':manifest['source'],'sourceUrl':manifest['sourceUrl'],'networkSha256':manifest['network']['sha256'],'bounds':{'south':min(x[0] for x in points),'north':max(x[0] for x in points),'west':min(x[1] for x in points),'east':max(x[1] for x in points)}}
(root/'public/transit/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'localityCountyKeys':len(known),'urbanLocalities':len(urban),'transitCoverage':coverage['bounds']}))

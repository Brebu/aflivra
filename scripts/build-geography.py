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
# Județul se compară pliat: SIRUTA scrie diacriticele vechi (Ş-cedilla), OSM
# diacriticele noi (Ș-comma) — pe string brut, „Brașov" și „Braşov" ar fi două
# județe diferite și două rânduri pentru același județ real.
def county_key(value):
 return ' '.join(unicodedata.normalize('NFD',value).encode('ascii','ignore').decode().lower().replace('județul','').replace('judetul','').split())
for item in source['data']['items']:
 name=fold(item['name']);county=item['county'].replace('JUDEŢUL ','').replace('JUDEȚUL ','').title()
 if name=='bucuresti':county='București'
 names.setdefault(name,set()).add(county)
 if item.get('environment')=='Urban':urban_names.setdefault(name,set()).add(county)
# Mediul urban se filtrează pe PEREA (nume, județ): un nume urban într-un județ
# nu îndreptătățește satul omonim rural din alt județ (SOHODOL Brașov vs Gorj).
urban_pairs={(name,county_key(county)) for name,counties in urban_names.items() for county in counties}
known={k:next(iter(v)) for k,v in names.items() if len(v)==1}
urban_known={k:next(iter(v)) for k,v in urban_names.items() if len(v)==1}
out=root/'public/data';out.mkdir(exist_ok=True)
proof={'sourceUrl':'https://data.gov.ro/dataset/siruta_s1-2026','fetchedAt':source['fetchedAt']}
(out/'locality-counties.json').write_text(json.dumps({**proof,'items':known,'urbanItems':urban_known},ensure_ascii=False,separators=(',',':'))+'\n')
cities=json.loads((root/'public/places/cities.json').read_text())['items']
# Registrul cartografiat cuprinde municipiile și orașele, plus satele pe care SIRUTA
# le poartă în mediul urban (componente ale unităților urbane) — restul satelor
# rămân onest fără punct geografic, nu se inventează nicio coordonată.
# Județul rândului: cel cartografiat de OSM, altfel rezolvat din SIRUTA — doar
# la un nume unic; un nume ambiguu nu moștenește județul omonimului urban.
best={};priority={'city':0,'town':1,'village':2,'hamlet':3}
for city in cities:
 folded=fold(city['name'])
 core=city.get('type') in ['city','town']
 if city.get('type') not in ['city','town','village','hamlet']:continue
 county=city.get('county') or known.get(folded) or ''
 key=(folded,county_key(county))
 if not core and key not in urban_pairs:continue
 held=best.get(key)
 if held and priority[held[1]['type']]<=priority[city['type']]:continue
 best[key]=(county,city)
urban=[{k:city[k] for k in ['name','lat','lon']}|{'county':county,'type':city['type']} for county,city in best.values()]
(out/'geographic-localities.json').write_text(json.dumps({**proof,'items':urban},ensure_ascii=False,separators=(',',':'))+'\n')
network=json.loads((root/'public/transit/network.json').read_text());manifest=json.loads((root/'public/transit/manifest.json').read_text())
points=[(float(x['stop_lat']),float(x['stop_lon'])) for x in network['stops']]
coverage={'source':manifest['source'],'sourceUrl':manifest['sourceUrl'],'networkSha256':manifest['network']['sha256'],'bounds':{'south':min(x[0] for x in points),'north':max(x[0] for x in points),'west':min(x[1] for x in points),'east':max(x[1] for x in points)}}
(root/'public/transit/coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'localityCountyKeys':len(known),'urbanLocalities':len(urban),'transitCoverage':coverage['bounds']}))

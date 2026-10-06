"""Import a complete, real CKAN metadata snapshot; never substitute metadata for file contents."""
import sys,json,zipfile,hashlib,re,unicodedata,collections
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=Path(sys.argv[1]); out=root/'public/catalog'; docs=out/'datasets'; docs.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(source) as z:
 raw=z.read('catalog.json'); snapshot=json.loads(raw); registry=json.loads(z.read('sources.json'))
 for name,checksum in [(line.split('  ',1)[1],line.split('  ',1)[0]) for line in z.read('SHA256SUMS.txt').decode().splitlines() if '  ' in line]:
  assert hashlib.sha256(z.read(name)).hexdigest()==checksum, 'Attachment integrity mismatch: '+name
datasets=snapshot['datasets']; ids=[d['id'] for d in datasets]
# Pass 1: declared counts and dataset identity.
assert len(datasets)==snapshot['unique_datasets']==snapshot['total_reported']
assert len(set(ids))==len(ids), 'Duplicate dataset identifiers'
norm=lambda s:unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
spec=(root/'lib/live/catalog-categories.ts').read_text()
categories=[(i,q) for i,q in re.findall(r"id:'([^']+)'.*?query:'([^']+)'",spec)]
index=[]; formats=collections.Counter(); orgs={}; resource_ids=[]; missing=[]; field_names=set()
# Pass 2: every resource and every metadata field, without slicing rows/fields.
for d in datasets:
 resources=d.get('resources',[]); org=d.get('organization') or {}; org={'title':org,'name':d.get('organization_slug') or org} if isinstance(org,str) else org; orgs[org.get('id',org.get('name','unknown'))]=org.get('title',org.get('name','Editor neprecizat'))
 text=norm(' '.join([str(d.get(k,'')) for k in ['title','notes','name']])+str(org)+str(d.get('tags',[])))
 matched=[i for i,q in categories if any(norm(term.rstrip('*')) in text for term in q.split(' OR '))]
 resource_formats=sorted(set(str(r.get('format') or 'Nespecificat').upper() for r in resources))
 for r in resources:
  resource_ids.append(r.get('id')); formats[str(r.get('format') or 'Nespecificat').upper()]+=1
  if not r.get('id') or not r.get('url'): missing.append({'dataset':d['id'],'resource':r.get('id'),'missingId':not bool(r.get('id')),'missingUrl':not bool(r.get('url'))})
 field_names.update(d)
 (docs/(d['id']+'.json')).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
 index.append({'id':d['id'],'name':d.get('name'),'title':d.get('title') or d.get('name'),'notes':d.get('notes') or '', 'organization':org.get('title') or org.get('name') or 'Editor neprecizat','modified':d.get('metadata_modified'),'license':d.get('license_title') or 'Licență neprecizată','resourceCount':len(resources),'formats':resource_formats,'categories':matched,'inventoryOnly':True})
assert len(resource_ids)==snapshot['resource_count'], 'Resource count mismatch'
assert len(orgs)==snapshot['organization_count'], 'Publisher count mismatch'
(out/'index.json').write_text(json.dumps({'fetchedAt':snapshot['fetched_at'],'sourceUrl':snapshot['catalog'],'items':index},ensure_ascii=False,separators=(',',':')))
(out/'sources.json').write_text(json.dumps(registry,ensure_ascii=False,separators=(',',':')))
# Pass 3: read back every written dataset, verify all resource references and checksums.
roundtrip=[]; checksums={}
for d in datasets:
 path=docs/(d['id']+'.json'); data=path.read_bytes(); copy=json.loads(data)
 assert copy==d, 'Metadata round-trip failed'
 roundtrip.extend(r.get('id') for r in copy.get('resources',[])); checksums[d['id']]=hashlib.sha256(data).hexdigest()
assert roundtrip==resource_ids
audit={'fetchedAt':snapshot['fetched_at'],'sourceUrl':snapshot['catalog'],'snapshotSha256':hashlib.sha256(raw).hexdigest(),'passes':['Declared counts and stable identifiers','All resource descriptors and metadata fields','Round-trip of every published dataset with SHA-256'],'datasets':len(index),'resourceReferences':len(resource_ids),'uniqueResourceIds':len(set(resource_ids)),'publishers':len(orgs),'formats':dict(formats),'metadataFields':sorted(field_names),'missingResourceIdentifiersOrUrls':missing,'fileContentsVerified':False,'note':'Verificare integrală a metadatelor inventarului. Conținutul fiecărui fișier este verificat separat la import; inventarul nu certifică funcționarea tuturor adreselor.','datasetChecksums':checksums}
(out/'audit.json').write_text(json.dumps(audit,ensure_ascii=False,separators=(',',':')))
print(json.dumps({k:audit[k] for k in ['datasets','resourceReferences','uniqueResourceIds','publishers']})+' · 3 passes; original metadata retained')

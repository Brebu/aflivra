"""Verify every generated download, its checksum and its permanent link."""
import csv
import hashlib
import json
import zipfile
import re
from html.parser import HTMLParser
from pathlib import Path

out=Path(__file__).resolve().parent.parent/'public/downloads'
manifest=json.loads((out/'source-packages.json').read_text())
packages=manifest['packages']
revision=int(re.search(r'^## Revizia (\d+)',(out.parent.parent/'README.md').read_text(),re.M)[1])
assert packages and manifest['revision']==revision
paths=[]
for package in packages:
    file=out/package['file']
    assert file.stat().st_size==package['bytes']<20_000_000
    assert hashlib.sha256(file.read_bytes()).hexdigest()==package['sha256']
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==package['files']
        paths.extend(archive.namelist())
assert len(paths)==len(set(paths))==manifest['files']+1
assert 'lib/live/source-html.ts' in paths
assert 'scripts/render-download-index.py' in paths
for document in manifest['documents']:
    data=(out/document['file']).read_bytes()
    assert len(data)==document['bytes']
    assert hashlib.sha256(data).hexdigest()==document['sha256']
    assert data.startswith(b'%PDF-')
class Links(HTMLParser):
    def __init__(self):super().__init__();self.downloads=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='a' and 'download' in attrs:self.downloads.append(attrs['href'])
links=Links();links.feed((out/'index.html').read_text())
assert set(links.downloads)=={item['file'] for item in packages+manifest['documents']}|{'Aflivra_Pachete.csv'}
assert 'Ghidul versiunii 30 (PDF)' in (out/'index.html').read_text()
with (out/'Aflivra_Pachete.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
assert len(rows)==len(packages)+len(manifest['documents'])
assert [row['sha256'] for row in rows]==[item['sha256'] for item in packages+manifest['documents']]
print(json.dumps({'status':'passed','revision':manifest['revision'],'archives':len(packages),'documents':len(manifest['documents']),'crc':'all ZIP entries verified','links':'all downloadable files linked','sourceFiles':manifest['files']}))

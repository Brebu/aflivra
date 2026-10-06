"""Lossless packaging for complete current and historical law texts."""
import gzip, hashlib, json
from pathlib import Path

root=Path(__file__).resolve().parent.parent
out=root/'public/legal-snapshots'
changes={}
for file in out.glob('*.txt'):
    raw=file.read_bytes();data=gzip.compress(raw,compresslevel=9,mtime=0)
    assert gzip.decompress(data)==raw
    target=file.with_suffix('.txt.gz');target.write_bytes(data)
    changes['/legal-snapshots/'+file.name]={'file':'/legal-snapshots/'+target.name,'fileBytes':len(data),'fileSha256':hashlib.sha256(data).hexdigest()}
for file in out.glob('*.json'):
    manifest=json.loads(file.read_text());changed=False
    for item in manifest.get('items',[]):
        if item.get('file') in changes:
            copy=changes[item['file']]
            raw=gzip.decompress((root/'public'/copy['file'].lstrip('/')).read_bytes())
            assert hashlib.sha256(raw).hexdigest()==item['sha256']
            assert len(raw.decode('utf-8'))==item['characters']
            item.update(copy);changed=True
    if changed:file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
for old in changes:(root/'public'/old.lstrip('/')).unlink()
print(json.dumps({'losslessLawFiles':len(changes)}))

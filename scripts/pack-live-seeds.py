"""Pack immutable startup snapshots without losing source bytes or timestamps."""
from pathlib import Path
import base64, gzip, hashlib, json

root = Path(__file__).resolve().parent.parent / 'lib/live'
result = {'schema': 'aflivra-live-seeds-gzip-v1'}
for key, filename in [('server', 'server-seed.json'), ('catalog', 'catalog-seed.json')]:
    raw = (root / filename).read_bytes()
    encoded = gzip.compress(raw, compresslevel=9, mtime=0)
    assert gzip.decompress(encoded) == raw
    result[key] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                   'gzipBase64': base64.b64encode(encoded).decode('ascii')}
(root / 'seed-snapshots.json').write_text(json.dumps(result, separators=(',', ':')) + '\n')
print(json.dumps({'seedSourceBytes': sum(result[k]['bytes'] for k in ('server', 'catalog')),
                  'seedStoredBytes': (root / 'seed-snapshots.json').stat().st_size}), flush=True)

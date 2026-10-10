"""Staged EIDA data migration. Default: dry run. Uses only Python standard library."""
import argparse
import gzip
import hashlib
import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
def sha(data): return hashlib.sha256(data).hexdigest()
def atomic_replace(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(data)
        temporary.flush()
        os.fsync(temporary.fileno())
        temp_path = Path(temporary.name)
    os.replace(temp_path, path)

def main():
    parser = argparse.ArgumentParser(description='EIDA: verifică migrarea offline și, numai cu --write, scrie corpusul candidat și dovada lui.')
    parser.add_argument('repo', type=Path, help='Directorul repository-ului Aflivra')
    parser.add_argument('--write', action='store_true', help='Scrie două fișiere locale; nu face commit, push sau deploy')
    args = parser.parse_args()
    repo = args.repo.resolve()
    asset_path = repo/'public/eida/seismic.json.gz'
    registry_path = repo/'public/data/snapshot-transport.json'
    if not asset_path.is_file() or not registry_path.is_file(): raise ValueError('Lipsesc fișierele așteptate din repository.')
    baseline = (ROOT/'baseline/eida-seismic.json.gz').read_bytes()
    candidate_stored = (ROOT/'candidates/eida-seismic-v2.json.gz').read_bytes()
    candidate_json = gzip.decompress(candidate_stored)
    proof = json.loads((ROOT/'candidates/eida-proof-candidate.json').read_text())
    candidate = json.loads(candidate_json)
    if proof['bytes']!=len(candidate_json) or proof['sha256']!=sha(candidate_json) or proof['storedBytes']!=len(candidate_stored) or proof['storedSha256']!=sha(candidate_stored): raise ValueError('Dovada candidatului nu corespunde octeților.')
    if candidate['schema']!='aflivra-eida-v2' or len(candidate['events'])!=1157 or len(candidate['stations'])!=150: raise ValueError('Schema sau numerele candidatului nu corespund lotului verificat.')
    registry = json.loads(registry_path.read_text())
    matches = [i for i,item in enumerate(registry['items']) if item['path']==proof['path']]
    if len(matches)!=1: raise ValueError('Dovada EIDA trebuie să apară exact o dată în manifest.')
    existing = asset_path.read_bytes()
    if sha(existing)==proof['storedSha256']:
        if registry['items'][matches[0]]!=proof: raise ValueError('Corpusul este v2, dar manifestul nu are aceeași dovadă. Repară perechea înainte de a continua.')
        print(json.dumps({'status':'already_applied','modified':False}));return
    if sha(existing)!=sha(baseline): raise ValueError('Corpusul local diferă de baseline-ul verificat. Nu se aplică o migrare peste date necunoscute.')
    old_proof=registry['items'][matches[0]]
    if old_proof['sha256']!=sha(gzip.decompress(baseline)) or old_proof['bytes']!=len(gzip.decompress(baseline)): raise ValueError('Manifestul local nu corespunde baseline-ului.')
    registry['items'][matches[0]]=proof
    registry['originalBytes']=sum(item['bytes'] for item in registry['items'])
    updated_registry=(json.dumps(registry,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    changes=['public/eida/seismic.json.gz','public/data/snapshot-transport.json']
    if args.write:
        # Each file is replaced safely. The pair belongs in the SAME Git commit;
        # do not deploy between the two local replacements.
        atomic_replace(asset_path,candidate_stored)
        atomic_replace(registry_path,updated_registry)
    print(json.dumps({'status':'written' if args.write else 'dry_run','events':1157,'stationPeriods':150,'changes':changes,'modified':args.write},ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,json.JSONDecodeError) as error:
        raise SystemExit('Migrare oprită: '+str(error))

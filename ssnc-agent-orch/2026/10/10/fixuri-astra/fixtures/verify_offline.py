"""Verify delivered source bytes, complete SITUR/EIDA fixtures and LMI sample offline."""
import collections
import gzip
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent
def read_json(path): return json.loads(path.read_text())
def sha(data): return hashlib.sha256(data).hexdigest()
def require(condition,message):
    if not condition: raise ValueError(message)

def main():
    manifest=read_json(ROOT/'manifest.json')
    for entry in manifest['files']:
        path=(ROOT/entry['path']).resolve()
        require(path.is_relative_to(ROOT),'Cale în afara pachetului')
        data=path.read_bytes()
        require(len(data)==entry['bytes'] and sha(data)==entry['sha256'],'Fișier modificat sau incomplet: '+entry['path'])
    probes=read_json(ROOT/'source-probes.json')
    for probe in probes:
        data=(ROOT/probe['file']).read_bytes()
        require(probe['completeDownload'],'Descărcare incompletă: '+probe['file'])
        require(sha(data)==probe['sha256'],'Sursa nu are amprenta din verificare: '+probe['file'])
    for kind,expected in [('cazare',32058),('alimentatie',9063),('agentii',3104)]:
        source=read_json(ROOT/f'validated/situr-{kind}.json')
        baseline=json.loads(gzip.decompress((ROOT/f'baseline/situr-{kind}.json.gz').read_bytes()))
        require(len(source['rows'])==expected,'Număr SITUR greșit: '+kind)
        require(source['columns']==baseline['columns'],'Coloane SITUR diferite')
        count=lambda rows:collections.Counter(json.dumps(row,ensure_ascii=False) for row in rows)
        require(count(source['rows'])==count(baseline['rows']),'Diferență semantică SITUR: '+kind)
        with zipfile.ZipFile(ROOT/f'sources/situr-{kind}.xlsx') as workbook:
            require(workbook.testzip() is None,'XLSX cu CRC invalid: '+kind)
        print(f'SITUR {kind}: {expected} rânduri, toate coloanele și duplicatele păstrate.')
    alimentatie=read_json(ROOT/'validated/situr-alimentatie.json')
    county_index=alimentatie['columns'].index('Județ')
    require(sum(row[county_index]=='MUNICIPIUL BUCUREŞTI' for row in alimentatie['rows'])==387,'București: număr neașteptat')
    candidate_bytes=gzip.decompress((ROOT/'candidates/eida-seismic-v2.json.gz').read_bytes())
    candidate=json.loads(candidate_bytes)
    require(candidate_bytes==(ROOT/'candidates/eida-seismic-v2.json').read_bytes(),'JSON/gzip EIDA diferite')
    source_rows=[]
    columns=['eventIdentifier','time','latitude','longitude','depthKm','author','catalog','contributor','contributorIdentifier','magnitudeType','magnitude','magnitudeAuthor','eventLocationName','eventType']
    for year in range(2015,2027):
        for line in (ROOT/f'sources/eida-events-{year}.txt').read_text().splitlines():
            if not line.strip() or line.startswith('#'): continue
            fields=[field.strip() for field in line.split('|')]
            require(len(fields)==len(columns),'Lățime FDSN neașteptată')
            row=dict(zip(columns,fields))
            if row['time'].startswith(str(year)+'-'):source_rows.append(row)
    require(len(source_rows)==1157 and candidate['events']==source_rows,'Candidatul nu corespunde tuturor rândurilor FDSN')
    station_columns=['network','station','latitude','longitude','elevation','siteName','startTime','endTime']
    stations=[dict(zip(station_columns,[field.strip() for field in line.split('|')])) for line in (ROOT/'sources/eida-stations.txt').read_text().splitlines() if line.strip() and not line.startswith('#')]
    require(len(stations)==150 and candidate['stations']==stations,'Stații EIDA diferite')
    require(all(row['eventType']=='earthquake' for row in candidate['events']),'Câmp EIDA deplasat')
    require(candidate['coverageByYear'][-1]['status']=='inconclusive_204','Anul 2026 nu păstrează limita verificării')
    proof=read_json(ROOT/'candidates/eida-proof-candidate.json')
    require(proof['sha256']==sha(candidate_bytes) and proof['bytes']==len(candidate_bytes),'SHA/bytes EIDA invalid')
    print('EIDA: 1.157 evenimente verificate câmp cu câmp; 150 înregistrări de stații/perioade. 2026: HTTP 204 inconcludent.')
    lmi=read_json(ROOT/'validated/lmi-verification.json')
    require(len(lmi['goldens'])==12 and lmi['goldenRowsDifferentFromBaseline']==10,'Eșantion LMI neașteptat')
    require(sha((ROOT/'sources/lmi-bucuresti-2015.pdf').read_bytes())==lmi['officialPdfSha256'],'PDF LMI diferit')
    print('LMI: PDF complet și 12 rânduri de referință inspectate vizual, 10 diferite de baseline. Nu validează semantic toate cele 2.651 de rânduri.')
    print(json.dumps({'status':'passed','verifiedFiles':len(manifest['files']),'networkRequired':False},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError,json.JSONDecodeError,zipfile.BadZipFile) as error:
        print('Verificare eșuată: '+str(error),file=sys.stderr)
        sys.exit(1)

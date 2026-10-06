"""Package all code and published assets, keeping every downloadable file below 20 MB."""
from pathlib import Path
import hashlib,json,zipfile,subprocess,sys,re
root=Path(__file__).resolve().parent.parent;out=root/'public/downloads';out.mkdir(exist_ok=True)
subprocess.run(['python3', str(root / 'scripts/build-geography.py')], check=True)
subprocess.run([sys.executable,str(root/'scripts/compress-legal-snapshots.py')],check=True)
subprocess.run([sys.executable,str(root/'scripts/compress-snapshots.py')],check=True)
subprocess.run([sys.executable,str(root/'scripts/pack-live-seeds.py')],check=True)
for p in out.glob('Aflivra_Date_*.zip'):p.unlink()
files=[]
for folder in ['app','components','lib','db','drizzle','build','scripts','public','vendor']:
 files.extend(p for p in (root/folder).rglob('*') if p.is_file() and ('/downloads/' not in str(p) or p.suffix=='.pdf') and p.suffix!='.tsbuildinfo' and not any(x.startswith('.') for x in p.relative_to(root).parts))
files.extend(root/x for x in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','README.md','tsconfig.json','vite.config.ts','drizzle.config.ts','cloudflare-env.d.ts','.openai/hosting.json'] if (root/x).exists())
large={'places','transit','catalog','stories','media'};code=[];assets=[]
for f in sorted(set(files)):
 parts=f.relative_to(root).parts
 (assets if parts[0]=='public' and len(parts)>1 and parts[1] in large else code).append(f)
packages=[];file_count=0
main=out/'Aflivra_Cod.zip'
with zipfile.ZipFile(main,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in code:z.write(f,f.relative_to(root));file_count+=1
 z.writestr('CITESTE_ARHIVELE.txt','Dezarhivați Aflivra_Cod.zip și toate volumele Aflivra_Date_*.zip în același director. Volumele includ toate fișierele publicate, datele și media. Fișierele JSON.gz păstrează exact octeții JSON originali după decomprimare gzip; aplicația le citește automat. Lista completă cu SHA-256 este în source-packages.json. În arhive nu sunt conturi sau credențiale.\n')
assert main.stat().st_size<20_000_000
packages.append({'file':main.name,'kind':'code','label':'Codul aplicației și instrucțiuni','bytes':main.stat().st_size,'sha256':hashlib.sha256(main.read_bytes()).hexdigest(),'files':len(code)+1})
# Append complete compressed entries, never split a source file into an unreadable volume.
part=1;z=None;paths=[]
def close():
 global z,paths
 if z is None:return
 name=z.filename;z.close();p=Path(name);assert p.stat().st_size<20_000_000
 packages.append({'file':p.name,'kind':'data','label':'Date și imagini · volumul '+str(len(packages)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'files':len(paths),'paths':paths});z=None;paths=[]
for f in assets:
 import zlib
 raw=f.read_bytes();estimated=len(zlib.compress(raw,6))+len(str(f.relative_to(root)))*2+160
 if z is not None and z.fp.tell()+estimated>18_000_000:close();part+=1
 if z is None:z=zipfile.ZipFile(out/('Aflivra_Date_'+str(part).zfill(2)+'.zip'),'w',zipfile.ZIP_DEFLATED,compresslevel=6)
 z.write(f,f.relative_to(root));paths.append(str(f.relative_to(root)));file_count+=1
close();manifest={'schema':'aflivra-source-packages-v1','files':file_count,'packages':packages,'instructions':'Dezarhivați codul și toate volumele de date în același director. Sunt incluse toate fișierele aplicației și toate datele publicate, cu structura originală.'}
manifest['revision']=int(re.search(r'^## Revizia (\d+)',(root/'README.md').read_text(),re.M)[1])
manifest['documents']=[{'file':p.name,'kind':'document','label':'Ghidul versiunii '+re.search(r'_v(\d+)_',p.name)[1]+' (PDF)','bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.glob('Aflivra_v*_Documentatie.pdf'))]
(out/'source-packages.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
subprocess.run([sys.executable,str(root/'scripts/render-download-index.py')],check=True)
print(json.dumps({'packages':len(packages),'sourceFiles':file_count,'bytes':sum(p['bytes'] for p in packages)},ensure_ascii=False),flush=True)

"""Render permanent download links from the verified package manifest."""
import csv
import html
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / 'public/downloads'
manifest = json.loads((out / 'source-packages.json').read_text())
revision = manifest['revision']

def card(item):
    name = html.escape(item['file'], quote=True)
    label = html.escape(item['label'])
    size = f"{item['bytes'] / 1_000_000:.2f} MB".replace('.', ',')
    details = f" · {item['files']} fișiere" if 'files' in item else ''
    return f'''<li><div><h3>{label}</h3><p>{size}{details}</p></div><a href="{name}" download="{name}">Descarcă {'PDF' if name.endswith('.pdf') else 'ZIP'}</a></li>'''

packages = '\n'.join(card(p) for p in manifest['packages'])
documents = '\n'.join(card(p) for p in manifest['documents'])
page = f'''<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aflivra · cod și documentație · revizia {revision}</title>
<style>
@font-face{{font-family:Inter;src:url('/fonts/Inter-Regular.ttf') format('truetype');font-display:swap}}*{{box-sizing:border-box}}body{{margin:0;background:#f4f6fa;color:#172338;font:1rem/1.7 Inter,system-ui,sans-serif}}header,main{{width:min(100% - 32px,960px);margin:auto}}header{{padding:24px 0;border-bottom:1px solid #dbe2ee;display:flex;align-items:center;justify-content:space-between;gap:20px}}a{{color:#0066cc;text-underline-offset:4px}}a:focus-visible{{outline:3px solid #0066cc;outline-offset:4px}}header>a:first-child{{font-size:1.5rem;font-weight:700;text-decoration:none;color:#172338}}main{{padding:32px 0 56px}}h1{{font-size:clamp(1.7rem,5vw,2.5rem);line-height:1.25;margin:0 0 20px}}h2{{font-size:1.375rem;line-height:1.4;margin:32px 0 16px}}h3{{font-size:1rem;line-height:1.5;margin:0}}p{{margin:8px 0 16px}}ul{{list-style:none;padding:0;margin:0;display:grid;gap:12px}}li{{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;padding:20px;background:white;border:1px solid #d9e2ee;border-radius:16px}}li p{{margin:6px 0 0;color:#526077;font-size:.9375rem}}li a{{padding:10px 18px;border:1px solid #c4d7f2;border-radius:12px;background:#eff5ff;text-decoration:none;min-height:44px;line-height:1.5;white-space:normal;font-weight:600;text-align:center}}li>div{{min-width:0;overflow-wrap:break-word}}.note{{padding:18px;background:#eaf1fc;border-radius:14px}}@media(max-width:480px){{li{{grid-template-columns:1fr;gap:14px}}li a{{width:100%}}header{{flex-wrap:wrap}}}}
</style></head><body><header><a href="/">aflivra.</a><a href="/#view=dashboard">Înapoi la aplicație</a></header><main>
<h1>Cod și documentație</h1><p>Codul aplicației: <strong>revizia {revision}</strong>. Arhivele sunt împărțite în volume sub 20 MB și se descarcă separat.</p>
<p class="note">Dezarhivează <strong>Aflivra_Cod.zip</strong> și <strong>toate cele {len(manifest['packages'])-1} volume de date</strong> în același director. Istoricul modificărilor și instrucțiunile de rulare sunt în README.md din arhiva de cod.</p>
<h2>Codul și toate datele publicate</h2><ul>{packages}</ul>
<h2>Documentație PDF</h2><p>Ghidul versiunii {revision} descrie această revizie. Ghidurile anterioare păstrează numărul versiunii lor. Istoricul complet al modificărilor este în README.md din cod.</p><ul>{documents}</ul>
<h2>Inventarul descărcărilor</h2><p><a href="Aflivra_Pachete.csv" download="Aflivra_Pachete.csv">Descarcă inventarul CSV cu dimensiuni și SHA-256</a></p>
</main></body></html>'''
(out / 'index.html').write_text(page, encoding='utf-8')
with (out / 'Aflivra_Pachete.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['revizie', 'tip', 'fisier', 'descriere', 'octeti', 'sha256'])
    for item in [*manifest['packages'], *manifest['documents']]:
        writer.writerow([revision, item['kind'], item['file'], item['label'], item['bytes'], item['sha256']])

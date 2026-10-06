"""Extend the photographed explorer from exact national OSM records and Commons.

Downloads at most three assets concurrently, keeps attribution, validates decoding,
and never manufactures photos or opening hours. Run with the project's Python
runtime (Pillow required). Existing valid photo exports are reused.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime, gzip, hashlib, html, io, json, math, re, time
import urllib.error, urllib.parse, urllib.request
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "public/places"
MEDIA = ROOT / "public/media"
CACHE = ROOT / ".sites-runtime/exploration-import"
CACHE.mkdir(parents=True, exist_ok=True)

def read(path):
    path = Path(path)
    return json.loads(path.read_bytes() if path.exists() else gzip.decompress(Path(str(path)+".gz").read_bytes()))

def text(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", str(value or "")))).strip()

def get(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Aflivra/1.0 public-image-attribution (Romania explorer)"})
            with urllib.request.urlopen(request, timeout=25) as response:
                data = response.read(24_000_001)
                if len(data)>24_000_000: raise ValueError("Asset too large")
                return data
        except urllib.error.HTTPError as error:
            if attempt == 2 or not 500 <= error.code <= 599: raise
            time.sleep(1 + attempt)

def file_title(row, tags):
    name = tags.get("wikimedia_commons", "")
    if name.startswith("File:"): return name
    url = urllib.parse.urlparse(row.get("image", ""))
    if url.hostname == "upload.wikimedia.org":
        return "File:" + urllib.parse.unquote(url.path.split("/")[-1])
    if url.hostname == "commons.wikimedia.org":
        for prefix in ("/wiki/Special:FilePath/", "/wiki/File:"):
            if url.path.startswith(prefix):
                return "File:" + urllib.parse.unquote(url.path[len(prefix):])
    return None

manifest = read(BASE / "manifest.json")
rows = [row for part in manifest["indices"]["cultura"]["name"] for row in read(BASE / part["file"])["items"]]
records = {row["id"]: row for chunk in {row["chunk"] for row in rows} for row in read(BASE / ("records/"+chunk+".json"))["items"]}
# Border-extract spillovers, unnamed destination, and a photographed lake whose
# photo and mapped position refer to different regions are excluded from this
# photographed selection. The full original national inventory stays intact.
excluded = {"n1918839400", "w401658826", "w1301174068", "n3465156723", "w213092650"}
selected = [(row, records[row["id"]]["tags"], file_title(row, records[row["id"]]["tags"])) for row in rows
            if row["id"] not in excluded and any(t["label"] in ("Muzee", "Locuri de vizitat", "Puncte panoramice") for t in row["types"])]
selected = [(row,tags,title) for row,tags,title in selected if title]
titles = sorted(set(title for row,tags,title in selected))
query = {"action":"query","format":"json","formatversion":"2","prop":"imageinfo",
         "iiprop":"url|size|extmetadata","iiurlwidth":"1440","titles":"|".join(titles)}
metadata_path = CACHE / "commons-imageinfo.json"
if metadata_path.exists(): metadata = read(metadata_path)
else:
    metadata = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(query)))
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False))
normal = lambda s: s.replace("_", " ")
pages = {normal(p["title"]):p for p in metadata["query"]["pages"]}
cities = read(BASE / "cities.json")["items"]

def km(a, b):
    rad = math.pi/180
    dlat=(b["lat"]-a["lat"])*rad;dlon=(b["lon"]-a["lon"])*rad
    x=math.sin(dlat/2)**2+math.cos(a["lat"]*rad)*math.cos(b["lat"]*rad)*math.sin(dlon/2)**2
    return 6371*2*math.atan2(math.sqrt(x), math.sqrt(max(0,1-x)))

def export(candidate):
    row,tags,title = candidate
    page = pages.get(normal(title), {})
    if not page.get("imageinfo"): raise ValueError("Commons file unavailable: "+title)
    info = page["imageinfo"][0];meta = info.get("extmetadata", {})
    field = lambda name: text(meta.get(name, {}).get("value", ""))
    license = field("LicenseShortName");license_url = field("LicenseUrl")
    if not re.search(r"CC (?:BY|0)|public domain|^PD|PDM", license, re.I):
        raise ValueError("Reusable license not confirmed: "+title+" / "+license)
    author = field("Artist")
    if not author: raise ValueError("Author not supplied: "+title)
    download = info.get("thumburl") or info["url"]
    image_id = "explore-"+row["id"];target=MEDIA/(image_id+".webp")
    if not target.exists():
        raw = get(download)
        image = Image.open(io.BytesIO(raw));image.load()
        if image.width<160 or image.height<120: raise ValueError("Image too small: "+title)
        image.thumbnail((1024,1024), Image.Resampling.LANCZOS)
        image.convert("RGB").save(target,"WEBP",quality=80,method=6)
    with Image.open(target) as image: width,height=image.size
    nearest = min(cities, key=lambda c:km(row,c))
    city = row["city"] or "Zona "+nearest["name"]
    region = tags.get("addr:county") or tags.get("is_in:county") or "România"
    kind = " · ".join(dict.fromkeys(t["label"] for t in row["types"] if t["category"]=="cultura"))
    nature = any(word in row["name"].lower() for word in ("cascad","cheil","lac","tâmpa","tunele"))
    website = row["website"] if row["website"].startswith("https://") else row["sourceUrl"]
    place = {"id":"osm-"+row["id"],"name":row["name"],"kind":kind,"city":city,"region":region,
             "tag":row["name"],"lat":row["lat"],"lon":row["lon"],"images":[image_id],
             "summary":kind+" · "+city,
             "description":((row["address"]+". ") if row["address"] else "")+
                "Poziția și informațiile acestui loc provin din fișa OpenStreetMap. Fotografia reală, autorul și licența sunt disponibile în galerie; programul și condițiile actuale se confirmă la administrator.",
             "website":website,"features":[kind,"Fotografie reală"],"interests":["cultura","natura","mediu"] if nature else ["cultura","local"],
             "sourceUrl":row["sourceUrl"],"recordId":row["id"],"recordChunk":row["chunk"],
             "cityApproximate":not bool(row["city"])}
    asset={"app_id":image_id,"app_file":"/media/"+target.name,"subject":row["name"],"caption_ro":row["name"],
           "original_title":page["title"],"source_page_url":info["descriptionurl"],
           "original_image_url":info["url"],"downloaded_image_url":download,
           "author":author,"license":license,"license_url":license_url or info["descriptionurl"],
           "attribution":title+" — "+author+" / Wikimedia Commons / "+license,
           "width":width,"height":height,"bytes":target.stat().st_size,
           "sha256":hashlib.sha256(target.read_bytes()).hexdigest(),
           "retrieval_date":datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
           "changes":"Downscaled to at most 1024 px, optimized WebP quality 80. CSS crops thumbnails; original license applies.",
           "source_record":row["sourceUrl"],"commons_page_id":page["pageid"]}
    return place,asset

places=[];assets=[];failures=[]
with ThreadPoolExecutor(max_workers=3) as pool:
    for future in as_completed({pool.submit(export,c):c[0]["id"] for c in selected}):
        try:
            place,asset=future.result();places.append(place);assets.append(asset)
            print(json.dumps({"saved":place["name"],"bytes":asset["bytes"]},ensure_ascii=False),flush=True)
        except Exception as error:
            failures.append(str(error));print(json.dumps({"excluded":str(error)},ensure_ascii=False),flush=True)
places.sort(key=lambda p:p["name"].casefold());assets.sort(key=lambda a:a["app_id"])
if len(places)<20: raise RuntimeError("Too few confirmed photographed places: "+str(len(places)))
(BASE/"exploration.json").write_text(json.dumps(places,ensure_ascii=False,indent=2)+"\n")
photographs=read(MEDIA/"manifest.json")
photographs["assets"]=[a for a in photographs["assets"] if not a["app_id"].startswith("explore-")]+assets
(MEDIA/"manifest.json").write_text(json.dumps(photographs,ensure_ascii=False,indent=2)+"\n")
(BASE/"exploration-import.json").write_text(json.dumps({"source":manifest["sourceUrl"],
    "dataAsOf":manifest["dataAsOf"],"fetchedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "places":len(places),"photos":len(assets),"maxParallelRequests":3,"failures":failures,
    "note":"A photographed selection of exact source records, not a replacement for the complete inventory."},ensure_ascii=False,indent=2)+"\n")
print(json.dumps({"places":len(places),"photos":len(assets),"failures":len(failures)},ensure_ascii=False),flush=True)

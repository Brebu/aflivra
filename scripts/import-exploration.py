"""Extend the photographed explorer from exact national OSM records and Commons.

Wave 1a (media scale): every Commons-linked record in every category index —
direct File: tags, upload.wikimedia.org image URLs and Commons Category: tags —
plus the Wiki Loves Monuments 2011 monuments mapped onto the same corpus from
our own CKAN catalog snapshot. Each anchored place receives a curated gallery
of up to three attested local photos (quality gate 800 px, CC/PD license with
machine-readable extmetadata attribution) and at most one licensed webm clip
(this wave's small video tier). Downloads stay at most three concurrent
requests, API queries are paced, and no photo or clip is ever manufactured.
"""

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse, collections, datetime, gzip, hashlib, html, io, json, math, re, threading, time
import urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ElementTree
from PIL import Image
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "public/places"
MEDIA = ROOT / "public/media"
CACHE = ROOT / ".sites-runtime/exploration-import"
CACHE.mkdir(parents=True, exist_ok=True)
CARARE = "{http://www.carare.eu/carareSchema}"

WLM_XML_URL = "https://data.gov.ro/storage/f/2013-11-12T19%3A03%3A59.028Z/inp-wikilovesmonuments-2011.xml"
WLM_DATASET_URL = "https://data.gov.ro/dataset/wiki-loves-monuments-ro-2011"
WLM_DATASET_LICENSE = "OGL-ROU (data.gov.ro, uk-ogl)"
MAX_PHOTOS_PER_PLACE = 3
MAX_VIDEO_FILES = 100
VIDEO_PREFERRED_BYTES = 15 * 1024 * 1024
VIDEO_HARD_BYTES = 25 * 1024 * 1024
VIDEO_TOTAL_BYTES = 150 * 1024 * 1024
PHOTO_MIN_WIDTH = 800

parser = argparse.ArgumentParser()
parser.add_argument(
    "--max-places", type=int, default=0, help="internal smoke bound; 0 = full run"
)
args = parser.parse_args()


def read(path):
    path = Path(path)
    return json.loads(
        path.read_bytes()
        if path.exists()
        else gzip.decompress(Path(str(path) + ".gz").read_bytes())
    )


def text(value):
    return re.sub(
        r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", "", str(value or "")))
    ).strip()


pace_lock = threading.Lock()
paced_until = 0.0


def pace(min_interval: float = 0.35) -> None:
    """One outbound request every min_interval across all workers — the
    recorded 429 rejections ask exactly for this discipline."""
    global paced_until
    with pace_lock:
        now = time.monotonic()
        wait = paced_until + min_interval - now
        if wait > 0:
            time.sleep(wait)
        paced_until = time.monotonic()


def get(url: str, limit: int = 0) -> bytes:
    bound = limit or max(24_000_000, VIDEO_PREFERRED_BYTES)
    for attempt in range(5):
        try:
            pace()
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Aflivra/1.0 public-image-attribution (Romania explorer)"
                },
            )
            with urllib.request.urlopen(request, timeout=40) as response:
                payload = response.read(bound + 1)
                data = bytes(payload if payload is not None else b"")
                if len(data) > bound:
                    raise ValueError("Asset too large")
                return data
        except urllib.error.HTTPError as error:
            if attempt == 4:
                raise
            if error.code == 429:
                time.sleep(45 * (attempt + 1))
                continue
            if 500 <= error.code <= 599:
                time.sleep(1 + attempt * 2)
                continue
            raise
    raise ValueError("Download failed after retries: " + url)


def api(**params) -> dict:
    """One paced Commons API call; 429 responses back off instead of failing."""
    params.update({"action": "query", "format": "json", "formatversion": "2"})
    result = {"query": {"pages": []}}
    for attempt in range(5):
        try:
            time.sleep(0.4)
            result = json.loads(
                get(
                    "https://commons.wikimedia.org/w/api.php?"
                    + urllib.parse.urlencode(params)
                )
            )
            break
        except urllib.error.HTTPError as error:
            if attempt == 4 or error.code != 429:
                raise
            time.sleep(30 + 30 * attempt)
        except ValueError:
            return {"query": {"pages": []}}
    return result if isinstance(result, dict) else {"query": {"pages": []}}


def norm(s):
    import unicodedata

    return "".join(
        c
        for c in unicodedata.normalize("NFD", (s or "").lower())
        if not unicodedata.combining(c)
    )


def norm_lmi(s):
    parts = str(s).upper().replace(" ", "").split("-")
    if len(parts) >= 4:
        parts[-1] = parts[-1].lstrip("0") or "0"
        return "-".join(p.lower() for p in parts)
    return str(s).strip().lower()


def norm_title(title):
    return title.replace("_", " ").strip()


def file_title(row, tags):
    name = tags.get("wikimedia_commons", "")
    if name.startswith("File:"):
        return name
    url = urllib.parse.urlparse(row.get("image", ""))
    if url.hostname == "upload.wikimedia.org":
        return "File:" + urllib.parse.unquote(url.path.split("/")[-1])
    if url.hostname == "commons.wikimedia.org":
        for prefix in ("/wiki/Special:FilePath/", "/wiki/File:"):
            if url.path.startswith(prefix):
                return "File:" + urllib.parse.unquote(url.path[len(prefix) :])
    return None


def significant_tokens(name):
    stop = {"romania", "judetul", "orice"}
    return [
        t
        for t in re.findall(r"[a-zăâîșțüö0-9]+", norm(name))
        if len(t) >= 4 and t not in stop
    ]


def title_matches(title, name):
    """Relevance gate for search-sourced files: most significant name tokens
    appear in the file title AND sit close together — scattered hits on
    'Grand ... Arena' would otherwise pass off an Australian basketball final
    as the clip of a Romanian Grand Arena record."""
    tokens = significant_tokens(name)
    if not tokens:
        return False
    words = re.findall(r"[a-zăâîșțüö0-9]+", norm(title))
    first = {}
    for index, word in enumerate(words):
        first.setdefault(word, index)
    hits = [first[t] for t in tokens if t in first]
    needed = len(tokens) if len(tokens) == 1 else max(2, math.ceil(len(tokens) * 2 / 3))
    if len(hits) < needed:
        return False
    if len(tokens) == 1:
        return len(tokens[0]) >= 6
    return max(hits) - min(hits) <= 3


manifest = read(BASE / "manifest.json")

# --- corpus: every category index row plus its full record tags -------------
index_rows = {}
for category, indices in manifest["indices"].items():
    if category == "local-all":
        continue
    for part in indices["name"]:
        for row in read(BASE / part["file"])["items"]:
            index_rows[row["id"]] = row
records = {}
for chunk in set(index_rows[row_id]["chunk"] for row_id in index_rows):
    for record in read(BASE / ("records/" + chunk + ".json"))["items"]:
        records[record["id"]] = record
rows_by_city = collections.defaultdict(list)
for row in index_rows.values():
    rows_by_city[norm(row.get("city") or "")].append(row)
lmi_records = {}
for record_id in sorted(records):
    code = (records[record_id].get("tags") or {}).get("ref:RO:lmi") or (
        records[record_id].get("tags") or {}
    ).get("ref:RO:LMI")
    if code:
        # An OSM node and its way can carry the same LMI code; the lowest id
        # wins so every run anchors the same record (byte-stable manifests).
        lmi_records.setdefault(norm_lmi(code), record_id)

# --- selection 1: every Commons-linked record in every category -------------
# Excluded classes, kept from the original pipeline's honest discipline:
# the five documented records (border-extract spillovers, unnamed destination,
# a photographed lake whose photo and mapped position refer to different
# regions), tourism=information boards (signage, not photographed
# destinations — their guidepost photos belong to the corpus record details,
# not to the place galleries), and border-extract spillovers with foreign-
# script names. The full original national inventory stays intact.
excluded = {"n1918839400", "w401658826", "w1301174068", "n3465156723", "w213092650"}
cyrillic = re.compile(r"[\u0400-\u04FF]")
selected = {}
for record_id, row in index_rows.items():
    if record_id in excluded:
        continue
    tags = records[record_id]["tags"]
    if tags.get("tourism") == "information" or cyrillic.search(row["name"]):
        continue
    direct = file_title(row, tags)
    category_tag = tags.get("wikimedia_commons", "")
    if direct:
        selected[record_id] = {"source": "direct", "title": direct}
    elif category_tag.startswith("Category:"):
        selected[record_id] = {"source": "category", "title": category_tag}

# --- selection 2: WLM 2011 monuments mapped to the corpus (offline) ----------
wlm_path = CACHE / "wlm2011.xml"
if not wlm_path.exists():
    wlm_path.write_bytes(get(WLM_XML_URL, limit=25_000_000))
wlm_monuments = []
for carare in ElementTree.parse(wlm_path).getroot().findall(CARARE + "carare"):
    asset = carare.find(CARARE + "heritageAssetIdentification")
    if asset is None:
        continue
    name = text(
        asset.findtext(
            CARARE + "appellation/" + CARARE + "name", default="", namespaces=None
        )
        or ""
    )
    protection = text(
        asset.findtext(CARARE + "designations/" + CARARE + "protectionType", default="")
        or ""
    )
    match = re.search(r"cod LMI:\s*([^)]+)", protection)
    code = match.group(1).strip() if match else ""
    city = text(
        asset.findtext(
            CARARE
            + "spatial/"
            + CARARE
            + "locationSet/"
            + CARARE
            + "address/"
            + CARARE
            + "townOrCity",
            default="",
        )
        or ""
    )
    county = text(
        asset.findtext(
            CARARE
            + "spatial/"
            + CARARE
            + "locationSet/"
            + CARARE
            + "address/"
            + CARARE
            + "adminArea",
            default="",
        )
        or ""
    )
    photos = []
    for resource in carare.findall(CARARE + "digitalResource"):
        link = resource.findtext(CARARE + "link", default="") or ""
        filename = (
            urllib.parse.unquote(urllib.parse.urlparse(link).path.split("/")[-1])
            if link
            else ""
        )
        if not filename:
            continue
        photos.append(
            {
                "title": "File:" + filename.replace("_", " "),
                "name": text(
                    resource.findtext(
                        CARARE + "appellation/" + CARARE + "name", default=""
                    )
                    or ""
                ),
                "photographer": text(
                    resource.findtext(CARARE + "actors/" + CARARE + "name", default="")
                    or ""
                ),
                "date": text(
                    resource.findtext(
                        CARARE + "temporal/" + CARARE + "displayDate", default=""
                    )
                    or ""
                ),
            }
        )
    if code and photos:
        wlm_monuments.append(
            {
                "name": name,
                "lmi": norm_lmi(code),
                "city": city,
                "county": county,
                "photos": photos,
            }
        )

wlm_by_record = collections.defaultdict(list)
for monument in wlm_monuments:
    record_id = lmi_records.get(monument["lmi"])
    method = "lmi"
    if not record_id:
        candidates = []
        for row in rows_by_city.get(norm(monument["city"]), []):
            row_name = norm(row["name"])
            monument_name = norm(monument["name"])
            if row_name and row_name == monument_name:
                candidates.append((2, row["id"]))
            elif (
                len(row_name) >= 12
                and len(monument_name) >= 12
                and (row_name in monument_name or monument_name in row_name)
            ):
                candidates.append((1, row["id"]))
        strong = [c for c in candidates if c[0] == 2]
        if strong:
            record_id, method = strong[0][1], "name"
        elif len(candidates) == 1 and candidates[0][0] == 1:
            record_id, method = candidates[0][1], "name"
    if record_id and record_id not in excluded:
        row = index_rows.get(record_id)
        if row is None or (
            cyrillic.search(row["name"])
            or records[record_id]["tags"].get("tourism") == "information"
        ):
            continue
        matched = dict(monument)
        matched["method"] = method
        wlm_by_record[record_id].append(matched)
        selected.setdefault(record_id, {"source": "wlm", "title": None})
if args.max_places:
    selected = dict(list(selected.items())[: args.max_places])
    for record_id in list(wlm_by_record):
        if record_id not in selected:
            del wlm_by_record[record_id]
print(
    json.dumps(
        {
            "selectedRecords": len(selected),
            "fromDirectOrCategory": sum(
                1 for s in selected.values() if s["source"] != "wlm"
            ),
            "fromWlmOnly": sum(1 for s in selected.values() if s["source"] == "wlm"),
            "wlmMonuments": len(wlm_monuments),
            "wlmMonumentsMapped": sum(len(v) for v in wlm_by_record.values()),
        },
        ensure_ascii=False,
    ),
    flush=True,
)


# --- selection 3: the before-coverage snapshot (honest reporting) -----------
def coverage_for(attested_ids):
    table = {}
    for category, indices in manifest["indices"].items():
        if category == "local-all":
            continue
        rows = [
            row
            for part in indices["name"]
            for row in read(BASE / part["file"])["items"]
        ]
        table[category] = {
            "rows": len(rows),
            "hotlink": sum(
                1 for row in rows if row.get("image", "").startswith("https:")
            ),
            "attested": sum(1 for row in rows if row["id"] in attested_ids),
        }
    return table


def baseline_attested():
    """The committed selection is the honest 'before': during an uncommitted
    wave it is the pre-wave state; after the commit it is the last shipped one."""
    import subprocess

    try:
        raw = subprocess.run(
            ["git", "show", "HEAD:public/places/exploration.json"],
            capture_output=True,
            cwd=ROOT,
            check=True,
        ).stdout
        return {p["recordId"] for p in json.loads(raw) if p.get("recordId")}
    except Exception:
        return {
            place["recordId"]
            for place in read(BASE / "exploration.json")
            if place.get("recordId")
        }


before_attested = baseline_attested()
coverage_before = coverage_for(before_attested)
cities = read(BASE / "cities.json")["items"]


def km(a, b):
    rad = math.pi / 180
    dlat = (b["lat"] - a["lat"]) * rad
    dlon = (b["lon"] - a["lon"]) * rad
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(a["lat"] * rad) * math.cos(b["lat"] * rad) * math.sin(dlon / 2) ** 2
    )
    return 6371 * 2 * math.atan2(math.sqrt(x), math.sqrt(max(0, 1 - x)))


# --- Commons imageinfo resolution (batched, cached) --------------------------
metadata_path = CACHE / "commons-imageinfo.json"
imageinfo = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}


def fetch_imageinfo(titles):
    missing = [t for t in titles if norm_title(t) not in imageinfo]
    for at in range(0, len(missing), 50):
        batch = missing[at : at + 50]
        response = api(
            prop="imageinfo",
            iiprop="url|size|extmetadata|mime|mediatype",
            iiurlwidth="1024",
            titles="|".join(batch),
        )
        pages = {
            norm_title(p["title"]): p
            for p in response.get("query", {}).get("pages", [])
        }
        for title in batch:
            page = pages.get(norm_title(title))
            if page and page.get("imageinfo"):
                imageinfo[norm_title(title)] = page
            else:
                imageinfo[norm_title(title)] = {"title": title, "missing": True}
        metadata_path.write_text(json.dumps(imageinfo, ensure_ascii=False))
    return [imageinfo[norm_title(t)] for t in titles]


def usable_photo(page):
    """License gate (CC/PD with machine-readable attribution) plus the 800 px quality gate."""
    info = (page or {}).get("imageinfo", [{}])[0]
    meta = info.get("extmetadata", {}) or {}
    license = text(meta.get("LicenseShortName", {}).get("value", ""))
    author = text(meta.get("Artist", {}).get("value", ""))
    if not re.search(r"CC0|CC (?:BY|0)|public domain|^PD|PDM", license, re.I):
        return None
    if not author:
        return None
    if info.get("mediatype") != "BITMAP":
        return None
    if not str(info.get("mime", "")).startswith("image/"):
        return None
    if int(info.get("width", 0) or 0) < PHOTO_MIN_WIDTH:
        return None
    return license, author, info


# --- candidate collection per selected record --------------------------------
candidates = {}
for record_id, entry in selected.items():
    row, tags = index_rows[record_id], records[record_id]["tags"]
    plan = []
    if entry["source"] == "direct":
        plan.append(("direct", entry["title"]))
    for monument in wlm_by_record.get(record_id, []):
        # The dataset's own curation order (INP CARARE export) doubles as the
        # ranking; each plan item carries its monument's name and LMI code so
        # every shipped photo keeps the full contest provenance.
        for photo in monument["photos"][:2]:
            plan.append(
                (
                    "wlm",
                    {
                        **photo,
                        "lmi": monument["lmi"],
                        "monument": monument["name"],
                    },
                )
            )
    if entry["source"] == "category":
        cache_key = CACHE / (
            "category-"
            + hashlib.sha256(entry["title"].encode()).hexdigest()[:16]
            + ".json"
        )
        if cache_key.exists():
            members = json.loads(cache_key.read_text())
        else:
            response = api(
                generator="categorymembers",
                gcmtitle=entry["title"],
                gcmtype="file",
                gcmlimit="12",
                prop="imageinfo",
                iiprop="url|size|extmetadata|mime|mediatype",
                iiurlwidth="1024",
            )
            members = [
                p.get("title")
                for p in response.get("query", {}).get("pages", [])
                if p.get("imageinfo")
            ]
            cache_key.write_text(json.dumps(members, ensure_ascii=False))
        for title in members[:4]:
            plan.append(("category", title))
    candidates[record_id] = plan

# Search enrichment for places that still have fewer than two anchors.
for record_id, entry in list(candidates.items()):
    row = index_rows[record_id]
    if len(candidates[record_id]) >= 2:
        continue
    query = (row["name"] + " " + (row.get("city") or "")).strip()
    cache_key = CACHE / (
        "search-" + hashlib.sha256(query.encode()).hexdigest()[:16] + ".json"
    )
    if cache_key.exists():
        results = json.loads(cache_key.read_text())
    else:
        response = api(
            generator="search",
            gsrsearch=query,
            gsrnamespace="6",
            gsrlimit="10",
            prop="imageinfo",
            iiprop="url|size|extmetadata|mime|mediatype",
            iiurlwidth="1024",
        )
        results = [
            p.get("title")
            for p in response.get("query", {}).get("pages", [])
            if p.get("imageinfo")
        ]
        cache_key.write_text(json.dumps(results, ensure_ascii=False))
    for title in results:
        if title_matches(title, row["name"]):
            candidates[record_id].append(("search", title))

# Videos: one licensed webm clip where Commons offers one for the place.
video_candidates = {}
claimed_video_titles = set()
for record_id in candidates:
    row = index_rows[record_id]
    tokens = significant_tokens(row["name"])
    if not tokens:
        continue
    queries = [
        "filemime:video/webm " + row["name"] + " " + (row.get("city") or ""),
        "filemime:video/webm " + row["name"],
    ]
    merged = {}
    for query in queries:
        cache_key = CACHE / (
            "video-search-" + hashlib.sha256(query.encode()).hexdigest()[:16] + ".json"
        )
        if cache_key.exists():
            found = json.loads(cache_key.read_text())
        else:
            response = api(
                generator="search",
                gsrsearch=query,
                gsrnamespace="6",
                gsrlimit="8",
                prop="imageinfo",
                iiprop="url|size|extmetadata|mime|mediatype",
                iiurlwidth="640",
            )
            found = [
                {
                    "title": p.get("title"),
                    "size": p.get("imageinfo", [{}])[0].get("size"),
                    "thumburl": p.get("imageinfo", [{}])[0].get("thumburl"),
                }
                for p in response.get("query", {}).get("pages", [])
                if p.get("imageinfo")
            ]
            cache_key.write_text(json.dumps(found, ensure_ascii=False))
        for item in found:
            if item.get("title"):
                merged[item["title"]] = item
    results = list(merged.values())
    city_tokens = significant_tokens(row.get("city") or "")
    ranked = sorted(
        (r for r in results if r.get("size") and r["size"] < VIDEO_HARD_BYTES),
        key=lambda r: (
            0 if any(city_word in norm(r["title"]) for city_word in city_tokens) else 1,
            r["size"],
        ),
    )
    for ranked_item in ranked:
        if title_matches(ranked_item["title"], row["name"]) and (
            len(tokens) == 1 and len(tokens[0]) >= 6 or len(tokens) >= 2
        ):
            # Two records of one monument (an OSM node and its way) must not
            # each download the same clip: a claimed title belongs to the first.
            if norm_title(ranked_item["title"]).casefold() in claimed_video_titles:
                break
            claimed_video_titles.add(norm_title(ranked_item["title"]).casefold())
            video_candidates[record_id] = ranked_item["title"]
            break

# --- resolve metadata for every candidate ------------------------------------
need_titles = sorted(
    {
        title
        for plan in candidates.values()
        for kind, item in plan
        for title in ([item] if kind != "wlm" else [item["title"]])
    }
    | set(video_candidates.values())
)
fetch_imageinfo(need_titles)
print(
    json.dumps(
        {
            "candidates": len(need_titles),
            "videoCandidates": [
                {
                    "record": record_id,
                    "row": index_rows[record_id]["name"],
                    "title": title,
                }
                for record_id, title in sorted(video_candidates.items())
            ],
        },
        ensure_ascii=False,
    ),
    flush=True,
)


def export_photo(record_id, role, kind, item):
    row = index_rows[record_id]
    title = item if kind in ("direct", "category", "search") else item["title"]
    page = imageinfo.get(norm_title(title), {})
    gate = usable_photo(page)
    if not gate:
        raise ValueError(
            (
                "Reusable photo not confirmed: "
                if kind != "wlm"
                else "WLM photo no longer licensed/available: "
            )
            + title
        )
    license, author, info = gate
    if kind == "direct" and role == 1:
        image_id = "explore-" + record_id
    elif kind == "wlm":
        image_id = "wlm-" + record_id + "-" + str(role)
    else:
        image_id = "explore-" + record_id + "-" + str(role)
    target = MEDIA / (image_id + ".webp")
    if not target.exists():
        raw = get(info.get("thumburl") or info["url"])
        image = Image.open(io.BytesIO(raw))
        image.load()
        if image.width < 320 or image.height < 240:
            raise ValueError("Image too small: " + title)
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        image.convert("RGB").save(target, "WEBP", quality=80, method=6)
    with Image.open(target) as image:
        width, height = image.size
    return image_id, {
        "app_id": image_id,
        "app_file": "/media/" + target.name,
        "subject": row["name"],
        "caption_ro": text(page.get("title", "").replace("File:", "").rsplit(".", 1)[0])
        or row["name"],
        "original_title": page.get("title", title),
        "source_page_url": info["descriptionurl"],
        "original_image_url": info["url"],
        "downloaded_image_url": info.get("thumburl") or info["url"],
        "author": author,
        "license": license,
        "license_url": text(
            (info.get("extmetadata", {}) or {}).get("LicenseUrl", {}).get("value", "")
        )
        or info["descriptionurl"],
        "attribution": page.get("title", title)
        + " — "
        + author
        + " / Wikimedia Commons / "
        + license,
        "role": "gallery" if role > 1 else "main",
        "width": width,
        "height": height,
        "bytes": target.stat().st_size,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "retrieval_date": datetime.datetime.now(datetime.timezone.utc)
        .date()
        .isoformat(),
        "changes": "Downscaled to at most 1024 px, optimized WebP quality 80. CSS crops thumbnails; original license applies.",
        "source_record": row["sourceUrl"],
        "commons_page_id": page.get("pageid"),
        **(
            {
                "wlm": {
                    "monument": item["monument"],
                    "lmi": item.get("lmi", ""),
                    "photographer": item.get("photographer", ""),
                    "date": item.get("date", ""),
                    "dataset": WLM_DATASET_URL,
                    "datasetLicense": WLM_DATASET_LICENSE,
                }
            }
            if kind == "wlm"
            else {}
        ),
    }


def export_video(record_id, title):
    row = index_rows[record_id]
    page = imageinfo.get(norm_title(title), {})
    info = (page or {}).get("imageinfo", [{}])[0]
    meta = info.get("extmetadata", {}) or {}
    license = text(meta.get("LicenseShortName", {}).get("value", ""))
    author = text(meta.get("Artist", {}).get("value", ""))
    if (
        not re.search(r"CC0|CC (?:BY|0)|public domain|^PD|PDM", license, re.I)
        or not author
        or info.get("mediatype") != "VIDEO"
        or info.get("mime") != "video/webm"
    ):
        raise ValueError("Video license not confirmed: " + title)
    if int(info.get("size", 0) or 0) >= VIDEO_HARD_BYTES:
        raise ValueError("Video over the 25 MiB hard ceiling: " + title)
    image_id = "video-" + record_id
    target = MEDIA / (image_id + ".webm")
    if not target.exists():
        target.write_bytes(get(info["url"], limit=VIDEO_HARD_BYTES - 1))
    if target.stat().st_size >= VIDEO_HARD_BYTES:
        target.unlink()
        raise ValueError("Video exceeded the hard ceiling on download: " + title)
    return image_id, {
        "app_id": image_id,
        "app_file": "/media/" + target.name,
        "subject": row["name"],
        "caption_ro": text(page.get("title", "").replace("File:", "").rsplit(".", 1)[0])
        or row["name"],
        "original_title": page.get("title", title),
        "source_page_url": info["descriptionurl"],
        "original_image_url": info["url"],
        "downloaded_image_url": info["url"],
        "author": author,
        "license": license,
        "license_url": text(
            (info.get("extmetadata", {}) or {}).get("LicenseUrl", {}).get("value", "")
        )
        or info["descriptionurl"],
        "attribution": page.get("title", title)
        + " — "
        + author
        + " / Wikimedia Commons / "
        + license,
        "role": "video",
        "mime": "video/webm",
        "poster_url": info.get("thumburl"),
        "width": info.get("width"),
        "height": info.get("height"),
        "bytes": target.stat().st_size,
        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "retrieval_date": datetime.datetime.now(datetime.timezone.utc)
        .date()
        .isoformat(),
        "changes": "Copied without re-encoding; the original webm and its license are kept byte-for-byte.",
        "source_record": row["sourceUrl"],
        "commons_page_id": page.get("pageid"),
    }


places = []
assets = []
failures = []
# The video tier is assigned deterministically before the download pool runs:
# smallest qualifying clips for the earliest records, until a budget is spent.
video_plan = {}
video_budget_files = MAX_VIDEO_FILES
video_budget_bytes = VIDEO_TOTAL_BYTES
for record_id in sorted(video_candidates):
    if video_budget_files <= 0 or video_budget_bytes <= 0:
        break
    video_plan[record_id] = video_candidates[record_id]
    video_budget_files -= 1
    info = (imageinfo.get(norm_title(video_candidates[record_id]), {}) or {}).get(
        "imageinfo", [{}]
    )[0]
    video_budget_bytes -= int(info.get("size", 0) or 0)


def build_record(record_id):
    row, tags = index_rows[record_id], records[record_id]["tags"]
    plan = candidates[record_id]
    seen_titles = set()
    photos = []
    for kind, item in plan:
        if len(photos) >= MAX_PHOTOS_PER_PLACE:
            break
        title = item if kind in ("direct", "category", "search") else item["title"]
        key = norm_title(title).casefold()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        try:
            photos.append(export_photo(record_id, len(photos) + 1, kind, item))
        except ValueError as error:
            # One candidate below the license/quality bar never sinks the whole
            # gallery: the next candidate in the curated order takes the slot.
            failures.append(str(error))
            print(json.dumps({"excluded": str(error)}, ensure_ascii=False), flush=True)
    videos = []
    video_title = video_plan.get(record_id)
    if video_title:
        try:
            video_id, video_asset = export_video(record_id, video_title)
            videos.append(video_id)
            assets.append(video_asset)
        except Exception as error:
            failures.append(str(error))
            print(json.dumps({"excluded": str(error)}, ensure_ascii=False), flush=True)
    if not photos:
        raise ValueError("No reusable photo confirmed for record: " + record_id)
    for image_id, photo_asset in photos:
        assets.append(photo_asset)
    nearest = min(cities, key=lambda c: km(row, c))
    city = row["city"] or "Zona " + nearest["name"]
    region = tags.get("addr:county") or tags.get("is_in:county") or "România"
    categories = [c for c in row.get("categories", []) if c]
    primary = next((c for c in categories if c != "local-all"), "local")
    kind = " · ".join(
        dict.fromkeys(
            t["label"]
            for t in row["types"]
            if not categories or t["category"] == primary or t["category"] in categories
        )
    )
    monuments = wlm_by_record.get(record_id, [])
    nature = any(
        word in row["name"].lower()
        for word in ("cascad", "cheil", "lac", "tâmpa", "tunele", "parc", "rezerva")
    )
    website = (
        row["website"] if row["website"].startswith("https://") else row["sourceUrl"]
    )
    features = [kind or "Loc verificat în sursă", "Fotografie reală"] + (
        ["Monument istoric"] if monuments else []
    )
    description = (
        ((row["address"] + ". ") if row["address"] else "")
        + "Poziția și informațiile acestui loc provin din fișa OpenStreetMap. "
        + (
            "Fotografiile reale provin din Wikimedia Commons"
            + (
                ", în parte din ediția 2011 a Wiki Loves Monuments (Lista Monumentelor Istorice)"
                if monuments
                else ""
            )
            + (
                "; clipul video face parte din aceeași galerie verificată"
                if videos
                else ""
            )
            + ". Autorul și licența fiecărui material sunt disponibile în galerie. Programul și condițiile actuale se confirmă la administrator."
        )
    )
    place = {
        "id": "osm-" + record_id,
        "name": row["name"],
        "kind": kind or "Loc din inventarul național",
        "city": city,
        "region": region,
        "tag": row["name"],
        "lat": row["lat"],
        "lon": row["lon"],
        "images": [image_id for image_id, _ in photos],
        "summary": (kind or "Loc") + " · " + city,
        "description": description,
        "website": website,
        "features": list(dict.fromkeys(features)),
        "interests": list(
            dict.fromkeys([primary, "local"] + (["natura"] if nature else []))
        ),
        "sourceUrl": row["sourceUrl"],
        "recordId": record_id,
        "recordChunk": row["chunk"],
        "cityApproximate": not bool(row["city"]),
    }
    if videos:
        place["videos"] = videos
    return place


with ThreadPoolExecutor(max_workers=3) as pool:
    futures = {
        pool.submit(build_record, record_id): record_id for record_id in candidates
    }
    for future in as_completed(futures):
        record_id = futures[future]
        try:
            places.append(future.result())
        except Exception as error:
            failures.append(str(error))
            print(json.dumps({"excluded": str(error)}, ensure_ascii=False), flush=True)

places.sort(key=lambda p: (p["name"].casefold(), p["id"]))
assets.sort(key=lambda a: a["app_id"])
if len(places) < 200:
    raise RuntimeError("Too few confirmed photographed places: " + str(len(places)))
(BASE / "exploration.json").write_text(
    json.dumps(places, ensure_ascii=False, indent=2) + "\n"
)

photographs = read(MEDIA / "manifest.json")
preserved = [
    a
    for a in photographs["assets"]
    if not re.match(r"^(?:explore|wlm|video)-", a["app_id"])
]
# Repair provenance drift on preserved editorial rows: the register must
# describe the exact bytes shipped on disk after the later WebP re-optimization.
for asset in preserved:
    path = MEDIA / asset["app_file"].replace("/media/", "")
    if path.exists():
        data = path.read_bytes()
        if (
            asset.get("bytes") != len(data)
            or asset.get("sha256") != hashlib.sha256(data).hexdigest()
        ):
            asset["bytes"] = len(data)
            asset["sha256"] = hashlib.sha256(data).hexdigest()
            asset["changes"] = (
                text(asset.get("changes", ""))
                or "Export WebP re-optimizat; registrul descrie octeții livrați."
            )
            with Image.open(path) as image:
                asset["width"], asset["height"] = image.size
photographs["assets"] = preserved + assets
(MEDIA / "manifest.json").write_text(
    json.dumps(photographs, ensure_ascii=False, indent=2) + "\n"
)
# Files produced by earlier runs of this pipeline that the current curated
# selection no longer ships must leave the disk with their manifest rows —
# an unreferenced binary would be an unattributable republication.
shipped_ids = {asset["app_id"] for asset in photographs["assets"]}
for path in MEDIA.glob("*.web[pm]"):
    if re.match(r"^(?:explore|wlm|video)-", path.stem) and path.stem not in shipped_ids:
        path.unlink()

after_attested = {place["recordId"] for place in places}
coverage_after = coverage_for(after_attested)
photo_roles = collections.Counter()
for asset in assets:
    photo_roles[
        "wlm" if asset.get("wlm") else "video" if asset["role"] == "video" else "photo"
    ] += 1
(BASE / "exploration-import.json").write_text(
    json.dumps(
        {
            "source": manifest["sourceUrl"],
            "dataAsOf": manifest["dataAsOf"],
            "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "places": len(places),
            "photos": sum(len(p["images"]) for p in places),
            "videos": len([a for a in assets if a.get("role") == "video"]),
            "photoRoles": dict(photo_roles),
            "videoFiles": [
                {"app_id": a["app_id"], "bytes": a["bytes"], "license": a["license"]}
                for a in assets
                if a.get("role") == "video"
            ],
            "maxParallelRequests": 3,
            "maxPhotosPerPlace": MAX_PHOTOS_PER_PLACE,
            "photoMinWidth": PHOTO_MIN_WIDTH,
            "excluded": sorted(excluded),
            "wlm": {
                "dataset": WLM_DATASET_URL,
                "datasetLicense": WLM_DATASET_LICENSE,
                "monumentsTotal": len(wlm_monuments),
                "monumentsMapped": sum(len(v) for v in wlm_by_record.values()),
                "recordsWithWlmPhotos": len(
                    [
                        record_id
                        for record_id in candidates
                        if any(
                            asset["app_id"].startswith("wlm-" + record_id)
                            for asset in assets
                        )
                    ]
                ),
                "photosSelected": photo_roles.get("wlm", 0),
            },
            "beforeCoverage": coverage_before,
            "afterCoverage": coverage_after,
            "beforeAttestedRecords": len(before_attested),
            "afterAttestedRecords": len(after_attested),
            "failures": failures,
            "note": "A photographed selection of exact source records — every Commons-linked OSM record in every category and the Wiki Loves Monuments 2011 monuments mapped to the corpus — not a replacement for the complete inventory.",
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n"
)
print(
    json.dumps(
        {
            "places": len(places),
            "photos": sum(len(p["images"]) for p in places),
            "videos": len([a for a in assets if a.get("role") == "video"]),
            "videoBytes": sum(a["bytes"] for a in assets if a.get("role") == "video"),
            "failures": len(failures),
        },
        ensure_ascii=False,
    ),
    flush=True,
)

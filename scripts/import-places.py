#!/usr/bin/env python3
"""Import a verified Geofabrik Romania PBF, preserving all tags of selected places.

Requires pyosmium. The public export excludes contributor personal metadata.
This is a derived ODbL database, separate from official registries. No Overpass
public instance is used as an application backend. Writes only after validation.
"""

import argparse, collections, datetime, hashlib, json, math, pathlib, re, shutil, tempfile, unicodedata

HEALTH = {
    "hospital": "Spitale",
    "clinic": "Clinici",
    "doctors": "Cabinete medicale",
    "dentist": "Stomatologie",
    "pharmacy": "Farmacii",
    "veterinary": "Medicină veterinară",
    "blood_donation": "Donare de sânge",
    "nursing_home": "Îngrijire și recuperare",
}
EDUCATION = {
    "school": "Școli",
    "kindergarten": "Grădinițe",
    "university": "Universități",
    "college": "Colegii",
    "language_school": "Cursuri de limbi",
    "music_school": "Școli de muzică",
    "driving_school": "Școli de șoferi",
    "training": "Formare profesională",
}
FINANCE = {
    "bank": "Bănci",
    "atm": "Bancomate",
    "bureau_de_change": "Schimb valutar",
    "payment_terminal": "Plăți",
}
LOCAL = {
    "townhall": "Primării",
    "post_office": "Poștă",
    "police": "Poliție",
    "fire_station": "Pompieri",
    "social_facility": "Servicii sociale",
    "community_centre": "Centre comunitare",
    "public_bath": "Băi publice",
    "toilets": "Toalete publice",
    "drinking_water": "Apă potabilă",
    "recycling": "Reciclare",
}
CULTURE = {
    "theatre": "Teatre",
    "cinema": "Cinematografe",
    "library": "Biblioteci",
    "arts_centre": "Centre culturale",
    "music_venue": "Săli de concerte",
}
TRANSPORT = {
    "bus_station": "Autogări",
    "taxi": "Taxi",
    "ferry_terminal": "Feriboturi",
    "car_rental": "Închirieri auto",
    "car_sharing": "Car sharing",
    "bicycle_rental": "Biciclete",
    "parking": "Parcări",
    "charging_station": "Încărcare electrică",
    "fuel": "Benzinării",
}

ATTRACTION_LABEL = "Locuri de vizitat"
# English common words found in actual junk attraction names of the national
# corpus (audit 2026-10); a name made entirely of these is a descriptive dump,
# not an article title. Kept intentionally narrow — mirrored in scripts/
# verify-model-contracts.mjs (LEG 1) and scripts/recover-places-attractions.py.
ATTRACTION_ENGLISH_WORDS = {
    "enclosure",
    "cliff",
    "peninsula",
    "viewpoint",
    "waterfall",
    "windmill",
    "windmills",
    "barn",
    "wagons",
    "with",
    "floating",
    "mill",
    "fresh",
    "meat",
    "red",
    "pole",
    "gravity",
    "hill",
    "former",
    "mine",
    "nude",
    "beach",
    "ski",
    "slope",
    "the",
    "of",
    "and",
    "a",
    "sign",
    "ruins",
    "fort",
    "island",
    "bridge",
    "tower",
    "cave",
    "spring",
    "lake",
    "river",
    "forest",
    "park",
    "garden",
}
# Audited singletons the generic classes cannot catch without overreach.
ATTRACTION_EXPLICIT_JUNK = {
    "partie schi - ski slope",
    "former mine-Valea Blaznei",
    "NICOSMAIL",
    "Ot11378 campu mare",
    "Traseu Manastirea Magarul, la dreapta dupa canton",
}
ATTRACTION_ECHO_TAGS = (
    "man_made",
    "historic",
    "natural",
    "landuse",
    "leisure",
    "tourism",
    "amenity",
    "waterway",
    "building",
    "barrier",
)


def classify(t):
    out = []

    def add(cat, label):
        if (cat, label) not in out:
            out.append((cat, label))

    a = t.get("amenity", "")
    for mapping, cat in [
        (HEALTH, "sanatate"),
        (EDUCATION, "educatie"),
        (FINANCE, "bani"),
        (LOCAL, "local"),
        (CULTURE, "cultura"),
        (TRANSPORT, "transport"),
    ]:
        if a in mapping:
            add(cat, mapping[a])
    if t.get("healthcare") and t["healthcare"] not in ("no", "yes"):
        add("sanatate", HEALTH.get(t["healthcare"], "Servicii de sănătate"))
    if a == "cinema":
        add("filme", "Cinematografe")
    if a == "courthouse":
        add("justitie", "Instanțe")
    if a == "police":
        add("justitie", "Poliție")
    if a == "charging_station":
        add("energie", "Încărcare electrică")
    if a == "shelter":
        add("mediu", "Adăposturi")
    if t.get("tourism") in ("wilderness_hut", "refuge_hut"):
        add("mediu", "Adăposturi")
    if t.get("highway") == "rest_area":
        add("mediu", "Spații de odihnă")
    if a == "marketplace":
        add("agricultura", "Piețe agroalimentare")
        add("local", "Piețe")
    o = t.get("office", "")
    if o == "government":
        add("local", "Instituții publice")
    if o in ("lawyer", "notary"):
        add("justitie", "Avocați" if o == "lawyer" else "Notari")
    if o in ("employment_agency", "company") and (
        o == "employment_agency" or t.get("recruitment")
    ):
        add("munca", "Ocupare și recrutare")
    if o in ("newspaper", "television", "radio"):
        add("stiri", "Redacții și media")
    if o in (
        "company",
        "accountant",
        "insurance",
        "it",
        "estate_agent",
        "architect",
        "tax_advisor",
        "consulting",
    ):
        add("firme", "Birouri și servicii")
    if t.get("shop") and t["shop"] not in ("no", "vacant", "yes"):
        add("firme", "Magazine și servicii")
        if t["shop"] in ("farm", "agrarian", "garden_centre", "country_store"):
            add("agricultura", "Produse și servicii agricole")
        if t["shop"] in ("medical_supply", "hearing_aids", "optician"):
            add("sanatate", "Optică și dispozitive medicale")
    tourist = t.get("tourism", "")
    if tourist in (
        "museum",
        "gallery",
        "attraction",
        "information",
        "zoo",
        "aquarium",
        "viewpoint",
        "theme_park",
    ):
        add(
            "cultura",
            {
                "museum": "Muzee",
                "gallery": "Galerii",
                "information": "Informare turistică",
                "viewpoint": "Puncte panoramice",
            }.get(tourist, "Locuri de vizitat"),
        )
    if tourist in (
        "hotel",
        "motel",
        "hostel",
        "guest_house",
        "camp_site",
        "apartment",
        "chalet",
    ):
        add("firme", "Cazare")
    if t.get("leisure") in ("park", "garden", "nature_reserve"):
        add("mediu", "Parcuri și natură")
    if t.get("leisure") in (
        "sports_centre",
        "fitness_centre",
        "swimming_pool",
        "stadium",
        "playground",
    ):
        add("local", "Sport și timp liber")
    if t.get("natural") in ("peak", "spring", "cave_entrance") and t.get("name"):
        add(
            "mediu",
            {"peak": "Vârfuri", "spring": "Izvoare", "cave_entrance": "Peșteri"}[
                t["natural"]
            ],
        )
    if t.get("power") in ("plant", "generator", "substation") and t.get("name"):
        add("energie", "Infrastructură energetică")
    if t.get("landuse") in ("farmyard", "greenhouse_horticulture") and t.get("name"):
        add("agricultura", "Ferme și horticultură")
    if t.get("railway") in ("station", "halt"):
        add("transport", "Gări")
    if t.get("highway") == "bus_stop":
        add("transport", "Stații de autobuz")
    if t.get("aeroway") == "aerodrome":
        add("transport", "Aeroporturi")
    return out


def norm(s):
    return "".join(
        c
        for c in unicodedata.normalize("NFD", s).lower()
        if not unicodedata.combining(c)
    )


def valid_public_attraction_name(name, t):
    """A public attractions article ("Locuri de vizitat") needs a real, presentable name.

    Rejects the junk classes audited in the national corpus (2026-10): entries
    whose shipped name is the subcategory label itself (unnamed features whose
    name fell back to the label), English leading-ordinal descriptors
    ("3rd enclosure"), OSM fixme artifacts, names that echo a structural tag
    value ("windmill" for man_made=windmill), pure-English common-word
    descriptive phrases and route-directions sentences. Scoped to attractions
    only — every other subcategory keeps shipping exactly as before.
    """
    n = norm(name)
    if n == norm(ATTRACTION_LABEL):
        return False
    if re.match(r"^[0-9]+(st|nd|rd|th)\b", name.strip(), re.IGNORECASE):
        return False
    if re.search(r"fixme", name, re.IGNORECASE):
        return False
    for key in ATTRACTION_ECHO_TAGS:
        value = t.get(key)
        if value and norm(value) == n:
            return False
    if name in ATTRACTION_EXPLICIT_JUNK:
        return False
    tokens = [
        norm(token)
        for token in re.split(
            r"[^a-zA-Z\u00C0-\u024F\u0391-\u03C9\u0400-\u04FF]+", name
        )
        if token
    ]
    if tokens and all(token in ATTRACTION_ENGLISH_WORDS for token in tokens):
        return False
    if re.search(r"\bla dreapta\b|\bla st(â|a)nga\b", name, re.IGNORECASE):
        return False
    return True


def apply_attraction_gate(t, types, gate):
    """Strip the attractions type from records without a valid public attraction
    name; the record survives in its other categories (an unnamed utility POI
    keeps shipping there by design) and is dropped entirely when nothing
    remains. Every rejection is counted for the build report."""
    if not any(label == ATTRACTION_LABEL for _, label in types):
        return types
    raw = t.get("name:ro") or t.get("name") or t.get("brand") or t.get("operator")
    if raw and valid_public_attraction_name(raw, t):
        return types
    kept = [x for x in types if x[1] != ATTRACTION_LABEL]
    gate["attractions-rejected"] += 1
    if kept:
        gate["attraction-type-stripped"] += 1
    else:
        gate["records-dropped"] += 1
    return kept


def mean(points):
    if not points:
        return None
    return (
        round(sum(p[0] for p in points) / len(points), 6),
        round(sum(p[1] for p in points) / len(points), 6),
    )


def main():
    # The PBF-processing dependency loads only on the national build path; the
    # attractions gate (and the recovery driver importing this module) must stay
    # importable where pyosmium is not installed.
    import osmium

    p = argparse.ArgumentParser()
    p.add_argument("--pbf", required=True)
    p.add_argument("--metadata", required=True)
    p.add_argument("--output", default="public/places")
    a = p.parse_args()
    source = pathlib.Path(a.pbf)
    meta = json.loads(pathlib.Path(a.metadata).read_text())
    if hashlib.sha256(source.read_bytes()).hexdigest() != meta["sha256"]:
        raise RuntimeError("PBF checksum mismatch")
    with osmium.io.Reader(str(source)) as reader:
        header = reader.header()
        data_as_of = header.get("osmosis_replication_timestamp") or None
    relations = {}
    needed_nodes = set()
    needed_ways = set()

    class RelationScan(osmium.SimpleHandler):
        def relation(self, r):
            t = dict(r.tags)
            types = classify(t)
            if types:
                members = [(m.type, m.ref) for m in r.members if m.type in ("n", "w")]
                relations[r.id] = (t, types, members, str(r.timestamp), r.version)
                for typ, ref in members:
                    (needed_nodes if typ == "n" else needed_ways).add(ref)

    RelationScan().apply_file(str(source))
    positions = {}
    records = []
    cities = []
    stats = collections.Counter()
    gate = collections.Counter()
    unlocated = 0

    def add(typ, ident, t, types, point, updated, version):
        nonlocal unlocated
        if not point:
            unlocated += 1
            return
        lat, lon = point
        if not (43 <= lat <= 49.2 and 20 <= lon <= 31):
            return
        types = apply_attraction_gate(t, types, gate)
        if not types:
            return
        name = (
            t.get("name:ro")
            or t.get("name")
            or t.get("brand")
            or t.get("operator")
            or types[0][1].removesuffix("i")
        )
        rid = typ[0] + str(ident)
        address = ", ".join(
            filter(
                None,
                [
                    (
                        " ".join(
                            filter(
                                None, [t.get("addr:street"), t.get("addr:housenumber")]
                            )
                        )
                    ),
                    t.get("addr:suburb"),
                    t.get("addr:city"),
                    t.get("addr:postcode"),
                ],
            )
        )
        phone = (
            t.get("contact:phone")
            or t.get("phone")
            or t.get("contact:mobile")
            or t.get("mobile")
            or ""
        )
        email = t.get("contact:email") or t.get("email") or ""
        website = t.get("contact:website") or t.get("website") or t.get("url") or ""
        record = {
            "id": rid,
            "name": name,
            "categories": list(dict.fromkeys(x[0] for x in types)),
            "types": [{"category": c, "label": l} for c, l in types],
            "lat": lat,
            "lon": lon,
            "address": address,
            "city": t.get("addr:city", ""),
            "phone": phone,
            "email": email,
            "website": website,
            "openingHours": t.get("opening_hours", ""),
            "updatedAt": updated,
            "sourceUrl": f"https://www.openstreetmap.org/{typ}/{ident}",
            "locationApproximate": typ != "node",
            "tags": t,
            "version": version,
        }
        records.append(record)
        for c, l in types:
            stats[c] += 1

    class Places(osmium.SimpleHandler):
        def node(self, n):
            if not n.location.valid():
                return
            point = (n.location.lat, n.location.lon)
            if n.id in needed_nodes:
                positions[("n", n.id)] = point
            t = dict(n.tags)
            if (
                t.get("place") in ("city", "town", "village", "hamlet")
                and t.get("name")
                and 43 <= point[0] <= 49.2
                and 20 <= point[1] <= 31
            ):
                cities.append(
                    {
                        "name": t.get("name:ro") or t["name"],
                        "lat": round(point[0], 6),
                        "lon": round(point[1], 6),
                        "type": t["place"],
                        "county": t.get("is_in:county", ""),
                        "sourceUrl": f"https://www.openstreetmap.org/node/{n.id}",
                    }
                )
            types = classify(t)
            if types:
                add("node", n.id, t, types, point, str(n.timestamp), n.version)

        def way(self, w):
            t = dict(w.tags)
            types = classify(t)
            if not types and w.id not in needed_ways:
                return
            point = mean(
                [
                    (n.location.lat, n.location.lon)
                    for n in w.nodes
                    if n.location.valid()
                ]
            )
            if point and w.id in needed_ways:
                positions[("w", w.id)] = point
            if types:
                add("way", w.id, t, types, point, str(w.timestamp), w.version)

    Places().apply_file(str(source), locations=True, idx="flex_mem")
    for ident, (t, types, members, updated, version) in relations.items():
        add(
            "relation",
            ident,
            t,
            types,
            mean([positions[x] for x in members if x in positions]),
            updated,
            version,
        )
    # One physical feature can be mapped as a node and a building. Merge only a
    # unique identical name + exact published address, or same contact and <40m.
    # Preserve every contributing record and its full original tags.
    groups = collections.defaultdict(list)
    merged = []
    for r in records:
        groups[norm(r["name"])].append(r)
    for group in groups.values():
        done = []
        for r in group:
            candidates = []
            for prior in done:
                near = (r["lat"] - prior["lat"]) ** 2 + (
                    (r["lon"] - prior["lon"]) * math.cos(math.radians(r["lat"]))
                ) ** 2 < (40 / 111000) ** 2
                evidence = (
                    r["address"] and norm(r["address"]) == norm(prior["address"])
                ) or any(
                    r[k] and r[k] == prior[k] for k in ("phone", "email", "website")
                )
                if (
                    near
                    and evidence
                    and set(r["categories"]) & set(prior["categories"])
                ):
                    candidates.append(prior)
            if len(candidates) == 1:
                prior = candidates[0]
                prior.setdefault("relatedSources", []).append(r)
                for k in (
                    "address",
                    "city",
                    "phone",
                    "email",
                    "website",
                    "openingHours",
                ):
                    if not prior[k] and r[k]:
                        prior[k] = r[k]
                prior["categories"] = list(
                    dict.fromkeys(prior["categories"] + r["categories"])
                )
                prior["types"] = [
                    json.loads(x)
                    for x in dict.fromkeys(
                        json.dumps(x) for x in prior["types"] + r["types"]
                    )
                ]
            else:
                done.append(r)
        merged.extend(done)
    records = sorted(merged, key=lambda r: (norm(r["name"]), r["id"]))
    if len(records) < 10_000 or len(cities) < 1000:
        raise RuntimeError("Incomplete national import")
    out = pathlib.Path(a.output)
    stage = pathlib.Path(tempfile.mkdtemp(prefix="places-", dir=out.parent))
    (stage / "records").mkdir()

    def write(path, value):
        raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        path.write_bytes(raw)
        if path.name != "index.json" and len(raw) > 24_000_000:
            raise RuntimeError("Asset exceeds 24 MB: " + str(path))
        return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

    chunks = {}
    index = []
    for at in range(0, len(records), 600):
        part = records[at : at + 600]
        key = f"{at // 600:04d}"
        chunks[key] = write(stage / "records" / f"{key}.json", {"items": part})
        for r in part:
            entry = {
                k: r[k]
                for k in (
                    "id",
                    "name",
                    "categories",
                    "types",
                    "lat",
                    "lon",
                    "address",
                    "city",
                    "phone",
                    "email",
                    "website",
                    "openingHours",
                    "updatedAt",
                    "sourceUrl",
                )
            }
            entry["chunk"] = key
            entry["search"] = norm(
                " ".join(str(v) for v in r["tags"].values())
                + " "
                + r["name"]
                + " "
                + r["address"]
            )
            index.append(entry)
    write(stage / "index.json", {"items": index})
    print(
        json.dumps({"attractionGate": dict(gate)}, ensure_ascii=False),
        flush=True,
    )
    import subprocess, sys

    subprocess.run(
        [
            sys.executable,
            str(pathlib.Path(__file__).with_name("finalize-places.py")),
            "--stage",
            str(stage),
            "--pbf",
            a.pbf,
            "--metadata",
            a.metadata,
            "--output",
            str(out),
        ],
        check=True,
    )


if __name__ == "__main__":
    main()

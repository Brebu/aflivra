# P1 probe — normalizer unification evidence over the full places corpus.
# Walks every record chunk and every local-all/name index shard (178.868 rows) and
# compares the stored index `search` value against three rule variants:
#   js_old  : NFD, strip U+0300-U+036F, lower        (lib/live/query.ts today)
#   py_old  : NFD, lower, strip ccc!=0               (scripts/finalize-places.py today)
#   unified : NFD, strip category M, lower-mark order both ways
# Verdicts: divergence counts per rule, whether any ccc==0 mark exists anywhere in
# the searchable text (the only inputs where py_old and unified differ), and whether
# the unified rule recomputes every stored index value exactly (no regeneration).
import gzip, json, pathlib, unicodedata, collections

root = pathlib.Path(__file__).resolve().parents[6] / "public" / "places"
manifest = json.loads((root / "manifest.json").read_text())


# (explicit variant functions keep the comparison honest)
def strip_range(s, lo, hi):
    return "".join(c for c in s if not (lo <= ord(c) <= hi))


def js_old_norm(s):
    return strip_range(unicodedata.normalize("NFD", s), 0x0300, 0x036F).lower()


def py_old_norm(s):
    return "".join(
        c
        for c in unicodedata.normalize("NFD", s).lower()
        if not unicodedata.combining(c)
    )


def unified_marks_lower(s):
    return "".join(c for c in s if not unicodedata.category(c).startswith("M")).lower()


def unified_norm(s):
    # JS order: NFD -> strip marks -> toLowerCase
    return unified_marks_lower(unicodedata.normalize("NFD", s))


def unified_py_order(s):
    # Python order: NFD -> lower -> strip marks (rules out an order dependency)
    return "".join(
        c
        for c in unicodedata.normalize("NFD", s).lower()
        if not unicodedata.category(c).startswith("M")
    )


stats = collections.Counter()
js_old_div = []  # stored index vs js_old (the T1.4 P1 finding)
unified_div = []  # stored index vs unified (must be 0 for no-regeneration)
order_div = []  # unified JS order vs unified Python order (must be 0)
ccc0_marks = []  # any mark with ccc==0 in the searchable text (must be absent)
mark_census = collections.Counter()


def searchable(r):
    tags = r.get("tags") or {}
    return (
        " ".join(str(v) for v in tags.values())
        + " "
        + r["name"]
        + " "
        + (r.get("address") or "")
    )


records = {}
for key in sorted(manifest["chunks"]):
    with gzip.open(root / "records" / (key + ".json.gz"), "rt", encoding="utf-8") as f:
        for r in json.load(f)["items"]:
            records[r["id"]] = r
            text = searchable(r)
            for ch in unicodedata.normalize("NFD", text):
                cat = unicodedata.category(ch)
                if cat.startswith("M"):
                    mark_census[
                        "U+%04X ccc=%d %s" % (ord(ch), unicodedata.combining(ch), cat)
                    ] += 1
                    if unicodedata.combining(ch) == 0:
                        ccc0_marks.append((r["id"], "U+%04X" % ord(ch)))
stats["records"] = len(records)

shards = 0
for part in (manifest["indices"].get("local-all") or {}).get("name", []):
    shards += 1
    with gzip.open(root / (part["file"] + ".gz"), "rt", encoding="utf-8") as f:
        for row in json.load(f)["items"]:
            r = records.get(row["id"])
            if r is None:
                stats["index_rows_missing_record"] += 1
                continue
            text = searchable(r)
            if row["search"] != js_old_norm(text):
                js_old_div.append(row["id"])
            if row["search"] != unified_norm(text):
                unified_div.append((row["id"], row["search"], unified_norm(text)))
            if unified_norm(text) != unified_py_order(text):
                order_div.append(row["id"])
stats["index_shards"] = shards
stats["js_old_divergence"] = len(js_old_div)
stats["unified_divergence"] = len(unified_div)
stats["order_divergence"] = len(order_div)
stats["ccc0_marks_in_corpus"] = len(ccc0_marks)

print(
    json.dumps(
        {
            "records": stats["records"],
            "indexNameShards": shards,
            "marksSeenInSearchableText": dict(mark_census),
            "divergenceIndexVsJsOld": stats["js_old_divergence"],
            "divergenceIndexVsUnified": stats["unified_divergence"],
            "divergenceUnifiedOrder": stats["order_divergence"],
            "ccc0Marks": stats["ccc0_marks_in_corpus"],
            "sampleJsOldDivergence": js_old_div[:5],
            "sampleUnifiedDivergence": unified_div[:2],
            "sampleCcc0Marks": ccc0_marks[:5],
        },
        ensure_ascii=False,
        indent=1,
    )
)
ok = (
    stats["js_old_divergence"] > 0
    and stats["unified_divergence"] == 0
    and stats["ccc0_marks_in_corpus"] == 0
    and stats["order_divergence"] == 0
)
print(
    "P1 SCAN VERDICT:",
    "UNIFIED-RULE-PROVEN (index == unified rule for every row; no regeneration needed)"
    if ok
    else "CHECK OUTPUT",
)
raise SystemExit(0 if ok else 1)

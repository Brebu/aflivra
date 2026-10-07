#!/usr/bin/env python3
"""Re-apply the attractions name validity gate to an already-shipped places corpus.

The national rebuild (import-places.py over the verified Geofabrik PBF +
finalize-places.py) is the primary corpus build; this recovery path re-assembles
public/places from the shipped record chunks — which preserve every original
OpenStreetMap tag — whenever the PBF is not at hand, so the current corpus gets
the very same attractions gate (import-places.apply_attraction_gate, imported
here so the two can never diverge) without any network fetch. The city index,
source metadata and exploration assets are carried from the prior build
byte-for-byte; every manifest sha256 proof is recomputed by finalize-places.py;
compress-snapshots.py re-stores the deterministic gzip layer afterwards.
"""

import argparse, collections, datetime, gzip, importlib.util, json, pathlib, subprocess, sys, tempfile, shutil

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "import_places", HERE / "import-places.py"
)
assert spec and spec.loader, "import-places.py must be loadable next to this script"
import_places = importlib.util.module_from_spec(spec)
spec.loader.exec_module(import_places)


def realign_exploration(output, gate, rejected):
    """Keep the exploration anchors true to the rebuilt corpus.

    The editorial selection pins each place to its record's chunk (the
    full-record sheet fetches /places/records/<chunk>.json.gz), and the
    exploration import report pins a per-category coverage table of the
    corpus. A corpus rebuild re-shards the records, so both must be
    realigned — every anchor is checked to still resolve to its record,
    and the report keeps its import-time before* tables untouched.
    """
    manifest = json.loads((output / "manifest.json").read_text())
    chunk_of = {}
    for key in sorted(manifest["chunks"]):
        for r in json.loads((output / "records" / (key + ".json")).read_text())[
            "items"
        ]:
            chunk_of[r["id"]] = key
    places = json.loads((output / "exploration.json").read_text())
    for place in places:
        chunk = chunk_of.get(place["recordId"])
        if not chunk:
            raise RuntimeError(
                "exploration anchor lost its record in the rebuild: "
                + place["recordId"]
            )
        place["recordChunk"] = chunk
    (output / "exploration.json").write_text(
        json.dumps(places, ensure_ascii=False, indent=2) + "\n"
    )
    attested = {place["recordId"] for place in places}
    coverage = {}
    for category, indices in manifest["indices"].items():
        if category == "local-all":
            continue
        rows = [
            row
            for part in indices["name"]
            for row in json.loads((output / part["file"]).read_text())["items"]
        ]
        coverage[category] = {
            "rows": len(rows),
            "hotlink": sum(
                1 for row in rows if row.get("image", "").startswith("https:")
            ),
            "attested": sum(1 for row in rows if row["id"] in attested),
        }
    report = json.loads((output / "exploration-import.json").read_text())
    report["afterCoverage"] = coverage
    report["corpusGateRealignment"] = {
        "appliedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "gate": dict(gate),
        "rejectedNames": dict(sorted(rejected)),
        "note": "Tabela afterCoverage și fragmentele de înregistrare ale galeriei au fost re-aliniate la corpusul re-făcut de poarta de validare a numelor atracțiilor; tabelele before* rămân instantanee de la import.",
    }
    (output / "exploration-import.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--output", default="public/places")
    a = p.parse_args()
    output = pathlib.Path(a.output)
    manifest = json.loads((output / "manifest.json").read_text())

    records = []
    for key in sorted(manifest["chunks"]):
        raw = gzip.decompress((output / "records" / (key + ".json.gz")).read_bytes())
        records.extend(json.loads(raw)["items"])

    gate = collections.Counter()
    rejected_names = collections.Counter()
    kept_records = []
    for r in records:
        types = [(t["category"], t["label"]) for t in r["types"]]
        gated = import_places.apply_attraction_gate(r["tags"], types, gate)
        if gated == types:
            kept_records.append(r)
            continue
        rejected_names[r["name"]] += 1
        if not gated:
            continue
        # The record survives in its other categories; its name re-derives the
        # way a fresh import would derive it for those categories alone.
        t = r["tags"]
        raw_name = (
            t.get("name:ro") or t.get("name") or t.get("brand") or t.get("operator")
        )
        r["name"] = raw_name or gated[0][1].removesuffix("i")
        r["categories"] = list(dict.fromkeys(category for category, _ in gated))
        r["types"] = [{"category": c, "label": l} for c, l in gated]
        kept_records.append(r)

    kept_records.sort(key=lambda r: (import_places.norm(r["name"]), r["id"]))
    stage = pathlib.Path(tempfile.mkdtemp(prefix="places-recovery-", dir=output.parent))
    (stage / "records").mkdir()
    index = []
    for at in range(0, len(kept_records), 600):
        part = kept_records[at : at + 600]
        key = f"{at // 600:04d}"
        (stage / "records" / f"{key}.json").write_bytes(
            json.dumps(
                {"items": part}, ensure_ascii=False, separators=(",", ":")
            ).encode()
        )
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
            entry["search"] = import_places.norm(
                " ".join(str(v) for v in r["tags"].values())
                + " "
                + r["name"]
                + " "
                + r["address"]
            )
            index.append(entry)
    (stage / "index.json").write_bytes(
        json.dumps({"items": index}, ensure_ascii=False, separators=(",", ":")).encode()
    )
    # Exploration assets live in the same output directory but belong to their
    # own pipeline; carry them across the rebuild byte-for-byte.
    for extra in ("exploration.json", "exploration-import.json"):
        source = output / extra
        if source.exists():
            shutil.copy2(source, stage / extra)
    # The prior build's source metadata and city index are the recovery inputs.
    # The metadata stays outside the stage: finalize renames the whole stage to
    # the output directory, and only corpus assets may ship there.
    metadata_path = stage.parent / (stage.name + "-metadata.json")
    metadata_path.write_text(json.dumps(manifest["pbf"]))
    try:
        subprocess.run(
            [
                sys.executable,
                str(HERE / "finalize-places.py"),
                "--stage",
                str(stage),
                "--metadata",
                str(metadata_path),
                "--cities",
                str(output / "cities.json"),
                "--as-of",
                str(manifest["dataAsOf"]),
                "--output",
                str(output),
            ],
            check=True,
        )
    finally:
        metadata_path.unlink(missing_ok=True)
    realign_exploration(output, gate, rejected_names)
    print(
        json.dumps(
            {
                "attractionGate": dict(gate),
                "rejectedNames": dict(sorted(rejected_names.items())),
                "recordsBefore": len(records),
                "recordsAfter": len(kept_records),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()

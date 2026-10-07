"""Store full snapshots as deterministic gzip, retaining original-byte proofs."""

from pathlib import Path
import gzip, hashlib, json

root = Path(__file__).resolve().parent.parent / "public"
patterns = [
    "places/records/**/*.json",
    "places/indices/**/*.json",
    "places/spatial/**/*.json",
    "transit/routes/**/*.json",
    "stories/texts/**/*.json",
    "stories/index.json",
    "catalog/datasets/**/*.json",
    "catalog/index.json",
    "trains/stations.json",
    "trains/boards/**/*.json",
]
paths = set()
for pattern in patterns:
    paths.update(root.glob(pattern))
    paths.update(Path(str(p)[:-3]) for p in root.glob(pattern + ".gz"))
items = []
for path in sorted(paths):
    stored = Path(str(path) + ".gz")
    if path.exists():
        raw = path.read_bytes()
        encoded = gzip.compress(raw, compresslevel=6, mtime=0)
        assert gzip.decompress(encoded) == raw
        stored.write_bytes(encoded)
        path.unlink()
    else:
        encoded = stored.read_bytes()
        raw = gzip.decompress(encoded)
    items.append(
        {
            "path": "/" + str(path.relative_to(root)),
            "file": "/" + str(stored.relative_to(root)),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "storedBytes": len(encoded),
            "storedSha256": hashlib.sha256(encoded).hexdigest(),
        }
    )
manifest = {
    "schema": "aflivra-snapshot-transport-v1",
    "encoding": "gzip",
    "originalBytes": sum(x["bytes"] for x in items),
    "storedBytes": sum(x["storedBytes"] for x in items),
    "items": items,
}
(root / "data/snapshot-transport.json").write_text(
    json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
)
print(
    json.dumps(
        {
            "snapshots": len(items),
            "originalBytes": manifest["originalBytes"],
            "storedBytes": manifest["storedBytes"],
        }
    ),
    flush=True,
)

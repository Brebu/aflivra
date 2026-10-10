#!/usr/bin/env python3
"""pdftotext -bbox-layout XML → JSON with per-page word boxes (std-lib only).

The LMI importer feeds this to scripts/lib/lmi-rows.mjs, which assembles rows from
the printed grid's own geometry. Kept in Python for the std-lib XML parser; no
network, no third-party packages.
"""

import json
import sys
import xml.etree.ElementTree as ET

NS = "{http://www.w3.org/1999/xhtml}"


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else "-"
    data = open(source, "rb").read() if source != "-" else sys.stdin.buffer.read()
    root = ET.fromstring(data)
    pages = []
    for index, page in enumerate(root.iter(NS + "page"), start=1):
        words = [
            {
                "text": word.text or "",
                "xMin": float(word.get("xMin") or 0),
                "xMax": float(word.get("xMax") or 0),
                "yMin": float(word.get("yMin") or 0),
                "yMax": float(word.get("yMax") or 0),
            }
            for word in page.iter(NS + "word")
        ]
        width = float(page.get("width") or 0)
        pages.append(
            {
                "pdfPage": index,
                "width": width or None,
                "words": words,
            }
        )
    json.dump({"pages": pages}, sys.stdout, ensure_ascii=False)


main()

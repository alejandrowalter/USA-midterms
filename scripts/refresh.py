#!/usr/bin/env python3
"""Actualiza data/page.json (Polymarket) y data/results.json (NYT/AP).

Si una fuente falla, no borra el archivo anterior. Sale con error solo cuando
Polymarket no pudo armar el control del Senado y de la Cámara.
"""
from __future__ import annotations

import json
import sys
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from nyt_results import build_results  # noqa: E402
from polymarket_lib import (  # noqa: E402
    all_tokens,
    build_page,
    discover,
    midpoints,
)


def atomic_write(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return "".join(c for c in s.lower() if c.isalpha() or c.isspace()).split()


def align_parties(page: dict, results: dict) -> None:
    """Si Polymarket no marca el partido, usa el candidato homónimo del NYT."""
    races = (results or {}).get("races") or {}
    for group in ("senate", "governor", "house"):
        for race in page.get(group) or []:
            nyt = races.get(race["key"])
            if not nyt:
                continue
            for cand in race["candidates"]:
                if cand["party"] in ("D", "R"):
                    continue
                parts = norm(cand["name"])
                if len(parts) < 2:
                    continue
                last, first = parts[-1], parts[0]
                hits = []
                for nc in nyt["candidates"]:
                    np = norm(nc["name"])
                    if len(np) >= 2 and np[-1] == last and (np[0] == first or np[0].startswith(first) or first.startswith(np[0])):
                        hits.append(nc)
                if len(hits) == 1 and hits[0]["party"] in ("D", "R", "I"):
                    cand["party"] = hits[0]["party"]


def reconcile_keys(page: dict, results: dict) -> None:
    nyt_keys = set((results or {}).get("races") or {})
    for group in ("senate", "governor", "house"):
        merged: dict[str, dict] = {}
        for race in page.get(group) or []:
            key = race["key"]
            if key not in nyt_keys and key.endswith(":special"):
                base = key[: -len(":special")]
                if base in nyt_keys or base not in {r["key"] for r in page[group]}:
                    key = base
            race["key"] = key
            prev = merged.get(key)
            if prev is None or (race.get("volume") or 0) > (prev.get("volume") or 0):
                merged[key] = race
        page[group] = [merged[k] for k in sorted(merged)]


def main() -> int:
    sources = json.loads((ROOT / "sources.json").read_text(encoding="utf-8"))
    now = datetime.now(ZoneInfo("America/Bogota"))
    as_iso = now.isoformat(timespec="seconds")
    as_bta = now.strftime("%Y-%m-%d %H:%M")
    print(f"hora Bogotá {as_bta}")

    found = discover(sources)
    print(
        f"eventos: senado {len(found['senate'])}, gob {len(found['governor'])}, "
        f"cámara {len(found['house'])}, control {len(found['top'])}, faltan {found['missing']}"
    )
    if len(found["senate"]) < 20 or len(found["governor"]) < 20 or len(found["house"]) < 50:
        print("Polymarket devolvió demasiado pocos eventos; no reescribo page.json", file=sys.stderr)
        return 1
    toks = all_tokens(found)
    print(f"pidiendo {len(toks)} midpoints…")
    tokmap = midpoints(found["clob"], toks)
    print(f"midpoints {len(tokmap)}")
    page = build_page(found, tokmap, as_iso, as_bta)

    results = None
    try:
        results = build_results(sources, as_iso, as_bta)
        reconcile_keys(page, results)
        align_parties(page, results)
        print(
            f"NYT: senado {sum(1 for k in results['races'] if k.startswith('senate:'))}, "
            f"gob {sum(1 for k in results['races'] if k.startswith('gov:'))}, "
            f"cámara {sum(1 for k in results['races'] if k.startswith('house:'))}, "
            f"llamados S {results['senate']['called']} H {results['house']['called']}"
        )
    except Exception as e:  # noqa: BLE001 — conservar el JSON anterior
        print(f"NYT no disponible, se conserva data/results.json: {e}", file=sys.stderr)

    atomic_write(ROOT / "data" / "page.json", page)
    if results and results.get("ok"):
        atomic_write(ROOT / "data" / "results.json", results)
    sen = page["control"]["senate"]["outcomes"]
    hou = page["control"]["house"]["outcomes"]
    print("senado", [(o["label"], o["price"]) for o in sen])
    print("cámara", [(o["label"], o["price"]) for o in hou])
    print(f"carreras PM: sen {len(page['senate'])} gob {len(page['governor'])} house {len(page['house'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

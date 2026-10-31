#!/usr/bin/env python3
"""Descubre mercados de Polymarket (Gamma) y precios del libro (CLOB)."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request

AT_LARGE = {"AK", "DE", "ND", "SD", "VT", "WY"}
# Nombres sin marca de partido en el mercado (Alaska top-four, California top-two).
# Solo se usa si el texto del mercado no trae (D)/(R) y el feed del NYT tampoco coincide.
PARTY_OVERRIDE = {
    "Xavier Becerra": "D",
    "Steve Hilton": "R",
    "Mary Peltola": "D",
    "Dan Sullivan": "R",
    "Sen. Dan Sullivan": "R",
    "Jonathan Kreiss-Tomkins": "D",
    "Bernadette Wilson": "R",
}
STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO", "Montana": "MT",
    "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
LABELS = {
    "Democratic Party": "Demócratas",
    "Republican Party": "Republicanos",
    "Democrats Sweep": "Barrida demócrata",
    "Republicans Sweep": "Barrida republicana",
    "R Senate, D House": "Senado R · Cámara D",
    "D Senate, R House": "Senado D · Cámara R",
    "Other": "Otro",
}
UA = {"User-Agent": "usa-midterms-tracker/1.0", "Accept": "application/json"}


def get_json(url: str, data=None, timeout: int = 30, tries: int = 3):
    body = json.dumps(data).encode() if data is not None else None
    headers = dict(UA)
    if body is not None:
        headers["Content-Type"] = "application/json"
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            if i == tries - 1:
                break
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"{url.split('?')[0]}: {last}")


def events_by_tag(gamma: str, tag: str) -> list[dict]:
    out, off, seen = [], 0, set()
    while off <= 5000:
        page = get_json(f"{gamma}/events?tag_slug={tag}&closed=false&limit=100&offset={off}")
        if not isinstance(page, list) or not page:
            break
        fresh = [e for e in page if e.get("slug") not in seen]
        for e in fresh:
            seen.add(e.get("slug"))
        out.extend(fresh)
        if len(page) < 100 or not fresh:
            break
        off += 100
    return out


def event_by_slug(gamma: str, slug: str) -> dict | None:
    d = get_json(f"{gamma}/events?slug={slug}")
    return d[0] if isinstance(d, list) and d else None


def tok0(m: dict) -> str | None:
    try:
        ids = json.loads(m.get("clobTokenIds") or "[]")
        return ids[0] if ids else None
    except (ValueError, IndexError, TypeError):
        return None


def gamma_price(m: dict) -> float | None:
    try:
        return float(json.loads(m.get("outcomePrices") or "[]")[0])
    except (ValueError, IndexError, TypeError):
        return None


def live_markets(ev: dict) -> list[dict]:
    rows = []
    for m in ev.get("markets") or []:
        if m.get("closed") or not m.get("active"):
            continue
        title = m.get("groupItemTitle") or ""
        if re.match(r"^Party [A-F]$", title):
            continue
        if not tok0(m) or gamma_price(m) is None:
            continue
        rows.append(m)
    return rows


def party_of(m: dict) -> str:
    g = m.get("groupItemTitle") or ""
    q = m.get("question") or ""
    blob = f"{g} {q}"
    if re.search(r"\(D\)", g) or re.search(r"democrat", blob, re.I):
        return "D"
    if re.search(r"\(R\)", g) or re.search(r"republican", blob, re.I):
        return "R"
    if re.search(r"\(I\)", g) or re.search(r"independent", blob, re.I):
        return "I"
    name = clean_name(g or q)
    return PARTY_OVERRIDE.get(name) or PARTY_OVERRIDE.get(g.strip()) or "O"


def clean_name(s: str) -> str:
    s = re.sub(r"\s*\((D|R|I|Ind\.?)\)\s*$", "", (s or "").strip(), flags=re.I)
    s = re.sub(r"^(Sen\.|Rep\.|Gov\.)\s+", "", s)
    return s.strip()


def display_label(raw: str) -> str:
    raw = (raw or "").strip()
    if raw in LABELS:
        return LABELS[raw]
    name = clean_name(raw)
    return LABELS.get(name, name or raw)


def is_2026(ev: dict) -> bool:
    end = ev.get("endDate") or ""
    if end and end < "2026-01-01":
        return False
    blob = f"{ev.get('slug') or ''} {ev.get('title') or ''}"
    if re.search(r"\b2024\b|\b2025\b|\b2028\b", blob) and "2026" not in blob:
        return False
    low = blob.lower()
    if any(w in low for w in ("lieutenant", "primary", "county", "mayor")):
        return False
    return True


def state_from_title(title: str) -> str | None:
    for name, code in sorted(STATES.items(), key=lambda kv: -len(kv[0])):
        if title.startswith(name + " ") or title.startswith(name + "’s"):
            return code
    return None


def extract_district(ev: dict) -> str | None:
    title = ev.get("title") or ""
    slug = ev.get("slug") or ""
    m = re.search(r"\b([A-Za-z]{2})-(\d{1,2}|AL)\b", title)
    if not m:
        m = re.search(r"(?:^|-)([a-z]{2})-(\d{1,2}|al)-(?:house|seat)", slug)
    if not m:
        m = re.search(r"for-the-([a-z]{2})-(\d{1,2}|al)-seat", slug)
    if not m:
        return None
    st, dist = m.group(1).upper(), m.group(2).upper()
    if st not in STATES.values():
        return None
    if dist != "AL":
        n = int(dist)
        dist = "AL" if st in AT_LARGE else f"{n:02d}"
    elif st not in AT_LARGE and dist == "AL":
        return None
    return f"{st}-{dist}"


def senate_key(ev: dict) -> str | None:
    st = state_from_title(ev.get("title") or "")
    if not st:
        return None
    blob = f"{ev.get('slug') or ''} {ev.get('title') or ''}".lower()
    if "special" in blob:
        return f"senate:{st}:special"
    return f"senate:{st}"


def gov_key(ev: dict) -> str | None:
    st = state_from_title(ev.get("title") or "")
    return f"gov:{st}" if st else None


def is_senate_event(ev: dict) -> bool:
    slug = ev.get("slug") or ""
    if "county" in slug or not is_2026(ev):
        return False
    return bool(re.search(r"senate-election-winner(-\d+)?$", slug))


def is_gov_event(ev: dict) -> bool:
    slug = ev.get("slug") or ""
    if not is_2026(ev) or slug.startswith("guam"):
        return False
    return bool(
        re.search(r"governor-(election-)?(winner-2026|2026)$", slug)
        or slug.endswith("governor-election-winner")
        or re.search(r"governor-election-winner(-\d+)?$", slug)
    )


def is_house_event(ev: dict) -> bool:
    slug = ev.get("slug") or ""
    if not is_2026(ev):
        return False
    return "house-election-winner" in slug or "house-race-for-the" in slug


def summarize_candidates(ev: dict, tokmap: dict) -> list[dict]:
    rows = []
    for m in live_markets(ev):
        token = tok0(m)
        raw = tokmap.get(token) if token else None
        try:
            price = float(raw) if raw is not None else gamma_price(m)
        except (TypeError, ValueError):
            price = gamma_price(m)
        if price is None:
            continue
        label_raw = m.get("groupItemTitle") or m.get("question") or ""
        rows.append({
            "name": display_label(label_raw),
            "party": party_of(m),
            "price": round(price, 4),
            "token": token,
        })
    # un candidato por token
    dedup = {}
    for row in rows:
        dedup[row["token"] or row["name"]] = row
    rows = list(dedup.values())
    rows.sort(key=lambda r: -r["price"])
    # conserva D, R y quien tenga al menos 2%; tope 6
    kept = []
    seen_party_best = set()
    for row in rows:
        if row["price"] >= 0.02 or row["party"] in ("D", "R") and row["party"] not in seen_party_best:
            kept.append(row)
            if row["party"] in ("D", "R"):
                seen_party_best.add(row["party"])
        if len(kept) >= 6:
            break
    if not kept:
        kept = rows[:4]
    return kept


def race_record(ev: dict, key: str, office: str, tokmap: dict, district: str | None = None) -> dict:
    st = key.split(":")[1][:2]
    return {
        "key": key,
        "office": office,
        "state": st,
        "district": district,
        "name": district or STATES_REV.get(st, st),
        "slug": ev.get("slug"),
        "url": f"https://polymarket.com/event/{ev['slug']}",
        "volume": int(round(float(ev.get("volume") or 0))),
        "candidates": summarize_candidates(ev, tokmap),
    }


STATES_REV = {v: k for k, v in STATES.items()}


def control_record(ev: dict, tokmap: dict) -> dict:
    outcomes = []
    for m in live_markets(ev):
        token = tok0(m)
        raw = tokmap.get(token) if token else None
        try:
            price = float(raw) if raw is not None else gamma_price(m)
        except (TypeError, ValueError):
            price = gamma_price(m)
        if price is None:
            continue
        label_raw = m.get("groupItemTitle") or ""
        outcomes.append({
            "label": display_label(label_raw),
            "label_en": label_raw,
            "party": party_of(m) if party_of(m) != "O" or "democrat" in label_raw.lower() or "republican" in label_raw.lower() else (
                "D" if "democrat" in label_raw.lower() else "R" if "republican" in label_raw.lower() else "O"
            ),
            "price": round(float(price), 4),
            "token": token,
        })
    outcomes.sort(key=lambda o: -o["price"])
    return {
        "slug": ev.get("slug"),
        "title": ev.get("title"),
        "url": f"https://polymarket.com/event/{ev['slug']}",
        "volume": int(round(float(ev.get("volume") or 0))),
        "outcomes": outcomes,
    }


def choose(prev: dict | None, new: dict) -> dict:
    if prev is None:
        return new
    def score(r):
        parties = {c["party"] for c in r["candidates"]}
        both = 1 if "D" in parties and "R" in parties else 0
        return (both, r.get("volume") or 0)
    return new if score(new) >= score(prev) else prev


def midpoints(clob: str, token_ids: list[str]) -> dict:
    res = {}
    ids = [t for t in dict.fromkeys(token_ids) if t]
    for i in range(0, len(ids), 80):
        chunk = ids[i:i + 80]
        try:
            got = get_json(f"{clob}/midpoints", [{"token_id": t} for t in chunk], timeout=40)
            if isinstance(got, dict):
                res.update(got)
        except RuntimeError as e:
            print("midpoints parcial", e)
    return res


def discover(sources: dict) -> dict:
    gamma = sources["polymarket"]["gamma"]
    clob = sources["polymarket"]["clob"]
    senate_ev = [e for e in events_by_tag(gamma, "senate-midterms") if is_senate_event(e)]
    gov_ev = [e for e in events_by_tag(gamma, "governor-midterms") if is_gov_event(e)]
    house_ev = [e for e in events_by_tag(gamma, "house-elections") if is_house_event(e)]
    top = []
    missing = []
    for slug in sources.get("control_slugs") or []:
        ev = event_by_slug(gamma, slug)
        if ev:
            top.append(ev)
        else:
            missing.append(slug)
    return {
        "senate": senate_ev,
        "governor": gov_ev,
        "house": house_ev,
        "top": top,
        "missing": missing,
        "clob": clob,
    }


CONTROL_KEYS = {
    "which-party-will-win-the-senate-in-2026": "senate",
    "which-party-will-win-the-house-in-2026": "house",
    "balance-of-power-2026-midterms": "balance",
    "republican-senate-seats-after-the-2026-midterm-elections-927": "senate_seats",
    "republican-house-seats-after-the-2026-midterm-elections": "house_seats",
}


def build_page(found: dict, tokmap: dict, as_of_iso: str, as_of_bogota: str) -> dict:
    senate: dict[str, dict] = {}
    for ev in found["senate"]:
        key = senate_key(ev)
        if not key:
            continue
        senate[key] = choose(senate.get(key), race_record(ev, key, "senate", tokmap))
    gov: dict[str, dict] = {}
    for ev in found["governor"]:
        key = gov_key(ev)
        if not key:
            continue
        gov[key] = choose(gov.get(key), race_record(ev, key, "governor", tokmap))
    house: dict[str, dict] = {}
    for ev in found["house"]:
        dist = extract_district(ev)
        if not dist:
            continue
        key = f"house:{dist}"
        house[key] = choose(house.get(key), race_record(ev, key, "house", tokmap, district=dist))
    by_slug = {e["slug"]: control_record(e, tokmap) for e in found["top"]}
    control = {}
    for slug, key in CONTROL_KEYS.items():
        if slug in by_slug:
            control[key] = by_slug[slug]
    if "senate" not in control or "house" not in control:
        raise RuntimeError(f"Faltan mercados de control: {sorted(control)}")
    return {
        "as_of_iso": as_of_iso,
        "as_of_bogota": as_of_bogota,
        "source": "gamma-api.polymarket.com + clob.polymarket.com",
        "missing_slugs": found["missing"],
        "control_slugs": [slug for slug in CONTROL_KEYS if slug in by_slug],
        "control": control,
        "senate": [senate[k] for k in sorted(senate)],
        "governor": [gov[k] for k in sorted(gov)],
        "house": [house[k] for k in sorted(house)],
    }


def all_tokens(found: dict) -> list[str]:
    toks = []
    for group in ("top", "senate", "governor", "house"):
        for ev in found[group]:
            for m in live_markets(ev):
                t = tok0(m)
                if t:
                    toks.append(t)
    return toks

#!/usr/bin/env python3
"""Normaliza los JSON públicos de resultados del New York Times (fuente AP).

No inventa cifras: si el feed trae 0 votos, el estado queda en «sin_votos».
"""
from __future__ import annotations

import json
import urllib.request
from collections import defaultdict

AT_LARGE = {"AK", "DE", "ND", "SD", "VT", "WY"}
PARTY = {"DEM": "D", "GOP": "R", "REP": "R"}
COMPETITIVE = {"tossup", "lean-dem", "lean-rep", "likely-dem", "likely-rep"}
UA = {"User-Agent": "usa-midterms-tracker/1.0", "Accept": "application/json", "Accept-Encoding": "identity"}


def party_code(nyt_id: str | None) -> str:
    if not nyt_id:
        return "O"
    return PARTY.get(nyt_id, "O")


def state_of(nyt_id: str) -> str:
    return (nyt_id or "").split("-")[0]


def house_code(race: dict) -> str | None:
    nyt_id = race.get("nyt_id") or ""
    parts = nyt_id.split("-")
    st = parts[0] if parts else ""
    if st in ("", "US"):
        return None
    dist = None
    if "H" in parts:
        i = parts.index("H")
        if i + 1 < len(parts) and parts[i + 1].isdigit():
            dist = int(parts[i + 1])
    if dist is None:
        sn = race.get("seat_number")
        dist = int(sn) if str(sn or "").isdigit() else None
    if dist is None:
        return None
    if st in AT_LARGE:
        return f"{st}-AL"
    return f"{st}-{dist:02d}"


def assign_keys(races: list[dict], office: str) -> list[tuple[str, dict]]:
    """Una carrera por estado en Senado y gobernaciones. Cámara: ST-NN o ST-AL."""
    if office == "house":
        out = []
        for race in races:
            code = house_code(race)
            if code:
                out.append((f"house:{code}", race))
        return out
    prefix = "senate" if office == "senate" else "gov"
    by_state: dict[str, list[dict]] = defaultdict(list)
    for race in races:
        st = state_of(race.get("nyt_id") or "")
        if st and st != "US":
            by_state[st].append(race)
    out = []
    for st, group in by_state.items():
        if len(group) == 1:
            out.append((f"{prefix}:{st}", group[0]))
            continue
        for race in group:
            nyt_id = race.get("nyt_id") or ""
            special = "S_W" in nyt_id or "special" in nyt_id.lower()
            key = f"{prefix}:{st}:special" if special else f"{prefix}:{st}"
            # si choca la clave, agrega el seat
            if any(k == key for k, _ in out):
                seat = race.get("seat_number") or "x"
                key = f"{key}:{seat}"
            out.append((key, race))
    return out


def _cand_name(meta: dict) -> str:
    first = (meta.get("first_name") or "").strip()
    last = (meta.get("last_name") or "").strip()
    name = f"{first} {last}".strip()
    return name or last or first or meta.get("nyt_id") or ""


def _is_writein(name: str) -> bool:
    n = name.lower()
    return "write-in" in n or "write ins" in n or n.startswith("total write")


def slim_race(key: str, race: dict) -> dict:
    meta = race.get("candidate_metadata") or {}
    top = race.get("top_reporting_unit") or {}
    vote_by_id = {}
    leader_ids = set()
    for c in top.get("candidates") or []:
        cid = c.get("nyt_id")
        votes = c.get("votes") or {}
        total = votes.get("total")
        vote_by_id[cid] = int(total) if isinstance(total, (int, float)) else 0
        if c.get("leader"):
            leader_ids.add(cid)
    total_votes = int(top.get("total_votes") or 0)
    outcome = race.get("outcome") or {}
    won_ids = set(outcome.get("won") or [])
    runoff_ids = set(outcome.get("advanced_to_runoff") or [])
    call = race.get("race_call_status")
    candidates = []
    for cid, m in meta.items():
        name = _cand_name(m)
        votes = vote_by_id.get(cid, 0)
        if _is_writein(name) and votes <= 0 and cid not in won_ids:
            continue
        party = party_code((m.get("party") or {}).get("nyt_id"))
        candidates.append({
            "id": cid,
            "name": name,
            "party": party,
            "incumbent": bool(m.get("incumbent")),
            "votes": votes,
            "leader": cid in leader_ids,
            "winner": cid in won_ids,
            "runoff": cid in runoff_ids,
        })
    candidates.sort(key=lambda c: (-c["votes"], -int(c["winner"]), c["name"]))
    # fuera de la noche electoral el orden por 0 votos es alfabético; el cliente reordena con Polymarket
    eevp = top.get("eevp")
    eevp_n = float(eevp) if isinstance(eevp, (int, float)) else 0.0
    winner = next((c["name"] for c in candidates if c["winner"]), None)
    winner_party = next((c["party"] for c in candidates if c["winner"]), None)
    if winner:
        status = "llamado"
    elif call in ("projected", "apparent", "likely_projected", "winner_projected"):
        status = "proyectado"
    elif runoff_ids:
        status = "segunda_vuelta"
    elif total_votes > 0 or eevp_n > 0:
        status = "contando"
    else:
        status = "sin_votos"
    return {
        "key": key,
        "nyt_id": race.get("nyt_id"),
        "rating": race.get("general_rating") or race.get("rating"),
        "call_status": call,
        "status": status,
        "certified": bool(race.get("certified")),
        "eevp": round(eevp_n, 2),
        "total_votes": total_votes,
        "expected_votes": int(top.get("total_expected_vote") or 0),
        "precincts_reporting": int(top.get("precincts_reporting") or 0),
        "precincts_total": int(top.get("precincts_total") or 0),
        "updated_at": race.get("updated_at") or top.get("provider_updated_at"),
        "winner": winner,
        "winner_party": winner_party,
        "called_by": list(outcome.get("called_by") or []),
        "candidates": candidates,
    }


def _party_block(block: dict | None) -> dict:
    out = {}
    for src, dst in (("DEM", "D"), ("GOP", "R"), ("OTH", "O")):
        b = (block or {}).get(src) or {}
        out[dst] = int(b.get("seats") or 0) if isinstance(b, dict) else int(b or 0)
    return out


def slim_control(payload: dict, office_id: str) -> dict | None:
    results = (payload.get("partyControlData") or {}).get("results") or []
    if not results:
        return None
    offices = (results[0].get("offices") or {})
    office = offices.get(office_id)
    if not office:
        return None
    balance = office.get("party_balance") or {}
    seats = {}
    not_up = {}
    for src, dst in (("DEM", "D"), ("GOP", "R"), ("OTH", "O")):
        b = balance.get(src) or {}
        seats[dst] = int(b.get("seats") or 0)
        not_up[dst] = int(b.get("no_election") or 0)
    before_raw = office.get("current_control") or {}
    before = {
        "D": int(before_raw.get("DEM") or 0),
        "R": int(before_raw.get("GOP") or 0),
        "O": int(before_raw.get("OTH") or 0),
    }
    to_win_raw = office.get("to_win") or {}
    winner = None
    for src, dst in (("DEM", "D"), ("GOP", "R"), ("OTH", "O")):
        if (balance.get(src) or {}).get("winner"):
            winner = dst
    meta = payload.get("resultsMeta") or {}
    return {
        "total": int(office.get("total") or 0),
        "open_seats": int(office.get("open_seats") or 0),
        "not_on_ballot": int(office.get("no_election_seats") or 0),
        "called": int(office.get("num_races_called") or 0),
        "reporting": bool(office.get("is_reporting")),
        "to_win": {
            "D": int(to_win_raw.get("DEM") or 0),
            "R": int(to_win_raw.get("GOP") or 0),
            "O": int(to_win_raw.get("OTH") or 0),
        },
        "seats": seats,
        "not_up": not_up,
        "before": before,
        "winner": winner,
        "updated_at": meta.get("resultsUpdatedAt"),
    }


def house_by_state(slim_races: dict) -> dict:
    tally: dict[str, dict] = {}
    for key, race in slim_races.items():
        if not key.startswith("house:"):
            continue
        code = key.split(":", 1)[1]
        st = code[:2]
        rating = race.get("rating") or "none"
        row = tally.setdefault(st, {})
        row[rating] = row.get(rating, 0) + 1
    return dict(sorted(tally.items()))


def slim_payload(payload: dict, office: str) -> dict:
    office_id = {"senate": "S", "house": "H", "governor": "G"}[office]
    races = {}
    for key, race in assign_keys(payload.get("races") or [], office):
        races[key] = slim_race(key, race)
    return {"control": slim_control(payload, office_id), "races": races}


def get_json(url: str, timeout: int = 60, tries: int = 3):
    import time
    import urllib.error
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            if i == tries - 1:
                break
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def build_results(sources: dict, fetched_at_iso: str, fetched_at_bogota: str) -> dict:
    urls = sources["nyt"]
    senate = slim_payload(get_json(urls["senate"]), "senate")
    house = slim_payload(get_json(urls["house"], timeout=90), "house")
    gov = slim_payload(get_json(urls["governor"]), "governor")
    races = {}
    races.update(senate["races"])
    races.update(gov["races"])
    races.update(house["races"])
    if len(senate["races"]) < 30 or len(gov["races"]) < 30 or len(house["races"]) < 400:
        raise RuntimeError(
            f"Feed NYT incompleto: senado {len(senate['races'])}, "
            f"gob {len(gov['races'])}, cámara {len(house['races'])}"
        )
    return {
        "ok": True,
        "error": None,
        "source": "The New York Times (resultados compilados con The Associated Press)",
        "source_urls": urls,
        "fetched_at_iso": fetched_at_iso,
        "fetched_at_bogota": fetched_at_bogota,
        "senate": senate["control"],
        "house": house["control"],
        "races": races,
        "house_by_state": house_by_state(house["races"]),
    }

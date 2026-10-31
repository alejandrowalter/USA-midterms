#!/usr/bin/env python3
"""Pruebas sin red del normalizador NYT y del descubridor de Polymarket."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nyt_results import assign_keys, house_code, slim_control, slim_race  # noqa: E402
from polymarket_lib import extract_district, is_gov_event, is_senate_event, party_of, senate_key  # noqa: E402


def race(**kwargs):
    base = {
        "nyt_id": "AL-G-S-2026-11-03",
        "office_id": "S",
        "general_rating": "solid-rep",
        "rating": "solid-rep",
        "race_call_status": "too_early",
        "certified": False,
        "seat_number": "2",
        "updated_at": "2026-10-22T17:50:17.827Z",
        "outcome": {"won": [], "advanced_to_runoff": [], "called_by": []},
        "candidate_metadata": {
            "wess-e": {
                "nyt_id": "wess-e", "first_name": "Everett", "last_name": "Wess",
                "incumbent": False, "party": {"nyt_id": "DEM"},
            },
            "moore-b": {
                "nyt_id": "moore-b", "first_name": "Barry", "last_name": "Moore",
                "incumbent": False, "party": {"nyt_id": "GOP"},
            },
        },
        "top_reporting_unit": {
            "eevp": 0, "total_votes": 0, "total_expected_vote": 1768687,
            "precincts_reporting": 0, "precincts_total": 2028,
            "candidates": [
                {"nyt_id": "wess-e", "votes": {"total": 0}, "leader": False},
                {"nyt_id": "moore-b", "votes": {"total": 0}, "leader": False},
            ],
        },
    }
    base.update(kwargs)
    return base


class NytTests(unittest.TestCase):
    def test_zero_votes_are_not_a_result(self):
        slim = slim_race("senate:AL", race())
        self.assertEqual(slim["status"], "sin_votos")
        self.assertIsNone(slim["winner"])
        self.assertEqual(slim["eevp"], 0)
        self.assertEqual(slim["total_votes"], 0)
        names = {c["name"]: c["party"] for c in slim["candidates"]}
        self.assertEqual(names["Barry Moore"], "R")
        self.assertEqual(names["Everett Wess"], "D")

    def test_called_race_uses_real_vote_totals(self):
        # Cifras reales del Senado de Arizona 2024, solo para probar el parser.
        slim = slim_race("senate:AZ", race(
            nyt_id="AZ-G-S-2024-11-05",
            race_call_status=None,
            outcome={"won": ["gallego-r"], "advanced_to_runoff": [], "called_by": ["ap"]},
            candidate_metadata={
                "gallego-r": {"nyt_id": "gallego-r", "first_name": "Ruben", "last_name": "Gallego",
                              "incumbent": False, "party": {"nyt_id": "DEM"}},
                "lake-k": {"nyt_id": "lake-k", "first_name": "Kari", "last_name": "Lake",
                           "incumbent": False, "party": {"nyt_id": "GOP"}},
            },
            top_reporting_unit={
                "eevp": 100, "total_votes": 3347964, "total_expected_vote": 3347964,
                "precincts_reporting": 1736, "precincts_total": 1736,
                "candidates": [
                    {"nyt_id": "gallego-r", "votes": {"total": 1676335}, "leader": True},
                    {"nyt_id": "lake-k", "votes": {"total": 1595761}, "leader": False},
                ],
            },
        ))
        self.assertEqual(slim["status"], "llamado")
        self.assertEqual(slim["winner"], "Ruben Gallego")
        self.assertEqual(slim["winner_party"], "D")
        self.assertEqual(slim["candidates"][0]["votes"], 1676335)
        self.assertAlmostEqual(1676335 / 3347964 * 100, 50.07, places=2)

    def test_keys(self):
        senate = assign_keys([
            race(nyt_id="FL-S_W-S-2026-11-03"),
            race(nyt_id="OH-S_W-S-2026-11-03"),
            race(),
        ], "senate")
        keys = dict(senate)
        self.assertIn("senate:FL", keys)
        self.assertIn("senate:OH", keys)
        self.assertIn("senate:AL", keys)
        house = assign_keys([
            {"nyt_id": "PA-G-H-1-2026-11-03", "seat_number": "1"},
            {"nyt_id": "AK-G-H-1-2026-11-03", "seat_number": "1"},
            {"nyt_id": "US-G-H-2026-11-03", "seat_number": "1"},
            {"nyt_id": "CA-G-H-22-2026-11-03", "seat_number": "22"},
        ], "house")
        hkeys = [k for k, _ in house]
        self.assertEqual(hkeys, ["house:PA-01", "house:AK-AL", "house:CA-22"])
        self.assertEqual(house_code({"nyt_id": "TX-G-H-15-2026-11-03"}), "TX-15")

    def test_control_block(self):
        payload = {"partyControlData": {"results": [{"offices": {"S": {
            "total": 100, "open_seats": 35, "no_election_seats": 65,
            "num_races_called": 0, "is_reporting": False,
            "to_win": {"DEM": 51, "GOP": 50, "OTH": 51},
            "party_balance": {
                "DEM": {"seats": 34, "no_election": 34, "winner": False},
                "GOP": {"seats": 31, "no_election": 31, "winner": False},
                "OTH": {"seats": 0, "no_election": 0, "winner": False},
            },
            "current_control": {"DEM": 45, "GOP": 57, "OTH": 2},
        }}}]}, "resultsMeta": {"resultsUpdatedAt": "2026-10-27T17:14:12.323Z"}}
        ctrl = slim_control(payload, "S")
        self.assertEqual(ctrl["seats"], {"D": 34, "R": 31, "O": 0})
        self.assertEqual(ctrl["not_up"], {"D": 34, "R": 31, "O": 0})
        self.assertEqual(ctrl["to_win"]["R"], 50)
        self.assertEqual(ctrl["called"], 0)
        self.assertEqual(ctrl["before"]["D"] + ctrl["before"]["R"] + ctrl["before"]["O"], 104)


class PolymarketTests(unittest.TestCase):
    def test_filters_and_districts(self):
        self.assertTrue(is_senate_event({"slug": "kansas-senate-election-winner", "title": "Kansas Senate", "endDate": "2026-11-04T00:00:00Z"}))
        self.assertFalse(is_senate_event({"slug": "kansas-senate-county-winner", "title": "Kansas", "endDate": "2026-11-04T00:00:00Z"}))
        self.assertTrue(is_gov_event({"slug": "georgia-governor-winner-2026", "title": "Georgia Governor", "endDate": "2026-11-04T00:00:00Z"}))
        self.assertFalse(is_gov_event({"slug": "guam-governor-winner-2026", "title": "Guam Governor", "endDate": "2026-11-04T00:00:00Z"}))
        ev = {"title": "WI-01 House Election Winner", "slug": "wi-01-house-election-winner"}
        self.assertEqual(extract_district(ev), "WI-01")
        ev2 = {"title": "House", "slug": "which-party-will-win-the-house-race-for-the-ca-22-seat"}
        self.assertEqual(extract_district(ev2), "CA-22")
        ev3 = {"title": "AK-AL House Election Winner", "slug": "ak-al-house-election-winner"}
        self.assertEqual(extract_district(ev3), "AK-AL")
        self.assertEqual(senate_key({"title": "Maine Senate Election Winner", "slug": "maine-senate-election-winner"}), "senate:ME")
        m = {"groupItemTitle": "Adam Hamilton (D)", "question": "Will Adam Hamilton win?"}
        self.assertEqual(party_of(m), "D")
        m2 = {"groupItemTitle": "Mary Peltola", "question": "Will Mary Peltola win the Alaska senate election?"}
        self.assertEqual(party_of(m2), "D")


if __name__ == "__main__":
    unittest.main()

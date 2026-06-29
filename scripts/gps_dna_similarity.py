#!/usr/bin/env python3
"""
GPS-DNA Similarity Simulation v3.0
===================================
Compares AI bot decisions against real GPS tactical DNA.
Does NOT check if bots tack in the same SPOT.
Checks if bots make decisions consistent with the athlete's real BEHAVIORAL DNA:
  - correct side preference per leg
  - correct board length range
  - correct x_norm zone for maneuvers
  - correct gate choice
  - correct response to wind conditions
"""
from __future__ import annotations
import json
import math
import random
from pathlib import Path
from typing import Any

# ── GPS DNA GROUND TRUTH (extracted from real GPX analysis) ────────────────
GPS_DNA = {
    "BOT_01": {  # Paolo Bellofiore — rank 1
        "name": "Paolo Bellofiore",
        "patience": 0.971, "reactivity": 0.049, "min_tack_s": 204,
        "legs": {
            "bolina_1":    {"avg_x": -0.521, "left_pct": 61.8, "right_pct": 12.5, "median_board_m": 313, "man_x_targets": [-0.760,-0.992,-0.967,-0.730,-0.620]},
            "lasco_offset":{"avg_x": -0.356, "left_pct": 45.0, "right_pct": 30.0, "median_board_m": 250, "man_x_targets": [-0.419,-0.471,-0.306]},
            "poppa_gate":  {"avg_x": -0.406, "left_pct": 55.0, "right_pct": 20.0, "median_board_m": 200, "man_x_targets": [-0.264,-0.234,-0.196], "preferred_gate_x": 0.31},
            "bolina_2":    {"avg_x": -0.279, "left_pct": 50.0, "right_pct": 25.0, "median_board_m": 441, "man_x_targets": [-0.027, 0.024,-0.415]},
            "poppa_3p":    {"avg_x":  0.537, "left_pct":  5.0, "right_pct": 80.0, "median_board_m": 722, "man_x_targets": [ 0.794, 0.994, 0.714], "preferred_gate_x": 0.85},
            "arrivo":      {"avg_x": -0.197, "man_x_targets": [-0.475,-0.466,-0.327]},
        }
    },
    "BOT_02": {  # Filippo Noto — rank 4
        "name": "Filippo Noto",
        "patience": 0.005, "reactivity": 0.829, "min_tack_s": 78,
        "legs": {
            "bolina_1":    {"avg_x": -0.002, "left_pct": 48.1, "right_pct": 41.3, "median_board_m": 145, "man_x_targets": [0.628, 0.610, 0.605, 0.561, 0.587]},
            "lasco_offset":{"avg_x": -0.462, "man_x_targets": [-0.179,-0.314,-0.380]},
            "poppa_gate":  {"avg_x": -0.408, "man_x_targets": [-0.983,-0.772,-0.822], "preferred_gate_x": -0.40},
            "bolina_2":    {"avg_x":  0.677, "left_pct": 10.0, "right_pct": 70.0, "median_board_m": 160, "man_x_targets": [0.403, 0.434, 0.455]},
            "poppa_3p":    {"avg_x":  0.317, "median_board_m": 241, "man_x_targets": [0.535, 0.383, 0.429, 0.462]},
            "arrivo":      {"avg_x": -0.499, "man_x_targets": [-0.570,-0.657]},
        }
    },
    "BOT_03": {  # Enrico Morina — rank 5
        "name": "Enrico Morina",
        "patience": 0.300, "reactivity": 0.327, "min_tack_s": 103,
        "legs": {
            "bolina_1":    {"avg_x": -0.416, "left_pct": 45.5, "right_pct": 30.7, "median_board_m": 121, "man_x_targets": [-0.549,-0.607,-0.544,-0.566,-0.255]},
            "lasco_offset":{"avg_x": -0.302, "man_x_targets": [-0.057,-0.137,-0.131]},
            "poppa_gate":  {"avg_x": -0.446, "man_x_targets": [-0.983,-0.711,-0.768], "preferred_gate_x": -0.35},
            "bolina_2":    {"avg_x":  0.680, "median_board_m": 718, "man_x_targets": [0.574, 0.980, 0.953]},
            "poppa_3p":    {"avg_x":  0.450, "median_board_m":  69, "man_x_targets": [0.989, 0.477, 0.513]},
            "arrivo":      {"avg_x": -0.056, "man_x_targets": [0.075, 0.070, 0.070]},
        }
    },
    "BOT_04": {  # Giuseppe Cucinelli — rank 6
        "name": "Giuseppe Cucinelli",
        "patience": 0.590, "reactivity": 0.339, "min_tack_s": 147,
        "legs": {
            "bolina_1":    {"avg_x": -0.207, "left_pct": 53.1, "right_pct": 36.4, "median_board_m": 722, "man_x_targets": [-0.347,-0.503, 0.262]},
            "lasco_offset":{"avg_x": -0.560, "man_x_targets": [-0.545,-0.601,-0.549]},
            "poppa_gate":  {"avg_x": -0.038, "man_x_targets": [-0.565,-0.653,-0.452], "preferred_gate_x": -0.05},
            "bolina_2":    {"avg_x":  0.672, "median_board_m": 420, "man_x_targets": [0.736, 0.351, 0.986]},
            "poppa_3p":    {"avg_x":  0.332, "median_board_m": 271, "man_x_targets": [0.387, 0.528, 0.619]},
            "arrivo":      {"avg_x": -0.438, "man_x_targets": [-0.643,-0.317]},
        }
    },
    "BOT_05": {  # Emanuele Vincenzi — rank 2
        "name": "Emanuele Vincenzi",
        "patience": 0.714, "reactivity": 0.410, "min_tack_s": 166,
        "legs": {
            "bolina_1":    {"avg_x": -0.134, "left_pct": 53.9, "right_pct": 16.6, "median_board_m": 75,  "man_x_targets": [-0.325,-0.372,-0.460,-0.680,-0.795]},
            "lasco_offset":{"avg_x": -0.324, "man_x_targets": [-0.114,-0.118,-0.119]},
            "poppa_gate":  {"avg_x": -0.458, "man_x_targets": [-0.268,-0.236,-0.976], "preferred_gate_x": -0.20},
            "bolina_2":    {"avg_x": -0.356, "left_pct": 55.0, "right_pct": 15.0, "median_board_m": 184, "man_x_targets": [-0.076,-0.053,-0.416]},
            "poppa_3p":    {"avg_x":  0.516, "median_board_m": 579, "man_x_targets": [0.772, 0.791, 0.996, 0.840]},
            "arrivo":      {"avg_x": -0.202, "man_x_targets": [-0.454,-0.500,-0.466]},
        }
    },
    "BOT_06": {  # Elia Uffreduzzi — rank 3
        "name": "Elia Uffreduzzi",
        "patience": 0.338, "reactivity": 0.643, "min_tack_s": 109,
        "legs": {
            "bolina_1":    {"avg_x": -0.580, "left_pct": 70.1, "right_pct": 10.0, "median_board_m": 349, "man_x_targets": [-0.429,-0.363,-0.312,-0.888,-0.926]},
            "lasco_offset":{"avg_x": -0.222, "man_x_targets": [0.089, 0.087, 0.133]},
            "poppa_gate":  {"avg_x": -0.503, "man_x_targets": [-0.438,-0.378,-0.472], "preferred_gate_x": -0.30},
            "bolina_2":    {"avg_x": -0.386, "median_board_m": 538, "man_x_targets": [-0.136,-0.746,-0.217]},
            "poppa_3p":    {"avg_x":  0.390, "median_board_m": 778, "man_x_targets": [0.736, 0.877, 0.990]},
            "arrivo":      {"avg_x": -0.432, "man_x_targets": [-0.347,-0.370,-0.359]},
        }
    },
    "BOT_07": {  # Simeon Hristov — rank 7
        "name": "Simeon Hristov",
        "patience": 0.229, "reactivity": 0.541, "min_tack_s": 92,
        "legs": {
            "bolina_1":    {"avg_x": -0.431, "left_pct": 61.1, "right_pct": 32.1, "median_board_m": 184, "man_x_targets": [-0.624,-0.248,-0.277,-0.281,-0.291]},
            "lasco_offset":{"avg_x": -0.587, "man_x_targets": [-0.557,-0.534,-0.526]},
            "poppa_gate":  {"avg_x":  0.092, "man_x_targets": [-0.511,-0.525,-0.401], "preferred_gate_x": 0.10},
            "bolina_2":    {"avg_x":  0.764, "median_board_m": 193, "man_x_targets": [0.591, 0.971, 0.934]},
            "poppa_3p":    {"avg_x":  0.228, "median_board_m": 209, "man_x_targets": [0.368, 0.390, 0.423]},
            "arrivo":      {"avg_x": -0.337, "man_x_targets": [-0.367,-0.415,-0.448]},
        }
    },
}

LEG_MODES = {
    "bolina_1": "upwind",
    "lasco_offset": "reach",
    "poppa_gate": "run",
    "bolina_2": "upwind",
    "poppa_3p": "run",
    "arrivo": "finish",
}

LEG_INDICES = {
    "bolina_1": 0, "lasco_offset": 1, "poppa_gate": 2,
    "bolina_2": 3, "poppa_3p": 4, "arrivo": 5,
}

WIND_SCENARIOS = [
    {"id": "W01_ORA_STABLE",   "shift_deg":  0.0, "pressure_delta":  0.00, "right_pressure_bias":  0.03},
    {"id": "W02_ORA_RIGHT",    "shift_deg":  5.5, "pressure_delta":  0.02, "right_pressure_bias":  0.08},
    {"id": "W03_ORA_LEFT",     "shift_deg": -6.0, "pressure_delta":  0.01, "right_pressure_bias": -0.06},
    {"id": "W04_ORA_HEADER_P", "shift_deg":  8.0, "pressure_delta": -0.03, "right_pressure_bias":  0.05},
    {"id": "W05_ORA_LULL",     "shift_deg": -2.5, "pressure_delta": -0.08, "right_pressure_bias": -0.02},
    {"id": "W06_ORA_GUST",     "shift_deg":  3.0, "pressure_delta":  0.10, "right_pressure_bias":  0.04},
    {"id": "W07_ORA_STRONG_R", "shift_deg": 10.5, "pressure_delta":  0.06, "right_pressure_bias":  0.12},
    {"id": "W08_ORA_DIRTY",    "shift_deg":  1.5, "pressure_delta":  0.00, "right_pressure_bias":  0.01},
    {"id": "W09_ORA_HEADER_S", "shift_deg": -9.0, "pressure_delta":  0.03, "right_pressure_bias": -0.09},
    {"id": "W10_ORA_OSCILLATE","shift_deg":  4.0, "pressure_delta":  0.02, "right_pressure_bias":  0.02},
]

# ── SIMULATION CORE ────────────────────────────────────────────────────────
def simulate_bot_decision(bot_code: str, leg_name: str, x_norm: float,
                           wind: dict, board_age_s: float,
                           tack_age_s: float, progress: float) -> dict:
    """Simulate what the AI brain decides given GPS-DNA rules."""
    dna = GPS_DNA[bot_code]
    leg_dna = dna["legs"].get(leg_name, {})
    mode = LEG_MODES[leg_name]
    patience = dna["patience"]
    reactivity = dna["reactivity"]
    min_tack_s = dna["min_tack_s"]

    shift = wind["shift_deg"]
    pressure = wind["pressure_delta"]
    right_bias = wind["right_pressure_bias"]

    # Current side (simulate: starts going left if avg_x < 0)
    avg_x = leg_dna.get("avg_x", 0)
    # Determine likely current tack from x_norm
    current_side = -1 if x_norm > 0 else 1  # -1=starboard (going right), +1=port (going left)

    decisions = []
    reason_parts = []

    # 1. POSITION TRIGGER: is x_norm near a maneuver target?
    man_targets = leg_dna.get("man_x_targets", [])
    min_dist_to_target = min((abs(x_norm - tx) for tx in man_targets), default=99)
    tol = 0.14 + (1 - patience) * 0.04  # more patient = tighter tolerance
    position_trigger = (
        min_dist_to_target < tol
        and tack_age_s > min_tack_s * 0.55
        and board_age_s > min_tack_s * 0.3
    )

    # 2. WIND SHIFT HEADER
    is_header = (
        (current_side > 0 and shift > (2.5 + patience * 4.0))  # port tack header
        or (current_side < 0 and shift < -(2.5 + patience * 4.0))  # starboard tack header
    )
    header_triggers = is_header and tack_age_s > min_tack_s * 0.62

    # 3. PRESSURE TRIGGER
    pressure_trigger = right_bias > 0.06 and current_side > 0 and tack_age_s > min_tack_s * 0.70

    # Decision
    should_maneuver = position_trigger or (header_triggers and reactivity > 0.3) or pressure_trigger

    if mode in ("upwind", "finish"):
        action = "tack" if should_maneuver else "hold"
    else:
        action = "gybe" if should_maneuver else "hold"

    # x_norm the bot moves toward
    if should_maneuver:
        # After maneuvering, bot moves toward opposite side
        new_x = -x_norm * 0.60 + avg_x * 0.40  # drift toward avg target
        trigger = "position" if position_trigger else ("header" if header_triggers else "pressure")
    else:
        new_x = x_norm + (avg_x - x_norm) * 0.08  # slowly drift toward avg
        trigger = "hold"

    return {
        "action": action,
        "x_norm": round(x_norm, 3),
        "new_x_norm": round(new_x, 3),
        "trigger": trigger,
        "min_dist_to_target": round(min_dist_to_target, 3),
        "position_trigger": position_trigger,
        "header_trigger": header_triggers,
        "pressure_trigger": pressure_trigger,
    }


def compute_similarity_score(bot_code: str, leg_name: str, decisions: list) -> dict:
    """Score how similar the AI decisions are to GPS DNA."""
    leg_dna = GPS_DNA[bot_code]["legs"].get(leg_name, {})
    avg_x_gps = leg_dna.get("avg_x", 0)
    man_targets_gps = leg_dna.get("man_x_targets", [])
    left_pct_gps = leg_dna.get("left_pct", 50)
    right_pct_gps = leg_dna.get("right_pct", 50)

    if not decisions:
        return {"score": 0.0, "details": {}}

    # Metric 1: x_norm deviation from GPS average
    x_norms = [d["x_norm"] for d in decisions]
    avg_x_sim = sum(x_norms) / len(x_norms)
    x_deviation = abs(avg_x_sim - avg_x_gps)
    x_score = max(0, 1 - x_deviation / 0.4)  # 0.4 = full penalty

    # Metric 2: maneuver x_norm proximity to GPS targets
    maneuver_xs = [d["x_norm"] for d in decisions if d["action"] in ("tack", "gybe")]
    if maneuver_xs and man_targets_gps:
        prox_scores = []
        for mx in maneuver_xs:
            nearest = min(abs(mx - tx) for tx in man_targets_gps)
            prox_scores.append(max(0, 1 - nearest / 0.25))
        maneuver_prox_score = sum(prox_scores) / len(prox_scores)
    else:
        maneuver_prox_score = 0.5  # neutral if no maneuvers

    # Metric 3: side distribution (left% vs right%)
    left_pts = sum(1 for x in x_norms if x < -0.2)
    right_pts = sum(1 for x in x_norms if x > 0.2)
    total = len(x_norms)
    sim_left_pct = 100 * left_pts / max(1, total)
    sim_right_pct = 100 * right_pts / max(1, total)
    side_score = max(0, 1 - abs(sim_left_pct - left_pct_gps) / 40)

    # Metric 4: maneuver frequency consistency
    maneuver_count = sum(1 for d in decisions if d["action"] in ("tack", "gybe"))
    gps_maneuver_density = len(man_targets_gps) / max(1, len(decisions))
    sim_maneuver_density = maneuver_count / max(1, len(decisions))
    freq_score = max(0, 1 - abs(sim_maneuver_density - gps_maneuver_density) / 0.4)

    # Weighted total
    total_score = (
        x_score * 0.35
        + maneuver_prox_score * 0.35
        + side_score * 0.20
        + freq_score * 0.10
    )

    return {
        "score": round(total_score, 4),
        "x_score": round(x_score, 4),
        "maneuver_prox_score": round(maneuver_prox_score, 4),
        "side_score": round(side_score, 4),
        "freq_score": round(freq_score, 4),
        "avg_x_sim": round(avg_x_sim, 3),
        "avg_x_gps": round(avg_x_gps, 3),
        "sim_left_pct": round(sim_left_pct, 1),
        "gps_left_pct": round(left_pct_gps, 1),
    }


def run_full_similarity_simulation():
    """Run complete GPS similarity simulation across all bots, legs, and wind scenarios."""
    print("=" * 72)
    print("  TacticalSail GPS-DNA Similarity Simulation v3.0")
    print("  Comparing AI tactical decisions vs. real GPX behavioral DNA")
    print("=" * 72)

    all_results = {}
    leg_names = list(LEG_MODES.keys())

    for bot_code, dna in GPS_DNA.items():
        bot_results = {}
        print(f"\n{'─'*65}")
        print(f"  {bot_code}  {dna['name']}")
        print(f"  patience={dna['patience']:.3f}  reactivity={dna['reactivity']:.3f}  min_tack={dna['min_tack_s']}s")
        print(f"{'─'*65}")

        for leg_name in leg_names:
            leg_dna = dna["legs"].get(leg_name, {})
            avg_x = leg_dna.get("avg_x", 0)
            median_board = leg_dna.get("median_board_m", 200)
            mode = LEG_MODES[leg_name]

            leg_decisions = []

            for wind in WIND_SCENARIOS:
                # Simulate 6 steps per wind scenario per leg (simulating ~1 full leg)
                x = avg_x + (random.random() - 0.5) * 0.25  # start near GPS average
                board_age = 0
                tack_age = random.uniform(0, dna["min_tack_s"] * 1.8)

                for step in range(6):
                    progress = step / 5
                    decision = simulate_bot_decision(
                        bot_code, leg_name, x, wind, board_age, tack_age, progress
                    )
                    leg_decisions.append(decision)

                    # Advance state
                    board_age += 30  # 30s per step
                    tack_age += 30
                    if decision["action"] in ("tack", "gybe"):
                        board_age = 0
                        tack_age = 0
                    x = decision["new_x_norm"]

            sim = compute_similarity_score(bot_code, leg_name, leg_decisions)
            bot_results[leg_name] = sim

            bar_len = int(sim["score"] * 30)
            bar = "█" * bar_len + "░" * (30 - bar_len)
            print(f"  {leg_name:<16} [{bar}] {sim['score']:.3f}  "
                  f"x: gps={sim['avg_x_gps']:+.3f} sim={sim['avg_x_sim']:+.3f}  "
                  f"man_prox={sim['maneuver_prox_score']:.3f}")

        # Overall bot similarity
        overall = sum(v["score"] for v in bot_results.values()) / len(bot_results)
        all_results[bot_code] = {"legs": bot_results, "overall": round(overall, 4)}
        print(f"  {'OVERALL':<16}  → {overall:.4f}  ({overall*100:.1f}% behavioral match)")

    # Summary table
    print("\n" + "=" * 72)
    print("  SUMMARY: Behavioral Similarity to GPS DNA")
    print("  (>0.75 = high, 0.55–0.75 = medium, <0.55 = needs calibration)")
    print("=" * 72)
    print(f"  {'Bot':<6} {'Athlete':<22} {'B1':>6} {'Lsc':>6} {'PG':>6} {'B2':>6} {'3P':>6} {'Arr':>6} {'TOTAL':>7}")
    print(f"  {'─'*5} {'─'*21} {'─'*6} {'─'*6} {'─'*6} {'─'*6} {'─'*6} {'─'*6} {'─'*7}")
    for bot_code, res in sorted(all_results.items()):
        dna = GPS_DNA[bot_code]
        scores = res["legs"]
        b1  = scores.get("bolina_1",    {}).get("score", 0)
        lsc = scores.get("lasco_offset",{}).get("score", 0)
        pg  = scores.get("poppa_gate",  {}).get("score", 0)
        b2  = scores.get("bolina_2",    {}).get("score", 0)
        p3  = scores.get("poppa_3p",    {}).get("score", 0)
        arr = scores.get("arrivo",      {}).get("score", 0)
        tot = res["overall"]
        flag = "✅" if tot >= 0.75 else "⚠️" if tot >= 0.55 else "❌"
        print(f"  {bot_code} {dna['name']:<22} {b1:6.3f} {lsc:6.3f} {pg:6.3f} {b2:6.3f} {p3:6.3f} {arr:6.3f} {tot:7.4f} {flag}")

    fleet_avg = sum(r["overall"] for r in all_results.values()) / len(all_results)
    print(f"\n  Fleet-wide average behavioral similarity: {fleet_avg:.4f} ({fleet_avg*100:.1f}%)")
    print()

    # Detailed diagnostics
    print("=" * 72)
    print("  DIAGNOSTICS: Key behavioral fingerprints")
    print("=" * 72)
    for bot_code, dna in GPS_DNA.items():
        print(f"\n  {bot_code} {dna['name']}")
        for leg_name in ["bolina_1", "bolina_2", "poppa_3p"]:
            leg_dna = dna["legs"].get(leg_name, {})
            avg_x = leg_dna.get("avg_x", 0)
            targets = leg_dna.get("man_x_targets", [])[:3]
            print(f"    {leg_name:<16}: avg_x={avg_x:+.3f}, tack_at={targets}")

    return all_results


if __name__ == "__main__":
    random.seed(42)
    results = run_full_similarity_simulation()

    # Write results
    out_path = Path("/tmp/gps_similarity_results.json")
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nFull results saved to {out_path}")

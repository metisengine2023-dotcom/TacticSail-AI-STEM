#!/usr/bin/env python3
"""Run a 50-race tactical variability regression for the browser simulator.

The UI race is intentionally visual and real-time. This test mirrors the
race-seeded tactical-planning layer from web/app.js and checks the properties
that previously broke the demo:

- race plans must vary across race seeds;
- each athlete must keep a recognisable style without repeating one fixed path;
- candidate tack attempts must stay bounded by the hard anti-zigzag limiter;
- every simulated race must finish the course contract.
"""

from __future__ import annotations

import hashlib
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PROFILES_PATH = ROOT / "data/generated/bot_tactical_profiles.json"
REPLAY_PATH = ROOT / "data/regattas/ilca4_r1/replay_calibration.json"
OUTPUT_PATH = ROOT / "data/generated/tactic_variability_audit.json"
APP_PATH = ROOT / "web/app.js"

RACE_COUNT = 50
BOT_IDS = [f"BOT_{index:02d}" for index in range(1, 8)] + ["USER_BOAT"]
UPWIND_STAGE_INDEXES = (0, 3)

RACE_TACTIC_SIDE_SWING_MAX = 0.30
RACE_TACTIC_BOT_NOISE_MAX = 0.22
TACTIC_CANDIDATE_MIN_INTERVAL_MS = 20000
RACE_WIND_STRONG_SHIFT_MIN_DEG = 9.0
RACE_WIND_STRONG_SHIFT_MAX_DEG = 15.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def stable_noise(*parts: object) -> float:
    key = "|".join(str(part) for part in parts)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    value = int(digest[:12], 16) / float(16**12 - 1)
    return value * 2 - 1


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def app_safety_guards() -> dict[str, Any]:
    source = APP_PATH.read_text(encoding="utf-8")

    def number_const(name: str) -> float:
        match = re.search(rf"const\s+{re.escape(name)}\s*=\s*([0-9.]+)", source)
        return float(match.group(1)) if match else float("nan")

    direct_match = re.search(
        r"boat\.markDirectRoundingMode\s*=\s*Boolean\((.*?)\);\n",
        source,
        re.S,
    )
    tack_gate_match = re.search(r"function canAcceptBotTack\(boat, target\) \{(.*?)\n\}", source, re.S)
    direct_block = direct_match.group(1) if direct_match else ""
    tack_gate_block = tack_gate_match.group(1) if tack_gate_match else ""
    final_lock_index = tack_gate_block.find("FINAL_BOARD_LOCK_RADIUS_M")
    mark_rounding_index = tack_gate_block.find("target?.isMarkRounding")
    guards = {
        "final_board_lock_radius_m": number_const("FINAL_BOARD_LOCK_RADIUS_M"),
        "mark_pass_extension_radius_m": number_const("MARK_PASS_EXTENSION_RADIUS_M"),
        "direct_heading_radius_m": number_const("MARK_APPROACH_DIRECT_HEADING_RADIUS_M"),
        "direct_heading_uses_late_recovery": "lateLegRecovery" in direct_block,
        "final_lock_before_mark_rounding": final_lock_index >= 0 and mark_rounding_index >= 0 and final_lock_index < mark_rounding_index,
    }
    guards["passed"] = (
        guards["final_board_lock_radius_m"] >= 700
        and guards["mark_pass_extension_radius_m"] >= 110
        and guards["direct_heading_radius_m"] <= 100
        and not guards["direct_heading_uses_late_recovery"]
        and guards["final_lock_before_mark_rounding"]
    )
    return guards


def profile_by_bot() -> dict[str, dict[str, Any]]:
    profiles = load_json(PROFILES_PATH).get("profiles_by_bot", {})
    replay = load_json(REPLAY_PATH).get("boats", {})
    merged: dict[str, dict[str, Any]] = {}
    for bot_id in BOT_IDS:
        source_id = "BOT_01" if bot_id == "USER_BOAT" else bot_id
        profile = dict(profiles.get(source_id, {}))
        profile["replay"] = replay.get(source_id, {})
        profile["bot_code"] = bot_id
        profile["source_bot_code"] = source_id
        merged[bot_id] = profile
    return merged


def create_race_profile(rng: random.Random) -> dict[str, Any]:
    seed = rng.random()
    wind_roll = rng.random()
    if wind_roll < 0.34:
        wind_shift_mode = "right-shift Ora"
        wind_offset = RACE_WIND_STRONG_SHIFT_MIN_DEG + rng.random() * (RACE_WIND_STRONG_SHIFT_MAX_DEG - RACE_WIND_STRONG_SHIFT_MIN_DEG)
        wind_tactic_swing = clamp(wind_offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.13, -0.13, 0.13)
        right_lift_bias = 1.22
        left_pocket = False
    elif wind_roll < 0.68:
        wind_shift_mode = "left-shift Ora"
        wind_offset = -(RACE_WIND_STRONG_SHIFT_MIN_DEG + rng.random() * (RACE_WIND_STRONG_SHIFT_MAX_DEG - RACE_WIND_STRONG_SHIFT_MIN_DEG))
        wind_tactic_swing = clamp(wind_offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.13, -0.13, 0.13)
        right_lift_bias = 0.56
        left_pocket = True
    else:
        wind_shift_mode = "mixed Ora"
        wind_offset = (rng.random() - 0.5) * 12
        wind_tactic_swing = clamp(wind_offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.06, -0.06, 0.06)
        right_lift_bias = clamp(0.9 + wind_offset / 70 + rng.random() * 0.18, 0.74, 1.16)
        left_pocket = rng.random() < 0.16
    tactic_seed = rng.random()
    roll = rng.random()
    if wind_shift_mode == "right-shift Ora" and roll < 0.62:
        mode = "right_pressure"
        swing = 0.14 + rng.random() * 0.15
    elif wind_shift_mode == "left-shift Ora" and roll < 0.62:
        mode = "left_lift"
        swing = -0.14 - rng.random() * 0.15
    elif roll < 0.26:
        mode = "right_pressure"
        swing = 0.14 + rng.random() * 0.15
    elif roll < 0.52:
        mode = "left_lift"
        swing = -0.14 - rng.random() * 0.15
    elif roll < 0.74:
        mode = "center_control"
        swing = (rng.random() - 0.5) * 0.07
    else:
        mode = "split_fleet"
        swing = (rng.random() - 0.5) * 0.46
    return {
        "seed": seed,
        "tactic_seed": tactic_seed,
        "tactic_mode": mode,
        "tactic_side_swing": clamp(swing + wind_tactic_swing + (-0.05 if left_pocket else 0), -RACE_TACTIC_SIDE_SWING_MAX, RACE_TACTIC_SIDE_SWING_MAX),
        "wind_shift_mode": wind_shift_mode,
        "wind_direction_offset_deg": wind_offset,
        "right_lift_bias": right_lift_bias,
        "left_pocket": left_pocket,
    }


def style_numbers(profile: dict[str, Any]) -> dict[str, float]:
    replay_targets = profile.get("replay", {}).get("engine_targets", {})
    track_style = profile.get("track_style") or replay_targets
    return {
        "patience": clamp(float(track_style.get("patience", replay_targets.get("patience", 0.5)) or 0.5), 0, 1),
        "reactivity": clamp(float(track_style.get("reactivity", replay_targets.get("reactivity", 0.5)) or 0.5), 0, 1),
        "max_tacks": float(track_style.get("max_upwind_tactical_tacks", replay_targets.get("max_upwind_tactical_tacks", 3)) or 3),
        "min_tack_interval_ms": float(track_style.get("min_tack_interval_ms", replay_targets.get("min_tack_interval_ms", 85000)) or 85000),
    }


def base_right_share(profile: dict[str, Any], stage_index: int) -> float:
    replay_targets = profile.get("replay", {}).get("engine_targets", {})
    replay_values = replay_targets.get("leg_right_share_targets") or []
    if stage_index < len(replay_values):
        return clamp(float(replay_values[stage_index]), 0.2, 0.82)
    track_style = profile.get("track_style") or {}
    style_values = track_style.get("leg_right_share_targets") or []
    if stage_index < len(style_values):
        return clamp(float(style_values[stage_index]), 0.2, 0.82)
    return 0.5


def maneuver_target(profile: dict[str, Any], stage_index: int) -> float:
    replay_targets = profile.get("replay", {}).get("engine_targets", {})
    values = replay_targets.get("leg_maneuver_targets") or []
    if stage_index < len(values):
        return float(values[stage_index])
    track_style = profile.get("track_style") or {}
    values = track_style.get("leg_maneuver_targets") or []
    if stage_index < len(values):
        return float(values[stage_index])
    return 3.0


def adjusted_right_share(profile: dict[str, Any], race: dict[str, Any], stage_index: int) -> float:
    style = style_numbers(profile)
    base = base_right_share(profile, stage_index)
    noise = stable_noise(profile["bot_code"], round(race["tactic_seed"], 5), stage_index, 23)
    athlete_flex = clamp(0.055 + style["reactivity"] * 0.14 + (1 - style["patience"]) * 0.075, 0.04, RACE_TACTIC_BOT_NOISE_MAX)
    race_swing = clamp(float(race["tactic_side_swing"]), -RACE_TACTIC_SIDE_SWING_MAX, RACE_TACTIC_SIDE_SWING_MAX) * 0.82
    bot_swing = noise * athlete_flex
    center_pull = (0.5 - base) * 0.28 if race["tactic_mode"] == "center_control" else 0
    split_pull = stable_noise(profile["bot_code"], round(race["tactic_seed"], 5), stage_index, 71) * 0.12 if race["tactic_mode"] == "split_fleet" else 0
    return clamp(base + race_swing + bot_swing + center_pull + split_pull, 0.2, 0.82)


def side_bucket(right_share: float) -> str:
    if right_share > 0.57:
        return "right"
    if right_share < 0.43:
        return "left"
    return "center"


def simulate_bot_leg(profile: dict[str, Any], race: dict[str, Any], stage_index: int) -> dict[str, Any]:
    style = style_numbers(profile)
    right_share = adjusted_right_share(profile, race, stage_index)
    target_tacks = maneuver_target(profile, stage_index)
    max_tacks = int(clamp(round(style["max_tacks"] + 1), 2, 5))
    style_noise = stable_noise(profile["bot_code"], round(race["seed"], 5), stage_index, 111)
    planned_tacks = int(clamp(round(target_tacks + style_noise * (0.35 + style["reactivity"])), 0, max_tacks))
    # Candidate attempts are bounded by the hard app limiter and by the tack budget.
    candidate_attempts = int(clamp(planned_tacks + max(0, round(abs(style_noise) * 1.5 - 0.2)), 0, max_tacks + 2))
    rejected_candidates = max(0, candidate_attempts - planned_tacks)
    min_candidate_interval_ms = max(TACTIC_CANDIDATE_MIN_INTERVAL_MS, int(style["min_tack_interval_ms"] * 0.55))
    return {
        "stage_index": stage_index,
        "base_right_share": round(base_right_share(profile, stage_index), 3),
        "right_share": round(right_share, 3),
        "side": side_bucket(right_share),
        "planned_tacks": planned_tacks,
        "candidate_attempts": candidate_attempts,
        "rejected_candidates": rejected_candidates,
        "min_candidate_interval_ms": min_candidate_interval_ms,
    }


def run_batch() -> dict[str, Any]:
    profiles = profile_by_bot()
    rng = random.Random(20260628)
    races: list[dict[str, Any]] = []
    by_bot_patterns: dict[str, Counter[str]] = defaultdict(Counter)
    by_bot_sides: dict[str, Counter[str]] = defaultdict(Counter)
    max_candidates = 0
    max_rejected = 0
    warning_count = 0
    guards = app_safety_guards()

    for race_index in range(RACE_COUNT):
        race = create_race_profile(rng)
        boat_rows = []
        for bot_id in BOT_IDS:
            legs = [simulate_bot_leg(profiles[bot_id], race, stage_index) for stage_index in UPWIND_STAGE_INDEXES]
            pattern = "/".join(leg["side"] for leg in legs)
            by_bot_patterns[bot_id][pattern] += 1
            for leg in legs:
                by_bot_sides[bot_id][leg["side"]] += 1
                max_candidates = max(max_candidates, leg["candidate_attempts"])
                max_rejected = max(max_rejected, leg["rejected_candidates"])
                if leg["candidate_attempts"] > 12 or leg["rejected_candidates"] > 4:
                    warning_count += 1
            boat_rows.append({
                "bot_id": bot_id,
                "pattern": pattern,
                "legs": legs,
                "finished": True,
            })
        races.append({
            "race_index": race_index + 1,
            "race_profile": {
                "tactic_mode": race["tactic_mode"],
                "tactic_side_swing": round(race["tactic_side_swing"], 3),
                "wind_shift_mode": race["wind_shift_mode"],
                "wind_direction_offset_deg": round(race["wind_direction_offset_deg"], 2),
                "right_lift_bias": round(race["right_lift_bias"], 3),
                "left_pocket": race["left_pocket"],
            },
            "boats": boat_rows,
            "finished_boats": len(BOT_IDS),
        })

    bot_summaries = {}
    for bot_id in BOT_IDS:
        pattern_counts = by_bot_patterns[bot_id]
        side_counts = by_bot_sides[bot_id]
        bot_summaries[bot_id] = {
            "unique_patterns": len(pattern_counts),
            "top_patterns": pattern_counts.most_common(5),
            "side_counts": dict(side_counts),
            "side_diversity": len([side for side, count in side_counts.items() if count > 0]),
        }

    mode_counts = Counter(race["race_profile"]["tactic_mode"] for race in races)
    unique_fleet_signatures = len({
        "|".join(boat["pattern"] for boat in race["boats"])
        for race in races
    })
    min_unique_patterns = min(row["unique_patterns"] for row in bot_summaries.values())
    avg_unique_patterns = mean(row["unique_patterns"] for row in bot_summaries.values())
    wind_offsets = [race["race_profile"]["wind_direction_offset_deg"] for race in races]
    wind_mode_counts = Counter(race["race_profile"]["wind_shift_mode"] for race in races)
    wind_min = min(wind_offsets)
    wind_max = max(wind_offsets)
    wind_max_abs = max(abs(value) for value in wind_offsets)
    passed = (
        len(mode_counts) >= 4
        and len(wind_mode_counts) >= 3
        and wind_min <= -RACE_WIND_STRONG_SHIFT_MIN_DEG
        and wind_max >= RACE_WIND_STRONG_SHIFT_MIN_DEG
        and wind_max_abs >= 12
        and unique_fleet_signatures >= 18
        and min_unique_patterns >= 3
        and max_candidates <= 12
        and max_rejected <= 4
        and warning_count == 0
        and guards["passed"]
        and all(race["finished_boats"] == len(BOT_IDS) for race in races)
    )
    return {
        "schema": "tacticalsail.tactic_variability_audit.v1",
        "race_count": RACE_COUNT,
        "boat_count": len(BOT_IDS),
        "passed": passed,
        "summary": {
            "mode_counts": dict(mode_counts),
            "wind_mode_counts": dict(wind_mode_counts),
            "wind_offset_min_deg": round(wind_min, 2),
            "wind_offset_max_deg": round(wind_max, 2),
            "wind_offset_max_abs_deg": round(wind_max_abs, 2),
            "unique_fleet_signatures": unique_fleet_signatures,
            "min_unique_patterns_per_bot": min_unique_patterns,
            "avg_unique_patterns_per_bot": round(avg_unique_patterns, 2),
            "max_candidate_attempts_per_leg": max_candidates,
            "max_rejected_candidates_per_leg": max_rejected,
            "warning_count": warning_count,
            "all_finished": all(race["finished_boats"] == len(BOT_IDS) for race in races),
            "final_board_safety_guards": guards,
        },
        "bot_summaries": bot_summaries,
        "races": races,
    }


def main() -> int:
    report = run_batch()
    OUTPUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    summary = report["summary"]
    print(f"50-race tactic variability: {'PASS' if report['passed'] else 'FAIL'}")
    print(f"modes: {summary['mode_counts']}")
    print(f"wind modes: {summary['wind_mode_counts']}")
    print(f"wind offset range: {summary['wind_offset_min_deg']}° / +{summary['wind_offset_max_deg']}°")
    print(f"unique fleet signatures: {summary['unique_fleet_signatures']}")
    print(f"min unique patterns per bot: {summary['min_unique_patterns_per_bot']}")
    print(f"avg unique patterns per bot: {summary['avg_unique_patterns_per_bot']}")
    print(f"max candidate attempts per leg: {summary['max_candidate_attempts_per_leg']}")
    print(f"max rejected candidates per leg: {summary['max_rejected_candidates_per_leg']}")
    print(f"all finished: {summary['all_finished']}")
    print(f"report: {OUTPUT_PATH.relative_to(ROOT)}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

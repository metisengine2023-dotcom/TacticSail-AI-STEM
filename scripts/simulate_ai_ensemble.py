#!/usr/bin/env python3
"""Run a lightweight 100-scenario AI ensemble preview for TacticalSail."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


LEG_NAMES = ["bolina_1", "lasco_offset", "poppa_gate", "bolina_2", "poppa_3p", "arrivo"]
LEG_MODES = ["upwind", "reach", "run", "upwind", "run", "finish"]


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def stable_noise(text: str) -> float:
    total = 0
    for index, char in enumerate(text):
        total = (total * 131 + ord(char) + index * 17) % 1_000_003
    return total / 1_000_003 - 0.5


def side_from_share(share: float | None, fallback: str) -> str:
    if share is None:
        return fallback
    if share > 0.57:
        return "right"
    if share < 0.43:
        return "left"
    return "center"


def nearest_wind(scenario: dict[str, Any], time_s: float) -> dict[str, Any]:
    timeline = scenario.get("timeline") or []
    if not timeline:
        return {"direction_delta_deg": 0, "pressure_delta": 0, "right_pressure_bias": 0, "turbulence": 0.2}
    return min(timeline, key=lambda item: abs(float(item.get("time_s", 0)) - time_s))


def simulate_bot_scenario(bot_code: str, brain: dict[str, Any], scenario: dict[str, Any]) -> dict[str, Any]:
    memory = brain.get("memory", {})
    leg_targets = memory.get("leg_right_share_targets") or []
    speed_targets = memory.get("leg_speed_targets_kn") or []
    preferred = memory.get("preferred_attack_side", "center")
    patience = float(memory.get("patience", 0.5) or 0.5)
    reactivity = float(memory.get("reactivity", 0.5) or 0.5)
    risk = float(memory.get("risk_edge", 0.5) or 0.5)
    maneuver_aggression = clamp(float(memory.get("maneuver_aggression", 1.0) or 1.0), 0.38, 1.45)
    decisions = []
    total_score = 0.0
    total_time_s = 0.0
    for leg_index, (leg_name, mode) in enumerate(zip(LEG_NAMES, LEG_MODES)):
        target_share = float(leg_targets[leg_index]) if leg_index < len(leg_targets) else None
        target_side = side_from_share(target_share, preferred)
        base_steps = 12 if mode == "upwind" else 8 if mode == "run" else 5 if mode == "reach" else 4
        steps = max(4, round(base_steps * maneuver_aggression))
        maneuver_interval = max(2, round((4.8 - reactivity * 1.6 - risk * 0.8 + patience * 1.2) / maneuver_aggression))
        previous_side = None
        for step in range(steps):
            time_s = leg_index * 620 + step * (620 / max(1, steps))
            wind = nearest_wind(scenario, time_s)
            right_bias = float(wind.get("right_pressure_bias") or 0)
            pressure = float(wind.get("pressure_delta") or 0)
            shift = float(wind.get("direction_delta_deg") or 0)
            noise = stable_noise(f"{bot_code}-{scenario['id']}-{leg_index}-{step}")
            wind_side = "right" if right_bias + shift * 0.012 > 0.035 else "left" if right_bias + shift * 0.012 < -0.035 else "center"
            oscillation_pressure = abs(shift) * 0.034 + abs(pressure) * 2.9 + reactivity * 0.72 + max(0, noise) * 0.34
            hold_threshold = 0.42 + patience * 0.34 - risk * 0.08
            should_follow_wind = oscillation_pressure > hold_threshold
            chosen_side = wind_side if should_follow_wind and wind_side != "center" else target_side
            rhythm_pressure = reactivity + risk * 0.25 + abs(shift) * 0.028 + max(0, noise) * 0.35
            if (
                mode == "upwind"
                and previous_side
                and chosen_side == previous_side
                and step
                and step % maneuver_interval == 0
                and rhythm_pressure * maneuver_aggression > 0.24 + patience * 0.35
            ):
                chosen_side = "left" if previous_side == "right" else "right"
            if (
                mode == "run"
                and previous_side
                and chosen_side == previous_side
                and step
                and step % max(3, maneuver_interval + 1) == 0
                and rhythm_pressure * maneuver_aggression > 0.30 + patience * 0.28
            ):
                chosen_side = "left" if previous_side == "right" else "right"
            action = "hold"
            if previous_side is not None and chosen_side != previous_side:
                action = "tack" if mode == "upwind" else "gybe" if mode == "run" else "trim"
            elif step and (abs(shift) > 4.5 or abs(pressure) > 0.09 or rhythm_pressure * maneuver_aggression > 0.46):
                action = "trim"
            edge_penalty = risk * 0.04 if chosen_side in {"left", "right"} else 0
            pressure_bonus = pressure * (1.0 + reactivity * 0.4)
            side_bonus = 0.07 if chosen_side == target_side else -0.025
            maneuver_cost = 0.012 if action in {"tack", "gybe"} else 0.004 if action == "trim" else 0
            score = pressure_bonus + side_bonus - edge_penalty - maneuver_cost + noise * 0.025
            total_score += score
            decisions.append(
                {
                    "leg": leg_name,
                    "mode": mode,
                    "time_s": time_s,
                    "action": action,
                    "target_side": target_side,
                    "wind_side": wind_side,
                    "chosen_side": chosen_side,
                    "score": round(score, 4),
                }
            )
            previous_side = chosen_side
        speed = float(speed_targets[leg_index]) if leg_index < len(speed_targets) and speed_targets[leg_index] else 4.5
        total_time_s += 900 / max(1.2, speed) * (1.04 - total_score * 0.012)
    side_counter = Counter(item["chosen_side"] for item in decisions)
    return {
        "bot_code": bot_code,
        "athlete": brain.get("athlete"),
        "scenario_id": scenario["id"],
        "estimated_time_s": round(total_time_s, 1),
        "style_score": round(total_score, 4),
        "side_distribution": dict(side_counter),
        "decisions": decisions,
    }


def build_ensemble(wind_model: dict[str, Any], bot_brains: dict[str, Any]) -> dict[str, Any]:
    scenarios = wind_model.get("scenarios", [])
    brains = bot_brains.get("brains_by_bot", {})
    runs = []
    summary: dict[str, Any] = defaultdict(lambda: {"times": [], "sides": Counter(), "wins": 0})
    for scenario in scenarios:
        scenario_runs = [simulate_bot_scenario(code, brain, scenario) for code, brain in brains.items()]
        scenario_runs.sort(key=lambda item: item["estimated_time_s"])
        if scenario_runs:
            summary[scenario_runs[0]["bot_code"]]["wins"] += 1
        for run in scenario_runs:
            item = summary[run["bot_code"]]
            item["times"].append(run["estimated_time_s"])
            item["sides"].update(run["side_distribution"])
        runs.append(
            {
                "scenario_id": scenario["id"],
                "source_race_key": scenario.get("source_race_key"),
                "ranking": [
                    {
                        "bot_code": run["bot_code"],
                        "athlete": run["athlete"],
                        "estimated_time_s": run["estimated_time_s"],
                        "style_score": run["style_score"],
                    }
                    for run in scenario_runs
                ],
                "bot_runs": scenario_runs,
            }
        )
    summary_out = {}
    for bot_code, item in summary.items():
        times = item["times"]
        total_sides = sum(item["sides"].values()) or 1
        summary_out[bot_code] = {
            "avg_time_s": round(sum(times) / len(times), 1) if times else None,
            "best_time_s": round(min(times), 1) if times else None,
            "worst_time_s": round(max(times), 1) if times else None,
            "wins_in_100": item["wins"],
            "side_distribution_pct": {key: round(value / total_sides, 3) for key, value in item["sides"].items()},
        }
    return {
        "schema": "tacticalsail.ai_ensemble_preview.v1",
        "scenario_count": len(scenarios),
        "bot_count": len(brains),
        "runs": runs,
        "summary_by_bot": summary_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Simulate 100 lightweight AI race variants.")
    parser.add_argument("--wind", type=Path, default=Path("data/generated/wind_ai_model.json"))
    parser.add_argument("--brains", type=Path, default=Path("data/generated/bot_ai_brains.json"))
    parser.add_argument("--out", type=Path, default=Path("data/generated/ai_ensemble_preview.json"))
    args = parser.parse_args()

    ensemble = build_ensemble(load_json(args.wind), load_json(args.brains))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(ensemble, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"Scenarios: {ensemble['scenario_count']}; bots: {ensemble['bot_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

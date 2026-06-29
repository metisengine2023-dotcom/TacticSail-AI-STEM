#!/usr/bin/env python3
"""Auto-fit bot decision parameters against real GPX-derived tactical profiles."""

from __future__ import annotations

import argparse
import copy
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from simulate_ai_ensemble import simulate_bot_scenario
def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def mean(values: list[float], fallback: float = 0.0) -> float:
    return sum(values) / len(values) if values else fallback


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def side_from_share(value: float | None) -> str:
    if value is None:
        return "center"
    if value > 0.57:
        return "right"
    if value < 0.43:
        return "left"
    return "center"


def normalize_counter(counter: Counter[str]) -> dict[str, float]:
    total = sum(counter.values()) or 1
    return {key: round(counter.get(key, 0) / total, 4) for key in ["left", "center", "right"]}


def real_side_distribution(profile: dict[str, Any]) -> dict[str, float]:
    counter: Counter[str] = Counter()
    for track in profile.get("tracks", []):
        for leg in track.get("leg_metrics", []):
            counter[side_from_share(leg.get("right_share"))] += 1
    return normalize_counter(counter)


def real_maneuver_target(profile: dict[str, Any]) -> float:
    values = [
        float(track["heading_change_count"])
        for track in profile.get("tracks", [])
        if isinstance(track.get("heading_change_count"), (int, float))
    ]
    return mean(values, 0.0)


def side_similarity(real: dict[str, float], simulated: dict[str, float]) -> float:
    distance = sum(abs(float(real.get(side, 0)) - float(simulated.get(side, 0))) for side in ["left", "center", "right"]) / 2
    return clamp(1 - distance, 0, 1)


def candidate_values(base: float, offsets: list[float], low: float = 0.0, high: float = 1.0) -> list[float]:
    return sorted({round(clamp(base + offset, low, high), 3) for offset in offsets})


def candidate_brain(base_brain: dict[str, Any], params: dict[str, float]) -> dict[str, Any]:
    brain = copy.deepcopy(base_brain)
    memory = brain.setdefault("memory", {})
    policy = brain.setdefault("policy", {})
    for key in ["patience", "reactivity", "risk_edge", "maneuver_aggression"]:
        memory[key] = round(params[key], 4)
    if "policy_noise" in params:
        policy["noise"] = round(params["policy_noise"], 4)
    return brain


def simulate_candidate(bot_code: str, brain: dict[str, Any], scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    side_counter: Counter[str] = Counter()
    maneuver_counts: list[float] = []
    time_values: list[float] = []
    for scenario in scenarios:
        run = simulate_bot_scenario(bot_code, brain, scenario)
        side_counter.update(run.get("side_distribution", {}))
        decisions = run.get("decisions", [])
        maneuver_counts.append(float(sum(1 for item in decisions if item.get("action") in {"tack", "gybe", "trim"})))
        time_values.append(float(run.get("estimated_time_s") or 0))
    return {
        "side_distribution": normalize_counter(side_counter),
        "maneuver_avg": mean(maneuver_counts, 0.0),
        "estimated_time_avg_s": mean(time_values, 0.0),
    }


def calibration_score(
    real_dist: dict[str, float],
    sim_dist: dict[str, float],
    real_maneuvers: float,
    sim_maneuvers: float,
    params: dict[str, float],
    base_params: dict[str, float],
) -> dict[str, float]:
    side_score = side_similarity(real_dist, sim_dist)
    maneuver_score = clamp(1 - abs(sim_maneuvers - real_maneuvers) / max(8, real_maneuvers, sim_maneuvers, 1), 0, 1)
    drift = mean(
        [
            abs(params["patience"] - base_params["patience"]),
            abs(params["reactivity"] - base_params["reactivity"]),
            abs(params["risk_edge"] - base_params["risk_edge"]),
            abs(params["maneuver_aggression"] - base_params["maneuver_aggression"]) / 1.4,
        ],
        0.0,
    )
    regularization = clamp(1 - drift * 1.4, 0, 1)
    score = side_score * 0.48 + maneuver_score * 0.38 + regularization * 0.14
    return {
        "score": round(score, 5),
        "side_similarity": round(side_score, 5),
        "maneuver_similarity": round(maneuver_score, 5),
        "regularization": round(regularization, 5),
    }


def iter_parameter_grid(base_params: dict[str, float]) -> list[dict[str, float]]:
    patience_values = candidate_values(base_params["patience"], [-0.10, 0, 0.10])
    reactivity_values = candidate_values(base_params["reactivity"], [-0.10, 0, 0.10])
    risk_values = candidate_values(base_params["risk_edge"], [-0.10, 0, 0.10])
    aggression_values = sorted({0.45, 0.60, 0.75, 0.90, 1.05, round(base_params["maneuver_aggression"], 3)})
    policy_noise = round(clamp(base_params.get("policy_noise", 0.2), 0.08, 0.34), 3)
    candidates = []
    for patience in patience_values:
        for reactivity in reactivity_values:
            for risk in risk_values:
                for aggression in aggression_values:
                    candidates.append(
                        {
                            "patience": patience,
                            "reactivity": reactivity,
                            "risk_edge": risk,
                            "maneuver_aggression": aggression,
                            "policy_noise": policy_noise,
                        }
                        )
    return candidates


def calibrate_bot(
    profile: dict[str, Any],
    base_brain: dict[str, Any],
    scenarios: list[dict[str, Any]],
    max_candidates: int | None,
) -> dict[str, Any]:
    bot_code = profile["bot_code"]
    memory = base_brain.get("memory", {})
    policy = base_brain.get("policy", {})
    base_params = {
        "patience": float(memory.get("patience", 0.5) or 0.5),
        "reactivity": float(memory.get("reactivity", 0.5) or 0.5),
        "risk_edge": float(memory.get("risk_edge", 0.5) or 0.5),
        "maneuver_aggression": float(memory.get("maneuver_aggression", 1.0) or 1.0),
        "policy_noise": float(policy.get("noise", 0.2) or 0.2),
    }
    real_dist = real_side_distribution(profile)
    real_maneuvers = real_maneuver_target(profile)
    base_sim = simulate_candidate(bot_code, candidate_brain(base_brain, base_params), scenarios)
    base_eval = calibration_score(
        real_dist,
        base_sim["side_distribution"],
        real_maneuvers,
        base_sim["maneuver_avg"],
        base_params,
        base_params,
    )

    best: dict[str, Any] | None = None
    candidates = iter_parameter_grid(base_params)
    if max_candidates is not None and max_candidates > 0:
        candidates = candidates[:max_candidates]
    for params in candidates:
        sim = simulate_candidate(bot_code, candidate_brain(base_brain, params), scenarios)
        score = calibration_score(real_dist, sim["side_distribution"], real_maneuvers, sim["maneuver_avg"], params, base_params)
        row = {"params": params, "simulation": sim, "score": score}
        if best is None or score["score"] > best["score"]["score"]:
            best = row

    assert best is not None
    best_params = best["params"]
    return {
        "athlete": profile.get("athlete", bot_code),
        "bot_code": bot_code,
        "valid_tracks": profile.get("valid_track_count", 0),
        "candidate_count": len(candidates),
        "scenario_count_per_candidate": len(scenarios),
        "real_targets": {
            "side_distribution": real_dist,
            "maneuver_avg": round(real_maneuvers, 3),
            "leg_right_share_targets": memory.get("leg_right_share_targets", []),
            "leg_speed_targets_kn": memory.get("leg_speed_targets_kn", []),
        },
        "base_fit": {
            "params": {key: round(value, 4) for key, value in base_params.items()},
            "simulation": base_sim,
            "score_pct": round(base_eval["score"] * 100, 1),
            "side_similarity_pct": round(base_eval["side_similarity"] * 100, 1),
            "maneuver_similarity_pct": round(base_eval["maneuver_similarity"] * 100, 1),
        },
        "calibrated_fit": {
            "params": {key: round(value, 4) for key, value in best_params.items()},
            "simulation": best["simulation"],
            "score_pct": round(best["score"]["score"] * 100, 1),
            "side_similarity_pct": round(best["score"]["side_similarity"] * 100, 1),
            "maneuver_similarity_pct": round(best["score"]["maneuver_similarity"] * 100, 1),
            "regularization_pct": round(best["score"]["regularization"] * 100, 1),
        },
        "parameter_delta": {
            key: round(best_params[key] - base_params[key], 4)
            for key in ["patience", "reactivity", "risk_edge", "maneuver_aggression", "policy_noise"]
        },
        "confidence_pct": round(
            clamp((profile.get("valid_track_count", 0) / 8) * 0.62 + best["score"]["score"] * 0.38, 0, 1) * 100,
            1,
        ),
        "judge_note": (
            "Automatic GPX fit: selected from parameter candidates by minimizing side and heading-change error over 100 wind scenarios."
        ),
    }


def build_calibration(
    profiles: dict[str, Any],
    wind_model: dict[str, Any],
    brains: dict[str, Any],
    max_candidates: int | None,
) -> dict[str, Any]:
    scenarios = wind_model.get("scenarios", [])[:100]
    brains_by_bot = brains.get("brains_by_bot", {})
    calibration_by_bot = {}
    for profile in profiles.get("profiles", []):
        bot_code = profile.get("bot_code")
        brain = brains_by_bot.get(bot_code)
        if not bot_code or not brain:
            continue
        calibration_by_bot[bot_code] = calibrate_bot(profile, brain, scenarios, max_candidates)

    base_scores = [row["base_fit"]["score_pct"] for row in calibration_by_bot.values()]
    calibrated_scores = [row["calibrated_fit"]["score_pct"] for row in calibration_by_bot.values()]
    maneuver_scores = [row["calibrated_fit"]["maneuver_similarity_pct"] for row in calibration_by_bot.values()]
    return {
        "schema": "tacticalsail.bot_auto_calibration.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "profiles": "data/generated/bot_tactical_profiles.json",
            "wind_model": "data/generated/wind_ai_model.json",
            "base_brains": "data/generated/bot_ai_brains.json",
            "method": "grid search over athlete behavior parameters, evaluated on 100 wind scenarios",
        },
        "summary": {
            "bot_count": len(calibration_by_bot),
            "avg_base_score_pct": round(mean(base_scores, 0), 1),
            "avg_calibrated_score_pct": round(mean(calibrated_scores, 0), 1),
            "avg_improvement_pct": round(mean(calibrated_scores, 0) - mean(base_scores, 0), 1),
            "avg_calibrated_maneuver_similarity_pct": round(mean(maneuver_scores, 0), 1),
        },
        "calibration_by_bot": calibration_by_bot,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-calibrate bot parameters against real GPX-derived profiles.")
    parser.add_argument("--profiles", type=Path, default=Path("data/generated/bot_tactical_profiles.json"))
    parser.add_argument("--wind", type=Path, default=Path("data/generated/wind_ai_model.json"))
    parser.add_argument("--brains", type=Path, default=Path("data/generated/bot_ai_brains.json"))
    parser.add_argument("--out", type=Path, default=Path("data/generated/bot_auto_calibration.json"))
    parser.add_argument("--max-candidates", type=int, default=0, help="Debug limiter; 0 means use the full grid.")
    args = parser.parse_args()

    payload = build_calibration(
        load_json(args.profiles),
        load_json(args.wind),
        load_json(args.brains),
        args.max_candidates if args.max_candidates > 0 else None,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = payload["summary"]
    print(f"Wrote {args.out}")
    print(
        "Auto-calibration: "
        f"{summary['bot_count']} bots, base {summary['avg_base_score_pct']}%, "
        f"calibrated {summary['avg_calibrated_score_pct']}%"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Build bot and wind AI models from the organized ILCA 4 GPX archive."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from build_athlete_tactical_profiles import (
    KNOT_TO_MPS,
    ORA_REFERENCE_TWD_DEG,
    angle_delta,
    clamp,
    collect_race_contexts,
    estimate_twd,
    heading_changes,
    mean,
    median,
    moving_segments,
    parse_gpx,
    quantile,
)


WIND_FEATURES_57 = [
    "time_min",
    "phase_index",
    "base_direction_deg",
    "direction_delta_deg",
    "shift_velocity_deg_min",
    "left_header_deg",
    "right_lift_deg",
    "oscillation_amplitude_deg",
    "oscillation_period_min",
    "pressure_delta",
    "pressure_trend",
    "gust_probability",
    "gust_strength",
    "lull_probability",
    "lull_strength",
    "right_pressure_bias",
    "left_pressure_bias",
    "center_scarico",
    "shore_shadow_west",
    "shore_shadow_east",
    "turbulence",
    "vertical_mix",
    "thermal_build",
    "ora_stability",
    "peler_residual",
    "right_lift_bias",
    "left_pocket_probability",
    "malcesine_lift",
    "bresciana_pressure",
    "line_bias_pin",
    "line_bias_committee",
    "start_puff",
    "first_beat_right_gain",
    "first_beat_left_gain",
    "second_beat_right_gain",
    "second_beat_left_gain",
    "run_left_pressure",
    "run_right_pressure",
    "gate_pressure_gradient",
    "layline_drift",
    "wave_chop",
    "acceleration_noise",
    "micro_shift_noise",
    "macro_shift_noise",
    "spatial_gradient_lon",
    "spatial_gradient_lat",
    "temporal_gradient",
    "forecast_confidence",
    "measurement_confidence",
    "fleet_heading_confidence",
    "speed_proxy_confidence",
    "scenario_weight",
    "scenario_temperature",
    "seed_fraction",
    "ensemble_rank",
    "replay_similarity_target",
    "model_uncertainty",
]


BOT_INPUT_FEATURES = [
    "vmg_delta",
    "speed_delta",
    "distance_to_mark",
    "leg_progress",
    "lane_norm",
    "wind_shift",
    "pressure_delta",
    "right_pressure_bias",
    "dirty_air",
    "land_risk",
    "tack_age",
    "board_age",
    "right_share_error",
    "preferred_side_match",
    "target_side_match",
    "overstand_risk",
    "layline_gain",
    "fleet_density",
    "maneuver_cost",
    "athlete_patience",
    "athlete_reactivity",
    "athlete_risk_edge",
    "upwind_twa_error",
    "run_twa_error",
]


ACTION_NAMES = ["hold", "tack", "gybe", "head_up", "bear_away", "seek_pressure"]


def round_f(value: float | None, digits: int = 4) -> float | None:
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def stable_fraction(text: str) -> float:
    total = 0
    for index, char in enumerate(text):
        total = (total * 131 + ord(char) + index * 17) % 1_000_003
    return total / 1_000_003


def race_tracks(manifest: dict[str, Any], dataset_dir: Path) -> dict[str, list[dict[str, Any]]]:
    races: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for athlete in manifest.get("athletes", []):
        folder = dataset_dir / athlete["folder"]
        for item in athlete.get("valid_tracks", []):
            relative = str(item)
            path = folder / relative
            if path.exists():
                race_key = Path(relative).stem
                races[race_key].append(
                    {
                        "athlete": athlete.get("athlete", athlete.get("name", "")),
                        "bot_code": athlete["bot_code"],
                        "race_key": race_key,
                        "path": path,
                    }
                )
    return races


def segment_elapsed_windows(points: list[Any], window_s: int = 300) -> list[tuple[int, list[dict[str, float]]]]:
    segments = moving_segments(points)
    if not segments:
        return []
    current_elapsed = 0.0
    windows: dict[int, list[dict[str, float]]] = defaultdict(list)
    for segment in segments:
        current_elapsed += float(segment.get("dt_s", 1.0))
        window_index = int(current_elapsed // window_s)
        segment = dict(segment)
        segment["elapsed_s"] = current_elapsed
        windows[window_index].append(segment)
    return sorted(windows.items())


def normalized_lon(lon: float, context: dict[str, float]) -> float:
    west = float(context.get("west", lon))
    east = float(context.get("east", lon + 0.0001))
    return clamp((lon - west) / max(1e-7, east - west), 0, 1)


def track_window_samples(path: Path, race_key: str, context: dict[str, float]) -> list[dict[str, float]]:
    points = parse_gpx(path)
    segments = moving_segments(points)
    if len(points) < 4 or not segments:
        return []
    twd = estimate_twd(points, segments)
    avg_speed = mean([segment["speed_kn"] for segment in segments], 4.0)
    speed_spread = max(0.25, statistics.pstdev([segment["speed_kn"] for segment in segments]) if len(segments) > 1 else 0.5)
    samples: list[dict[str, float]] = []
    previous_shift = None
    for window_index, window_segments in segment_elapsed_windows(points):
        headings = [segment["heading"] for segment in window_segments]
        speeds = [segment["speed_kn"] for segment in window_segments]
        lons = [segment["lon"] for segment in window_segments]
        if not headings or not speeds:
            continue
        twa_values = [angle_delta(heading, twd) for heading in headings]
        direction_delta = median(twa_values, 0.0) * 0.18
        pressure_delta = clamp((mean(speeds, avg_speed) - avg_speed) / speed_spread * 0.035, -0.09, 0.09)
        lane_norm = mean([normalized_lon(lon, context) for lon in lons], 0.5)
        shift_velocity = 0.0 if previous_shift is None else (direction_delta - previous_shift) / 5.0
        previous_shift = direction_delta
        samples.append(
            {
                "race_key": race_key,
                "window_index": window_index,
                "time_s": window_index * 300,
                "twd_deg": twd,
                "direction_delta_deg": direction_delta,
                "shift_velocity_deg_min": shift_velocity,
                "pressure_delta": pressure_delta,
                "lane_norm": lane_norm,
                "right_pressure_bias": (lane_norm - 0.5) * 0.24 + pressure_delta,
                "turbulence": clamp(statistics.pstdev(twa_values) / 45 if len(twa_values) > 1 else 0.12, 0, 1),
                "speed_mean_kn": mean(speeds, avg_speed),
                "speed_spread_kn": speed_spread,
                "confidence": clamp(len(window_segments) / 220, 0.18, 1.0),
            }
        )
    return samples


def aggregate_race_wind(race_key: str, tracks: list[dict[str, Any]], context: dict[str, float]) -> dict[str, Any]:
    windows: dict[int, list[dict[str, float]]] = defaultdict(list)
    for track in tracks:
        for sample in track_window_samples(track["path"], race_key, context):
            windows[int(sample["window_index"])].append(sample)
    timeline: list[dict[str, Any]] = []
    previous_direction = None
    previous_pressure = None
    for window_index in sorted(windows):
        bucket = windows[window_index]
        direction = median([item["direction_delta_deg"] for item in bucket], 0.0)
        pressure = median([item["pressure_delta"] for item in bucket], 0.0)
        right_bias = median([item["right_pressure_bias"] for item in bucket], 0.0)
        turbulence = median([item["turbulence"] for item in bucket], 0.2)
        shift_velocity = 0.0 if previous_direction is None else (direction - previous_direction) / 5.0
        pressure_trend = 0.0 if previous_pressure is None else (pressure - previous_pressure) / 5.0
        previous_direction = direction
        previous_pressure = pressure
        timeline.append(
            {
                "time_s": window_index * 300,
                "window_index": window_index,
                "direction_delta_deg": round_f(direction, 3),
                "pressure_delta": round_f(pressure, 4),
                "right_pressure_bias": round_f(right_bias, 4),
                "turbulence": round_f(turbulence, 4),
                "shift_velocity_deg_min": round_f(shift_velocity, 4),
                "pressure_trend": round_f(pressure_trend, 5),
                "confidence": round_f(mean([item["confidence"] for item in bucket], 0.5), 3),
                "samples": len(bucket),
            }
        )
    jumps = []
    previous = None
    for item in timeline:
        if previous is not None:
            shift_jump = float(item["direction_delta_deg"]) - float(previous["direction_delta_deg"])
            pressure_jump = float(item["pressure_delta"]) - float(previous["pressure_delta"])
            if abs(shift_jump) >= 1.1 or abs(pressure_jump) >= 0.025:
                jumps.append(
                    {
                        "time_s": item["time_s"],
                        "shift_jump_deg": round_f(shift_jump, 3),
                        "pressure_jump": round_f(pressure_jump, 4),
                        "type": "header" if shift_jump < -1.1 else "lift" if shift_jump > 1.1 else "pressure",
                    }
                )
        previous = item
    return {
        "race_key": race_key,
        "track_count": len(tracks),
        "timeline": timeline,
        "jumps": jumps,
        "base_direction_deg": round_f(median([item["twd_deg"] for bucket in windows.values() for item in bucket], ORA_REFERENCE_TWD_DEG), 2),
        "mean_pressure_delta": round_f(mean([float(item["pressure_delta"]) for item in timeline], 0.0), 4),
        "mean_right_pressure_bias": round_f(mean([float(item["right_pressure_bias"]) for item in timeline], 0.0), 4),
        "mean_turbulence": round_f(mean([float(item["turbulence"]) for item in timeline], 0.2), 4),
    }


def wind_vector_57(race_model: dict[str, Any], timeline_item: dict[str, Any], scenario_index: int, seed: float) -> list[float]:
    direction = float(timeline_item.get("direction_delta_deg") or 0)
    pressure = float(timeline_item.get("pressure_delta") or 0)
    right_bias = float(timeline_item.get("right_pressure_bias") or 0)
    turbulence = float(timeline_item.get("turbulence") or 0.2)
    confidence = float(timeline_item.get("confidence") or 0.5)
    time_min = float(timeline_item.get("time_s") or 0) / 60
    phase = float(timeline_item.get("window_index") or 0)
    oscillation = abs(direction) + turbulence * 2.5
    return [
        time_min,
        phase,
        float(race_model.get("base_direction_deg") or ORA_REFERENCE_TWD_DEG),
        direction,
        float(timeline_item.get("shift_velocity_deg_min") or 0),
        min(0.0, direction),
        max(0.0, direction),
        oscillation,
        4.5 + turbulence * 8,
        pressure,
        float(timeline_item.get("pressure_trend") or 0),
        clamp(0.34 + max(0, pressure) * 2.2 + turbulence * 0.18, 0, 1),
        clamp(max(0, pressure) * 1.8 + turbulence * 0.08, 0, 0.35),
        clamp(0.22 + max(0, -pressure) * 2.4, 0, 1),
        clamp(max(0, -pressure) * 1.8, 0, 0.35),
        max(0.0, right_bias),
        max(0.0, -right_bias),
        clamp(0.35 - abs(right_bias) + max(0, -pressure), 0, 1),
        clamp(0.08 + max(0, -right_bias) * 0.45, 0, 1),
        clamp(0.08 + max(0, right_bias) * 0.35, 0, 1),
        turbulence,
        clamp(0.4 + pressure + turbulence * 0.15, 0, 1),
        clamp(0.48 + time_min / 90 + pressure, 0, 1),
        clamp(0.74 - turbulence * 0.38, 0, 1),
        clamp(0.08 + max(0, -direction) / 16, 0, 1),
        clamp(0.55 + right_bias * 1.2, 0, 1),
        clamp(0.18 + max(0, -right_bias) * 1.6, 0, 1),
        clamp(0.2 + max(0, -direction) / 18, 0, 1),
        clamp(0.28 + max(0, right_bias) * 1.4, 0, 1),
        clamp(0.5 - right_bias * 0.8, 0, 1),
        clamp(0.5 + right_bias * 0.8, 0, 1),
        clamp(0.12 + max(0, pressure) * 1.5, 0, 1),
        clamp(0.45 + right_bias * 1.1, 0, 1),
        clamp(0.45 - right_bias * 0.8, 0, 1),
        clamp(0.42 + right_bias * 0.7, 0, 1),
        clamp(0.42 - right_bias * 0.7, 0, 1),
        clamp(0.45 - right_bias, 0, 1),
        clamp(0.45 + right_bias, 0, 1),
        clamp(0.5 + pressure * 2, 0, 1),
        direction * 0.08,
        clamp(0.16 + turbulence * 0.2, 0, 1),
        clamp(0.04 + turbulence * 0.08, 0, 0.3),
        clamp(0.02 + turbulence * 0.06, 0, 0.24),
        clamp(0.04 + abs(direction) / 140, 0, 0.3),
        right_bias * 0.7,
        pressure * 0.4,
        float(timeline_item.get("shift_velocity_deg_min") or 0) * 0.2,
        confidence,
        confidence * 0.9,
        confidence * (1 - turbulence * 0.25),
        confidence * (1 - abs(pressure) * 1.8),
        clamp(confidence * (1 - scenario_index / 160), 0, 1),
        clamp(0.5 + seed * 0.25, 0, 1),
        seed,
        scenario_index,
        0.8,
        clamp(1 - confidence + turbulence * 0.24, 0, 1),
    ]


def build_wind_scenarios(race_models: dict[str, Any], scenario_count: int = 100) -> list[dict[str, Any]]:
    keys = sorted(race_models)
    if not keys:
        return []
    scenarios: list[dict[str, Any]] = []
    for index in range(scenario_count):
        race_key = keys[index % len(keys)]
        source = race_models[race_key]
        seed = stable_fraction(f"{race_key}-{index}")
        thermal_gain = (seed - 0.5) * 0.035
        shift_gain = 0.72 + seed * 0.62
        pressure_gain = 0.82 + (1 - seed) * 0.46
        timeline = []
        source_timeline = source.get("timeline") or [{"time_s": 0, "window_index": 0, "direction_delta_deg": 0, "pressure_delta": 0, "right_pressure_bias": 0, "turbulence": 0.22, "confidence": 0.3}]
        for item in source_timeline:
            vector = wind_vector_57(source, item, index, seed)
            timeline.append(
                {
                    "time_s": item["time_s"],
                    "direction_delta_deg": round_f(float(item.get("direction_delta_deg") or 0) * shift_gain + math.sin(seed * 9 + index) * 0.45, 3),
                    "pressure_delta": round_f(float(item.get("pressure_delta") or 0) * pressure_gain + thermal_gain, 4),
                    "right_pressure_bias": round_f(float(item.get("right_pressure_bias") or 0) * shift_gain, 4),
                    "turbulence": round_f(clamp(float(item.get("turbulence") or 0.2) * (0.9 + seed * 0.28), 0.04, 0.95), 4),
                    "feature_vector_57": [round_f(value, 5) for value in vector],
                }
            )
        scenarios.append(
            {
                "id": f"wind_ai_{index + 1:03d}",
                "source_race_key": race_key,
                "seed": round_f(seed, 6),
                "weight": round_f(1 / scenario_count, 5),
                "shift_gain": round_f(shift_gain, 4),
                "pressure_gain": round_f(pressure_gain, 4),
                "thermal_gain": round_f(thermal_gain, 5),
                "base_direction_deg": source.get("base_direction_deg", ORA_REFERENCE_TWD_DEG),
                "timeline": timeline,
            }
        )
    return scenarios


def action_weights_for_profile(profile: dict[str, Any]) -> dict[str, dict[str, float]]:
    track = profile.get("track_style", {})
    sim = profile.get("simulator_profile", {})
    patience = float(track.get("patience", 0.5))
    reactivity = float(track.get("reactivity", 0.5))
    risk = float(track.get("risk_edge", 0.5))
    right = 1 if track.get("preferred_attack_side") == "right" else -1 if track.get("preferred_attack_side") == "left" else 0
    tack_prob = float(sim.get("tack_on_header_probability", 0.42))
    early_layline = float(sim.get("early_layline_probability", 0.35))
    base = {name: {feature: 0.0 for feature in BOT_INPUT_FEATURES} for name in ACTION_NAMES}
    base["hold"].update(
        {
            "vmg_delta": 0.52,
            "speed_delta": 0.22,
            "tack_age": patience * 0.28,
            "board_age": patience * 0.18,
            "preferred_side_match": 0.3 + patience * 0.18,
            "dirty_air": -0.36,
            "land_risk": -0.48,
        }
    )
    base["tack"].update(
        {
            "wind_shift": 0.42 + tack_prob * 0.38,
            "dirty_air": 0.28,
            "land_risk": 0.5,
            "right_share_error": 0.38,
            "board_age": 0.22 + reactivity * 0.2,
            "maneuver_cost": -0.62 + reactivity * 0.18,
            "target_side_match": 0.34,
            "athlete_reactivity": 0.26,
        }
    )
    base["gybe"].update(
        {
            "pressure_delta": 0.24,
            "right_share_error": 0.24,
            "dirty_air": 0.2,
            "maneuver_cost": -0.48,
            "run_twa_error": 0.36,
            "athlete_reactivity": 0.18,
        }
    )
    base["head_up"].update(
        {
            "vmg_delta": 0.25,
            "upwind_twa_error": 0.38,
            "pressure_delta": -0.08,
            "layline_gain": 0.2,
            "maneuver_cost": -0.12,
        }
    )
    base["bear_away"].update(
        {
            "speed_delta": 0.24,
            "pressure_delta": 0.22,
            "run_twa_error": 0.24,
            "land_risk": -0.18,
            "maneuver_cost": -0.1,
        }
    )
    base["seek_pressure"].update(
        {
            "pressure_delta": 0.44,
            "right_pressure_bias": 0.28 * max(0.25, abs(right)),
            "lane_norm": 0.22 * right,
            "athlete_risk_edge": 0.24 * risk,
            "land_risk": -0.36 * (1 - risk * 0.35),
            "fleet_density": -0.18,
            "target_side_match": 0.24,
        }
    )
    for action in ACTION_NAMES:
        for key, value in base[action].items():
            base[action][key] = round_f(value, 5)
    return base


def load_auto_calibration(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return {}
    payload = load_json(path)
    return payload.get("calibration_by_bot", {})


def build_bot_brains(tactical_profiles: dict[str, Any], auto_calibration: dict[str, Any] | None = None) -> dict[str, Any]:
    brains = {}
    auto_calibration = auto_calibration or {}
    for bot_code, profile in tactical_profiles.get("profiles_by_bot", {}).items():
        track = profile.get("track_style", {})
        sim = profile.get("simulator_profile", {})
        aggregate = profile.get("aggregate_stats", {})
        calibration = auto_calibration.get(bot_code, {})
        calibrated_fit = calibration.get("calibrated_fit", {}) if isinstance(calibration, dict) else {}
        calibrated_params = calibrated_fit.get("params", {}) if isinstance(calibrated_fit, dict) else {}
        seed = stable_fraction(bot_code + profile.get("athlete", ""))
        neurons = []
        for index in range(32):
            neuron_seed = stable_fraction(f"{bot_code}-{index}")
            feature_weights = {
                feature: round_f(math.sin((feature_index + 1) * (index + 3) * 0.37 + neuron_seed * 4.2) * 0.18, 5)
                for feature_index, feature in enumerate(BOT_INPUT_FEATURES)
            }
            neurons.append(
                {
                    "id": f"{bot_code}_n{index + 1:02d}",
                    "activation": "tanh" if index % 3 else "relu",
                    "bias": round_f((neuron_seed - 0.5) * 0.22, 5),
                    "feature_weights": feature_weights,
                }
            )
        brains[bot_code] = {
            "bot_code": bot_code,
            "athlete": profile.get("athlete"),
            "version": "athlete-brain-v1",
            "similarity_target": 0.8,
            "seed": round_f(seed, 6),
            "input_features": BOT_INPUT_FEATURES,
            "actions": ACTION_NAMES,
            "memory": {
                "preferred_attack_side": track.get("preferred_attack_side", "center"),
                "start_preference": track.get("start_preference", "center"),
                "patience": calibrated_params.get("patience", track.get("patience", 0.5)),
                "reactivity": calibrated_params.get("reactivity", track.get("reactivity", 0.5)),
                "risk_edge": calibrated_params.get("risk_edge", track.get("risk_edge", 0.5)),
                "maneuver_aggression": calibrated_params.get("maneuver_aggression", 1.0),
                "median_board_s": aggregate.get("median_board_s"),
                "maneuver_rate_per_hour": aggregate.get("maneuver_rate_per_hour"),
                "right_share": aggregate.get("right_share"),
                "leg_right_share_targets": track.get("leg_right_share_targets", []),
                "leg_speed_targets_kn": track.get("leg_speed_targets_kn", []),
                "auto_calibration_score_pct": calibrated_fit.get("score_pct"),
                "auto_calibration_confidence_pct": calibration.get("confidence_pct") if isinstance(calibration, dict) else None,
            },
            "policy": {
                "action_weights": action_weights_for_profile(profile),
                "noise": calibrated_params.get("policy_noise", sim.get("decision_noise", 0.2)),
                "cost_weights": sim.get("cost_weights", {}),
                "hold_long_board_probability": sim.get("hold_long_board_probability", 0.4),
                "dirty_air_escape_probability": sim.get("dirty_air_escape_probability", 0.55),
            },
            "neurons": neurons,
            "auto_calibration": calibration or None,
            "debug_hint": track.get("qwen_hint", ""),
        }
    return {
        "schema": "tacticalsail.bot_ai_brains.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "input_features": BOT_INPUT_FEATURES,
        "actions": ACTION_NAMES,
        "brains_by_bot": brains,
    }


def build_models(dataset_dir: Path, tactical_profiles_path: Path, scenario_count: int, calibration_path: Path | None) -> dict[str, Any]:
    manifest = load_json(dataset_dir / "manifest.json")
    contexts = collect_race_contexts(manifest, dataset_dir)
    races = race_tracks(manifest, dataset_dir)
    race_models = {
        race_key: aggregate_race_wind(race_key, tracks, contexts.get(race_key, {}))
        for race_key, tracks in sorted(races.items())
    }
    wind_model = {
        "schema": "tacticalsail.wind_ai_model.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "feature_names_57": WIND_FEATURES_57,
        "source": {
            "dataset": str(dataset_dir),
            "valid_track_count": sum(len(items) for items in races.values()),
            "race_count": len(races),
        },
        "race_models": race_models,
        "scenarios": build_wind_scenarios(race_models, scenario_count),
    }
    tactical_profiles = load_json(tactical_profiles_path)
    bot_brains = build_bot_brains(tactical_profiles, load_auto_calibration(calibration_path))
    return {"wind_model": wind_model, "bot_brains": bot_brains}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build wind and bot AI models from TacticalSail GPX data.")
    parser.add_argument("--dataset", type=Path, default=Path("data/regattas/athlete_tracks"))
    parser.add_argument("--profiles", type=Path, default=Path("data/generated/bot_tactical_profiles.json"))
    parser.add_argument("--calibration", type=Path, default=Path("data/generated/bot_auto_calibration.json"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/generated"))
    parser.add_argument("--scenarios", type=int, default=100)
    args = parser.parse_args()

    models = build_models(args.dataset, args.profiles, args.scenarios, args.calibration)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    wind_path = args.out_dir / "wind_ai_model.json"
    bot_path = args.out_dir / "bot_ai_brains.json"
    suite_path = args.out_dir / "regatta_ai_suite.json"
    wind_path.write_text(json.dumps(models["wind_model"], ensure_ascii=False, indent=2), encoding="utf-8")
    bot_path.write_text(json.dumps(models["bot_brains"], ensure_ascii=False, indent=2), encoding="utf-8")
    suite_path.write_text(json.dumps(models, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {wind_path}")
    print(f"Wrote {bot_path}")
    print(f"Wrote {suite_path}")
    print(f"Wind scenarios: {len(models['wind_model']['scenarios'])}; features: {len(WIND_FEATURES_57)}")
    print(f"Bot brains: {len(models['bot_brains']['brains_by_bot'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

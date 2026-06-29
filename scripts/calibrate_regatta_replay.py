#!/usr/bin/env python3
"""Build replay calibration data from ILCA GPX tracks."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


KNOT_TO_MPS = 0.514444
ORA_TWD_DEG = 185.0
MAX_GHOST_POINTS = 260

# Leg lengths taken from the Garda/Area B reference tables supplied with the GPX.
LEG_DEFINITIONS = [
    ("start_to_alfa1", "bolina_1", 1135),
    ("alfa1_to_alfa2", "lasco_offset", 1052),
    ("alfa2_to_gate", "poppa_gate", 1054),
    ("gate_to_alfa2", "bolina_2", 807),
    ("alfa2_to_3p", "poppa_3p", 1251),
    ("3p_to_finish", "arrivo", 274),
]


@dataclass
class TrackPoint:
    lat: float
    lon: float
    time: datetime | None


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_gpx(path: Path) -> list[TrackPoint]:
    root = ET.parse(path).getroot()
    points: list[TrackPoint] = []
    for node in root.findall(".//{*}trkpt"):
        time_node = node.find("{*}time")
        points.append(
            TrackPoint(
                lat=float(node.attrib["lat"]),
                lon=float(node.attrib["lon"]),
                time=parse_time(time_node.text if time_node is not None else None),
            )
        )
    return points


def haversine_m(a: TrackPoint | dict, b: TrackPoint | dict) -> float:
    a_lat = a.lat if isinstance(a, TrackPoint) else a["lat"]
    a_lon = a.lon if isinstance(a, TrackPoint) else a["lon"]
    b_lat = b.lat if isinstance(b, TrackPoint) else b["lat"]
    b_lon = b.lon if isinstance(b, TrackPoint) else b["lon"]
    radius = 6371000.0
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    d_lat = math.radians(b_lat - a_lat)
    d_lon = math.radians(b_lon - a_lon)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def bearing_deg(a: TrackPoint, b: TrackPoint) -> float:
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    d_lon = math.radians(b.lon - a.lon)
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def angle_delta(a: float, b: float) -> float:
    return ((a - b + 540) % 360) - 180


def cumulative_distances(points: list[TrackPoint]) -> list[float]:
    distances = [0.0]
    for previous, current in zip(points, points[1:]):
        distances.append(distances[-1] + haversine_m(previous, current))
    return distances


def duration_s(points: list[TrackPoint]) -> float | None:
    if len(points) < 2 or points[0].time is None or points[-1].time is None:
        return None
    return max(0.0, (points[-1].time - points[0].time).total_seconds())


def index_at_distance(cumulative: list[float], target_m: float) -> int:
    if not cumulative:
        return 0
    lo, hi = 0, len(cumulative) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cumulative[mid] < target_m:
            lo = mid + 1
        else:
            hi = mid
    return lo


def coordinate_rotation_twd(point: TrackPoint, ref: TrackPoint, twd_deg: float = ORA_TWD_DEG) -> dict:
    lat_to_m = 111132.0
    lon_to_m = 111132.0 * math.cos(math.radians(ref.lat))
    delta_lat_m = (point.lat - ref.lat) * lat_to_m
    delta_lon_m = (point.lon - ref.lon) * lon_to_m
    twd_rad = math.radians(twd_deg)
    return {
        "x_prime_transverse": math.cos(twd_rad) * delta_lat_m + math.sin(twd_rad) * delta_lon_m,
        "y_prime_wind_axis": -math.sin(twd_rad) * delta_lat_m + math.cos(twd_rad) * delta_lon_m,
    }


def headings_for(points: list[TrackPoint]) -> list[float]:
    headings: list[float] = []
    for previous, current in zip(points, points[1:]):
        if haversine_m(previous, current) >= 8:
            headings.append(bearing_deg(previous, current))
    return headings


def count_heading_changes(headings: list[float], threshold_deg: float = 58.0) -> int:
    if len(headings) < 2:
        return 0
    changes = 0
    previous = headings[0]
    cooldown = 0
    for heading in headings[1:]:
        if abs(angle_delta(heading, previous)) >= threshold_deg and cooldown <= 0:
            changes += 1
            cooldown = 4
        previous = heading
        cooldown -= 1
    return changes


def quantile(values: list[float], q: float, fallback: float = 0.0) -> float:
    if not values:
        return fallback
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * q)))
    return ordered[idx]


def downsample_track(points: list[TrackPoint], max_points: int = MAX_GHOST_POINTS) -> list[list[float]]:
    if len(points) <= max_points:
        return [[round(p.lat, 7), round(p.lon, 7)] for p in points]
    sampled: list[list[float]] = []
    for idx in range(max_points):
        source_idx = round(idx * (len(points) - 1) / (max_points - 1))
        point = points[source_idx]
        sampled.append([round(point.lat, 7), round(point.lon, 7)])
    return sampled


def leg_slices(points: list[TrackPoint], cumulative: list[float]) -> list[tuple[int, int]]:
    total = cumulative[-1] if cumulative else 0.0
    weight_total = sum(length for _, _, length in LEG_DEFINITIONS)
    breakpoints = [0.0]
    running = 0.0
    for _, _, length in LEG_DEFINITIONS:
        running += length / weight_total
        breakpoints.append(total * running)
    slices: list[tuple[int, int]] = []
    for start_m, end_m in zip(breakpoints, breakpoints[1:]):
        start_idx = index_at_distance(cumulative, start_m)
        end_idx = max(start_idx + 1, index_at_distance(cumulative, end_m))
        slices.append((start_idx, min(end_idx, len(points) - 1)))
    return slices


def segment_metrics(points: list[TrackPoint], cumulative: list[float], track_center_lon: float) -> list[dict]:
    segments: list[dict] = []
    for leg_index, (start_idx, end_idx) in enumerate(leg_slices(points, cumulative), start=1):
        name, mode, _ = LEG_DEFINITIONS[leg_index - 1]
        leg_points = points[start_idx : end_idx + 1]
        leg_distance = max(0.0, cumulative[end_idx] - cumulative[start_idx])
        leg_duration = duration_s(leg_points)
        speed_kn = leg_distance / leg_duration / KNOT_TO_MPS if leg_duration and leg_duration > 0 else None
        headings = headings_for(leg_points)
        right_points = sum(1 for point in leg_points if point.lon >= track_center_lon)
        right_share = right_points / max(1, len(leg_points))
        projected = [coordinate_rotation_twd(point, leg_points[0]) for point in leg_points]
        x_values = [item["x_prime_transverse"] for item in projected]
        y_values = [item["y_prime_wind_axis"] for item in projected]
        heading_changes = count_heading_changes(headings)
        segments.append(
            {
                "leg": leg_index,
                "name": name,
                "mode": mode,
                "start_index": start_idx,
                "end_index": end_idx,
                "points": len(leg_points),
                "distance_m": round(leg_distance, 1),
                "duration_s": round(leg_duration, 1) if leg_duration is not None else None,
                "avg_speed_kn": round(speed_kn, 2) if speed_kn is not None else None,
                "right_share": round(right_share, 3),
                "dominant_side": "right" if right_share >= 0.56 else "left" if right_share <= 0.44 else "center",
                "heading_change_count": heading_changes,
                "median_heading_deg": round(statistics.median(headings), 1) if headings else None,
                "x_prime_min_m": round(min(x_values), 1) if x_values else 0,
                "x_prime_max_m": round(max(x_values), 1) if x_values else 0,
                "y_prime_gain_m": round((y_values[-1] - y_values[0]) if y_values else 0, 1),
            }
        )
    return segments


def build_track_record(entry: dict, regatta_dir: Path, style_by_bot: dict) -> dict:
    track_path = regatta_dir / entry["track"]
    points = parse_gpx(track_path)
    if len(points) < 2:
        raise ValueError(f"{track_path} has too few points")

    cumulative = cumulative_distances(points)
    total_distance = cumulative[-1]
    total_duration = duration_s(points)
    center_lon = statistics.median(point.lon for point in points)
    headings = headings_for(points)
    segments = segment_metrics(points, cumulative, center_lon)
    style = style_by_bot.get(entry["bot_code"]) or style_by_bot.get(track_path.name) or {}
    segment_right_shares = [segment["right_share"] for segment in segments]
    maneuver_counts = [segment["heading_change_count"] for segment in segments]
    top_four_focus = entry["rank"] <= 4
    total_speed_kn = total_distance / total_duration / KNOT_TO_MPS if total_duration else None
    mean_leg_speed = statistics.mean([s["avg_speed_kn"] for s in segments if s["avg_speed_kn"] is not None])
    ghost_track = downsample_track(points)

    return {
        "athlete": entry["athlete"],
        "bot_code": entry["bot_code"],
        "rank": entry["rank"],
        "ranking_confidence": entry.get("confidence", "medium"),
        "track_file": entry["track"],
        "focus_replay": top_four_focus,
        "summary": {
            "points": len(points),
            "ghost_points": len(ghost_track),
            "distance_km": round(total_distance / 1000, 3),
            "duration_min": round(total_duration / 60, 2) if total_duration is not None else None,
            "avg_speed_kn": round(total_speed_kn, 2) if total_speed_kn is not None else None,
            "mean_leg_speed_kn": round(mean_leg_speed, 2) if mean_leg_speed else None,
            "major_heading_changes": count_heading_changes(headings),
            "right_share_overall": round(sum(segment_right_shares) / len(segment_right_shares), 3),
            "leg_side_pattern": [segment["dominant_side"] for segment in segments],
            "maneuver_pattern": maneuver_counts,
        },
        "engine_targets": {
            "style_label": style.get("style_label"),
            "preferred_attack_side": style.get("preferred_attack_side"),
            "initial_side_sign": style.get("initial_side_sign"),
            "patience": style.get("patience"),
            "reactivity": style.get("reactivity"),
            "board_commitment_ms": style.get("board_commitment_ms"),
            "min_tack_interval_ms": style.get("min_tack_interval_ms"),
            "min_tack_distance_m": style.get("min_tack_distance_m"),
            "max_upwind_tactical_tacks": style.get("max_upwind_tactical_tacks"),
            "leg_right_share_targets": [round(value, 3) for value in segment_right_shares],
            "leg_maneuver_targets": maneuver_counts,
        },
        "leg_segments": segments,
        "ghost_track": ghost_track,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--regatta", default="data/regattas/ilca4_r1", help="Regatta dataset directory")
    args = parser.parse_args()

    regatta_dir = Path(args.regatta)
    manifest = json.loads((regatta_dir / "manifest.json").read_text())
    styles_payload = json.loads((regatta_dir / "athlete_styles.json").read_text())
    style_by_bot = {item["track_file"]: item for item in styles_payload.get("styles", []) if item.get("track_file")}
    style_by_bot.update({item.get("bot_code", ""): item for item in styles_payload.get("styles", []) if item.get("bot_code")})

    boats: dict[str, dict] = {}
    ghost_tracks: list[dict] = []
    for entry in manifest["ranking_interpretation"]:
        record = build_track_record(entry, regatta_dir, style_by_bot)
        boats[entry["bot_code"]] = record
        ghost_tracks.append(
            {
                "bot_code": entry["bot_code"],
                "athlete": entry["athlete"],
                "rank": entry["rank"],
                "focus_replay": record["focus_replay"],
                "points": record["ghost_track"],
            }
        )

    payload = {
        "regatta_id": manifest["id"],
        "label": manifest["label"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "calibration_note": (
            "GPX legs are segmented by reference leg-length ratios because the received tracks "
            "do not contain exact simulator buoy crossings. Use this as tactical/shape calibration, "
            "not as final absolute polar truth."
        ),
        "leg_definitions": [
            {"leg": index + 1, "name": name, "mode": mode, "reference_length_m": length}
            for index, (name, mode, length) in enumerate(LEG_DEFINITIONS)
        ],
        "score_formula": {
            "human_readable": "score = VMG + pressione + lift + layline + stile_atleta - rischio_terra - aria_sporca - manovre_inutili",
            "units": "dimensionless tactical score per candidate side",
        },
        "boats": boats,
        "ghost_tracks": ghost_tracks,
    }

    out_path = regatta_dir / "replay_calibration.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")

    leg_path = regatta_dir / "leg_segments.json"
    leg_path.write_text(
        json.dumps(
            {
                "regatta_id": manifest["id"],
                "generated_at": payload["generated_at"],
                "boats": {bot_code: record["leg_segments"] for bot_code, record in boats.items()},
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(f"Wrote {out_path}")
    print(f"Wrote {leg_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

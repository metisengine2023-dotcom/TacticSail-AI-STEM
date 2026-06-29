#!/usr/bin/env python3
"""Build multi-race tactical bot profiles from organized athlete GPX tracks."""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import xml.etree.ElementTree as ET
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


KNOT_TO_MPS = 0.514444
ORA_REFERENCE_TWD_DEG = 185.0
MAX_GHOST_POINTS = 220
LEG_RATIOS = [1135, 1052, 1054, 807, 1251, 274]
LEG_NAMES = ["bolina_1", "lasco_offset", "poppa_gate", "bolina_2", "poppa_3p", "arrivo"]
LEG_MODES = ["upwind", "reach", "run", "upwind", "run", "finish"]


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


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def mean(values: list[float], fallback: float = 0.0) -> float:
    return statistics.mean(values) if values else fallback


def median(values: list[float], fallback: float = 0.0) -> float:
    return statistics.median(values) if values else fallback


def quantile(values: list[float], q: float, fallback: float = 0.0) -> float:
    if not values:
        return fallback
    ordered = sorted(values)
    index = round((len(ordered) - 1) * clamp(q, 0, 1))
    return ordered[index]


def haversine_m(a: TrackPoint | dict[str, float], b: TrackPoint | dict[str, float]) -> float:
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


def bearing_deg(a: TrackPoint | dict[str, float], b: TrackPoint | dict[str, float]) -> float:
    a_lat = a.lat if isinstance(a, TrackPoint) else a["lat"]
    a_lon = a.lon if isinstance(a, TrackPoint) else a["lon"]
    b_lat = b.lat if isinstance(b, TrackPoint) else b["lat"]
    b_lon = b.lon if isinstance(b, TrackPoint) else b["lon"]
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)
    d_lon = math.radians(b_lon - a_lon)
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def angle_delta(a: float, b: float) -> float:
    return ((a - b + 540) % 360) - 180


def circular_mean(angles: list[float], fallback: float = ORA_REFERENCE_TWD_DEG) -> float:
    if not angles:
        return fallback
    sin_sum = sum(math.sin(math.radians(angle)) for angle in angles)
    cos_sum = sum(math.cos(math.radians(angle)) for angle in angles)
    return (math.degrees(math.atan2(sin_sum, cos_sum)) + 360) % 360


def centroid(points: list[TrackPoint] | list[dict[str, float]]) -> dict[str, float]:
    if not points:
        return {"lat": 0.0, "lon": 0.0}
    return {
        "lat": mean([p.lat if isinstance(p, TrackPoint) else p["lat"] for p in points]),
        "lon": mean([p.lon if isinstance(p, TrackPoint) else p["lon"] for p in points]),
    }


def cumulative_distances(points: list[TrackPoint]) -> list[float]:
    distances = [0.0]
    for previous, current in zip(points, points[1:]):
        distances.append(distances[-1] + haversine_m(previous, current))
    return distances


def duration_s(points: list[TrackPoint]) -> float | None:
    if len(points) < 2 or points[0].time is None or points[-1].time is None:
        return None
    return max(0.0, (points[-1].time - points[0].time).total_seconds())


def moving_segments(points: list[TrackPoint]) -> list[dict[str, float]]:
    segments: list[dict[str, float]] = []
    for previous, current in zip(points, points[1:]):
        distance = haversine_m(previous, current)
        if distance < 2:
            continue
        dt = 1.0
        if previous.time is not None and current.time is not None:
            dt = max(0.2, (current.time - previous.time).total_seconds())
        speed_kn = distance / dt / KNOT_TO_MPS
        if speed_kn > 16:
            continue
        segments.append(
            {
                "distance_m": distance,
                "dt_s": dt,
                "speed_kn": speed_kn,
                "heading": bearing_deg(previous, current),
                "lat": current.lat,
                "lon": current.lon,
            }
        )
    return segments


def heading_changes(segments: list[dict[str, float]], threshold_deg: float = 58.0) -> list[int]:
    changes: list[int] = []
    if len(segments) < 2:
        return changes
    previous = segments[0]["heading"]
    cooldown = 0
    for index, segment in enumerate(segments[1:], start=1):
        if abs(angle_delta(segment["heading"], previous)) >= threshold_deg and cooldown <= 0:
            changes.append(index)
            cooldown = 5
        previous = segment["heading"]
        cooldown -= 1
    return changes


def board_lengths(points: list[TrackPoint], segments: list[dict[str, float]], changes: list[int]) -> tuple[list[float], list[float]]:
    if not segments:
        return [], []
    starts = [0] + changes
    ends = changes + [len(segments) - 1]
    board_m: list[float] = []
    board_s: list[float] = []
    for start, end in zip(starts, ends):
        if end <= start:
            continue
        board_m.append(sum(segment["distance_m"] for segment in segments[start:end]))
        board_s.append(sum(segment["dt_s"] for segment in segments[start:end]))
    return board_m, board_s


def index_at_distance(cumulative: list[float], target_m: float) -> int:
    if not cumulative:
        return 0
    low, high = 0, len(cumulative) - 1
    while low < high:
        mid = (low + high) // 2
        if cumulative[mid] < target_m:
            low = mid + 1
        else:
            high = mid
    return low


def leg_slices(points: list[TrackPoint], cumulative: list[float]) -> list[tuple[int, int]]:
    total = cumulative[-1] if cumulative else 0
    ratio_total = sum(LEG_RATIOS)
    slices: list[tuple[int, int]] = []
    running = 0.0
    starts = [0.0]
    for length in LEG_RATIOS:
        running += length / ratio_total
        starts.append(running * total)
    for start_m, end_m in zip(starts, starts[1:]):
        start_index = index_at_distance(cumulative, start_m)
        end_index = max(start_index + 1, index_at_distance(cumulative, end_m))
        slices.append((start_index, min(end_index, len(points) - 1)))
    return slices


def estimate_twd(points: list[TrackPoint], segments: list[dict[str, float]]) -> float:
    if len(points) < 10:
        return ORA_REFERENCE_TWD_DEG
    start = centroid(points[: max(8, len(points) // 40)])
    south_lat = quantile([point.lat for point in points], 0.08, min(point.lat for point in points))
    south_points = [point for point in points if point.lat <= south_lat]
    windward = centroid(south_points)
    axis = bearing_deg(start, windward)
    if haversine_m(start, windward) < 250:
        return ORA_REFERENCE_TWD_DEG
    early_segments = segments[: max(20, len(segments) // 3)]
    upwind_like = [
        segment["heading"]
        for segment in early_segments
        if 32 <= abs(angle_delta(segment["heading"], axis)) <= 67 and segment["speed_kn"] >= 1.6
    ]
    if len(upwind_like) >= 20:
        left = [heading for heading in upwind_like if angle_delta(heading, axis) > 0]
        right = [heading for heading in upwind_like if angle_delta(heading, axis) < 0]
        if left and right:
            return circular_mean([circular_mean(left), circular_mean(right)], axis)
    return axis


def downsample_track(points: list[TrackPoint], max_points: int = MAX_GHOST_POINTS) -> list[list[float]]:
    if len(points) <= max_points:
        return [[round(point.lat, 7), round(point.lon, 7)] for point in points]
    sampled = []
    for index in range(max_points):
        source_index = round(index * (len(points) - 1) / (max_points - 1))
        point = points[source_index]
        sampled.append([round(point.lat, 7), round(point.lon, 7)])
    return sampled


def track_leg_metrics(points: list[TrackPoint], twd_deg: float, center_lon: float) -> list[dict[str, Any]]:
    cumulative = cumulative_distances(points)
    metrics: list[dict[str, Any]] = []
    for index, (start_index, end_index) in enumerate(leg_slices(points, cumulative), start=1):
        leg_points = points[start_index : end_index + 1]
        leg_segments = moving_segments(leg_points)
        leg_duration = duration_s(leg_points)
        leg_distance = cumulative[end_index] - cumulative[start_index]
        headings = [segment["heading"] for segment in leg_segments if segment["speed_kn"] >= 1.0]
        right_share = sum(1 for point in leg_points if point.lon >= center_lon) / max(1, len(leg_points))
        speed_kn = leg_distance / leg_duration / KNOT_TO_MPS if leg_duration and leg_duration > 0 else None
        twa_values = [abs(angle_delta(heading, twd_deg)) for heading in headings]
        changes = heading_changes(leg_segments)
        metrics.append(
            {
                "leg": index,
                "name": LEG_NAMES[index - 1],
                "mode": LEG_MODES[index - 1],
                "distance_m": round(leg_distance, 1),
                "duration_s": round(leg_duration, 1) if leg_duration is not None else None,
                "avg_speed_kn": round(speed_kn, 2) if speed_kn is not None else None,
                "median_twa_deg": round(median(twa_values), 1) if twa_values else None,
                "right_share": round(right_share, 3),
                "heading_change_count": len(changes),
            }
        )
    return metrics


def track_features(path: Path, race_key: str, race_context: dict[str, float] | None = None) -> dict[str, Any]:
    points = parse_gpx(path)
    segments = moving_segments(points)
    cumulative = cumulative_distances(points)
    total_distance = cumulative[-1] if cumulative else 0.0
    total_duration = duration_s(points)
    changes = heading_changes(segments)
    board_m, board_s = board_lengths(points, segments, changes)
    twd = estimate_twd(points, segments)
    lats = [point.lat for point in points]
    lons = [point.lon for point in points]
    west = float(race_context.get("west", min(lons))) if race_context else min(lons)
    east = float(race_context.get("east", max(lons))) if race_context else max(lons)
    center_lon = float(race_context.get("center_lon", median(lons))) if race_context else median(lons)
    normalized_lons = [(lon - west) / max(0.000001, east - west) for lon in lons]
    edge_use = sum(1 for value in normalized_lons if value <= 0.18 or value >= 0.82) / max(1, len(normalized_lons))
    right_share = sum(1 for lon in lons if lon >= center_lon) / max(1, len(lons))
    early = points[: max(8, len(points) // 8)]
    start_lon_norm = ((centroid(early)["lon"] - west) / max(0.000001, east - west)) if points else 0.5
    heading_values = [segment["heading"] for segment in segments if segment["speed_kn"] >= 1.0]
    twa_values = [abs(angle_delta(heading, twd)) for heading in heading_values]
    return {
        "race_key": race_key,
        "path": str(path),
        "points": len(points),
        "duration_min": round(total_duration / 60, 2) if total_duration is not None else None,
        "distance_km": round(total_distance / 1000, 3),
        "avg_speed_kn": round(total_distance / total_duration / KNOT_TO_MPS, 2) if total_duration else None,
        "estimated_twd_deg": round(twd, 1),
        "twd_source": "track_axis_plus_upwind_headings",
        "wind_left_deg": round(quantile([angle_delta(heading, twd) for heading in heading_values], 0.1), 1) if heading_values else None,
        "wind_right_deg": round(quantile([angle_delta(heading, twd) for heading in heading_values], 0.9), 1) if heading_values else None,
        "heading_change_count": len(changes),
        "maneuver_rate_per_hour": round(len(changes) / max((total_duration or 1) / 3600, 0.01), 2),
        "median_board_m": round(median(board_m), 1) if board_m else None,
        "median_board_s": round(median(board_s), 1) if board_s else None,
        "edge_use_ratio": round(edge_use, 3),
        "right_share": round(right_share, 3),
        "start_line_norm": round(clamp(start_lon_norm, 0, 1), 3),
        "median_twa_deg": round(median(twa_values), 1) if twa_values else None,
        "upwind_twa_deg": round(median([value for value in twa_values if 32 <= value <= 67]), 1)
        if any(32 <= value <= 67 for value in twa_values)
        else None,
        "run_twa_deg": round(median([value for value in twa_values if value >= 125]), 1)
        if any(value >= 125 for value in twa_values)
        else None,
        "bounds": {
            "lat_min": round(min(lats), 7),
            "lat_max": round(max(lats), 7),
            "lon_min": round(west, 7),
            "lon_max": round(east, 7),
        },
        "leg_metrics": track_leg_metrics(points, twd, center_lon),
        "ghost_track": downsample_track(points),
    }


def race_geometry(race_key: str, track_records: list[dict[str, Any]]) -> dict[str, Any]:
    all_points: list[TrackPoint] = []
    start_points: list[TrackPoint] = []
    finish_points: list[TrackPoint] = []
    twds: list[float] = []
    for record in track_records:
        points = parse_gpx(Path(record["path"]))
        if not points:
            continue
        all_points.extend(points)
        start_points.extend(points[: max(5, len(points) // 60)])
        finish_points.extend(points[-max(5, len(points) // 60) :])
        twds.append(float(record["estimated_twd_deg"]))
    if not all_points:
        return {"race_key": race_key, "quality": "empty"}
    lats = [point.lat for point in all_points]
    lons = [point.lon for point in all_points]
    south_cut = quantile(lats, 0.08, min(lats))
    north_cut = quantile(lats, 0.92, max(lats))
    west_cut = quantile(lons, 0.08, min(lons))
    east_cut = quantile(lons, 0.92, max(lons))
    windward_points = [point for point in all_points if point.lat <= south_cut]
    leeward_points = [point for point in all_points if point.lat >= north_cut]
    start_center = centroid(start_points)
    finish_center = centroid(finish_points)
    start_lons = [point.lon for point in start_points] or lons
    start_lats = [point.lat for point in start_points] or lats
    pin = {"lat": median(start_lats), "lon": quantile(start_lons, 0.12, min(start_lons))}
    committee = {"lat": median(start_lats), "lon": quantile(start_lons, 0.88, max(start_lons))}
    field_width_m = haversine_m({"lat": median(lats), "lon": west_cut}, {"lat": median(lats), "lon": east_cut})
    field_height_m = haversine_m({"lat": south_cut, "lon": median(lons)}, {"lat": north_cut, "lon": median(lons)})
    return {
        "race_key": race_key,
        "track_count": len(track_records),
        "estimated_twd_deg": round(circular_mean(twds), 1),
        "wind_oscillation_deg": {
            "left": round(quantile([float(item["wind_left_deg"] or 0) for item in track_records], 0.2), 1),
            "right": round(quantile([float(item["wind_right_deg"] or 0) for item in track_records], 0.8), 1),
        },
        "start_line": {
            "pin": {key: round(value, 7) for key, value in pin.items()},
            "committee": {key: round(value, 7) for key, value in committee.items()},
            "center": {key: round(value, 7) for key, value in start_center.items()},
        },
        "finish_center": {key: round(value, 7) for key, value in finish_center.items()},
        "marks": {
            "windward_estimate": {key: round(value, 7) for key, value in centroid(windward_points).items()},
            "leeward_gate_estimate": {key: round(value, 7) for key, value in centroid(leeward_points).items()},
            "offset_estimate": {
                "lat": round(centroid(windward_points)["lat"], 7),
                "lon": round(quantile([point.lon for point in windward_points], 0.82, max(lons)), 7),
            },
        },
        "bounds": {
            "lat_min": round(min(lats), 7),
            "lat_max": round(max(lats), 7),
            "lon_min": round(min(lons), 7),
            "lon_max": round(max(lons), 7),
            "width_m": round(field_width_m, 1),
            "height_m": round(field_height_m, 1),
        },
        "quality": "estimated_from_gpx_cluster",
    }


def start_preference_label(value: float) -> str:
    if value <= 0.34:
        return "pin"
    if value >= 0.66:
        return "committee"
    return "center"


def style_label(preferred_side: str, patience: float, reactivity: float, edge_use: float) -> str:
    tempo = "long-board" if patience >= 0.66 else "short-board" if reactivity >= 0.62 else "medium-board"
    risk = "edge" if edge_use >= 0.36 else "center"
    return f"{preferred_side}-{risk}-{tempo}"


def collect_race_contexts(manifest: dict[str, Any], dataset_dir: Path) -> dict[str, dict[str, float]]:
    grouped: dict[str, list[TrackPoint]] = defaultdict(list)
    for athlete in manifest["athletes"]:
        folder = dataset_dir / athlete["folder"]
        for relative in athlete.get("valid_tracks", []):
            path = folder / relative
            race_key = Path(relative).stem
            grouped[race_key].extend(parse_gpx(path))

    contexts: dict[str, dict[str, float]] = {}
    for race_key, points in grouped.items():
        if not points:
            continue
        lons = [point.lon for point in points]
        lats = [point.lat for point in points]
        contexts[race_key] = {
            "west": quantile(lons, 0.03, min(lons)),
            "east": quantile(lons, 0.97, max(lons)),
            "center_lon": median(lons),
            "south": quantile(lats, 0.03, min(lats)),
            "north": quantile(lats, 0.97, max(lats)),
        }
    return contexts


def build_athlete_profile(athlete: dict[str, Any], dataset_dir: Path, race_contexts: dict[str, dict[str, float]]) -> dict[str, Any]:
    folder = dataset_dir / athlete["folder"]
    records = []
    for relative in athlete.get("valid_tracks", []):
        path = folder / relative
        race_key = Path(relative).stem
        records.append(track_features(path, race_key, race_contexts.get(race_key)))

    board_s = [record["median_board_s"] for record in records if record.get("median_board_s") is not None]
    board_m = [record["median_board_m"] for record in records if record.get("median_board_m") is not None]
    maneuver_rates = [record["maneuver_rate_per_hour"] for record in records]
    edge_uses = [record["edge_use_ratio"] for record in records]
    right_shares = [record["right_share"] for record in records]
    start_norms = [record["start_line_norm"] for record in records]
    upwind_twas = [record["upwind_twa_deg"] for record in records if record.get("upwind_twa_deg") is not None]
    run_twas = [record["run_twa_deg"] for record in records if record.get("run_twa_deg") is not None]
    speeds = [record["avg_speed_kn"] for record in records if record.get("avg_speed_kn") is not None]
    leg_right_targets = []
    leg_maneuver_targets = []
    leg_speed_targets = []
    for leg_index in range(6):
        leg_right_targets.append(round(mean([record["leg_metrics"][leg_index]["right_share"] for record in records]), 3))
        leg_maneuver_targets.append(round(mean([record["leg_metrics"][leg_index]["heading_change_count"] for record in records]), 2))
        speed_values = [
            record["leg_metrics"][leg_index]["avg_speed_kn"]
            for record in records
            if record["leg_metrics"][leg_index]["avg_speed_kn"] is not None
        ]
        leg_speed_targets.append(round(mean(speed_values), 2) if speed_values else None)

    median_board_s = median(board_s, 150)
    median_board_m = median(board_m, 320)
    maneuver_rate = mean(maneuver_rates)
    edge_use = mean(edge_uses)
    right_share = mean(right_shares)
    start_norm = median(start_norms, 0.5)
    preferred_side = "right" if right_share >= 0.53 else "left" if right_share <= 0.47 else "center"
    patience = clamp((median_board_s - 70) / 260, 0, 1)
    reactivity = clamp((maneuver_rate - 12) / 18, 0, 1)
    risk = clamp(edge_use / 0.48, 0, 1)
    rank_weight = {
        "BOT_01": 1.0,
        "BOT_05": 0.86,
        "BOT_06": 0.72,
        "BOT_02": 0.58,
        "BOT_03": 0.45,
        "BOT_04": 0.32,
        "BOT_07": 0.22,
    }.get(athlete["bot_code"], 0.5)
    lane_bias = clamp((right_share - 0.5) * 1.35, -0.42, 0.42)
    switch_threshold = clamp(0.09 + patience * 0.15 - reactivity * 0.05 + risk * 0.04, 0.06, 0.29)
    board_commitment_ms = round(clamp(median_board_s * 760, 78000, 260000))
    min_tack_interval_ms = round(clamp(median_board_s * 560, 62000, 235000))
    min_tack_distance_m = round(clamp(median_board_m * 0.62, 210, 470))
    max_tacks = int(clamp(round(mean(leg_maneuver_targets[:4]) + 1), 2, 5))
    attack_side_sign = -1 if preferred_side == "right" else 1 if preferred_side == "left" else 0

    track_style = {
        "source_regatta": "athlete_tracks_aggregate",
        "style_label": style_label(preferred_side, patience, reactivity, edge_use),
        "preferred_attack_side": preferred_side,
        "initial_side_sign": attack_side_sign,
        "rank_weight": round(rank_weight, 3),
        "patience": round(patience, 3),
        "reactivity": round(reactivity, 3),
        "risk_edge": round(risk, 3),
        "lane_bias_adjust": round(lane_bias, 3),
        "switch_threshold": round(switch_threshold, 3),
        "board_commitment_ms": board_commitment_ms,
        "min_tack_interval_ms": min_tack_interval_ms,
        "min_tack_distance_m": min_tack_distance_m,
        "max_upwind_tactical_tacks": max_tacks,
        "course_boldness_adjust": round((risk - 0.5) * 0.09 + (reactivity - 0.5) * 0.04, 3),
        "response_adjust": round((reactivity - 0.5) * 0.035 - (patience - 0.5) * 0.012, 3),
        "wind_sensitivity_adjust": round((reactivity * 0.06 + risk * 0.03) - 0.035, 3),
        "upwind_lead_adjust": round((patience - 0.5) * 0.05 - risk * 0.015, 3),
        "layline_lead_adjust": round((risk - 0.5) * 0.04 + (patience - 0.5) * 0.018, 3),
        "leg_right_share_targets": leg_right_targets,
        "leg_maneuver_targets": leg_maneuver_targets,
        "leg_speed_targets_kn": leg_speed_targets,
        "start_preference": start_preference_label(start_norm),
        "start_line_norm": round(start_norm, 3),
        "upwind_twa_deg": round(median(upwind_twas), 1) if upwind_twas else None,
        "run_twa_deg": round(median(run_twas), 1) if run_twas else None,
        "qwen_hint": (
            f"{athlete['athlete']}: stile {preferred_side}, partenza {start_preference_label(start_norm)}, "
            f"pazienza {patience:.2f}, reattivita {reactivity:.2f}, rischio bordo {risk:.2f}. "
            "Usa variabilita 20%: replica lo stile, non la traccia rigida."
        ),
    }

    simulator_profile = {
        "similarity_target": 0.80,
        "decision_noise": round(0.20 + (1 - rank_weight) * 0.04, 3),
        "tack_on_header_probability": round(clamp(0.25 + reactivity * 0.55 - patience * 0.18, 0.12, 0.82), 3),
        "hold_long_board_probability": round(clamp(0.28 + patience * 0.58 - reactivity * 0.18, 0.1, 0.88), 3),
        "early_layline_probability": round(clamp(0.12 + risk * 0.52 + patience * 0.08, 0.08, 0.72), 3),
        "center_recovery_probability": round(clamp(0.55 - risk * 0.35 + (1 - reactivity) * 0.12, 0.18, 0.78), 3),
        "dirty_air_escape_probability": round(clamp(0.35 + reactivity * 0.35 + rank_weight * 0.18, 0.2, 0.9), 3),
        "preferred_start_zone": start_preference_label(start_norm),
        "cost_weights": {
            "vmg": round(1.0 + rank_weight * 0.16, 3),
            "pressure": round(0.72 + reactivity * 0.22, 3),
            "lift": round(0.58 + reactivity * 0.24, 3),
            "layline": round(0.48 + risk * 0.24, 3),
            "athlete_style": round(0.62 + patience * 0.26, 3),
            "land_risk": round(0.9 - risk * 0.16, 3),
            "dirty_air": round(0.62 + reactivity * 0.3, 3),
            "maneuver_cost": round(0.82 + patience * 0.32, 3),
        },
    }

    return {
        "athlete": athlete["athlete"],
        "bot_code": athlete["bot_code"],
        "folder": athlete["folder"],
        "valid_track_count": len(records),
        "excluded_track_count": len(athlete.get("excluded_tracks", [])),
        "track_style": track_style,
        "simulator_profile": simulator_profile,
        "aggregate_stats": {
            "avg_speed_kn": round(mean(speeds), 2) if speeds else None,
            "median_board_s": round(median_board_s, 1),
            "median_board_m": round(median_board_m, 1),
            "maneuver_rate_per_hour": round(maneuver_rate, 2),
            "edge_use_ratio": round(edge_use, 3),
            "right_share": round(right_share, 3),
            "estimated_twd_deg": round(circular_mean([record["estimated_twd_deg"] for record in records]), 1),
            "start_line_norm": round(start_norm, 3),
        },
        "tracks": records,
    }


def write_csv_summary(path: Path, profiles: list[dict[str, Any]]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "bot_code",
                "athlete",
                "valid_tracks",
                "style_label",
                "preferred_side",
                "start",
                "patience",
                "reactivity",
                "risk_edge",
                "median_board_s",
                "maneuver_rate_h",
                "right_share",
                "avg_speed_kn",
            ]
        )
        for profile in profiles:
            style = profile["track_style"]
            stats = profile["aggregate_stats"]
            writer.writerow(
                [
                    profile["bot_code"],
                    profile["athlete"],
                    profile["valid_track_count"],
                    style["style_label"],
                    style["preferred_attack_side"],
                    style["start_preference"],
                    style["patience"],
                    style["reactivity"],
                    style["risk_edge"],
                    stats["median_board_s"],
                    stats["maneuver_rate_per_hour"],
                    stats["right_share"],
                    stats["avg_speed_kn"],
                ]
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/regattas/athlete_tracks", help="Organized athlete GPX dataset")
    parser.add_argument("--out", default="data/generated/bot_tactical_profiles.json", help="Generated bot profile JSON")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset)
    manifest = json.loads((dataset_dir / "manifest.json").read_text())
    race_contexts = collect_race_contexts(manifest, dataset_dir)
    profiles = [build_athlete_profile(athlete, dataset_dir, race_contexts) for athlete in manifest["athletes"]]
    by_race: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for profile in profiles:
        for record in profile["tracks"]:
            by_race[record["race_key"]].append(record)
    field_geometries = {race_key: race_geometry(race_key, records) for race_key, records in sorted(by_race.items())}
    generated_at = datetime.now(timezone.utc).isoformat()
    valid_count = sum(profile["valid_track_count"] for profile in profiles)
    excluded_count = sum(profile["excluded_track_count"] for profile in profiles)
    payload = {
        "schema": "tacticalsail.bot_tactical_profiles.v1",
        "generated_at": generated_at,
        "source_manifest": str(dataset_dir / "manifest.json"),
        "data_audit": {
            "athletes": len(profiles),
            "valid_tracks": valid_count,
            "excluded_tracks": excluded_count,
            "total_saved_tracks": valid_count + excluded_count,
            "wind_context": manifest.get("wind_context", "Ora"),
            "target_similarity": 0.80,
            "note": "Profiles are calibrated from valid GPX only. Excluded tracks are retained but not used for behavior fitting.",
        },
        "field_geometry": field_geometries,
        "profiles": profiles,
        "profiles_by_bot": {profile["bot_code"]: profile for profile in profiles},
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    (dataset_dir / "field_geometry_model.json").write_text(json.dumps(field_geometries, indent=2, ensure_ascii=False) + "\n")
    (dataset_dir / "tactical_profiles.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    write_csv_summary(dataset_dir / "tactical_profile_summary.csv", profiles)
    print(f"Wrote {out_path}")
    print(f"Wrote {dataset_dir / 'field_geometry_model.json'}")
    print(f"Wrote {dataset_dir / 'tactical_profiles.json'}")
    print(f"Wrote {dataset_dir / 'tactical_profile_summary.csv'}")
    print(f"Valid tracks: {valid_count}; excluded: {excluded_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from pathlib import Path
from typing import Any
import zipfile
import xml.etree.ElementTree as ET


GPX_NS = {"g": "http://www.topografix.com/GPX/1/1"}
KNOT_TO_MPS = 0.514444


@dataclass(slots=True)
class TrackPoint:
    lat: float
    lon: float
    time: datetime | None = None


@dataclass(slots=True)
class TrackSummary:
    source: str
    points: int
    distance_m: float
    duration_s: float
    avg_speed_kn: float
    start_time: datetime | None
    end_time: datetime | None
    race_points: int = 0
    race_distance_m: float = 0.0
    race_duration_s: float = 0.0
    race_avg_speed_kn: float = 0.0
    race_start_time: datetime | None = None
    race_end_time: datetime | None = None
    race_window_label: str = ""


def _read_source_bytes(path: Path) -> tuple[bytes, str]:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            members = [name for name in archive.namelist() if not name.endswith("/")]
            if not members:
                raise ValueError(f"Zip archive has no files: {path}")
            chosen = next((name for name in members if name.lower().endswith(".gpx")), members[0])
            return archive.read(chosen), f"{path}::{chosen}"
    return path.read_bytes(), str(path)


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def load_track_points(path: str | Path) -> tuple[list[TrackPoint], str]:
    source = Path(path)
    data, label = _read_source_bytes(source)
    root = ET.fromstring(data)

    points: list[TrackPoint] = []
    for node in root.findall(".//g:trkpt", GPX_NS):
        lat = float(node.attrib["lat"])
        lon = float(node.attrib["lon"])
        time = _parse_time(node.findtext("g:time", default=None, namespaces=GPX_NS))
        points.append(TrackPoint(lat=lat, lon=lon, time=time))

    if not points:
        raise ValueError(f"No GPX track points found in {label}")
    return points, label


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * radius_m * asin(sqrt(a))


def _project_points(points: list[TrackPoint]) -> tuple[list[tuple[float, float]], float, float]:
    if not points:
        return [], 0.0, 0.0
    lat0 = sum(point.lat for point in points) / len(points)
    lon0 = sum(point.lon for point in points) / len(points)
    lat_scale = 111_320.0
    lon_scale = 111_320.0 * cos(radians(lat0))
    projected = [
        ((point.lon - lon0) * lon_scale, (point.lat - lat0) * lat_scale)
        for point in points
    ]
    return projected, lat0, lon0


def _project_geo_point(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    lat_scale = 111_320.0
    lon_scale = 111_320.0 * cos(radians(lat0))
    return ((lon - lon0) * lon_scale, (lat - lat0) * lat_scale)


def _segment_intersection_param(
    p1: tuple[float, float],
    p2: tuple[float, float],
    q1: tuple[float, float],
    q2: tuple[float, float],
) -> tuple[float, float] | None:
    px, py = p1
    rx, ry = p2[0] - p1[0], p2[1] - p1[1]
    qx, qy = q1
    sx, sy = q2[0] - q1[0], q2[1] - q1[1]
    denom = rx * sy - ry * sx
    if abs(denom) < 1e-9:
        return None
    qpx, qpy = qx - px, qy - py
    t = (qpx * sy - qpy * sx) / denom
    u = (qpx * ry - qpy * rx) / denom
    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        return t, u
    return None


def _find_crossing(
    points: list[TrackPoint],
    projected_points: list[tuple[float, float]],
    line: tuple[tuple[float, float], tuple[float, float]] | None,
    lat0: float,
    lon0: float,
) -> tuple[int, float] | None:
    if line is None:
        return None
    line_a = _project_geo_point(line[0][0], line[0][1], lat0, lon0)
    line_b = _project_geo_point(line[1][0], line[1][1], lat0, lon0)
    for index, (p1, p2) in enumerate(zip(projected_points, projected_points[1:])):
        result = _segment_intersection_param(p1, p2, line_a, line_b)
        if result is None:
            continue
        segment_ratio, _ = result
        return index, segment_ratio
    return None


def _interpolate_time(first: datetime | None, second: datetime | None, ratio: float) -> datetime | None:
    if first is None or second is None:
        return None
    delta = second - first
    return first + delta * ratio


def _build_partial_distance(
    points: list[TrackPoint],
    start_index: int,
    start_ratio: float,
    end_index: int,
    end_ratio: float,
) -> tuple[float, int]:
    if end_index < start_index:
        return 0.0, 0

    total = 0.0
    race_points = max(end_index - start_index + 1, 0)

    start_point_a = points[start_index]
    start_point_b = points[start_index + 1]
    total += haversine_m(
        start_point_a.lat,
        start_point_a.lon,
        start_point_a.lat + (start_point_b.lat - start_point_a.lat) * start_ratio,
        start_point_a.lon + (start_point_b.lon - start_point_a.lon) * start_ratio,
    )

    for index in range(start_index + 1, end_index):
        first = points[index]
        second = points[index + 1]
        total += haversine_m(first.lat, first.lon, second.lat, second.lon)

    end_point_a = points[end_index]
    end_point_b = points[end_index + 1]
    total += haversine_m(
        end_point_a.lat + (end_point_b.lat - end_point_a.lat) * end_ratio,
        end_point_a.lon + (end_point_b.lon - end_point_a.lon) * end_ratio,
        end_point_b.lat,
        end_point_b.lon,
    )

    return total, race_points


def _find_active_window(points: list[TrackPoint], threshold_kn: float = 2.0) -> tuple[int, int] | None:
    if len(points) < 2:
        return None
    speeds: list[float] = []
    for point in points:
        # GPX speed lives in the Garmin extension; missing values are treated as zero.
        # We keep the series aligned with track points.
        speed_text = ""
        # speed is stored on the point extension when present
        # the caller already parsed the same file, so we can reuse the raw XML only through the points list.
        # Here we approximate active detection later via point timestamps if speed data is not passed in.
        speeds.append(0.0)
    return None


def summarize_track(
    path: str | Path,
    start_line: tuple[tuple[float, float], tuple[float, float]] | None = None,
    finish_line: tuple[tuple[float, float], tuple[float, float]] | None = None,
    auto_window: bool = False,
) -> TrackSummary:
    points, label = load_track_points(path)
    projected_points, lat0, lon0 = _project_points(points)

    distance_m = 0.0
    for first, second in zip(points, points[1:]):
        distance_m += haversine_m(first.lat, first.lon, second.lat, second.lon)

    times = [point.time for point in points if point.time is not None]
    if len(times) >= 2:
        duration_s = (times[-1] - times[0]).total_seconds()
        start_time = times[0]
        end_time = times[-1]
    else:
        duration_s = float(max(len(points) - 1, 0) * 3)
        start_time = None
        end_time = None

    avg_speed_kn = 0.0 if duration_s <= 0 else (distance_m / duration_s) / KNOT_TO_MPS
    race_distance_m = distance_m
    race_duration_s = duration_s
    race_avg_speed_kn = avg_speed_kn
    race_start_time = start_time
    race_end_time = end_time
    race_points = len(points)
    race_window_label = "full_track"

    start_crossing = _find_crossing(points, projected_points, start_line, lat0, lon0)
    finish_crossing = _find_crossing(points, projected_points, finish_line, lat0, lon0)
    if start_crossing is not None and finish_crossing is not None:
        start_index, start_ratio = start_crossing
        finish_index, finish_ratio = finish_crossing
        if finish_index > start_index or (finish_index == start_index and finish_ratio >= start_ratio):
            race_distance_m, race_points = _build_partial_distance(
                points,
                start_index,
                start_ratio,
                finish_index,
                finish_ratio,
            )
            race_start_time = _interpolate_time(
                points[start_index].time,
                points[start_index + 1].time,
                start_ratio,
            )
            race_end_time = _interpolate_time(
                points[finish_index].time,
                points[finish_index + 1].time,
                finish_ratio,
            )
            if race_start_time is not None and race_end_time is not None:
                race_duration_s = (race_end_time - race_start_time).total_seconds()
            elif len(points) >= 2:
                race_duration_s = max((finish_index - start_index), 0) * 3.0
            else:
                race_duration_s = 0.0
            race_avg_speed_kn = 0.0 if race_duration_s <= 0 else (race_distance_m / race_duration_s) / KNOT_TO_MPS
            race_window_label = "line_trimmed"
    elif auto_window:
        # Fallback heuristic: use the longest active sailing window from the raw GPX speed data.
        # This is a practical approximation when start/finish lines are not available.
        import xml.etree.ElementTree as ET

        source = Path(path)
        data, _ = _read_source_bytes(source)
        root = ET.fromstring(data)
        speeds = [
            float(node.findtext('.//{http://www.garmin.com/xmlschemas/TrackPointExtension/v2}speed', default='0') or 0.0)
            for node in root.findall('.//g:trkpt', GPX_NS)
        ]
        threshold_kn = 2.0
        best_start = None
        best_end = None
        current_start = None
        for index, speed_kn in enumerate(speeds):
            if speed_kn >= threshold_kn and current_start is None:
                current_start = index
            elif speed_kn < threshold_kn and current_start is not None:
                if best_start is None or (index - 1 - current_start) > (best_end - best_start):
                    best_start = current_start
                    best_end = index - 1
                current_start = None
        if current_start is not None:
            if best_start is None or (len(speeds) - 1 - current_start) > (best_end - best_start):
                best_start = current_start
                best_end = len(speeds) - 1

        if best_start is not None and best_end is not None and best_end > best_start:
            race_window_label = "auto_window_speed"
            race_distance_m = 0.0
            for index in range(best_start, best_end):
                first = points[index]
                second = points[index + 1]
                race_distance_m += haversine_m(first.lat, first.lon, second.lat, second.lon)
            race_points = best_end - best_start + 1
            if points[best_start].time is not None and points[best_end].time is not None:
                race_start_time = points[best_start].time
                race_end_time = points[best_end].time
                race_duration_s = (race_end_time - race_start_time).total_seconds()
            else:
                race_duration_s = float(max(best_end - best_start, 0) * 3)
            race_avg_speed_kn = 0.0 if race_duration_s <= 0 else (race_distance_m / race_duration_s) / KNOT_TO_MPS

    return TrackSummary(
        source=label,
        points=len(points),
        distance_m=distance_m,
        duration_s=duration_s,
        avg_speed_kn=avg_speed_kn,
        start_time=start_time,
        end_time=end_time,
        race_points=race_points,
        race_distance_m=race_distance_m,
        race_duration_s=race_duration_s,
        race_avg_speed_kn=race_avg_speed_kn,
        race_start_time=race_start_time,
        race_end_time=race_end_time,
        race_window_label=race_window_label,
    )


def estimate_time_seconds(distance_m: float, speed_kn: float) -> float:
    if speed_kn <= 0:
        raise ValueError("speed_kn must be greater than zero")
    return distance_m / (speed_kn * KNOT_TO_MPS)


def format_seconds(total_seconds: float) -> str:
    seconds = max(int(round(total_seconds)), 0)
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def format_meters(value: float) -> str:
    return f"{value:,.1f} m".replace(",", "_").replace(".", ",").replace("_", ".")


def format_knots(value: float) -> str:
    return f"{value:.2f} kn".replace(".", ",")


def compare_track_to_bot(
    track_path: str | Path,
    bot_profile: dict[str, Any],
    tactical_boost_pct: float = 0.0,
    start_line: tuple[tuple[float, float], tuple[float, float]] | None = None,
    finish_line: tuple[tuple[float, float], tuple[float, float]] | None = None,
    auto_window: bool = False,
) -> dict[str, Any]:
    summary = summarize_track(
        track_path,
        start_line=start_line,
        finish_line=finish_line,
        auto_window=auto_window,
    )
    metrics = bot_profile.get("metrics", {})
    bot_speed_kn = float(metrics.get("avg_speed", 0.0))
    if bot_speed_kn <= 0:
        raise ValueError("Bot profile is missing a valid avg_speed value")

    boosted_speed_kn = bot_speed_kn * (1.0 + tactical_boost_pct / 100.0)
    race_distance_m = summary.race_distance_m or summary.distance_m
    race_duration_s = summary.race_duration_s or summary.duration_s
    simulated_s = estimate_time_seconds(race_distance_m, boosted_speed_kn)
    delta_s = race_duration_s - simulated_s
    delta_pct = 0.0 if race_duration_s <= 0 else (delta_s / race_duration_s) * 100.0

    return {
        "summary": summary,
        "bot_name": bot_profile.get("bot_name", "unknown"),
        "bot_code": bot_profile.get("bot_code", "unknown"),
        "bot_speed_kn": bot_speed_kn,
        "boosted_speed_kn": boosted_speed_kn,
        "simulated_s": simulated_s,
        "delta_s": delta_s,
        "delta_pct": delta_pct,
        "race_distance_m": race_distance_m,
        "race_duration_s": race_duration_s,
    }

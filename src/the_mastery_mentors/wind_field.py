from __future__ import annotations

import bz2
import json
import math
import xml.etree.ElementTree as ET
import shutil
import tempfile
from pathlib import Path
from typing import Any, Iterable

import numpy as np


MPS_TO_KNOTS = 1.9438444924406048


def _normalize_name(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _to_python_scalar(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    return value


def _coord_name(data_array: Any, candidates: Iterable[str]) -> str | None:
    candidate_set = {_normalize_name(name) for name in candidates}
    for name in list(getattr(data_array, "coords", {}).keys()) + list(getattr(data_array, "dims", [])):
        if _normalize_name(str(name)) in candidate_set:
            return str(name)
    return None


def read_kml_bbox(kml_path: str | Path) -> dict[str, float]:
    root = ET.fromstring(Path(kml_path).read_text(encoding="utf-8"))
    coords_texts = [node.text or "" for node in root.findall(".//{*}coordinates")]
    points: list[tuple[float, float]] = []
    for coords_text in coords_texts:
        for pair in coords_text.split():
            if not pair.strip():
                continue
            lon_text, lat_text, *_ = pair.split(",")
            points.append((float(lon_text), float(lat_text)))

    if not points:
        raise ValueError(f"Cannot read any coordinates from {kml_path}")

    lons = [lon for lon, _ in points]
    lats = [lat for _, lat in points]
    return {
        "south": float(min(lats)),
        "north": float(max(lats)),
        "west": float(min(lons)),
        "east": float(max(lons)),
    }


def load_wind_model_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_wind_model_json(path: str | Path, payload: dict[str, Any]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def wind_vector_from_uv(u_ms: float, v_ms: float) -> dict[str, float]:
    speed_ms = math.sqrt(u_ms**2 + v_ms**2)
    speed_kn = speed_ms * MPS_TO_KNOTS
    direction_deg = (math.degrees(math.atan2(-u_ms, -v_ms)) + 360.0) % 360.0
    return {
        "u_ms": float(u_ms),
        "v_ms": float(v_ms),
        "speed_ms": float(speed_ms),
        "speed_kn": float(speed_kn),
        "direction_deg": float(direction_deg),
    }


def _candidate_filters(short_names: Iterable[str], param_ids: Iterable[int] | None = None) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    for short_name in short_names:
        filters.append({"shortName": short_name})
    if param_ids:
        for param_id in param_ids:
            filters.append({"paramId": int(param_id)})
    return filters


def _expand_grib_input(grib_path: str | Path, temp_dir: tempfile.TemporaryDirectory[str] | None = None) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    path = Path(grib_path)
    if path.suffix.lower() != ".bz2":
        return path, temp_dir

    if temp_dir is None:
        temp_dir = tempfile.TemporaryDirectory(prefix="tacticalsail-grib-")
    out_path = Path(temp_dir.name) / path.name.removesuffix(".bz2")
    with bz2.open(path, "rb") as src, out_path.open("wb") as dst:
        shutil.copyfileobj(src, dst)
    return out_path, temp_dir


def _open_grib_component(grib_path: str | Path, filters: list[dict[str, Any]]):
    import xarray as xr

    errors: list[str] = []
    for backend_filter in filters:
        try:
            dataset = xr.open_dataset(
                grib_path,
                engine="cfgrib",
                backend_kwargs={"filter_by_keys": backend_filter, "indexpath": ""},
            )
        except Exception as exc:  # pragma: no cover - backend specific
            errors.append(f"{backend_filter}: {exc}")
            continue
        if dataset.data_vars:
            data_var_name = next(iter(dataset.data_vars))
            return dataset[data_var_name], backend_filter

    raise RuntimeError(
        "Unable to open GRIB component with cfgrib. Tried: "
        + "; ".join(errors or ["no candidate filter matched"])
    )


def _frame_selector(data_array: Any, lat_name: str, lon_name: str) -> list[str]:
    return [dim for dim in data_array.dims if dim not in {lat_name, lon_name}]


def _coord_value_to_text(value: Any) -> str:
    value = _to_python_scalar(value)
    if value is None:
        return "unknown"
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _frame_hours(data_array: Any, frame_slice: Any, frame_index: int, frame_dims: list[str]) -> float:
    for dim in frame_dims:
        coord = frame_slice.coords.get(dim)
        if coord is None:
            continue
        coord_value = _to_python_scalar(coord.values)
        if coord_value is None:
            continue
        if isinstance(coord_value, (int, float, np.integer, np.floating)):
            return float(coord_value)
        try:
            import pandas as pd

            return float(pd.to_timedelta(coord_value).total_seconds() / 3600.0)
        except Exception:
            pass
        if hasattr(coord_value, "total_seconds"):
            return float(coord_value.total_seconds() / 3600.0)
    return float(frame_index)


def _frame_label(frame_slice: Any, frame_dims: list[str], fallback: int) -> str:
    parts = []
    for dim in frame_dims:
        coord = frame_slice.coords.get(dim)
        if coord is None:
            continue
        parts.append(f"{dim}={_coord_value_to_text(coord.values)}")
    return " ".join(parts) if parts else f"frame={fallback}"


def _bilinear_sample(grid: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float) -> float:
    lat = float(np.clip(lat, float(lats[0]), float(lats[-1])))
    lon = float(np.clip(lon, float(lons[0]), float(lons[-1])))

    lat_hi = int(np.searchsorted(lats, lat, side="right"))
    lon_hi = int(np.searchsorted(lons, lon, side="right"))
    lat_hi = min(max(lat_hi, 1), len(lats) - 1)
    lon_hi = min(max(lon_hi, 1), len(lons) - 1)
    lat_lo = lat_hi - 1
    lon_lo = lon_hi - 1

    lat0 = float(lats[lat_lo])
    lat1 = float(lats[lat_hi])
    lon0 = float(lons[lon_lo])
    lon1 = float(lons[lon_hi])

    lat_ratio = 0.0 if math.isclose(lat0, lat1) else (lat - lat0) / (lat1 - lat0)
    lon_ratio = 0.0 if math.isclose(lon0, lon1) else (lon - lon0) / (lon1 - lon0)

    q11 = float(grid[lat_lo, lon_lo])
    q12 = float(grid[lat_lo, lon_hi])
    q21 = float(grid[lat_hi, lon_lo])
    q22 = float(grid[lat_hi, lon_hi])

    return float(
        (1 - lat_ratio) * (1 - lon_ratio) * q11
        + (1 - lat_ratio) * lon_ratio * q12
        + lat_ratio * (1 - lon_ratio) * q21
        + lat_ratio * lon_ratio * q22
    )


def build_wind_model_from_grib(
    u_grib_path: str | Path,
    area_kml_path: str | Path,
    *,
    v_grib_path: str | Path | None = None,
    grid_lat_points: int = 72,
    grid_lon_points: int = 72,
    margin_lat: float = 0.015,
    margin_lon: float = 0.02,
) -> dict[str, Any]:
    import xarray as xr

    source_u_grib_path = str(u_grib_path)
    source_v_grib_path = str(v_grib_path if v_grib_path is not None else u_grib_path)
    temp_dir: tempfile.TemporaryDirectory[str] | None = None
    try:
        area_bbox = read_kml_bbox(area_kml_path)
        south = area_bbox["south"] - margin_lat
        north = area_bbox["north"] + margin_lat
        west = area_bbox["west"] - margin_lon
        east = area_bbox["east"] + margin_lon

        u_grib_path, temp_dir = _expand_grib_input(u_grib_path, temp_dir)
        v_input = v_grib_path if v_grib_path is not None else u_grib_path
        v_grib_path, temp_dir = _expand_grib_input(v_input, temp_dir)

        u_da, u_filter = _open_grib_component(
            u_grib_path,
            _candidate_filters(["10u", "u10", "u", "10metreuwindcomponent"], [165]),
        )
        v_da, v_filter = _open_grib_component(
            v_grib_path,
            _candidate_filters(["10v", "v10", "v", "10metrevwindcomponent"], [166]),
        )

        lat_name = _coord_name(u_da, ["latitude", "lat"])
        lon_name = _coord_name(u_da, ["longitude", "lon"])
        if lat_name is None or lon_name is None:
            raise RuntimeError("The GRIB file does not expose latitude/longitude coordinates.")

        u_da = u_da.sortby(lat_name).sortby(lon_name)
        v_da = v_da.sortby(lat_name).sortby(lon_name)
        u_da, v_da = xr.align(u_da, v_da, join="inner")

        target_lats = np.linspace(south, north, grid_lat_points)
        target_lons = np.linspace(west, east, grid_lon_points)

        frame_dims = _frame_selector(u_da, lat_name, lon_name)
        if not frame_dims:
            frame_dims = []

        frames: list[dict[str, Any]] = []
        total_speed = 0.0
        total_points = 0

        frame_iter = [()] if not frame_dims else np.ndindex(*[u_da.sizes[dim] for dim in frame_dims])
        for frame_index, frame_selector in enumerate(frame_iter):
            selector = {dim: idx for dim, idx in zip(frame_dims, frame_selector)}
            u_slice = u_da.isel(selector) if selector else u_da
            v_slice = v_da.isel(selector) if selector else v_da

            u_interp = u_slice.interp({lat_name: target_lats, lon_name: target_lons}, method="linear")
            v_interp = v_slice.interp({lat_name: target_lats, lon_name: target_lons}, method="linear")

            u_values = np.asarray(u_interp.values, dtype=float)
            v_values = np.asarray(v_interp.values, dtype=float)
            speed_ms = np.sqrt(u_values**2 + v_values**2)

            if np.isfinite(speed_ms).any():
                total_speed += float(np.nansum(speed_ms))
                total_points += int(np.isfinite(speed_ms).sum())

            frame_meta = {dim: _coord_value_to_text(u_slice.coords[dim].values) for dim in frame_dims if dim in u_slice.coords}
            frame_hours = _frame_hours(u_da, u_slice, frame_index, frame_dims)

            frames.append(
                {
                    "hours": float(frame_hours),
                    "label": _frame_label(u_slice, frame_dims, frame_index),
                    "meta": frame_meta,
                    "u": u_values.tolist(),
                    "v": v_values.tolist(),
                }
            )

        if not frames:
            raise RuntimeError("The GRIB file did not yield any usable wind frames.")

        reference_wind_kn = (total_speed / total_points) * MPS_TO_KNOTS if total_points else 12.0
        reference_wind_kn = float(reference_wind_kn if reference_wind_kn > 0 else 12.0)

        return {
            "source": {
                "u_grib_path": source_u_grib_path,
                "v_grib_path": source_v_grib_path,
                "u_filter": u_filter,
                "v_filter": v_filter,
            },
            "bbox": area_bbox,
            "grid": {
                "latitudes": target_lats.tolist(),
                "longitudes": target_lons.tolist(),
                "resolution_lat_deg": float(target_lats[1] - target_lats[0]) if len(target_lats) > 1 else 0.0,
                "resolution_lon_deg": float(target_lons[1] - target_lons[0]) if len(target_lons) > 1 else 0.0,
                "reference_wind_kn": reference_wind_kn,
            },
            "frames": frames,
        }
    finally:
        if temp_dir is not None:
            temp_dir.cleanup()


def sample_wind_model(
    model: dict[str, Any],
    lat: float,
    lon: float,
    *,
    hours: float = 0.0,
) -> dict[str, Any]:
    grid = model.get("grid") or {}
    lats = np.asarray(grid.get("latitudes") or [], dtype=float)
    lons = np.asarray(grid.get("longitudes") or [], dtype=float)
    frames = list(model.get("frames") or [])
    reference_wind_kn = float(grid.get("reference_wind_kn") or 12.0)

    if len(lats) < 2 or len(lons) < 2 or not frames:
        return {
            "speed_kn": 0.0,
            "speed_ms": 0.0,
            "direction_deg": 0.0,
            "u_ms": 0.0,
            "v_ms": 0.0,
            "multiplier": 1.0,
            "reference_wind_kn": reference_wind_kn,
            "pressure": "unknown",
            "frame_label": "unknown",
        }

    frames_sorted = sorted(frames, key=lambda frame: float(frame.get("hours", 0.0)))
    target_hours = float(hours)

    if len(frames_sorted) == 1:
        frame_a = frame_b = frames_sorted[0]
        blend = 0.0
    else:
        if target_hours <= float(frames_sorted[0].get("hours", 0.0)):
            frame_a = frame_b = frames_sorted[0]
            blend = 0.0
        elif target_hours >= float(frames_sorted[-1].get("hours", 0.0)):
            frame_a = frame_b = frames_sorted[-1]
            blend = 0.0
        else:
            frame_a = frames_sorted[0]
            frame_b = frames_sorted[-1]
            for idx in range(len(frames_sorted) - 1):
                left = float(frames_sorted[idx].get("hours", 0.0))
                right = float(frames_sorted[idx + 1].get("hours", 0.0))
                if left <= target_hours <= right:
                    frame_a = frames_sorted[idx]
                    frame_b = frames_sorted[idx + 1]
                    blend = 0.0 if math.isclose(left, right) else (target_hours - left) / (right - left)
                    break
            else:
                blend = 0.0

    u_a = np.asarray(frame_a["u"], dtype=float)
    v_a = np.asarray(frame_a["v"], dtype=float)
    u_b = np.asarray(frame_b["u"], dtype=float)
    v_b = np.asarray(frame_b["v"], dtype=float)
    u_ms = _bilinear_sample(u_a, lats, lons, lat, lon) * (1.0 - blend) + _bilinear_sample(u_b, lats, lons, lat, lon) * blend
    v_ms = _bilinear_sample(v_a, lats, lons, lat, lon) * (1.0 - blend) + _bilinear_sample(v_b, lats, lons, lat, lon) * blend
    vector = wind_vector_from_uv(u_ms, v_ms)
    multiplier = vector["speed_kn"] / reference_wind_kn if reference_wind_kn > 0 else 1.0
    pressure = "forte" if multiplier >= 1.1 else "debole" if multiplier <= 0.9 else "media"
    return {
        **vector,
        "multiplier": float(multiplier),
        "reference_wind_kn": reference_wind_kn,
        "pressure": pressure,
        "frame_label": frame_a.get("label", "frame"),
        "frame_hours": float(frame_a.get("hours", 0.0)),
        "frame_blend": float(blend),
    }

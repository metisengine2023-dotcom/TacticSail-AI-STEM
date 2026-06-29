from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add 'src' to python path to load the package when running from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from the_mastery_mentors.wind_field import build_wind_model_from_grib, save_wind_model_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a GRIB file into a compact wind field JSON for TacticalSail.")
    parser.add_argument("--grib", help="Input combined GRIB/GRIB2 file containing both U and V components")
    parser.add_argument("--u-grib", help="Input GRIB/GRIB2 file for the U 10m wind component")
    parser.add_argument("--v-grib", help="Input GRIB/GRIB2 file for the V 10m wind component")
    parser.add_argument(
        "--area-kml",
        default="data/maps/area.kml",
        help="KML file describing the Area B boundary used to crop the wind field",
    )
    parser.add_argument(
        "--output",
        default="data/generated/wind_field.json",
        help="Output JSON file for the interpolated wind model",
    )
    parser.add_argument("--grid-lat-points", type=int, default=72, help="Number of latitude samples in the output grid")
    parser.add_argument("--grid-lon-points", type=int, default=72, help="Number of longitude samples in the output grid")
    parser.add_argument("--margin-lat", type=float, default=0.015, help="Latitude margin added around the Area B bbox")
    parser.add_argument("--margin-lon", type=float, default=0.02, help="Longitude margin added around the Area B bbox")
    args = parser.parse_args()

    if args.grib and (args.u_grib or args.v_grib):
        parser.error("Use either --grib or the pair --u-grib/--v-grib, not both.")
    if not args.grib and not (args.u_grib and args.v_grib):
        parser.error("Provide --grib or both --u-grib and --v-grib.")

    payload = build_wind_model_from_grib(
        args.grib or args.u_grib,
        args.area_kml,
        v_grib_path=args.v_grib,
        grid_lat_points=args.grid_lat_points,
        grid_lon_points=args.grid_lon_points,
        margin_lat=args.margin_lat,
        margin_lon=args.margin_lon,
    )
    save_wind_model_json(args.output, payload)
    print(f"Saved wind field model to {Path(args.output).resolve()}")
    print(f"Frames: {len(payload['frames'])} | Reference wind: {payload['grid']['reference_wind_kn']:.2f} kn")


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from the_mastery_mentors.gpx_analysis import (  # noqa: E402
    compare_track_to_bot,
    format_knots,
    format_meters,
    format_seconds,
)
from the_mastery_mentors.loader import load_bot_profiles  # noqa: E402


def find_bot(bot_profiles: list[object], bot_code_or_name: str) -> dict[str, object]:
    query = bot_code_or_name.strip().lower()
    for bot in bot_profiles:
        bot_dict = bot.to_dict() if hasattr(bot, "to_dict") else dict(bot)  # type: ignore[arg-type]
        if str(bot_dict.get("bot_code", "")).lower() == query:
            return bot_dict
        if str(bot_dict.get("bot_name", "")).lower() == query:
            return bot_dict
    raise ValueError(f"Bot not found: {bot_code_or_name}")


def parse_line(value: str) -> tuple[tuple[float, float], tuple[float, float]]:
    parts = [item.strip() for item in value.split(",") if item.strip()]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(
            "Line format must be lat1,lon1,lat2,lon2"
        )
    lat1, lon1, lat2, lon2 = map(float, parts)
    return (lat1, lon1), (lat2, lon2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare a GPX track against a bot profile.")
    parser.add_argument("track", help="Path to a .gpx file or .zip archive containing one GPX file")
    parser.add_argument(
        "--bot",
        default="Enrico",
        help="Bot name or code to use as the baseline (default: Enrico)",
    )
    parser.add_argument(
        "--bots",
        default="data/bots",
        help="Path to the bot directory or a JSON file with bot profiles",
    )
    parser.add_argument(
        "--boost",
        type=float,
        default=0.0,
        help="Optional tactical boost percentage applied to the bot speed",
    )
    parser.add_argument(
        "--start-line",
        type=parse_line,
        default=None,
        help="Start line as lat1,lon1,lat2,lon2",
    )
    parser.add_argument(
        "--finish-line",
        type=parse_line,
        default=None,
        help="Finish line as lat1,lon1,lat2,lon2",
    )
    parser.add_argument(
        "--auto-window",
        action="store_true",
        help="Estimate the race window from the GPX speed profile when start/finish lines are not available",
    )
    args = parser.parse_args()

    bot_profiles = load_bot_profiles(args.bots)
    bot = find_bot(bot_profiles, args.bot)
    report = compare_track_to_bot(
        args.track,
        bot,
        tactical_boost_pct=args.boost,
        start_line=args.start_line,
        finish_line=args.finish_line,
        auto_window=args.auto_window,
    )
    summary = report["summary"]

    print("Track summary")
    print(f"Source: {summary.source}")
    print(f"Points: {summary.points}")
    print(f"Distance: {format_meters(summary.distance_m)}")
    print(f"Duration: {format_seconds(summary.duration_s)}")
    print(f"Actual avg speed: {format_knots(summary.avg_speed_kn)}")
    if args.start_line and args.finish_line:
        print()
        print("Race window")
        print(f"Race distance: {format_meters(summary.race_distance_m)}")
        print(f"Race duration: {format_seconds(summary.race_duration_s)}")
        print(f"Race avg speed: {format_knots(summary.race_avg_speed_kn)}")
    elif args.auto_window:
        print()
        print("Race window")
        print(f"Auto window: {summary.race_window_label}")
        print(f"Race distance: {format_meters(summary.race_distance_m)}")
        print(f"Race duration: {format_seconds(summary.race_duration_s)}")
        print(f"Race avg speed: {format_knots(summary.race_avg_speed_kn)}")
    else:
        print()
        print("Race window")
        print("Not provided. Use --start-line and --finish-line to trim the GPX to the real race.")
    print()
    print("Bot baseline")
    print(f"Bot: {report['bot_name']} ({report['bot_code']})")
    print(f"Avg speed: {format_knots(report['bot_speed_kn'])}")
    if args.boost:
        print(f"Boosted speed: {format_knots(report['boosted_speed_kn'])}")
    print(f"Simulated time: {format_seconds(report['simulated_s'])}")
    print()
    print("Delta")
    print(f"Advantage: {format_seconds(abs(report['delta_s']))}")
    print(f"Direction: {'Qwen/bot beats the track' if report['delta_s'] > 0 else 'Track is faster'}")
    print(f"Relative delta: {report['delta_pct']:.2f}%")


if __name__ == "__main__":
    main()

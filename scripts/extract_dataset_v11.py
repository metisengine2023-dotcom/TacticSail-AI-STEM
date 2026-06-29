from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


USER_RE = re.compile(
    r"MetaSail:\s*(?P<bot_code>[^|]+)\s*\|\s*Leg\s*(?P<leg>\d+)\s*\|\s*Rank\s*(?P<rank>\d+)\s*\|\s*Dist\s*(?P<dist>[\d.]+)%\s*\|\s*Avg\s*(?P<avg>[\d.]+)\s*kt\s*\|\s*VMG\s*(?P<vmg>[\d.]+)\s*kt\s*\|\s*Rt\s*(?P<rt>[\d.]+)%\s*\|\s*Lt\s*(?P<lt>[\d.]+)%"
)


def normalize_bot_index(bot_code: str) -> str:
    digits = re.sub(r"\D+", "", bot_code)
    if not digits:
        return bot_code
    return str(int(digits))


@dataclass
class ParsedExample:
    bot_code: str
    bot_name: str
    leg: int
    rank: int
    distance_pct: float
    avg_speed: float
    vmg: float
    rt_pct: float
    lt_pct: float
    scenario: str
    user_text: str
    assistant_headings: list[str]
    assistant_sections: list[str]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract structured data from dataset v11")
    parser.add_argument("--input", required=True, help="Path to the train.jsonl file")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument(
        "--bot-names",
        default="",
        help="Optional JSON file mapping bot index to human name",
    )
    return parser


def load_bot_names(path: str) -> dict[str, str]:
    if not path:
        return {}
    return json.loads(Path(path).read_text(encoding="utf-8"))


def parse_user_text(text: str) -> dict[str, Any]:
    match = USER_RE.search(text)
    if not match:
        raise ValueError(f"Unrecognized user format: {text[:160]}")
    return {
        "bot_code": match.group("bot_code").strip(),
        "leg": int(match.group("leg")),
        "rank": int(match.group("rank")),
        "distance_pct": float(match.group("dist")),
        "avg_speed": float(match.group("avg")),
        "vmg": float(match.group("vmg")),
        "rt_pct": float(match.group("rt")),
        "lt_pct": float(match.group("lt")),
    }


def parse_assistant_text(text: str) -> tuple[list[str], list[str]]:
    headings: list[str] = []
    sections: list[str] = []
    current_section: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            headings.append(line[3:].strip())
            if current_section:
                sections.append("\n".join(current_section).strip())
                current_section = []
        elif line.startswith("### "):
            headings.append(line[4:].strip())
        current_section.append(line)
    if current_section:
        sections.append("\n".join(current_section).strip())
    return headings, sections


def summarize_examples(
    examples: list[ParsedExample],
    bot_names: dict[str, str],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    bot_groups: dict[str, list[ParsedExample]] = defaultdict(list)
    all_headings = Counter()
    all_words = Counter()

    for item in examples:
        if not item.bot_code.upper().startswith("BOT_"):
            continue
        bot_groups[item.bot_code].append(item)
        all_headings.update(
            heading for heading in item.assistant_headings if "Area A" not in heading
        )
        all_words.update(re.findall(r"[A-Za-z0-9_]+", item.scenario.lower()))

    bot_profiles: list[dict[str, Any]] = []
    for bot_code, rows in sorted(bot_groups.items()):
        n = len(rows)
        avg_speed = sum(row.avg_speed for row in rows) / n
        avg_vmg = sum(row.vmg for row in rows) / n
        avg_dist = sum(row.distance_pct for row in rows) / n
        avg_rt = sum(row.rt_pct for row in rows) / n
        avg_lt = sum(row.lt_pct for row in rows) / n
        preferred_side = "left" if avg_lt > avg_rt else "right" if avg_rt > avg_lt else "balanced"
        bot_index = normalize_bot_index(bot_code)
        bot_profiles.append(
            {
                "bot_code": bot_code,
                "bot_name": bot_names.get(bot_index, bot_code),
                "area": "B",
                "examples_count": n,
                "metrics": {
                    "avg_speed": round(avg_speed, 3),
                    "avg_vmg": round(avg_vmg, 3),
                    "avg_distance_pct": round(avg_dist, 3),
                    "avg_rt_pct": round(avg_rt, 3),
                    "avg_lt_pct": round(avg_lt, 3),
                },
                "preferred_side": preferred_side,
                "tactical_tags": sorted(
                    {
                        heading
                        for row in rows
                        for heading in row.assistant_headings[:4]
                        if "Area A" not in heading
                    }
                ),
                "source_examples": [asdict(row) for row in rows[:5]],
            }
        )

    priors = {
        "area": "B",
        "top_headings": all_headings.most_common(20),
        "top_scenario_words": all_words.most_common(40),
        "instruction": "Use only these priors for tactical context, not as training labels.",
    }
    return bot_profiles, priors


def main() -> None:
    args = build_parser().parse_args()
    input_path = Path(args.input)
    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "bots").mkdir(parents=True, exist_ok=True)

    bot_names = load_bot_names(args.bot_names)
    parsed_examples: list[ParsedExample] = []

    for line in input_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        messages = payload["messages"]
        user_text = messages[1]["content"]
        assistant_text = messages[2]["content"]
        user_data = parse_user_text(user_text)
        if not user_data["bot_code"].upper().startswith("BOT_"):
            continue
        headings, sections = parse_assistant_text(assistant_text)
        bot_index = normalize_bot_index(user_data["bot_code"])
        parsed_examples.append(
            ParsedExample(
                bot_code=user_data["bot_code"],
                bot_name=bot_names.get(bot_index, user_data["bot_code"]),
                leg=user_data["leg"],
                rank=user_data["rank"],
                distance_pct=user_data["distance_pct"],
                avg_speed=user_data["avg_speed"],
                vmg=user_data["vmg"],
                rt_pct=user_data["rt_pct"],
                lt_pct=user_data["lt_pct"],
                scenario=user_text.split("Scenario:", 1)[-1].strip(),
                user_text=user_text,
                assistant_headings=headings,
                assistant_sections=sections,
            )
        )

    bot_profiles, priors = summarize_examples(parsed_examples, bot_names)

    (output_root / "examples.jsonl").write_text(
        "\n".join(json.dumps(asdict(item), ensure_ascii=False) for item in parsed_examples),
        encoding="utf-8",
    )
    (output_root / "bot_profiles.json").write_text(
        json.dumps(bot_profiles, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_root / "tactical_priors.json").write_text(
        json.dumps(priors, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    for profile in bot_profiles:
        file_name = f"{profile['bot_code'].lower()}_{profile['bot_name'].lower().replace(' ', '_')}.json"
        (output_root / "bots" / file_name).write_text(
            json.dumps(profile, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()

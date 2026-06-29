#!/usr/bin/env python3
"""Verify the minimum hackathon demo contract."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def load_json(path: str):
    with (ROOT / path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")
    print(f"ok: {message}")


def main() -> int:
    wind = load_json("data/generated/wind_ai_model.json")
    brains = load_json("data/generated/bot_ai_brains.json")
    ensemble = load_json("data/generated/ai_ensemble_preview.json")
    report = load_json("data/generated/hackathon_readiness_report.json")
    replay = load_json("data/generated/replay_validation.json")
    calibration = load_json("data/generated/bot_auto_calibration.json")
    tactic_variability = load_json("data/generated/tactic_variability_audit.json")
    html = (ROOT / "web/index.html").read_text(encoding="utf-8")
    app = (ROOT / "web/app.js").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    require(len(wind.get("feature_names_57", [])) == 57, "wind model has 57 variables")
    require(len(wind.get("scenarios", [])) >= 100, "wind model has at least 100 scenarios")
    require(len(brains.get("brains_by_bot", {})) == 7, "seven bot AI brains are generated")
    require(all(len(brain.get("neurons", [])) >= 32 for brain in brains["brains_by_bot"].values()), "each bot brain has neural policy")
    require(ensemble.get("scenario_count") == 100 and len(ensemble.get("runs", [])) == 100, "ensemble simulates 100 variants")
    require(report.get("hackathon_readiness_pct", 0) >= 75, "hackathon readiness is above demo threshold")
    require(len(replay.get("bot_validation", [])) == 7, "replay validation covers seven bots")
    require(len(calibration.get("calibration_by_bot", {})) == 7, "auto-calibration covers seven bots")
    require(calibration.get("summary", {}).get("avg_calibrated_score_pct", 0) >= 75, "auto-calibration fit is usable")
    require(report.get("auto_calibration_validation", {}).get("score_pct", 0) >= 75, "readiness report includes auto-calibration proof")
    require(tactic_variability.get("race_count") == 50 and tactic_variability.get("passed"), "50-race tactic variability regression passes")
    require(tactic_variability.get("summary", {}).get("wind_offset_max_abs_deg", 0) >= 12, "race wind varies by 10-15 degrees")
    require(tactic_variability.get("summary", {}).get("unique_fleet_signatures", 0) >= 18, "bots vary tactics across race seeds")
    require(tactic_variability.get("summary", {}).get("max_candidate_attempts_per_leg", 99) <= 12, "anti-zigzag candidate limit is bounded")
    require(tactic_variability.get("summary", {}).get("final_board_safety_guards", {}).get("passed"), "final-board lock prevents mark approach zigzag")
    require("hackathonReadinessValue" in html and "Hackathon QA" in html, "UI exposes hackathon QA panel")
    require("Live tactics" in html and "tacticReasonValue" in html, "UI exposes live tactic explanation panel")
    require("enforceBoatInsideArea" in app, "runtime includes anti-land guard")
    require("Judge demo" in html and "runJudgeDemo" in app, "judge demo mode exists")
    require("app.js?v=112" in html, "HTML points to the current app bundle")
    require("Main Code Areas Judges Should Inspect" in readme, "README guides judge code review")
    require((ROOT / "docs/PROMPT_ENGINEERING.md").exists(), "prompt engineering notes exist")
    require((ROOT / "docs/PITCH_SCRIPT.md").exists(), "3 minute pitch script exists")
    require((ROOT / "docs/DEVPOST_SUBMISSION.md").exists(), "Devpost submission draft exists")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

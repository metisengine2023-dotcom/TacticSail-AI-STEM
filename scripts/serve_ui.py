from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


RUNTIME = None
RUNTIME_ERROR = ""
RUNTIME_LOCK = threading.Lock()
QWEN_SERVER_ENABLED = os.environ.get("TACTICALSAIL_ENABLE_QWEN", "").strip() == "1"


def _repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def _json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _load_qwen_runtime():
    global RUNTIME, RUNTIME_ERROR
    if not QWEN_SERVER_ENABLED:
        RUNTIME_ERROR = "Qwen live disabled. Start with TACTICALSAIL_ENABLE_QWEN=1 to use the local MLX model."
        return None
    if RUNTIME is not None:
        return RUNTIME
    if RUNTIME_ERROR:
        return None

    with RUNTIME_LOCK:
        if RUNTIME is not None:
            return RUNTIME
        if RUNTIME_ERROR:
            return None

        src_path = _repo_root() / "src"
        if str(src_path) not in sys.path:
            sys.path.insert(0, str(src_path))
        try:
            from the_mastery_mentors.qwen_runtime import load_auto_model

            RUNTIME = load_auto_model()
            return RUNTIME
        except Exception as exc:  # pragma: no cover - depends on local model setup
            RUNTIME_ERROR = str(exc)
            return None


def _extract_json_object(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _fallback_decision(payload: dict[str, Any]) -> dict[str, Any]:
    boat = payload.get("boat", {})
    wind = payload.get("wind", {})
    telemetry = payload.get("telemetry", {})
    stage = payload.get("stage", {})
    target = payload.get("target", {})
    polar_state = str(telemetry.get("polarState") or "")
    lane = str(wind.get("lane") or "")
    pressure = str(wind.get("pressure") or "")
    distance = float(target.get("distanceM") or 9999)
    side = "center"
    action = "hold"
    heading_delta = 0

    if "orzata" in polar_state:
        action = "bear_away"
        heading_delta = 4
    elif "poggiata" in polar_state:
        action = "head_up"
        heading_delta = -4
    elif stage.get("mode") == "upwind" and distance < 220:
        action = "tack"
        side = "center"
    elif "weak" in lane or pressure == "debole":
        action = "seek_pressure"
        side = "left" if boat.get("preferred_side") != "left" else "right"
        heading_delta = -3 if side == "left" else 3
    elif "right" in lane and pressure == "forte":
        side = "right"
    elif "left" in lane and pressure == "forte":
        side = "left"

    return {
        "action": action,
        "side": side,
        "heading_delta": heading_delta,
        "confidence": 0.58,
        "reason": "Local tactical fallback: polar state, pressure, and mark distance.",
    }


def _qwen_decision(payload: dict[str, Any]) -> dict[str, Any]:
    runtime = _load_qwen_runtime()
    if runtime is None:
        decision = _fallback_decision(payload)
        return {
            "engine": "fallback",
            "runtime_error": RUNTIME_ERROR,
            "decision": decision,
        }

    from the_mastery_mentors.qwen_runtime import generate_with_runtime

    compact_payload = {
        "boat": payload.get("boat", {}),
        "stage": payload.get("stage", {}),
        "target": payload.get("target", {}),
        "wind": payload.get("wind", {}),
        "telemetry": payload.get("telemetry", {}),
        "garda": payload.get("garda", {}),
        "isolated_context": payload.get("isolated_context", {}),
        "fleet": payload.get("fleet", [])[:7],
        "rules": [
            "Do not follow a fixed route if wind, fleet, or polar state indicate a loss.",
            "Respect the local Garda/VMG plan: evaluate x_prime, y_prime, overstand, and used side.",
            "Respect the athlete track_style: long or short boards, reactivity, attack side, and tack budget.",
            "Use replay_calibration and ghost_similarity when available: the bot should resemble its real athlete, not a generic clone.",
            "Use scoreBreakdown: score = VMG + pressure + lift + layline + athlete style - land risk - dirty air - wasted maneuvers.",
            "Consider temporalZone/temporalPhase: a good choice at minute 3 can become bad at minute 12.",
            "Weight course tactics: pressure/lift, weak center, gate, shore/land, and layline can override bot style.",
            "Avoid dirty air and cover: if a boat ahead disturbs the wind, seek clean air without zigzag.",
            "If too high, bear away and rebuild speed.",
            "If too low upwind, head up gradually without stalling the boat.",
            "On reaches speed can rise sharply; downwind stays more controlled.",
            "Avoid land and out-of-course edges.",
        ],
    }
    messages = [
        {
            "role": "system",
            "content": (
                "Sei Qwen 3.5 4B usato come tattico live di TacticalSail. "
                "Rispondi solo con una riga JSON puro, senza markdown e senza testo extra. "
                "Schema esatto: {\"action\":\"hold|tack|gybe|head_up|bear_away|seek_pressure\","
                "\"side\":\"left|right|center\",\"heading_delta\":0,\"confidence\":0.7,\"reason\":\"...\"}. "
                "heading_delta e in gradi, tra -8 e 8."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(compact_payload, ensure_ascii=False),
        },
    ]
    raw = generate_with_runtime(runtime, messages, max_tokens=96)
    parsed = _extract_json_object(raw) or {}
    fallback = _fallback_decision(payload)
    action_valid = parsed.get("action") in {"hold", "tack", "gybe", "head_up", "bear_away", "seek_pressure"}
    guardrail_active = not parsed or not action_valid
    decision = {
        "action": parsed.get("action") if action_valid else fallback["action"],
        "side": parsed.get("side") if parsed.get("side") in {"left", "right", "center"} else fallback["side"],
        "heading_delta": max(-8, min(8, float(parsed.get("heading_delta", fallback["heading_delta"]) or 0))),
        "confidence": max(0, min(1, float(parsed.get("confidence", fallback["confidence"]) or 0))),
        "reason": str(
            parsed.get("reason")
            or (
                "Qwen attivo, guardrail locale: risposta JSON non valida."
                if guardrail_active
                else fallback["reason"]
            )
        )[:180],
    }
    return {
        "engine": "qwen-guarded" if guardrail_active else "qwen",
        "backend": runtime.backend,
        "model_id": runtime.model_id,
        "decision": decision,
    }


class TacticalSailHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self) -> None:
        if self.path != "/api/qwen/decision":
            _json_response(self, 404, {"error": "unknown_endpoint"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            _json_response(self, 200, _qwen_decision(payload))
        except BrokenPipeError:
            return
        except Exception as exc:
            _json_response(self, 500, {"engine": "error", "error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the TacticalSail web UI locally.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser automatically")
    args = parser.parse_args()

    root = _repo_root()
    os.chdir(root)

    server = ThreadingHTTPServer((args.host, args.port), TacticalSailHandler)
    url = f"http://{args.host}:{args.port}/web/"
    print(f"Serving TacticalSail UI from {root}")
    print(f"Open: {url}")
    if not args.no_open:
        webbrowser.open_new_tab(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()

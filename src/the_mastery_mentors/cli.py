from __future__ import annotations

import argparse
import json
from pathlib import Path

from .context_builder import build_messages, build_payload
from .loader import load_area_b, load_bot_profiles, load_tactical_priors
from .qwen_runtime import generate_quantized_response
from .schemas import ContextBundle, SimulationRequest
from .wind_field import load_wind_model_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tmm")
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_context = subparsers.add_parser("build-context", help="Build a Qwen prompt payload")
    build_context.add_argument("--area-b", required=True, help="Path to Area B JSON")
    build_context.add_argument("--bots", required=True, help="Path to bots directory or JSON file")
    build_context.add_argument("--priors", required=True, help="Path to tactical priors JSON")
    build_context.add_argument("--scenario", default="", help="Scenario text")
    build_context.add_argument("--wind-mode", default="Ora", help="Wind mode")
    build_context.add_argument("--focus-question", default="", help="Optional focus question")
    build_context.add_argument(
        "--active-bots",
        default="",
        help="Comma separated list of active bot codes, for example BOT_01,BOT_02",
    )
    build_context.add_argument(
        "--retrieved-examples",
        default="",
        help="Optional JSON file with retrieved examples",
    )
    build_context.add_argument(
        "--wind-field",
        default="",
        help="Optional wind field JSON generated from a GRIB file",
    )
    build_context.add_argument(
        "--output",
        default="",
        help="Optional output file. If omitted, print to stdout.",
    )

    smoke_test = subparsers.add_parser("smoke-test", help="Run a tiny Qwen 4-bit test")
    smoke_test.add_argument(
        "--model-id",
        default="",
        help="Optional model id. Defaults to the platform-specific Qwen checkpoint.",
    )
    smoke_test.add_argument(
        "--prompt",
        default="Rispondi in italiano con una frase breve: il modello funziona?",
        help="Prompt to test the model",
    )
    return parser


def _load_retrieved_examples(path: str) -> list[dict]:
    if not path:
        return []
    return json.loads(Path(path).read_text(encoding="utf-8"))


def run_build_context(args: argparse.Namespace) -> dict:
    area_b = load_area_b(args.area_b)
    bot_profiles = load_bot_profiles(args.bots)
    tactical_priors = load_tactical_priors(args.priors)
    wind_map = load_wind_model_json(args.wind_field) if args.wind_field else {}
    request = SimulationRequest(
        area="B",
        wind_mode=args.wind_mode,
        scenario=args.scenario,
        focus_question=args.focus_question,
        active_bots=[item.strip() for item in args.active_bots.split(",") if item.strip()],
        wind_map=wind_map,
    )
    bundle = ContextBundle(
        area_b=area_b,
        bot_profiles=bot_profiles,
        tactical_priors=tactical_priors,
        request=request,
        retrieved_examples=_load_retrieved_examples(args.retrieved_examples),
    )
    messages = build_messages(bundle)
    payload = build_payload(bundle)

    result = {
        "messages": messages,
        "payload": payload,
    }
    if args.output:
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "build-context":
        run_build_context(args)
    elif args.command == "smoke-test":
        messages = [
            {"role": "system", "content": "Rispondi in italiano con una frase breve."},
            {"role": "user", "content": args.prompt},
        ]
        result = generate_quantized_response(messages, model_id=args.model_id or None, max_tokens=32)
        print(result.text if hasattr(result, "text") else result)


if __name__ == "__main__":
    main()

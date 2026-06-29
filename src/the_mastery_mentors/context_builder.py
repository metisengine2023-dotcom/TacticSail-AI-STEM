from __future__ import annotations

import json
from typing import Any

from .schemas import ContextBundle


SYSTEM_PROMPT = """Sei il motore di simulazione tattica di The Mastery Mentors.
Lavori solo su Area B.
Usi solo i dati presenti nel contesto.
Non fai fine-tuning in questo flusso.
Non inventi numeri mancanti.
Se un dato manca, lo segnali come null o unknown.
Il tuo compito e simulare gli atleti, leggere il vento, trovare i punti critici, e proporre la rotta migliore per battere l'avversario.
La risposta deve restare concentrata su velocita, vento, lato favorevole, virate e layline.
Rispondi solo con JSON valido.
"""

RESPONSE_SCHEMA = {
    "area": "B",
    "wind_read": {
        "left": "strong|medium|weak|unknown",
        "center": "strong|medium|weak|unknown",
        "right": "strong|medium|weak|unknown",
    },
    "simulations": [
        {
            "bot_code": "BOT_01",
            "bot_name": "Paolo",
            "route_decision": "text",
            "critical_points": ["text"],
            "maneuvers": ["text"],
            "advantage_state": "ahead|behind|equal|unknown",
        }
    ],
    "best_action": "text",
    "notes": ["text"],
}


def _bot_view(bot) -> dict[str, Any]:
    metrics = bot.metrics or {}
    avg_speed = float(metrics.get("avg_speed") or 0)
    avg_vmg = float(metrics.get("avg_vmg") or 0)
    avg_distance_pct = float(metrics.get("avg_distance_pct") or 0)
    preferred_side = bot.preferred_side or "unknown"
    if preferred_side == "left":
        lane_hint = "Prefer left pressure, protect speed, and tack early only when the gain is real."
    elif preferred_side == "right":
        lane_hint = "Prefer right if the gain is stable; otherwise stay central and avoid extra distance."
    else:
        lane_hint = "Use the center lane as the default and switch only for a clear pressure gain."

    if avg_distance_pct >= 118:
        risk = "high"
    elif avg_distance_pct >= 110:
        risk = "medium"
    else:
        risk = "low"

    if avg_vmg >= 4.2:
        pace_note = "This bot is naturally efficient on VMG."
    elif avg_vmg >= 3.9:
        pace_note = "This bot is balanced and should avoid wasteful maneuvers."
    else:
        pace_note = "This bot needs clean lanes and speed preservation."

    return {
        "bot_code": bot.bot_code,
        "bot_name": bot.bot_name,
        "preferred_side": preferred_side,
        "metrics": {
            "avg_speed": avg_speed,
            "avg_vmg": avg_vmg,
            "avg_distance_pct": avg_distance_pct,
            "avg_rt_pct": float(metrics.get("avg_rt_pct") or 0),
            "avg_lt_pct": float(metrics.get("avg_lt_pct") or 0),
        },
        "tactical_hint": lane_hint,
        "risk_level": risk,
        "pace_note": pace_note,
    }


def build_payload(bundle: ContextBundle) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "project": "The Mastery Mentors",
        "area": bundle.area_b.to_dict(),
        "bots": [bot.to_dict() for bot in bundle.bot_profiles],
        "bot_views": [_bot_view(bot) for bot in bundle.bot_profiles],
        "tactical_priors": bundle.tactical_priors,
        "response_schema": RESPONSE_SCHEMA,
        "retrieved_examples": bundle.retrieved_examples,
    }
    if bundle.request is not None:
        payload["request"] = bundle.request.to_dict()
    return payload


def build_messages(bundle: ContextBundle) -> list[dict[str, str]]:
    payload = build_payload(bundle)
    user_prompt = json.dumps(payload, ensure_ascii=False, indent=2)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

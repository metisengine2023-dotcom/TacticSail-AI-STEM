# Prompt Engineering Notes

TacticalSail uses AI as a tactical decision layer, not as a black-box physics engine.

## Design Goal

The model must answer one narrow question:

```text
Given one boat, one stage, one target, local wind, athlete style, auto-calibrated GPX parameters, and validation metrics,
what is the next tactical action and why?
```

It must not invent race geometry. The simulator owns:

- boat movement
- speed and VMG limits
- mark sequence
- wind sampling
- anti-land guard
- dirty air
- replay similarity

The AI can influence:

- hold / tack / gybe
- head up / bear away
- seek pressure
- preferred side
- explanation text

## Context Isolation

Each pilot bot receives isolated information:

- its own position
- its own speed and VMG
- its own athlete profile
- its own auto-calibrated behavior parameters
- its local wind
- its current mark
- its tactical debug state

It does not receive the full tactical plan of other bots.

The global coach context can see fleet information for summary and QA, but pilot decisions remain local.

## System Behavior

Expected output is JSON, not prose:

```json
{
  "action": "hold",
  "side": "right",
  "heading_delta": 0,
  "confidence": 0.72,
  "reason": "Right pressure and athlete profile favor holding the long board."
}
```

## Guardrails

The model is constrained by the simulator:

- cannot sail through land
- cannot skip marks
- cannot exceed ILCA speed envelopes
- cannot tack repeatedly below the minimum interval
- cannot override no-go angle safety
- cannot move fixed marks

If the local Qwen endpoint is unavailable, the runtime falls back to deterministic local AI:

- `web/bot_ai_brain.js`
- `web/tactical_bot_engine.js`

## Prompt Files To Inspect

- `src/the_mastery_mentors/context_builder.py`
- `scripts/serve_ui.py`
- `web/app.js` around `buildIsolatedBotQwenContext`
- `web/app.js` around `qwenDecisionPayload`

## Why This Is Not Just Prompting

The model receives structured data produced by real GPX processing:

- side distribution
- median board duration
- maneuver rate
- speed profile
- wind scenario
- auto-calibrated GPX fit score
- replay validation

The prompt is only the last layer. The core is a measured simulation pipeline.

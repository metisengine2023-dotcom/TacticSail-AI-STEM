# Devpost Submission Draft

## Project Name

TacticalSail AI STEM

## One-Liner

A data-driven sailing race simulator that turns real Lake Garda GPS tracks into AI-controlled tactical bots for STEM learning.

## Inspiration

Sailors often know whether they won or lost, but not exactly *why*. A GPS replay can show the track, but it rarely explains tactical decisions: pressure, lift, dirty air, layline risk, and maneuver timing. TacticalSail was built to make those hidden decisions visible.

## What It Does

TacticalSail simulates an ILCA 4 race on Lake Garda Area B.

It ingests real GPX tracks from seven sailors, builds a tactical profile for each athlete, auto-calibrates each bot against those GPX-derived targets, generates 100 wind scenarios, and lets AI bots race using those profiles. The UI shows a live race map, bot explanations, wind state, replay similarity, and hackathon QA metrics.

## How We Built It

- Parsed real GPX race tracks.
- Extracted side choice, board length, maneuver rate, speed profile, and wind estimates.
- Built per-athlete AI brains.
- Added automatic GPX-to-bot calibration, improving the measured fit from 78.8% base to 91.6% calibrated.
- Generated a 57-variable wind model with 100 scenarios.
- Implemented a browser-based 2D race simulator using Leaflet.
- Added Qwen 3.5 4B as a local tactical decision endpoint with deterministic fallback.
- Added hackathon readiness and replay validation reports.

## What Is Innovative

The system does not just replay tracks. It tries to emulate a sailor's tactical style.

Each bot answers:

- Which side of the course does this athlete prefer?
- Does the athlete tack on headers or hold long boards?
- How risky is the athlete near the edge of the course?
- Does dirty air or pressure justify changing plan?

The simulator explains the answer live.

## AI Components

- Local Qwen 3.5 4B tactical endpoint.
- Athlete-specific bot brain runtime.
- Wind AI scenario sampler.
- Structured prompt context with pilot isolation.
- Replay validation and readiness scoring.

## Dataset

Current clean dataset:

- 54 valid GPX tracks
- 2 excluded tracks
- 7 sailors
- Lake Garda Area B

Generated model assets:

- 7 bot brains
- 7 auto-calibrated athlete profiles
- 100 wind scenarios
- 57 wind variables
- 100 ensemble simulation variants

## Challenges

The hardest part was not drawing boats on a map. The hard part was making the tactics measurable:

- segmenting real GPX tracks into meaningful legs
- avoiding bots that repeat the same route
- keeping speed realistic
- preventing boats from sailing onto land
- explaining why the AI made a decision

## Accomplishments

- End-to-end simulator works locally.
- Real athlete data is organized and parsed.
- The UI exposes decision reasoning.
- The project includes verification scripts.
- The README points judges to the core files.

## What We Learned

For sports AI, explainability matters as much as model output. A coach, sailor, or judge needs to see why the decision happened, not just watch a dot move on a map.

## What Is Next

To move from prototype to product:

1. Run long browser stress tests over complete race duration.
2. Add more GPX races.
3. Validate mark rounding against official race committee geometry.
4. Export coach reports per sailor.
5. Improve the auto-calibration model with more regatta contexts.

## Built With

- JavaScript
- Leaflet
- Python
- GPX
- Qwen 3.5 4B
- MLX / Transformers
- OpenStreetMap

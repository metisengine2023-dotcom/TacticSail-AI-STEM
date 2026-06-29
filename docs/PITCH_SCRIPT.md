# 3 Minute Pitch Script

## 0:00 - Hook

In sailing, two athletes can sail the same race and choose completely different sides of the course. After the finish, the question is always the same: did I lose because I was slow, or because I made the wrong tactical decision?

TacticalSail AI STEM answers that question.

## 0:20 - What The App Does

This is a 2D race simulator for Lake Garda Area B.

We load real GPX tracks from ILCA 4 sailors, extract how each athlete actually races, and create AI bots that try to reproduce their tactical style.

The map shows the course, the boats, the wind, the track, the replay ghost, and the decision reason.

## 0:50 - Live Demo Sequence

1. Open the app.
2. Point to `Hackathon QA`.
3. Say: "The current readiness score is generated from real validation metrics, not hand-written marketing."
4. Start the race.
5. Select one bot.
6. Point to `Live tactics`.
7. Say: "The bot is deciding whether to hold, tack, or seek pressure using athlete profile, wind, VMG, dirty air, and layline risk."
8. Point to `Wind`.
9. Say: "The wind is not a single static arrow. It is sampled from 100 AI wind scenarios with 57 variables."
10. Point to the track and ghost.
11. Say: "The simulator auto-calibrates each bot against real GPS behavior. The current fit improved from 78.8% base to 91.6% calibrated."

## 1:45 - AI Explanation

The AI is not only a chat model.

There are three layers:

- a local tactical engine
- per-athlete bot brains
- an automatic GPX calibration pass
- a local Qwen 3.5 4B tactical endpoint

If Qwen is offline, the simulator still works with the local bot brain fallback.

## 2:15 - STEM Impact

For education, this lets sailors learn physics and math through sport:

- VMG
- vectors
- wind shifts
- pressure
- acceleration after tacks
- decision scoring
- replay validation

It turns a race into an interactive STEM lab.

## 2:45 - Honest Limitation

The system is not finished as a professional coaching product. The hackathon model is strong, but we still need deeper GPX-vs-simulation validation, official race committee mark data, and more regattas to validate exact timing.

## 3:00 - Close

TacticalSail is not just a game. It is a way to make tactical sailing explainable, measurable, and teachable.

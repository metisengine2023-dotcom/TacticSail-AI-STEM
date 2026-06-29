# Judge Demo Checklist

Use this sequence for the 2-3 minute Devpost video.

## Before Recording

1. Start the server:

   ```bash
   python3 scripts/serve_ui.py --host 127.0.0.1 --port 8002
   ```

2. Open:

   ```text
   http://127.0.0.1:8002/web/
   ```

3. Click `Judge demo`.

## What To Show

1. **Hackathon QA**
   - readiness score
   - replay similarity
   - wind scenario id
   - course lock

2. **Live tactics**
   - selected bot action
   - side choice
   - score
   - reason

3. **Wind**
   - AI wind badge
   - pressure zone
   - scenario-based behavior

4. **Map**
   - real course
   - fixed marks
   - live tracks
   - ghost/replay comparison

5. **Honest limitation**
   - the model is hackathon-ready, not yet a certified coaching product
   - deeper GPX-vs-simulation validation is still next before real coaching use

## Closing Line

TacticalSail turns sailing data into an explainable STEM simulation: not just where the sailor went, but why the tactical choice happened.

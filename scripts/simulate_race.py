from __future__ import annotations

import sys
from pathlib import Path

# Add src to the Python path so local modules resolve correctly.
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import argparse
import json
import random
import time
from typing import Any
from the_mastery_mentors.loader import load_area_b, load_bot_profiles, load_tactical_priors
from the_mastery_mentors.qwen_runtime import RuntimeBundle, generate_with_runtime, load_auto_model


def draw_map(x: float, y: float, mure: str, leg: str, opponent_x: float, opponent_y: float) -> str:
    # High-readability ASCII map: 40 columns by 15 rows.
    # X: 0-1000 -> 1-38
    # Y: 0-1200 -> row 14 (Y=0) to row 0 (Y=1200)
    grid = [[" " for _ in range(40)] for _ in range(15)]
    
    # Draw Garda shores.
    for r in range(15):
        grid[r][0] = "█"  # West shore (Limone)
        grid[r][39] = "█" # East shore (Malcesine)
        
    # Draw windward marks (ALFA 1 and ALFA 2 at Y=150, row 13).
    # ALFA 1 (Ovest): X = 250 (col 10)
    # ALFA 2 (Est): X = 750 (col 30)
    grid[13][10] = "❶"
    grid[13][30] = "❷"
    
    # Draw start/finish/gate line near the top (Y=1050, row 1).
    for c in range(1, 39):
        grid[1][c] = "·"
    grid[1][16] = "G"
    grid[1][17] = "A"
    grid[1][18] = "T"
    grid[1][19] = "E"
    
    # Virtual opponent position.
    opp_col = int(opponent_x / 1000 * 38) + 1
    opp_row = 14 - int(opponent_y / 1200 * 14)
    opp_col = max(1, min(opp_col, 38))
    opp_row = max(0, min(opp_row, 14))
    grid[opp_row][opp_col] = "O"
    
    # Bot-piloted boat position.
    col = int(x / 1000 * 38) + 1
    row = 14 - int(y / 1200 * 14)
    col = max(1, min(col, 38))
    row = max(0, min(row, 14))
    
    # Boat symbol depends on tack.
    boat_char = "▶" if mure == "mure_a_sinistra" else "◀"
    grid[row][col] = boat_char
    
    lines = []
    lines.append("       WEST SHORE (Limone)                       EAST SHORE (Malcesine)")
    lines.append("    " + "—"*40)
    for r in range(15):
        line_str = "".join(grid[r])
        # Add labels.
        if r == 1:
            line_str += "  [START/FINISH]"
        elif r == 13:
            line_str += "  [WINDWARD MARKS ❶/❷]"
        lines.append(f"{r:2d} |{line_str}|")
    lines.append("    " + "—"*40)
    lines.append("      Legend: ▶/◀ = Your boat (tack) | O = Opponent | ❶/❷ = Marks")
    return "\n".join(lines)


def query_qwen(runtime: RuntimeBundle, bot_name: str, preferred_side: str, state: dict[str, Any]) -> dict[str, Any]:
    # Build a compact tactical prompt with the current state.
    prompt_content = f"""
You are the virtual tactical officer for TacticalSail v1. Pilot bot '{bot_name}' in real time. Preferred side: {preferred_side}.
Current race state:
- Leg: {state['leg']}
- Boat position: X={state['x']:.1f}, Y={state['y']:.1f}
- Current tack: {state['mure']}
- Local wind: {state['wind_desc']}
- Current speed: {state['speed']:.2f} knots
- Current VMG: {state['vmg']:.2f} knots
- Left/Malcesine layline: {state['layline_status']}

Tactical constraints:
1. The left/Malcesine side (X > 700) is favored for pressure in this simplified CLI scenario.
2. Upwind ideal sequence: start, tack early to port, hold the left layline lane, then tack on layline toward the mark.
3. If the boat is on starboard tack after the start, recommend an early tack to port.
4. If the boat is near layline or sees a right shift, evaluate a tack.

Return pure JSON only, without Markdown fences.

Required JSON shape:
{{
  "action": "HOLD" | "TACK",
  "recommended_side": "left" | "right",
  "detected_critical_point": "short description of risk or wind state",
  "tactical_reason": "maximum 20 words in English"
}}
"""
    
    messages = [
        {"role": "system", "content": "You are the virtual tactical officer. Return only pure JSON matching the required structure."},
        {"role": "user", "content": prompt_content}
    ]
    
    response_text = generate_with_runtime(runtime, messages, max_tokens=256)
    
    # Clean possible Markdown fences or whitespace.
    response_text = response_text.strip()
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    response_text = response_text.strip()
    
    try:
        return json.loads(response_text)
    except Exception:
        # Deterministic fallback for malformed JSON.
        if state['mure'] == "mure_a_dritta" and state['y'] > 200:
            return {
                "action": "TACK",
                "recommended_side": "left",
                "detected_critical_point": "Starting on starboard, needs to move left.",
                "tactical_reason": "Tack early to connect with the eastern-shore pressure.",
            }
        return {
            "action": "HOLD",
            "recommended_side": "left",
            "detected_critical_point": "No critical issue detected.",
            "tactical_reason": "Hold the left board to exploit standard pressure.",
        }


def run_simulation(bot_choice: str = "2", auto_mode: bool = False, max_steps: int = 50) -> None:
    print("="*80)
    print(" INTERACTIVE RACE SIMULATOR - TACTICALSAIL V1 ".center(80, "#"))
    print("="*80)
    
    # Load Qwen.
    try:
        runtime = load_auto_model()
        print(f"Qwen backend active: {runtime.backend} ({runtime.model_id})")
    except Exception as e:
        print(f"Error loading Qwen model: {e}")
        return

    # Bot selection.
    if bot_choice == "1":
        bot_name = "Paolo"
        preferred_side = "right"
    else:
        bot_name = "Emanuele"
        preferred_side = "left"
        
    print(f"\nStarting simulation for bot: {bot_name} ({preferred_side})...")
    
    # Initial boat state: start near the top, centered on X.
    state = {
        "leg": "PRIMA_BOLINA",
        "x": 500.0,
        "y": 1050.0,
        "mure": "mure_a_dritta",
        "speed": 6.0,
        "vmg": 4.24,
        "wind_desc": "Standard Ora from 190° at 14 knots. Stronger wind on the left/Malcesine side.",
        "layline_status": "Not reached yet."
    }
    
    # Virtual opponent state.
    opp_x = 480.0
    opp_y = 1050.0
    opp_mure = "mure_a_dritta"
    
    step = 1
    auto_mode_active = auto_mode
    
    print("\n--- RACE STARTED ---")
    
    while step <= max_steps:
        # 1. Compute simplified local wind and shifts from X/Y.
        if state["x"] > 700:
            state["wind_desc"] = "Strong left-side pressure (+2.5 knots). Lift active."
            base_speed = 7.5
            if state["mure"] == "mure_a_dritta":
                state["vmg"] = base_speed * 0.80
            else:
                state["vmg"] = base_speed * 0.70
        elif state["x"] < 300:
            if state["x"] < 120 and state["mure"] == "mure_a_sinistra":
                state["wind_desc"] = "Right shift under the wall. Favorable wind shift active."
                base_speed = 6.2
                state["vmg"] = base_speed * 0.78
            else:
                state["wind_desc"] = "Right-side pressure lull in mountain shadow (-2 knots)."
                base_speed = 4.5
                state["vmg"] = base_speed * 0.65
        else:
            state["wind_desc"] = "Center channel, stable wind with minimal oscillation."
            base_speed = 6.0
            state["vmg"] = base_speed * 0.70
            
        state["speed"] = base_speed
        
        # Layline estimate for ALFA 2 (X=750, Y=150).
        # Y = 900 - X
        if state["y"] <= 900 - state["x"] and state["mure"] == "mure_a_sinistra":
            state["layline_status"] = "REACHED. Left layline for mark ❷; tack now."
        else:
            state["layline_status"] = "Not reached."
            
        # 2. Show telemetry and ASCII map.
        print("\n" + "="*50)
        print(f" STEP {step} | LEG: {state['leg']} ".center(50, "-"))
        print("="*50)
        print(draw_map(state["x"], state["y"], state["mure"], state["leg"], opp_x, opp_y))
        print(f"Boat {bot_name}: position X={state['x']:.1f}, Y={state['y']:.1f} | Tack: {state['mure']}")
        print(f"Speed: {state['speed']:.2f} kn | VMG: {state['vmg']:.2f} kn")
        print(f"Wind condition: {state['wind_desc']}")
        print(f"Layline state: {state['layline_status']}")
        print(f"Opponent: position X={opp_x:.1f}, Y={opp_y:.1f}")
        
        # Compute geometric gap.
        gap = state["y"] - opp_y
        if gap < 0:
            print(f"RACE STATUS: ahead by {-gap:.1f} meters.")
        elif gap > 0:
            print(f"RACE STATUS: behind by {gap:.1f} meters.")
        else:
            print("RACE STATUS: even.")
            
        # Check leg completion.
        if state["leg"] == "PRIMA_BOLINA" and state["y"] <= 150:
            print("\n" + "*"*80)
            print(" ALFA 2 windward mark rounded. ".center(80, " "))
            print(" Downwind leg toward the gate begins. ".center(80, " "))
            print("*"*80)
            state["leg"] = "POPPA"
            state["mure"] = "mure_a_sinistra"
            if not auto_mode_active:
                time.sleep(2)
            
        elif state["leg"] == "POPPA" and state["y"] >= 1000:
            print("\n" + "="*80)
            print(" RACE COMPLETE. Finish line crossed. ".center(80, " "))
            print("="*80)
            break
            
        # 3. Query Qwen for a tactical decision.
        decision = query_qwen(runtime, bot_name, preferred_side, state)
        print("\n---> QWEN TACTICAL DECISION:")
        print(f"     Recommended action: {decision.get('action', 'HOLD')}")
        print(f"     Critical point:     {decision.get('detected_critical_point', 'None')}")
        print(f"     Reason:             {decision.get('tactical_reason', '')}")
        
        # Ask for input when not in automatic mode.
        if not auto_mode_active:
            user_cmd = input("\n[Enter] next step | [v] force tack | [auto] fast mode | [quit]: ").strip().lower()
            if user_cmd == "quit":
                print("\nSimulation interrupted.")
                break
            elif user_cmd == "v":
                decision["action"] = "TACK"
            elif user_cmd == "auto":
                auto_mode_active = True
                
        # 4. Apply tactical decision.
        if decision.get("action") == "TACK":
            if state["mure"] == "mure_a_dritta":
                state["mure"] = "mure_a_sinistra"
                print("\n>>> MANEUVER: tack completed. Now on port tack.")
            else:
                state["mure"] = "mure_a_dritta"
                print("\n>>> MANEUVER: tack completed. Now on starboard tack.")
            if not auto_mode_active:
                time.sleep(1)
            
        # 5. Move the boat.
        if state["leg"] == "PRIMA_BOLINA":
            if state["mure"] == "mure_a_sinistra":
                state["x"] -= 50.0
            else:
                state["x"] += 50.0
            state["y"] -= state["vmg"] * 10.0
        else:
            if state["mure"] == "mure_a_sinistra":
                state["x"] += 60.0
            else:
                state["x"] -= 60.0
            if state["x"] > 650:
                downwind_vmg = 7.0
            else:
                downwind_vmg = 5.0
            state["y"] += downwind_vmg * 10.0
            
        # Clamp X inside the shores.
        state["x"] = max(10.0, min(state["x"], 990.0))
        
        # 6. Move the opponent with intentionally suboptimal random boards.
        if random.random() < 0.25:
            opp_mure = "mure_a_sinistra" if opp_mure == "mure_a_dritta" else "mure_a_dritta"
            
        if state["leg"] == "PRIMA_BOLINA":
            if opp_mure == "mure_a_sinistra":
                opp_x -= 40.0
            else:
                opp_x += 40.0
            opp_y -= 4.0 * 10.0
        else:
            if opp_mure == "mure_a_sinistra":
                opp_x += 50.0
            else:
                opp_x -= 50.0
            opp_y += 5.5 * 10.0
            
        opp_x = max(10.0, min(opp_x, 990.0))
        
        step += 1
        if auto_mode_active and not auto_mode:
            time.sleep(0.5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bot", choices=["1", "2"], default="2")
    parser.add_argument("--auto", action="store_true", default=False)
    parser.add_argument("--max-steps", type=int, default=50)
    args = parser.parse_args()
    
    # Force auto mode when there is no TTY, for example during agent execution.
    force_auto = args.auto or not sys.stdin.isatty()
    
    run_simulation(
        bot_choice=args.bot,
        auto_mode=force_auto,
        max_steps=args.max_steps,
    )
        

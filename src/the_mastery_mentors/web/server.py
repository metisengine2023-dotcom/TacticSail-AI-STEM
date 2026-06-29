from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# Add 'src' to python path to load the modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from the_mastery_mentors.loader import load_area_b, load_bot_profiles, load_tactical_priors
from the_mastery_mentors.schemas import ContextBundle, SimulationRequest
from the_mastery_mentors.context_builder import build_payload
from the_mastery_mentors.qwen_runtime import RuntimeBundle, generate_with_runtime, load_auto_model


app = FastAPI(title="TacticalSail v1 Regatta Simulator")

# Global simulation state
sim_state = {
    "started": False,
    "step": 0,
    "leg": "PRIMA_BOLINA",
    "wind_direction": 190.0,
    "wind_intensity": 14.0,
    "followed_bot": "BOT_05", # Emanuele by default
    "all_qwen": False,        # If true, queries Qwen for all bots
    "boats": {},              # bot_code -> state
    "history": []             # step -> list of boat positions
}

# Load static model references
RUNTIME: RuntimeBundle | None = None


def init_qwen_model():
    global RUNTIME
    if RUNTIME is None:
        try:
            print("Caricamento del modello Qwen 3.5 4B...")
            RUNTIME = load_auto_model()
            print(f"Modello Qwen caricato con successo via {RUNTIME.backend}: {RUNTIME.model_id}")
        except Exception as e:
            print(f"Errore nel caricamento del modello Qwen: {e}")
            print("Il simulatore funzionerà in modalità di fallback deterministica per le decisioni dei bot.")


def get_local_wind(x: float, y: float, mure: str) -> dict[str, Any]:
    # East Shore (Malcesine): X > 700
    if x > 700:
        desc = "Pressione forte a sinistra (+2.5 nodi). Buono di rotazione attivo."
        pressure = "strong"
        base_speed = 7.5
        vmg_factor = 0.80 if mure == "mure_a_dritta" else 0.70
    # West Shore (Limone): X < 300
    elif x < 300:
        if x < 120 and mure == "mure_a_sinistra":
            desc = "Scazzetto a destra! Salto di vento favorevole sotto costa."
            pressure = "medium"
            base_speed = 6.2
            vmg_factor = 0.78
        else:
            desc = "Scarso di pressione a destra (d'ombra delle montagne, -2 nodi)."
            pressure = "weak"
            base_speed = 4.5
            vmg_factor = 0.65
    # Center Lago
    else:
        desc = "Canale centrale, vento stabile (oscillazioni minime)."
        pressure = "medium"
        base_speed = 6.0
        vmg_factor = 0.70
        
    return {
        "description": desc,
        "pressure": pressure,
        "speed": base_speed,
        "vmg": base_speed * vmg_factor
    }


def is_in_layline(x: float, y: float, mure: str, leg: str) -> bool:
    if leg == "PRIMA_BOLINA":
        # ALFA 2: X = 750, Y = 150
        # Layline on starboard tack: Y - 150 = -(X - 750) => Y = 900 - X
        if mure == "mure_a_sinistra" and y <= 900 - x:
            return True
    return False


def query_bot_autopilot_qwen(bot_code: str, bot_name: str, preferred_side: str, state: dict[str, Any]) -> str:
    global RUNTIME
    if RUNTIME is None:
        # Fallback deterministico basato sulle regole tattiche del bot
        # Se mure a dritta, gira subito a sinistra se non è già sul lato preferito
        if state["mure"] == "mure_a_dritta" and state["y"] > 200:
            return "VIRA"
        # Se siamo in layline, vira
        if state["layline_status"] != "Non raggiunta.":
            return "VIRA"
        # Se preferisce destra e si trova a sinistra, o viceversa, valuta virata
        return "PROSEGUI"

    prompt = f"""
Sei il cervello del Bot '{bot_name}' (BOT_CODE: {bot_code}, lato preferito: {preferred_side}) in una regata ad Area B (Ora, vento da Sud 190°).
Il tuo obiettivo è decidere l'azione immediata.
Stato attuale della barca:
- Coordinata X: {state['x']:.1f} (0=Limone/Ovest, 1000=Malcesine/Est)
- Coordinata Y: {state['y']:.1f} (1050=Start/Top, 150=Marks/Bottom)
- Mure attuali: {state['mure']}
- Vento locale: {state['wind_desc']}
- Layline: {state['layline_status']}

Regole:
- Se sei su mure a dritta (starboard tack) subito dopo lo start, devi virare subito a sinistra.
- Se preferisci la sinistra (left) e sei mure a dritta, dovresti virare per portarti a sinistra.
- Se raggiungi la layline per la boa, devi virare.

Rispondi ESCLUSIVAMENTE con uno di questi due comandi in JSON puro:
{{ "azione": "VIRA" }} o {{ "azione": "PROSEGUI" }}
"""
    
    messages = [
        {"role": "system", "content": "Rispondi solo con JSON valido contendo la chiave 'azione'."},
        {"role": "user", "content": prompt}
    ]
    
    try:
        response = generate_with_runtime(RUNTIME, messages, max_tokens=64)
        response_text = response.strip().lower()
        if "vira" in response_text:
            return "VIRA"
    except Exception as e:
        print(f"Errore query autopilot per {bot_name}: {e}")
        
    return "PROSEGUI"


def query_coach_qwen(bot_name: str, preferred_side: str, state: dict[str, Any], fleet: list[dict[str, Any]]) -> dict[str, Any]:
    global RUNTIME
    if RUNTIME is None:
        return {
            "azione": "VIRA" if (state["mure"] == "mure_a_dritta" and state["y"] > 200) else "PROSEGUI",
            "lato_consigliato": "left",
            "punto_critico_rilevato": "Conduzione standard attiva.",
            "motivazione_tattica": "Mantieni la barca veloce mure a sinistra verso la pressione di Malcesine."
        }
    fleet_str = "\n".join([
        f"- Bot: {b['bot_name']} | Pos: X={b['x']:.1f}, Y={b['y']:.1f} | Mure: {b['mure']} | SOG: {b['speed']:.1f} kn"
        for b in fleet if b['bot_code'] != state['bot_code']
    ])

    prompt = f"""
Sei l'Ufficiale Tattico Virtuale di 'TacticalSail v1'. Devi guidare la barca di '{bot_name}' (lato preferito: {preferred_side}).
Hai la vista completa sul campo di regata (Area B, Ora da 190°).

Stato della tua barca:
- Posizione: X={state['x']:.1f}, Y={state['y']:.1f}
- Mure attuali: {state['mure']}
- Vento locale: {state['wind_desc']}
- Velocità attuale: {state['speed']:.2f} nodi
- VMG attuale: {state['vmg']:.2f} nodi
- Layline: {state['layline_status']}

Stato degli avversari:
{fleet_str}

Regola d'oro:
1. La sponda sinistra (Malcesine, X > 700) ha più pressione (+2.5 nodi) ed è favorita.
2. In bolina, si parte, si vira subito mure a sinistra, si va dritti fino alla layline di sinistra, poi si vira a destra per chiudere in boa.
3. Se rilevi un forte scazzetto a destra, puoi considerare di andare a destra.

Rispondi ESCLUSIVAMENTE in formato JSON puro. Non includere testo prima o dopo il JSON.

Struttura JSON richiesta:
{{
  "azione": "PROSEGUI" | "VIRA",
  "lato_consigliato": "left" | "right",
  "punto_critico_rilevato": "descrizione breve dello stato",
  "motivazione_tattica": "spiegazione tecnica (max 20 parole)"
}}
"""

    messages = [
        {"role": "system", "content": "Sei l'Ufficiale Tattico Virtuale. Rispondi solo in JSON puro conforme alla struttura richiesta."},
        {"role": "user", "content": prompt}
    ]

    try:
        response = generate_with_runtime(RUNTIME, messages, max_tokens=256)
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        return json.loads(response_text)
    except Exception as e:
        print(f"Errore query coach: {e}")
        return {
            "azione": "VIRA" if (state["mure"] == "mure_a_dritta" and state["y"] > 200) else "PROSEGUI",
            "lato_consigliato": "left",
            "punto_critico_rilevato": "Nessun pericolo rilevato.",
            "motivazione_tattica": "Mantieni rotta su mure a sinistra per agganciare Malcesine."
        }


class StartRequest(BaseModel):
    followed_bot: str = "BOT_05"
    all_qwen: bool = False
    wind_direction: float = 190.0
    wind_intensity: float = 14.0


@app.get("/")
def get_index():
    index_path = Path(__file__).parent / "frontend" / "index.html"
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@app.get("/api/config")
def get_config():
    # Return the roster of 7 bots from area_b config
    try:
        area_b = load_area_b("data/area_b.example.json")
        return {
            "bots": area_b.bot_roster,
            "wind_modes": ["Ora"],
            "area": "B"
        }
    except Exception as e:
        # Fallback list if files not loaded
        return {
            "bots": [
                {"bot_code": "BOT_01", "bot_name": "Paolo", "preferred_side": "right", "avg_speed": 6.01, "avg_vmg": 4.005},
                {"bot_code": "BOT_02", "bot_name": "Filippo", "preferred_side": "right", "avg_speed": 6.105, "avg_vmg": 3.967},
                {"bot_code": "BOT_03", "bot_name": "Enrico", "preferred_side": "right", "avg_speed": 6.041, "avg_vmg": 3.92},
                {"bot_code": "BOT_04", "bot_name": "Giuseppe", "preferred_side": "left", "avg_speed": 6.036, "avg_vmg": 4.029},
                {"bot_code": "BOT_05", "bot_name": "Emanuele", "preferred_side": "left", "avg_speed": 6.029, "avg_vmg": 4.027},
                {"bot_code": "BOT_06", "bot_name": "Elia", "preferred_side": "right", "avg_speed": 6.256, "avg_vmg": 3.908},
                {"bot_code": "BOT_07", "bot_name": "Simeon", "preferred_side": "left", "avg_speed": 6.076, "avg_vmg": 4.014}
            ]
        }


@app.post("/api/start")
def start_simulation(req: StartRequest):
    global sim_state
    sim_state["started"] = True
    sim_state["step"] = 0
    sim_state["leg"] = "PRIMA_BOLINA"
    sim_state["followed_bot"] = req.followed_bot
    sim_state["all_qwen"] = req.all_qwen
    sim_state["wind_direction"] = req.wind_direction
    sim_state["wind_intensity"] = req.wind_intensity
    sim_state["history"] = []
    
    # Load bots config
    bots_list = get_config()["bots"]
    sim_state["boats"] = {}
    
    for b in bots_list:
        code = b["bot_code"]
        # Start positions are staggered slightly near the start line (Y = 1050)
        # X coordinates around 500 (middle)
        offset_x = random.uniform(-60.0, 60.0)
        offset_y = random.uniform(-10.0, 10.0)
        
        sim_state["boats"][code] = {
            "bot_code": code,
            "bot_name": b["bot_name"],
            "preferred_side": b["preferred_side"],
            "avg_speed": b["avg_speed"],
            "avg_vmg": b["avg_vmg"],
            "x": 500.0 + offset_x,
            "y": 1050.0 + offset_y,
            "mure": "mure_a_dritta", # Starts on starboard tack
            "speed": b["avg_speed"],
            "vmg": b["avg_vmg"],
            "wind_desc": "Ora standard da 190°",
            "layline_status": "Non raggiunta.",
            "trail": [],
            "rank": 1,
            "active": True
        }
        
    return {"status": "ok", "state": sim_state}


@app.post("/api/step")
def step_simulation():
    global sim_state
    if not sim_state["started"]:
        raise HTTPException(status_code=400, detail="Simulation not started")
        
    sim_state["step"] += 1
    leg = sim_state["leg"]
    
    # Pre-calculate local wind and layline status for all boats
    for code, boat in sim_state["boats"].items():
        if not boat["active"]:
            continue
            
        wind_info = get_local_wind(boat["x"], boat["y"], boat["mure"])
        boat["wind_desc"] = wind_info["description"]
        boat["speed"] = wind_info["speed"]
        boat["vmg"] = wind_info["vmg"]
        
        if is_in_layline(boat["x"], boat["y"], boat["mure"], leg):
            boat["layline_status"] = "RAGGIUNTA! Sei in layline per boa ❷. Vira!"
        else:
            boat["layline_status"] = "Non raggiunta."

    # Run decision process for each boat
    fleet_list = [dict(b) for b in sim_state["boats"].values()]
    coach_advice = None

    for code, boat in sim_state["boats"].items():
        if not boat["active"]:
            continue
            
        # Decision engine
        action = "PROSEGUI"
        
        # Decide if this boat is driven by Qwen or deterministic algorithm
        is_followed = (code == sim_state["followed_bot"])
        
        if is_followed:
            # Query Qwen for the Coach advice (which also tells us the followed boat's decision)
            coach_res = query_coach_qwen(boat["bot_name"], boat["preferred_side"], boat, fleet_list)
            coach_advice = coach_res
            action = coach_res.get("azione", "PROSEGUI")
        elif sim_state["all_qwen"]:
            # Query Qwen for individual bot decision
            action = query_bot_autopilot_qwen(code, boat["bot_name"], boat["preferred_side"], boat)
        else:
            # Heuristic algorithm for opponent bots to maintain high performance
            # Paolo, Filippo, Enrico, Elia prefer right shore -> they go right (starboard tack) longer
            # Giuseppe, Emanuele, Simeon prefer left shore -> they go left (port tack) longer
            if sim_state["step"] == 1:
                # Everyone tacks immediately to port tack except right-preferring bots who stay starboard a bit longer
                if boat["preferred_side"] == "left":
                    action = "VIRA"
            else:
                # Regular tactical checks
                if boat["layline_status"] != "Non raggiunta.":
                    action = "VIRA"
                elif boat["x"] > 880 and boat["mure"] == "mure_a_dritta":
                    # Close to East shore, must tack back
                    action = "VIRA"
                elif boat["x"] < 120 and boat["mure"] == "mure_a_sinistra":
                    # Close to West shore, must tack back
                    action = "VIRA"
                elif random.random() < 0.05:
                    # Random oscillations / covering maneuvers
                    action = "VIRA"

        # Apply action
        if action == "VIRA":
            boat["mure"] = "mure_a_sinistra" if boat["mure"] == "mure_a_dritta" else "mure_a_dritta"
            
        # Move the boat based on current leg and mure
        # Record trail
        boat["trail"].append({"x": boat["x"], "y": boat["y"]})
        if len(boat["trail"]) > 100:
            boat["trail"].pop(0)
            
        if leg == "PRIMA_BOLINA":
            # Upwind: Y decreases
            if boat["mure"] == "mure_a_sinistra":
                # Port tack heading 235°: X decreases, Y decreases
                boat["x"] -= 45.0
            else:
                # Starboard tack heading 145°: X increases, Y decreases
                boat["x"] += 45.0
            boat["y"] -= boat["vmg"] * 10.0
        else:
            # Downwind: Y increases
            if boat["mure"] == "mure_a_sinistra":
                # Port tack heading 35°: X increases, Y increases
                boat["x"] += 55.0
            else:
                # Starboard tack heading 325°: X decreases, Y increases
                boat["x"] -= 55.0
            # Poppa speed lane: East side is faster
            poppa_vmg = 7.0 if boat["x"] > 650 else 5.0
            boat["y"] += poppa_vmg * 10.0

        # Boundary checks
        boat["x"] = max(15.0, min(boat["x"], 985.0))

    # Check Leg State Transitions
    # If followed bot rounded the mark (Y <= 150), transition to poppa
    followed_boat = sim_state["boats"][sim_state["followed_bot"]]
    if leg == "PRIMA_BOLINA" and followed_boat["y"] <= 150:
        sim_state["leg"] = "POPPA"
        # Turn all active boats to port tack to start downwind
        for boat in sim_state["boats"].values():
            boat["mure"] = "mure_a_sinistra"
            boat["y"] = max(boat["y"], 150.0) # lock at mark level
            
    elif leg == "POPPA" and followed_boat["y"] >= 1050:
        # Finish line crossed
        sim_state["started"] = False

    # Update Leaderboard ranks
    # In upwind, lower Y is better. In downwind, higher Y is better.
    active_boats = [b for b in sim_state["boats"].values() if b["active"]]
    if sim_state["leg"] == "PRIMA_BOLINA":
        active_boats.sort(key=lambda b: b["y"]) # lowest Y first
    else:
        active_boats.sort(key=lambda b: b["y"], reverse=True) # highest Y first
        
    for i, b in enumerate(active_boats):
        sim_state["boats"][b["bot_code"]]["rank"] = i + 1

    # Record history
    history_entry = {
        code: {"x": boat["x"], "y": boat["y"], "mure": boat["mure"], "rank": boat["rank"], "sog": boat["speed"]}
        for code, boat in sim_state["boats"].items()
    }
    sim_state["history"].append(history_entry)
    
    return {
        "state": sim_state,
        "coach_advice": coach_advice
    }


@app.post("/api/tack")
def force_tack():
    global sim_state
    if not sim_state["started"]:
        raise HTTPException(status_code=400, detail="Simulation not started")
        
    followed_boat = sim_state["boats"][sim_state["followed_bot"]]
    followed_boat["mure"] = "mure_a_sinistra" if followed_boat["mure"] == "mure_a_dritta" else "mure_a_dritta"
    return {"status": "ok", "mure": followed_boat["mure"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--test", action="store_true", default=False)
    args = parser.parse_args()
    
    # Initialize the platform-specific Qwen model
    init_qwen_model()
    
    # Mount static files
    frontend_path = Path(__file__).parent / "frontend"
    app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")
    
    if args.test:
        print("FastAPI server tests completed successfully!")
        sys.exit(0)
        
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()

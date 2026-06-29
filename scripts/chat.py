from __future__ import annotations

import sys
from pathlib import Path

# Aggiungi 'src' al path di Python per caricare i moduli corretti
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import json
from the_mastery_mentors.loader import load_area_b, load_bot_profiles, load_tactical_priors
from the_mastery_mentors.schemas import ContextBundle, SimulationRequest
from the_mastery_mentors.context_builder import build_payload
from the_mastery_mentors.qwen_runtime import generate_with_runtime, load_auto_model


def main() -> None:
    print("Caricamento del modello Qwen e dell'ambiente in corso (può richiedere qualche secondo)...")

    try:
        runtime = load_auto_model()
        print(f"Backend Qwen attivo: {runtime.backend} ({runtime.model_id})")
    except Exception as e:
        print(f"Errore nel caricamento del modello Qwen: {e}")
        sys.exit(1)
    
    # Caricamento del contesto aggiornato
    try:
        area_b = load_area_b("data/area_b.example.json")
        bot_profiles = load_bot_profiles("data/generated/bot_profiles.json")
        tactical_priors = load_tactical_priors("data/generated/tactical_priors.json")
    except Exception as e:
        print(f"Errore nel caricamento dei dati di configurazione: {e}")
        sys.exit(1)
        
    # Costruzione del payload di contesto per il modello
    request = SimulationRequest(
        area="B",
        wind_mode="Ora",
        scenario="Ora standard in Area B con buoni di pressione/rotazione a sinistra (Malcesine) e scarso a destra (Limone) tranne eccezione dello scazzetto.",
        focus_question="Come ottimizzare la risalita di bolina e la gestione dei bordi?"
    )
    bundle = ContextBundle(
        area_b=area_b,
        bot_profiles=bot_profiles,
        tactical_priors=tactical_priors,
        request=request
    )
    payload = build_payload(bundle)
    
    # System Prompt personalizzato per una conversazione tattica in italiano
    system_prompt = (
        "Sei l'Ufficiale Tattico Virtuale di 'TacticalSail v1', un sistema esperto di simulazione per regate in Area B sul Lago di Garda (vento Ora).\n"
        "Il tuo compito è rispondere a domande strategiche sulla conduzione, sulla scelta dei bordi, sulle boe, sui buoni e gli scarsi e sui profili degli atleti.\n\n"
        "Regole tattiche e contesto del campo:\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n\n"
        "Rispondi in italiano in modo chiaro, tecnico, autorevole e conciso. Fai riferimento specifico a:\n"
        "- La sequenza di bolina corretta (partenza, virata immediata a sinistra, bordo dritto su mure a sinistra fino in layline, virata a destra verso la boa).\n"
        "- I buoni di pressione e rotazione a sinistra (Malcesine) e gli scarsi a destra (Limone), tranne lo scazzetto.\n"
        "- I comportamenti specifici dei 7 bot registrati.\n"
        "Evita risposte troppo lunghe. Mantieni uno stile da tattico/coach di vela."
    )
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    print("\n" + "="*80)
    print(" UFFICIALE TATTICO DI TACTICALSAIL V1 ONLINE ".center(80, "*"))
    print("="*80)
    print("Contesto caricato correttamente. Puoi fare domande sulla tattica, sui bordi o sui bot.")
    print("Digita 'esci' per terminare la conversazione.\n")
    
    while True:
        try:
            user_input = input("Tu > ")
            if not user_input.strip():
                continue
            if user_input.lower() in ("esci", "exit", "quit"):
                print("\nDisconnessione Ufficiale Tattico. Buon vento!")
                break
                
            messages.append({"role": "user", "content": user_input})
            
            # Indicatore di caricamento
            print("Ufficiale Tattico > ...", end="\r")
            
            response_text = generate_with_runtime(runtime, messages, max_tokens=300)
            
            # Pulisce la riga dell'indicatore prima di stampare
            print(" "*30, end="\r")
            print(f"Ufficiale Tattico > {response_text}")
            
            messages.append({"role": "assistant", "content": response_text})
            
        except KeyboardInterrupt:
            print("\nDisconnessione Ufficiale Tattico. Buon vento!")
            break
        except Exception as e:
            print(f"\nErrore nella generazione della risposta: {e}")


if __name__ == "__main__":
    main()

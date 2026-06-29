"""
metasail_parser.py — Parser per dati MetaSail (CSV/JSON)
=========================================================
Legge i file di tracking GPS esportati da MetaSail:
- CSV con colonne: timestamp, lat, lon, sog, cog (e opzionalmente tws, twd)
- JSON con statistiche per gamba (VMG, VmC, velocita, distanza)
- Screenshot-stats: parsing delle statistiche aggregate per gamba

Formato timestamp MetaSail: ISO8601 o Unix epoch
"""

from __future__ import annotations
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union
import pandas as pd
import numpy as np


# ---------------------------------------------------------------------------
# Colonne attese nei file CSV MetaSail
# ---------------------------------------------------------------------------
METASAIL_CSV_COLUMNS = {
    # Possibili nomi colonna nel CSV MetaSail
    "timestamp": ["timestamp", "time", "datetime", "ts", "utc"],
    "lat":       ["lat", "latitude", "gps_lat"],
    "lon":       ["lon", "lng", "longitude", "gps_lon", "gps_lng"],
    "sog_kn":    ["sog", "sog_kn", "speed", "spd", "speed_kn", "gps_speed"],
    "cog":       ["cog", "heading", "course", "gps_cog", "track"],
    "tws_kn":    ["tws", "tws_kn", "wind_speed", "wind_spd"],
    "twd_deg":   ["twd", "twd_deg", "wind_dir", "wind_direction"],
}

KNOT_TO_MS = 0.514444
MS_TO_KNOT = 1.0 / KNOT_TO_MS


def _find_column(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Trova la prima colonna nel DataFrame che corrisponde ai candidati."""
    df_cols_lower = {c.lower(): c for c in df.columns}
    for candidate in candidates:
        if candidate.lower() in df_cols_lower:
            return df_cols_lower[candidate.lower()]
    return None


def _parse_timestamp(val) -> Optional[datetime]:
    """Parsa un timestamp da stringa ISO, Unix epoch (int/float), o ms."""
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        # Unix epoch in secondi o millisecondi
        ts = float(val)
        if ts > 1e12:
            ts /= 1000.0
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    val_str = str(val).strip()
    # ISO 8601
    for fmt in [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ]:
        try:
            dt = datetime.strptime(val_str, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    # Prova a interpretare come numero
    try:
        return _parse_timestamp(float(val_str))
    except (ValueError, TypeError):
        return None


def parse_metasail_csv(path: Union[str, Path]) -> pd.DataFrame:
    """
    Legge un file CSV MetaSail e restituisce un DataFrame normalizzato.
    
    Output DataFrame con colonne:
    - timestamp: datetime con timezone UTC
    - lat, lon: float [°]
    - sog_kn: Speed Over Ground [nodi]
    - cog: Course Over Ground [°]
    - tws_kn: True Wind Speed [nodi] (se disponibile)
    - twd_deg: True Wind Direction [°] (se disponibile)
    
    Args:
        path: percorso al file CSV MetaSail
    
    Returns:
        pd.DataFrame normalizzato e ordinato per timestamp
    
    Raises:
        ValueError: se il file non ha le colonne richieste
        FileNotFoundError: se il file non esiste
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File non trovato: {path}")
    
    # Tenta più separatori comuni
    for sep in [",", ";", "\t"]:
        try:
            df_raw = pd.read_csv(path, sep=sep, dtype=str, encoding="utf-8-sig")
            if len(df_raw.columns) > 2:
                break
        except Exception:
            continue
    else:
        raise ValueError(f"Impossibile leggere il CSV: {path}")
    
    # Mappa colonne
    col_map = {}
    for target, candidates in METASAIL_CSV_COLUMNS.items():
        found = _find_column(df_raw, candidates)
        if found:
            col_map[found] = target
    
    # Verifica colonne obbligatorie
    found_targets = set(col_map.values())
    required = {"timestamp", "lat", "lon"}
    if not required.issubset(found_targets):
        missing = required - found_targets
        raise ValueError(f"Colonne mancanti nel CSV MetaSail: {missing}\nColonne trovate: {list(df_raw.columns)}")
    
    df = df_raw.rename(columns=col_map)
    
    # Parsing e conversione
    df["timestamp"] = df["timestamp"].apply(_parse_timestamp)
    df = df.dropna(subset=["timestamp"])
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"])
    
    # SOG: converti in nodi se non già presenti
    if "sog_kn" in df.columns:
        df["sog_kn"] = pd.to_numeric(df["sog_kn"], errors="coerce").fillna(0)
        # Se SOG sembra essere in m/s (valori < 5 ma > 0.5), converti
        if df["sog_kn"].median() < 5.0 and df["sog_kn"].median() > 0.1:
            df["sog_kn"] = df["sog_kn"] * MS_TO_KNOT
    else:
        df["sog_kn"] = 0.0
    
    if "cog" in df.columns:
        df["cog"] = pd.to_numeric(df["cog"], errors="coerce").fillna(0) % 360
    else:
        df["cog"] = 0.0
    
    if "tws_kn" in df.columns:
        df["tws_kn"] = pd.to_numeric(df["tws_kn"], errors="coerce").fillna(0)
    if "twd_deg" in df.columns:
        df["twd_deg"] = pd.to_numeric(df["twd_deg"], errors="coerce").fillna(0) % 360
    
    # Ordina per timestamp
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    # Filtra punti GPS anomali (fuori dal Lago di Garda)
    GARDA_LAT_MIN, GARDA_LAT_MAX = 45.43, 45.90
    GARDA_LON_MIN, GARDA_LON_MAX = 10.44, 10.90
    mask = (
        (df["lat"] >= GARDA_LAT_MIN) & (df["lat"] <= GARDA_LAT_MAX) &
        (df["lon"] >= GARDA_LON_MIN) & (df["lon"] <= GARDA_LON_MAX)
    )
    df_filtered = df[mask]
    if len(df_filtered) < len(df) * 0.9:
        print(f"[AVVISO] {len(df) - len(df_filtered)} punti GPS fuori dal Lago di Garda rimossi")
    df = df_filtered.reset_index(drop=True)
    
    print(f"[MetaSail CSV] Caricati {len(df)} punti da {path.name} "
          f"({df['timestamp'].min()} → {df['timestamp'].max()})")
    return df


def parse_metasail_json(path: Union[str, Path]) -> pd.DataFrame:
    """
    Legge un file JSON MetaSail (tracking o statistiche per gamba).
    
    Supporta due formati:
    1. Array di punti GPS: [{timestamp, lat, lon, sog, cog}, ...]
    2. Oggetto con statistiche per gamba (dalle screenshot MetaSail)
    
    Returns:
        pd.DataFrame normalizzato
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"File non trovato: {path}")
    
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Formato array di punti
    if isinstance(data, list) and len(data) > 0:
        df = pd.DataFrame(data)
        # Normalizza colonne
        col_map = {}
        for target, candidates in METASAIL_CSV_COLUMNS.items():
            found = _find_column(df, candidates)
            if found:
                col_map[found] = target
        if col_map:
            df = df.rename(columns=col_map)
        if "timestamp" in df.columns:
            df["timestamp"] = df["timestamp"].apply(_parse_timestamp)
        return df.sort_values("timestamp").reset_index(drop=True)
    
    # Formato statistiche per gamba (oggetto)
    if isinstance(data, dict):
        legs = data.get("legs", data.get("gambe", []))
        if legs:
            return parse_leg_stats_from_dict(legs)
    
    raise ValueError(f"Formato JSON MetaSail non riconosciuto: {path}")


def parse_leg_stats_from_dict(legs_data: list) -> pd.DataFrame:
    """
    Parsa le statistiche per gamba da un array di dict (formato MetaSail).
    
    Ogni elemento atteso:
    {
      "leg": 1,
      "mode": "upwind",
      "classifica": 7,
      "vmg_medio_kn": 3.10,
      "top_vmg_kn": 4.89,
      "velocita_media_kn": 4.57,
      "velocita_max_kn": 6.8,
      "distanza_pct": 144,
      "percorso_effettivo_m": 1629,
      "lunghezza_gamba_m": 1135,
      "corso_deg": 187
    }
    """
    records = []
    for leg in legs_data:
        records.append({
            "leg": int(leg.get("leg", 0)),
            "mode": str(leg.get("mode", "unknown")),
            "rank": int(leg.get("classifica", leg.get("rank", 0))),
            "vmg_medio_kn": float(leg.get("vmg_medio_kn", leg.get("vmg_med", 0))),
            "top_vmg_kn": float(leg.get("top_vmg_kn", leg.get("top_vmg", 0))),
            "velocita_media_kn": float(leg.get("velocita_media_kn", leg.get("v_avg", 0))),
            "velocita_max_kn": float(leg.get("velocita_max_kn", leg.get("v_max", 0))),
            "distanza_pct": float(leg.get("distanza_pct", leg.get("dist_pct", 100))),
            "percorso_effettivo_m": float(leg.get("percorso_effettivo_m", leg.get("route_m", 0))),
            "lunghezza_gamba_m": float(leg.get("lunghezza_gamba_m", leg.get("leg_m", 0))),
            "corso_deg": float(leg.get("corso_deg", leg.get("course", 0))),
        })
    return pd.DataFrame(records)


def load_bot_profile(path: Union[str, Path]) -> dict:
    """
    Carica un profilo bot JSON (formato TacticSail).
    
    Returns:
        dict con tutti i dati del profilo (metrics, leg_metrics, ecc.)
    """
    path = Path(path)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_bot_profiles(bots_dir: Union[str, Path]) -> list[dict]:
    """
    Carica tutti i profili bot dalla directory specificata.
    
    Returns:
        Lista di dict profilo, ordinati per bot_code
    """
    bots_dir = Path(bots_dir)
    profiles = []
    for json_file in sorted(bots_dir.glob("BOT_*.json")):
        try:
            profile = load_bot_profile(json_file)
            profiles.append(profile)
        except Exception as e:
            print(f"[AVVISO] Impossibile caricare {json_file.name}: {e}")
    print(f"[MetaSail] Caricati {len(profiles)} profili bot da {bots_dir}")
    return profiles


def compute_metasail_summary(df: pd.DataFrame) -> dict:
    """
    Calcola statistiche riassuntive da una traccia MetaSail elaborata.
    
    Returns:
        dict con metriche aggregate
    """
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn"
    summary = {
        "n_points": len(df),
        "duration_min": None,
        "avg_sog_kn": round(float(df[sog_col].mean()), 3) if sog_col in df.columns else None,
        "max_sog_kn": round(float(df[sog_col].max()), 3) if sog_col in df.columns else None,
        "avg_vmg_kn": round(float(df["vmg_kn"].mean()), 3) if "vmg_kn" in df.columns else None,
        "avg_heel_deg": round(float(df["heel_deg_est"].mean()), 2) if "heel_deg_est" in df.columns else None,
    }
    if "timestamp" in df.columns and len(df) > 1:
        duration = (df["timestamp"].iloc[-1] - df["timestamp"].iloc[0]).total_seconds()
        summary["duration_min"] = round(duration / 60, 2)
    return summary

"""
hydrodynamics.py — Fisica inversa per TacticSail AI STEM
=========================================================
Stima parametri idrodinamici SENZA sensori IMU (solo GPS/COG/SOG).

Modelli implementati:
- Stima sbandamento (heel) da AWA teorico
- Stima drag timone da variazioni COG/SOG (fisica inversa)
- Modello polare ILCA6 semplificato (VMG ottimale per TWA)
- Profilo di perdita velocita' in virata

Riferimenti:
- ILCA6 polar data (World Sailing benchmark)
- Metodo di Gerritsma-Beukelman per resistenza idrodinamica
"""

from __future__ import annotations
import math
import numpy as np
import pandas as pd
from kinematics import shortest_angle_delta

# ---------------------------------------------------------------------------
# Costanti fisiche ILCA6
# ---------------------------------------------------------------------------
ILCA6_SAIL_AREA_M2 = 7.06          # superficie velica [m²]
ILCA6_MASS_KG = 66.0               # peso scafo standard [kg]
ILCA6_CREW_MASS_KG = 75.0          # peso equipaggio medio
ILCA6_RIGHTING_MOMENT_NM = 850.0   # momento raddrizzante a 20° [N·m]
RHO_AIR = 1.225                    # densità aria [kg/m³]
RHO_WATER = 1025.0                 # densità acqua salata [kg/m³]

# Tabella polare ILCA6 (TWA_deg → VMG_ottimale_kn, Speed_kn) calibrata su Garda 10kn
ILCA6_POLAR = [
    # (twa_deg, vmg_kn, speed_kn)
    (30,  0.0,  0.0),   # zona no-go
    (35,  1.2,  2.1),
    (40,  2.8,  3.6),
    (42,  3.2,  4.0),   # VMG bolina ottimale ~42-45°
    (44,  3.5,  4.3),
    (46,  3.6,  4.4),   # picco VMG bolina
    (48,  3.5,  4.5),
    (52,  3.3,  4.6),
    (60,  3.0,  4.9),
    (70,  2.5,  5.2),
    (80,  2.0,  5.6),
    (90,  1.2,  6.1),   # traverso
    (110, 0.4,  6.6),
    (120, 0.0,  6.8),
    (135,-2.8,  6.5),   # VMG poppa ottimale ~150°
    (150,-5.1,  6.2),   # picco VMG poppa
    (160,-5.0,  6.0),
    (170,-4.6,  5.7),
    (180,-4.0,  5.3),
]

def polar_speed_at_twa(twa_deg: float, tws_scale: float = 1.0) -> tuple[float, float]:
    """
    Restituisce (vmg_kn, speed_kn) dalla polare ILCA6 per un dato TWA.
    tws_scale: fattore di scala per vento diverso da 10kn (es. 1.1 per 11kn)
    """
    twa = abs(twa_deg)
    if twa < 30:
        return 0.0, 0.0
    # Interpolazione lineare nella tabella polare
    for i in range(len(ILCA6_POLAR)-1):
        t0, v0, s0 = ILCA6_POLAR[i]
        t1, v1, s1 = ILCA6_POLAR[i+1]
        if t0 <= twa <= t1:
            ratio = (twa - t0) / (t1 - t0) if t1 != t0 else 0
            vmg = v0 + (v1 - v0) * ratio
            spd = s0 + (s1 - s0) * ratio
            return vmg * tws_scale, spd * tws_scale
    return ILCA6_POLAR[-1][1] * tws_scale, ILCA6_POLAR[-1][2] * tws_scale

def optimal_vmg_angle(tws_kn: float = 10.0) -> dict:
    """
    Calcola l'angolo di bolina e poppa ottimale per massimo VMG.
    Restituisce dict con upwind e downwind.
    """
    tws_scale = tws_kn / 10.0
    # Upwind: cerca il massimo VMG positivo
    best_up_vmg, best_up_twa = 0, 46
    best_dn_vmg, best_dn_twa = 0, 150
    for twa in range(30, 181, 1):
        vmg, _ = polar_speed_at_twa(twa, tws_scale)
        if vmg > best_up_vmg:
            best_up_vmg, best_up_twa = vmg, twa
        if vmg < best_dn_vmg:
            best_dn_vmg, best_dn_twa = vmg, twa
    return {
        "upwind_twa_deg": best_up_twa,
        "upwind_vmg_kn": best_up_vmg,
        "downwind_twa_deg": best_dn_twa,
        "downwind_vmg_kn": abs(best_dn_vmg),
    }

# ---------------------------------------------------------------------------
# Stima sbandamento (heel angle) da AWA
# ---------------------------------------------------------------------------
def estimate_heel_angle(awa_deg: float, tws_kn: float, crew_mass_kg: float = 75.0) -> float:
    """
    Stima l'angolo di sbandamento teorico da AWA e TWS.
    Usa un modello semplificato di momento aerodinamico vs momento raddrizzante.
    
    Heel = arctan(F_aero * L_aero / GZ * W)
    dove GZ dipende dall'angolo di sbandamento stesso (iterativo).
    
    Returns:
        heel_deg: angolo di sbandamento stimato [°] (positivo = sinistra)
    """
    if awa_deg > 160 or awa_deg < 10:
        return 0.0  # poppa o ferma: sbandamento trascurabile
    
    # Coefficiente di spinta velica semplificato (funzione di AWA)
    awa_rad = math.radians(min(awa_deg, 90))
    cs = math.sin(awa_rad) * math.cos(awa_rad) * 1.8  # Cl semplificato
    
    # Forza aerodinamica laterale [N]
    v_wind_ms = tws_kn * 0.514444
    f_aero_lateral = 0.5 * RHO_AIR * ILCA6_SAIL_AREA_M2 * cs * v_wind_ms**2
    
    # Momento raddrizzante dell'equipaggio (funzione del peso e del momento di stazza)
    total_mass = ILCA6_MASS_KG + crew_mass_kg
    g = 9.81
    # GZ approximato per piccoli angoli
    gz_approx = 0.8  # [m] braccio di raddrizzamento nominale
    righting_moment = total_mass * g * gz_approx
    
    # Momento sbandante [N·m]
    center_of_effort_height = 4.2  # [m] centro vela dal lago
    heeling_moment = f_aero_lateral * center_of_effort_height * math.cos(math.radians(15))
    
    # Angolo di sbandamento (piccoli angoli)
    if righting_moment > 0:
        heel_rad = math.atan(heeling_moment / righting_moment)
        return min(math.degrees(heel_rad), 35.0)  # cap a 35° (scuffia)
    return 0.0

def estimate_heel_series(df: pd.DataFrame, tws_kn: float, crew_mass_kg: float = 75.0) -> pd.DataFrame:
    """Calcola l'angolo di sbandamento stimato per ogni riga del DataFrame."""
    df = df.copy()
    if "awa_deg" not in df.columns:
        df["heel_deg_est"] = 0.0
        return df
    df["heel_deg_est"] = df["awa_deg"].apply(
        lambda awa: estimate_heel_angle(float(awa), tws_kn, crew_mass_kg)
    )
    return df

# ---------------------------------------------------------------------------
# Stima drag timone da fisica inversa
# ---------------------------------------------------------------------------
def estimate_rudder_drag(df: pd.DataFrame, dt_s: float = 1.0) -> pd.Series:
    """
    Stima il drag del timone da variazioni di COG e SOG (fisica inversa).
    
    Il drag timone è proporzionale all'angolo di timone necessario per mantenere
    la rotta. Lo approssimiamo con la variazione angolare di COG normalizzata
    per la velocità.
    
    drag_proxy = |dCOG/dt| / SOG (adimensionale)
    
    Valori tipici ILCA6:
    - Bolina stabile: < 0.01
    - Virata in corso: 0.03-0.08
    - Conduzione timone pesante: 0.012-0.025
    
    Returns:
        pd.Series con il proxy di drag timone (adimensionale)
    """
    if "cog" not in df.columns:
        return pd.Series(np.zeros(len(df)), index=df.index, name="rudder_drag_proxy")
    
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn"
    dcog = df["cog"].diff().apply(lambda x: abs(shortest_angle_delta(0, x)) if pd.notna(x) else 0)
    dcog_rate = dcog / dt_s  # [°/s]
    sog = df[sog_col].clip(lower=0.1)  # evita divisione per zero
    
    # Drag proxy: correzioni di rotta normalizzate per velocità
    drag = (dcog_rate / sog).clip(upper=0.15)
    return pd.Series(drag.values, index=df.index, name="rudder_drag_proxy")

# ---------------------------------------------------------------------------
# Punteggio di efficienza complessiva della gamba
# ---------------------------------------------------------------------------
def compute_leg_efficiency(df: pd.DataFrame, twd_deg: float, tws_kn: float) -> dict:
    """
    Calcola metriche di efficienza per una singola gamba di regata.
    
    Confronta le performance reali con la polare teorica ILCA6.
    
    Args:
        df: DataFrame elaborato con vmg_kn, twa_deg, sog_kn
        twd_deg: direzione vento vero [°]
        tws_kn: velocità vento vero [kn]
    
    Returns:
        dict con metriche di efficienza
    """
    if "twa_deg" not in df.columns or "vmg_kn" not in df.columns:
        return {}
    
    tws_scale = tws_kn / 10.0
    avg_twa = float(df["twa_deg"].mean())
    
    # Polare teorica all'angolo medio
    vmg_polar, spd_polar = polar_speed_at_twa(avg_twa, tws_scale)
    
    vmg_col = "vmg_kn"
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn"
    avg_vmg = float(df[vmg_col].mean()) if vmg_col in df.columns else 0
    avg_sog = float(df[sog_col].mean()) if sog_col in df.columns else 0
    
    vmg_efficiency = abs(avg_vmg / vmg_polar) if vmg_polar != 0 else 0
    sog_efficiency = abs(avg_sog / spd_polar) if spd_polar != 0 else 0
    
    return {
        "avg_twa_deg": round(avg_twa, 1),
        "avg_vmg_kn": round(avg_vmg, 3),
        "avg_sog_kn": round(avg_sog, 3),
        "polar_vmg_kn": round(vmg_polar, 3),
        "polar_sog_kn": round(spd_polar, 3),
        "vmg_efficiency_pct": round(vmg_efficiency * 100, 1),
        "sog_efficiency_pct": round(sog_efficiency * 100, 1),
        "tws_kn": tws_kn,
        "twd_deg": twd_deg,
    }

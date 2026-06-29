"""
models.py — Modelli ML per TacticSail AI STEM
==============================================
Modello LSTM per il "Virtual Ghost" dell'atleta di riferimento.
Exportabile in formato ONNX per integrazione con il simulatore JS.

Architettura:
- Input: sequenza di [sog_kn, cog, vmg_kn, twa_deg, x_prime_m, y_prime_m] @ 1Hz
- LSTM: 2 layer, hidden_size=64
- Output: [vmg_delta_kn, x_prime_delta_m, heel_deg] nel passo successivo

Uso tipico:
1. Allena su tracce MetaSail storiche dell'atleta di riferimento
2. Esporta in ONNX
3. Usa il ghost per confronto offline (compute_ghost_delta)

Dipendenze: torch (opzionale), onnxruntime, numpy
"""

from __future__ import annotations
import json
import math
from pathlib import Path
from typing import Optional, Union
import numpy as np
import pandas as pd

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False


# ---------------------------------------------------------------------------
# Sequenza di input LSTM
# ---------------------------------------------------------------------------
GHOST_INPUT_FEATURES = [
    "sog_kn",         # Velocità [kn]
    "vmg_kn",         # VMG reale [kn]
    "twa_deg",        # True Wind Angle [°]
    "x_prime_m",      # Posizione trasversale (asse vento) [m]
    "y_prime_m",      # Posizione longitudinale [m]
    "a_tangential_ms2",  # Accelerazione tangenziale
    "turn_rate_deg_s",   # Rate of turn [°/s]
]

GHOST_OUTPUT_FEATURES = [
    "vmg_delta_kn",      # Delta VMG rispetto al ghost
    "x_prime_delta_m",   # Delta posizione trasversale
]


class GhostLSTM(nn.Module if TORCH_AVAILABLE else object):
    """
    LSTM per il Virtual Ghost ILCA6.
    Impara il pattern temporale di un atleta di riferimento e predice
    le sue posizioni future date le condizioni attuali.
    """
    def __init__(
        self,
        input_size: int = len(GHOST_INPUT_FEATURES),
        hidden_size: int = 64,
        num_layers: int = 2,
        output_size: int = len(GHOST_OUTPUT_FEATURES),
        dropout: float = 0.15,
    ) -> None:
        if not TORCH_AVAILABLE:
            raise ImportError("PyTorch richiesto per GhostLSTM. Installare con: pip install torch")
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, output_size),
        )
        self._init_weights()

    def _init_weights(self) -> None:
        for name, param in self.named_parameters():
            if "weight_ih" in name:
                nn.init.xavier_uniform_(param)
            elif "weight_hh" in name:
                nn.init.orthogonal_(param)
            elif "bias" in name:
                nn.init.zeros_(param)

    def forward(self, x):
        """
        Args:
            x: tensor (batch, seq_len, input_size)
        Returns:
            output: tensor (batch, output_size) — predizione del passo successivo
        """
        lstm_out, _ = self.lstm(x)
        last_out = lstm_out[:, -1, :]  # usa solo l'ultimo timestep
        return self.fc(last_out)


def load_ghost_model(path: Union[str, Path]) -> Optional[object]:
    """
    Carica un modello Ghost da file ONNX.
    
    Args:
        path: percorso al file .onnx
    
    Returns:
        InferenceSession ONNX o None se non disponibile
    """
    if not ONNX_AVAILABLE:
        print("[AVVISO] onnxruntime non installato. Installare con: pip install onnxruntime")
        return None
    path = Path(path)
    if not path.exists():
        print(f"[AVVISO] Modello Ghost non trovato: {path}")
        return None
    session = ort.InferenceSession(str(path))
    print(f"[Ghost] Modello ONNX caricato: {path.name}")
    return session


def export_ghost_to_onnx(model, output_path: Union[str, Path], seq_len: int = 60) -> None:
    """
    Esporta il GhostLSTM in formato ONNX.
    
    Args:
        model: GhostLSTM istanza addestrata
        output_path: percorso di output (.onnx)
        seq_len: lunghezza sequenza di input
    """
    if not TORCH_AVAILABLE:
        raise ImportError("PyTorch richiesto per l'export ONNX")
    import torch
    model.eval()
    dummy_input = torch.randn(1, seq_len, model.input_size)
    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        input_names=["sequence"],
        output_names=["prediction"],
        dynamic_axes={"sequence": {0: "batch_size", 1: "seq_len"}},
        opset_version=17,
    )
    print(f"[Ghost] Modello ONNX esportato: {output_path}")


def prepare_sequences(
    df: pd.DataFrame,
    seq_len: int = 60,
    features: list[str] = GHOST_INPUT_FEATURES,
) -> np.ndarray:
    """
    Prepara sequenze temporali per il training/inferenza LSTM.
    
    Args:
        df: DataFrame elaborato da kinematics.preprocess_track()
        seq_len: lunghezza della sequenza di input [campioni]
        features: lista di colonne da usare come input
    
    Returns:
        np.ndarray di shape (n_sequences, seq_len, n_features)
    """
    # Usa solo le feature disponibili
    available = [f for f in features if f in df.columns]
    if not available:
        raise ValueError(f"Nessuna feature disponibile. Richieste: {features}, Trovate: {list(df.columns)}")
    
    data = df[available].fillna(0).values.astype(np.float32)
    
    # Normalizzazione min-max per feature
    data_min = data.min(axis=0, keepdims=True)
    data_max = data.max(axis=0, keepdims=True)
    data_range = np.where(data_max - data_min > 0, data_max - data_min, 1)
    data_norm = (data - data_min) / data_range
    
    # Genera sequenze scorrevoli
    sequences = []
    for i in range(len(data_norm) - seq_len):
        sequences.append(data_norm[i:i + seq_len])
    
    return np.stack(sequences, axis=0) if sequences else np.empty((0, seq_len, len(available)), dtype=np.float32)


def run_ghost_inference(
    session,
    df: pd.DataFrame,
    seq_len: int = 60,
    features: list[str] = GHOST_INPUT_FEATURES,
) -> pd.DataFrame:
    """
    Esegue l'inferenza del Ghost su una traccia completa.
    
    Returns:
        DataFrame con colonne aggiuntive: ghost_vmg_delta_kn, ghost_x_prime_delta_m
    """
    sequences = prepare_sequences(df, seq_len, features)
    if len(sequences) == 0:
        df["ghost_vmg_delta_kn"] = np.nan
        df["ghost_x_prime_delta_m"] = np.nan
        return df
    
    input_name = session.get_inputs()[0].name
    predictions = session.run(None, {input_name: sequences})[0]  # (n_seq, output_size)
    
    # Allinea le predizioni (sfasate di seq_len-1 campioni)
    pad = np.full((seq_len, predictions.shape[1]), np.nan)
    predictions_padded = np.vstack([pad, predictions])[:len(df)]
    
    df = df.copy()
    df["ghost_vmg_delta_kn"] = predictions_padded[:, 0] if predictions.shape[1] > 0 else np.nan
    df["ghost_x_prime_delta_m"] = predictions_padded[:, 1] if predictions.shape[1] > 1 else np.nan
    
    return df


# ---------------------------------------------------------------------------
# Confronto Ghost vs Atleta (senza LSTM, da statistiche per gamba)
# ---------------------------------------------------------------------------
def compute_ghost_delta_from_stats(
    athlete_leg_stats: pd.DataFrame,
    ghost_leg_stats: pd.DataFrame,
) -> pd.DataFrame:
    """
    Calcola il delta di performance tra atleta e ghost per gamba.
    
    Input: DataFrame con statistiche per gamba (da parse_leg_stats_from_dict)
    Output: DataFrame con colonne delta (positivo = atleta meglio)
    """
    # Allinea per gamba
    merged = athlete_leg_stats.merge(
        ghost_leg_stats[["leg", "vmg_medio_kn", "velocita_media_kn", "distanza_pct"]],
        on="leg",
        suffixes=("_athlete", "_ghost"),
    )
    merged["delta_vmg_kn"] = merged["vmg_medio_kn_athlete"] - merged["vmg_medio_kn_ghost"]
    merged["delta_speed_kn"] = merged["velocita_media_kn_athlete"] - merged["velocita_media_kn_ghost"]
    merged["delta_dist_pct"] = merged["distanza_pct_athlete"] - merged["distanza_pct_ghost"]
    return merged


def compute_ghost_delta(
    athlete_df: pd.DataFrame,
    ghost_df: pd.DataFrame,
    twd_deg: float,
) -> pd.DataFrame:
    """
    Calcola Δd_wind (distanza trasversale rispetto al ghost) e ΔVMG.
    
    Entrambi i DataFrame devono avere colonne x_prime_m, y_prime_m, vmg_kn.
    I DataFrame vengono sincronizzati per indice.
    
    Returns:
        DataFrame con colonne: delta_vmg_kn, delta_x_prime_m, delta_y_prime_m
    """
    athlete = athlete_df.copy().reset_index(drop=True)
    ghost = ghost_df.copy().reset_index(drop=True)
    
    # Usa il minimo comune numero di righe
    n = min(len(athlete), len(ghost))
    
    result = athlete.head(n).copy()
    result["delta_vmg_kn"] = (
        athlete["vmg_kn"].head(n).values - ghost["vmg_kn"].head(n).values
        if "vmg_kn" in athlete.columns and "vmg_kn" in ghost.columns
        else np.nan
    )
    result["delta_x_prime_m"] = (
        athlete["x_prime_m"].head(n).values - ghost["x_prime_m"].head(n).values
        if "x_prime_m" in athlete.columns and "x_prime_m" in ghost.columns
        else np.nan
    )
    result["delta_y_prime_m"] = (
        athlete["y_prime_m"].head(n).values - ghost["y_prime_m"].head(n).values
        if "y_prime_m" in athlete.columns and "y_prime_m" in ghost.columns
        else np.nan
    )
    
    return result

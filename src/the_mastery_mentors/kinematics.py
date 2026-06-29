"""
kinematics.py — Modulo cinematico STEM per TacticSail AI
=========================================================
Elaborazione offline di tracce GPS MetaSail a bassa frequenza (0.5 - 1 Hz).

Funzionalità:
- Ingestion Layer: parsing di log CSV con colonne Timestamp, Lat, Lon, SOG, COG.
- Filtro di Kalman Discreto 2D per ridurre il jitter spaziale del posizionamento GPS.
- Rotazione assi rispetto alla direzione del vento reale (TWD).
- Calcolo VMG reale vettoriale di risalita al vento.
- Calcolo AWA (Apparent Wind Angle) per stime fisiche.
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Optional
import numpy as np
import pandas as pd

EARTH_RADIUS_M = 6_371_000.0

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distanza di Haversine in metri tra due coordinate geografiche."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))

def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Rilevamento (bearing) in gradi da punto A a punto B."""
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - (
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    )
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def normalize_angle(deg: float) -> float:
    return deg % 360

def shortest_angle_delta(a: float, b: float) -> float:
    return (b - a + 180) % 360 - 180

@dataclass
class KalmanState:
    lat: float = 0.0
    lon: float = 0.0
    vx: float = 0.0  # Velocità Nord [m/s]
    vy: float = 0.0  # Velocità Est [m/s]
    cov: np.ndarray = field(default_factory=lambda: np.eye(4) * 0.5)

class KalmanFilter2D:
    """
    Filtro di Kalman Discreto per lisciare i dati GPS 1Hz di MetaSail.
    Stato: [lat_m, lon_m, v_north, v_east]
    Misura: [lat_m, lon_m]
    """
    def __init__(self, process_noise: float = 1e-4, measurement_noise: float = 2.0):
        self.Q_base = process_noise
        self.R_meas = measurement_noise
        self.state: Optional[KalmanState] = None

    def _lat_m(self, dlat: float) -> float: return dlat * (math.pi / 180) * EARTH_RADIUS_M
    def _lon_m(self, dlon: float, lat: float) -> float: return dlon * (math.pi / 180) * EARTH_RADIUS_M * math.cos(math.radians(lat))
    def _m_to_lat(self, dm: float) -> float: return dm / ((math.pi / 180) * EARTH_RADIUS_M)
    def _m_to_lon(self, dm: float, lat: float) -> float: return dm / ((math.pi / 180) * EARTH_RADIUS_M * math.cos(math.radians(lat)))

    def initialize(self, lat: float, lon: float) -> KalmanState:
        self.state = KalmanState(lat=lat, lon=lon)
        self.state.cov = np.diag([0.01, 0.01, 0.5, 0.5])
        return self.state

    def update(self, lat: float, lon: float, dt: float = 1.0) -> KalmanState:
        if self.state is None:
            return self.initialize(lat, lon)
        
        lat_ref = self.state.lat
        dx_obs = self._lat_m(lat - self.state.lat)
        dy_obs = self._lon_m(lon - self.state.lon, lat_ref)
        
        F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
        q = self.Q_base
        Q = np.array([
            [dt**4/4*q, 0, dt**3/2*q, 0],
            [0, dt**4/4*q, 0, dt**3/2*q],
            [dt**3/2*q, 0, dt**2*q, 0],
            [0, dt**3/2*q, 0, dt**2*q],
        ])
        H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
        R = np.eye(2) * self.R_meas**2
        
        x_prev = np.array([0.0, 0.0, self.state.vx, self.state.vy])
        x_pred = F @ x_prev
        P_pred = F @ self.state.cov @ F.T + Q
        
        z = np.array([dx_obs, dy_obs])
        y_innov = z - H @ x_pred
        S = H @ P_pred @ H.T + R
        K = P_pred @ H.T @ np.linalg.inv(S)
        
        x_upd = x_pred + K @ y_innov
        P_upd = (np.eye(4) - K @ H) @ P_pred
        
        new_lat = self.state.lat + self._m_to_lat(x_upd[0])
        new_lon = self.state.lon + self._m_to_lon(x_upd[1], lat_ref)
        
        self.state = KalmanState(lat=new_lat, lon=new_lon, vx=float(x_upd[2]), vy=float(x_upd[3]), cov=P_upd)
        return self.state

def apply_kalman_filter(df: pd.DataFrame, process_noise: float = 1e-4, measurement_noise: float = 2.0) -> pd.DataFrame:
    df = df.copy().sort_values("timestamp").reset_index(drop=True)
    kf = KalmanFilter2D(process_noise, measurement_noise)
    lat_f, lon_f, vx_l, vy_l = [], [], [], []
    
    # Rileva colonne lat/lon
    lat_col = "gps_lat" if "gps_lat" in df.columns else "lat"
    lon_col = "gps_lon" if "gps_lon" in df.columns else "lon"
    
    for i, row in df.iterrows():
        if i == 0:
            state = kf.initialize(row[lat_col], row[lon_col])
            dt = 1.0
        else:
            dt = max((df.loc[i, "timestamp"] - df.loc[i-1, "timestamp"]).total_seconds(), 0.1)
            state = kf.update(row[lat_col], row[lon_col], dt)
        lat_f.append(state.lat)
        lon_f.append(state.lon)
        vx_l.append(state.vx)
        vy_l.append(state.vy)
        
    df["lat_filt"] = lat_f
    df["lon_filt"] = lon_f
    df["vx_ms"] = vx_l
    df["vy_ms"] = vy_l
    df["sog_kalman_ms"] = np.hypot(df["vx_ms"], df["vy_ms"])
    df["sog_kalman_kn"] = df["sog_kalman_ms"] / 0.514444
    return df

def coordinate_rotation_twd(df: pd.DataFrame, twd_deg: float, lat_ref: float, lon_ref: float) -> pd.DataFrame:
    """
    Esegue la rotazione geometrica istantanea della posizione rispetto
    alla direzione del vento reale (TWD), convertendo le variazioni geografiche 
    in metri relativi proiettati sull'asse del vento (y') e trasversale (x').
    """
    df = df.copy()
    
    # Rileva colonne lat/lon
    lat_col = "gps_lat" if "gps_lat" in df.columns else "lat_filt" if "lat_filt" in df.columns else "lat"
    lon_col = "gps_lon" if "gps_lon" in df.columns else "lon_filt" if "lon_filt" in df.columns else "lon"
    
    lat_to_meters = 111132.0
    lon_to_meters = 111132.0 * np.cos(np.radians(lat_ref))
    
    delta_lat_m = (df[lat_col] - lat_ref) * lat_to_meters
    delta_lon_m = (df[lon_col] - lon_ref) * lon_to_meters
    
    twd_rad = np.radians(twd_deg)
    
    # Matrice di rotazione definita nel documento tecnico:
    # x' =  cos(TWD)*d_lat + sin(TWD)*d_lon
    # y' = -sin(TWD)*d_lat + cos(TWD)*d_lon
    df['x_prime_transverse'] = np.cos(twd_rad) * delta_lat_m + np.sin(twd_rad) * delta_lon_m
    df['y_prime_wind_axis'] = -np.sin(twd_rad) * delta_lat_m + np.cos(twd_rad) * delta_lon_m
    
    return df

def compute_real_vmg(df: pd.DataFrame, twd_deg: float) -> pd.Series:
    """VMG reale = SOG * cos(TWA) in nodi. Positivo = guadagno al vento."""
    upwind_dir = (twd_deg + 180) % 360
    cog = df["cog"].values if "cog" in df.columns else np.zeros(len(df))
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn" if "sog_kalman_kn" in df.columns else "sog"
    sog = df[sog_col].values
    twa_rad = np.radians([shortest_angle_delta(upwind_dir, float(c)) for c in cog])
    return pd.Series(sog * np.cos(twa_rad), index=df.index, name="vmg_kn")

def derive_kinematic_acceleration(df: pd.DataFrame, dt_s: float = 1.0) -> pd.DataFrame:
    df = df.copy()
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn" if "sog_kalman_kn" in df.columns else "sog"
    sog_ms = df[sog_col] * 0.514444
    df["a_tangential_ms2"] = sog_ms.diff().fillna(0) / dt_s
    if "cog" in df.columns:
        dcog = df["cog"].diff().apply(lambda x: shortest_angle_delta(0, x) if pd.notna(x) else 0)
        omega = np.radians(dcog) / dt_s
        df["a_centripetal_ms2"] = sog_ms * omega.abs()
        df["turn_rate_deg_s"] = dcog / dt_s
    else:
        df["a_centripetal_ms2"] = 0.0
        df["turn_rate_deg_s"] = 0.0
    return df

def compute_awa(cog_deg: float, twd_deg: float, sog_kn: float, tws_kn: float) -> tuple[float, float]:
    twd_rad = math.radians(twd_deg)
    tw_x = tws_kn * math.sin(twd_rad + math.pi)
    tw_y = tws_kn * math.cos(twd_rad + math.pi)
    cog_rad = math.radians(cog_deg)
    boat_x = sog_kn * math.sin(cog_rad)
    boat_y = sog_kn * math.cos(cog_rad)
    aw_x = tw_x - boat_x
    aw_y = tw_y - boat_y
    aws = math.hypot(aw_x, aw_y)
    awa = (math.degrees(math.atan2(aw_x, aw_y)) + 360) % 360
    return awa, aws

def compute_awa_series(df: pd.DataFrame, twd_deg: float, tws_kn: float) -> pd.DataFrame:
    df = df.copy()
    sog_col = "sog_kn" if "sog_kn" in df.columns else "sog_kalman_kn" if "sog_kalman_kn" in df.columns else "sog"
    awas, awss, twas = [], [], []
    for _, row in df.iterrows():
        cog = float(row.get("cog", 0))
        sog = float(row.get(sog_col, 0))
        awa, aws = compute_awa(cog, twd_deg, sog, tws_kn)
        twa = abs(shortest_angle_delta((twd_deg + 180) % 360, cog))
        awas.append(awa)
        awss.append(aws)
        twas.append(twa)
    df["awa_deg"] = awas
    df["aws_kn"] = awss
    df["twa_deg"] = twas
    return df

def preprocess_track(
    df: pd.DataFrame, 
    twd_deg: float, 
    tws_kn: float,
    lat_ref: Optional[float] = None, 
    lon_ref: Optional[float] = None
) -> pd.DataFrame:
    """Pipeline offline per il tracciamento GPS 1Hz MetaSail."""
    # Rileva colonne lat/lon
    lat_col = "gps_lat" if "gps_lat" in df.columns else "lat"
    lon_col = "gps_lon" if "gps_lon" in df.columns else "lon"
    
    # 1. Filtro Kalman 2D
    df = apply_kalman_filter(df)
    
    if lat_ref is None:
        lat_ref = float(df[lat_col].iloc[0])
    if lon_ref is None:
        lon_ref = float(df[lon_col].iloc[0])
        
    # 2. Rotazione assi proiettati su asse vento
    df = coordinate_rotation_twd(df, twd_deg, lat_ref, lon_ref)
    
    # 3. VMG reale
    df["vmg_kn"] = compute_real_vmg(df, twd_deg)
    
    # 4. Accelerazioni derivate
    if len(df) > 1:
        dt_s = max(float(df["timestamp"].diff().dt.total_seconds().median()), 0.1)
        df = derive_kinematic_acceleration(df, dt_s)
        
    # 5. AWA/AWS
    df = compute_awa_series(df, twd_deg, tws_kn)
    return df

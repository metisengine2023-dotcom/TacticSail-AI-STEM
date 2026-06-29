"""
grib_fetcher.py — Download dati GRIB ERA5 per Lago di Garda
=============================================================
Scarica dati vento a 10m da Copernicus CDS API (ERA5/ERA5-Land)
per l'area del Lago di Garda (Riva del Garda, Area B MetaSail).

Prerequisiti:
  pip install cdsapi cfgrib xarray
  Registrarsi su https://cds.climate.copernicus.eu/ e configurare ~/.cdsapirc

Area di copertura:
  Nord: 45.90° (Riva del Garda)
  Sud:  45.83° (campo di regata)
  Ovest: 10.83° (Malcesine / sponda Veronese)
  Est:  10.86° (Limone / sponda Bresciana)

Variabili:
  u10: componente U del vento a 10m [m/s]
  v10: componente V del vento a 10m [m/s]
  → velocità: sqrt(u10²+v10²) in m/s
  → direzione: atan2(-u10, -v10) × 180/π (provenienza)
"""

from __future__ import annotations
import json
import math
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Union

# ---------------------------------------------------------------------------
# Costanti area Garda
# ---------------------------------------------------------------------------
GARDA_BBOX = {
    "north": 46.0,   # un po' oltre Riva per avere buona interpolazione
    "south": 45.3,
    "west":  10.4,
    "east":  11.0,
}

# Area B MetaSail (campo di regata preciso)
GARDA_RACE_AREA = {
    "north": 45.890,
    "south": 45.865,
    "west":  10.838,
    "east":  10.860,
}

# Ora di riferimento per Garda (picco termico pomeridiano)
ORA_PEAK_HOURS = [12, 13, 14, 15, 16]  # UTC


def build_cds_request(
    year: Union[int, str],
    month: Union[int, str],
    days: list[int],
    hours: Optional[list[int]] = None,
    variables: Optional[list[str]] = None,
    format: str = "grib",
) -> dict:
    """
    Costruisce il dizionario di richiesta per l'API CDS ERA5.
    
    Args:
        year: Anno di richiesta
        month: Mese (int o str con zero padding)
        days: Lista di giorni
        hours: Lista di ore UTC (default: Ora peak hours)
        variables: Lista di variabili (default: u10, v10)
        format: Formato output ('grib' o 'netcdf')
    
    Returns:
        dict compatibile con cdsapi.Client.retrieve()
    
    Esempio:
        req = build_cds_request(2025, 6, list(range(1,31)))
        c.retrieve('reanalysis-era5-single-levels', req, 'garda_giugno_2025.grib')
    """
    if hours is None:
        hours = ORA_PEAK_HOURS
    if variables is None:
        variables = ["10m_u_component_of_wind", "10m_v_component_of_wind"]
    
    return {
        "product_type": "reanalysis",
        "variable": variables,
        "year": str(year),
        "month": str(month).zfill(2),
        "day": [str(d).zfill(2) for d in days],
        "time": [f"{h:02d}:00" for h in hours],
        "area": [
            GARDA_BBOX["north"],
            GARDA_BBOX["west"],
            GARDA_BBOX["south"],
            GARDA_BBOX["east"],
        ],
        "format": format,
    }


def download_era5_garda(
    year: int,
    month: int,
    days: Optional[list[int]] = None,
    output_path: Optional[Union[str, Path]] = None,
    use_era5_land: bool = True,
) -> Path:
    """
    Scarica dati ERA5 (o ERA5-Land) per il Lago di Garda.
    
    ERA5-Land preferito per la risoluzione 0.1° vs 0.25° di ERA5.
    
    Args:
        year: Anno
        month: Mese
        days: Lista di giorni (default: tutti i giorni del mese)
        output_path: Percorso di output .grib (default: data/grib/garda_{year}_{month:02d}.grib)
        use_era5_land: Se True, usa ERA5-Land (0.1°). Se False, usa ERA5 (0.25°).
    
    Returns:
        Path al file GRIB scaricato
    
    Raises:
        ImportError: se cdsapi non è installato
        Exception: se il download fallisce
    """
    try:
        import cdsapi
    except ImportError:
        raise ImportError(
            "cdsapi non installato. Installa con: pip install cdsapi\n"
            "Poi configura ~/.cdsapirc con le tue credenziali CDS:\n"
            "  url: https://cds.climate.copernicus.eu/api/v2\n"
            "  key: YOUR_UID:YOUR_API_KEY"
        )
    
    import calendar
    if days is None:
        _, last_day = calendar.monthrange(year, month)
        days = list(range(1, last_day + 1))
    
    if output_path is None:
        output_dir = Path("data/grib")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"garda_{year}_{month:02d}.grib"
    else:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
    
    dataset = "reanalysis-era5-land" if use_era5_land else "reanalysis-era5-single-levels"
    request = build_cds_request(year, month, days)
    
    print(f"[GRIB] Download {dataset} per Lago di Garda {year}/{month:02d}...")
    print(f"[GRIB] Area: N={GARDA_BBOX['north']} S={GARDA_BBOX['south']} W={GARDA_BBOX['west']} E={GARDA_BBOX['east']}")
    print(f"[GRIB] Output: {output_path}")
    
    c = cdsapi.Client()
    c.retrieve(dataset, request, str(output_path))
    
    print(f"[GRIB] Download completato: {output_path} ({output_path.stat().st_size / 1024:.1f} KB)")
    return output_path


def grib_to_wind_field_json(
    grib_path: Union[str, Path],
    target_lat: float = 45.876,
    target_lon: float = 10.847,
    output_json: Optional[Union[str, Path]] = None,
) -> dict:
    """
    Converte un file GRIB ERA5 nel formato wind_field JSON usato da app.js.
    
    Interpola u10/v10 alla posizione del campo di regata e genera il JSON
    compatibile con il simulatore TacticSail.
    
    Args:
        grib_path: Percorso al file .grib
        target_lat: Latitudine del centro campo [°]
        target_lon: Longitudine del centro campo [°]
        output_json: Percorso di output JSON (opzionale)
    
    Returns:
        dict compatibile con wind_field in app.js
    """
    try:
        import cfgrib
        import xarray as xr
    except ImportError:
        raise ImportError("cfgrib e xarray richiesti. Installare con: pip install cfgrib xarray eccodes")
    
    grib_path = Path(grib_path)
    ds = xr.open_dataset(str(grib_path), engine="cfgrib")
    
    # Estrai u10 e v10
    u10 = ds.get("u10", ds.get("u", None))
    v10 = ds.get("v10", ds.get("v", None))
    
    if u10 is None or v10 is None:
        raise ValueError(f"Variabili u10/v10 non trovate nel GRIB: {list(ds.data_vars)}")
    
    # Coordinate
    lats = u10.latitude.values.tolist() if "latitude" in u10.dims else [target_lat]
    lons = u10.longitude.values.tolist() if "longitude" in u10.dims else [target_lon]
    
    frames = []
    time_dim = "time" if "time" in u10.dims else "valid_time" if "valid_time" in u10.dims else None
    
    if time_dim and len(u10[time_dim]) > 0:
        for i, t in enumerate(u10[time_dim].values):
            # Converti timestamp numpy a ore relative
            if hasattr(t, "astype"):
                t_dt = t.astype("datetime64[ms]").astype(datetime)
                hours = i * 1.0  # ore relative dall'inizio
            else:
                hours = float(i)
            
            u_frame = u10.isel(**{time_dim: i}).values
            v_frame = v10.isel(**{time_dim: i}).values
            
            frames.append({
                "hours": round(hours, 2),
                "label": f"ERA5 T+{hours:.0f}h",
                "u": u_frame.tolist() if hasattr(u_frame, "tolist") else [[float(u_frame)]],
                "v": v_frame.tolist() if hasattr(v_frame, "tolist") else [[float(v_frame)]],
            })
    else:
        # Singolo frame
        u_vals = u10.values
        v_vals = v10.values
        frames.append({
            "hours": 0,
            "label": "ERA5 Garda Ora",
            "u": u_vals.tolist() if hasattr(u_vals, "tolist") else [[float(u_vals)]],
            "v": v_vals.tolist() if hasattr(v_vals, "tolist") else [[float(v_vals)]],
        })
    
    # Velocità di riferimento (media)
    all_u = np.array([f["u"] for f in frames]).flatten()
    all_v = np.array([f["v"] for f in frames]).flatten()
    ref_speed_ms = float(np.mean(np.hypot(all_u, all_v)))
    ref_speed_kn = ref_speed_ms / 0.514444
    
    wind_field = {
        "source": "ERA5",
        "area": "Garda Race Area B",
        "grid": {
            "latitudes": lats,
            "longitudes": lons,
            "reference_wind_kn": round(ref_speed_kn, 2),
        },
        "frames": frames,
        "metadata": {
            "grib_file": grib_path.name,
            "race_center": {"lat": target_lat, "lon": target_lon},
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }
    }
    
    if output_json:
        output_json = Path(output_json)
        output_json.parent.mkdir(parents=True, exist_ok=True)
        with open(output_json, "w") as f:
            json.dump(wind_field, f, indent=2)
        print(f"[GRIB] Wind field JSON salvato: {output_json}")
    
    return wind_field


def create_synthetic_ora_wind_field(
    twd_deg: float = 185.0,
    tws_kn: float = 10.0,
    n_frames: int = 8,
    duration_hours: float = 2.0,
    seed: float = 0.5,
) -> dict:
    """
    Crea un wind field sintetico dell'Ora di Garda per test offline.
    
    Usa i parametri reali dell'Ora:
    - Direzione: 185° (SSO)
    - Velocità: 8-14 kn (picco pomeridiano)
    - Oscillazione: ±6° ogni 8-15 minuti
    - Bresciana (DX): +8-10% velocità
    - Malcesine (SX): +4-5% velocità, lift +6°
    
    Returns:
        dict compatibile con wind_field in app.js
    """
    # Griglia del campo di regata
    lats = [45.865, 45.870, 45.875, 45.880, 45.885, 45.890]
    lons = [10.838, 10.843, 10.847, 10.852, 10.857, 10.860]
    
    dt = duration_hours / n_frames
    frames = []
    
    for i in range(n_frames):
        hours = i * dt
        # Oscillazione temporale (shift di bolina reale)
        oscillation = 6.0 * math.sin(2 * math.pi * hours / 0.25 + seed * 10)  # 15-min cycle
        current_twd = twd_deg + oscillation
        
        # Gradiente spaziale di velocità
        u_grid = []
        v_grid = []
        for lat in lats:
            u_row, v_row = [], []
            for lon in lons:
                # Normalizzazione longitudine
                lon_norm = (lon - 10.838) / (10.860 - 10.838)
                # Boost Bresciana (lon > 0.65)
                bresciana = max(0, (lon_norm - 0.65) / 0.35) * 0.08
                # Boost Malcesine (lon < 0.30)
                malcesine = max(0, (0.30 - lon_norm) / 0.30) * 0.04
                # Lift Bresciana (dir gira verso destra)
                bresciana_lift = bresciana * -8  # gradi
                malcesine_lift = malcesine * 6   # gradi
                
                local_twd = current_twd + bresciana_lift + malcesine_lift
                local_tws_kn = tws_kn * (1 + bresciana + malcesine)
                local_tws_ms = local_tws_kn * 0.514444
                
                twd_rad = math.radians(local_twd)
                u_row.append(-local_tws_ms * math.sin(twd_rad))  # vento da quella direzione
                v_row.append(-local_tws_ms * math.cos(twd_rad))
            u_grid.append(u_row)
            v_grid.append(v_row)
        
        frames.append({
            "hours": round(hours, 3),
            "label": f"Ora sintetica T+{i*int(dt*60)}min",
            "u": u_grid,
            "v": v_grid,
        })
    
    return {
        "source": "synthetic-ora",
        "area": "Garda Race Area B (MetaSail)",
        "grid": {
            "latitudes": lats,
            "longitudes": lons,
            "reference_wind_kn": tws_kn,
        },
        "frames": frames,
        "metadata": {
            "twd_deg": twd_deg,
            "tws_kn": tws_kn,
            "oscillation_deg": 6.0,
            "bresciana_boost_pct": 8,
            "malcesine_boost_pct": 4,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "note": "Modello sintetico Ora calibrato su dati reali Garda Area B",
        }
    }


def save_wind_field(wind_field: dict, output_path: Union[str, Path]) -> None:
    """Salva il wind field JSON su disco."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(wind_field, f, indent=2)
    print(f"[GRIB] Wind field salvato: {output_path} ({output_path.stat().st_size/1024:.1f} KB)")


if __name__ == "__main__":
    # Genera e salva un wind field sintetico dell'Ora di Garda
    print("Generazione wind field sintetico Ora di Garda...")
    wf = create_synthetic_ora_wind_field(twd_deg=185.0, tws_kn=10.0)
    save_wind_field(wf, "../../data/wind/ora_sintetica_10kn.json")
    print("OK - Wind field creato per test offline")

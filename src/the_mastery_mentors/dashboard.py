"""
dashboard.py — Tool di Visualizzazione Analitico Offline (STEM)
===============================================================
Esegue la pipeline di analisi offline su un log di tracciamento MetaSail:
1. Carica i dati GPS (CSV/JSONL)
2. Applica il Filtro di Kalman 2D per il posizionamento spaziale pulito
3. Ruota le coordinate sull'asse del vento (TWD) per ricavare x' e y'
4. Stima lo sbandamento teorico (Heel) ed il drag del timone (Rudder Drag)
5. Simula il leader (Virtual Ghost) e calcola i delta prestazionali
6. Genera un report HTML interattivo (Chart.js e Leaflet) e lo apre nel browser.
"""

from __future__ import annotations
import json
import os
import sys
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd

# Aggiungi la cartella corrente a sys.path per importare i moduli locali
sys.path.insert(0, str(Path(__file__).parent))

import kinematics
import hydrodynamics
import models

def generate_mock_metasail_log(output_path: Path) -> None:
    """Genera un file CSV fittizio di test nel formato MetaSail standard se non esiste."""
    print(f"[Dashboard] Generazione log di test in corso: {output_path.name}...")
    
    # Campo di regata: Riva del Garda (Bolina da Nord verso Sud)
    lat_start = 45.8840
    lon_start = 10.8450
    twd = 185.0  # vento da Sud (Ora)
    
    timestamps = []
    lats = []
    lons = []
    sogs = []
    cogs = []
    
    now = datetime.now(timezone.utc)
    n_points = 360  # ~6 minuti di bolina a 1Hz
    
    # Simula un percorso a zigzag (tack) verso la boa sopravento
    current_lat = lat_start
    current_lon = lon_start
    mure = 1 # 1 = sinistra (heading ~137°), -1 = dritta (heading ~233°)
    
    for i in range(n_points):
        t = now + pd.Timedelta(seconds=i)
        timestamps.append(t.strftime("%Y-%m-%dT%H:%M:%SZ"))
        
        # Cambia mure ogni 90 secondi
        if i > 0 and i % 90 == 0:
            mure = -mure
            
        # Calcola prua e velocità con del rumore GPS
        heading = 137.0 if mure == 1 else 233.0
        heading += np.random.normal(0, 1.8) # rumore COG
        
        speed = 4.6 + np.random.normal(0, 0.22) # rumore SOG
        speed_mps = speed * 0.514444
        
        # Spostamento geografico
        rad = np.radians(heading)
        dlat = (speed_mps * np.cos(rad) / kinematics.EARTH_RADIUS_M) * (180 / np.pi)
        dlon = (speed_mps * np.sin(rad) / (kinematics.EARTH_RADIUS_M * np.cos(np.radians(current_lat)))) * (180 / np.pi)
        
        # Aggiungi jitter GPS alla posizione registrata
        recorded_lat = current_lat + np.random.normal(0, 0.000015)
        recorded_lon = current_lon + np.random.normal(0, 0.000022)
        
        lats.append(recorded_lat)
        lons.append(recorded_lon)
        sogs.append(round(speed, 2))
        cogs.append(round(heading % 360, 1))
        
        # Avanza posizione reale
        current_lat += dlat
        current_lon += dlon

    df = pd.DataFrame({
        "timestamp": timestamps,
        "gps_lat": lats,
        "gps_lon": lons,
        "sog_kn": sogs,
        "cog": cogs
    })
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"[Dashboard] Log fittizio salvato: {output_path}")

def run_analysis_pipeline(csv_path: Path, twd_deg: float = 185.0, tws_kn: float = 11.0) -> pd.DataFrame:
    """Carica ed elabora la traccia tramite la pipeline cinematica ed idrodinamica offline."""
    df_raw = pd.read_csv(csv_path)
    df_raw["timestamp"] = pd.to_datetime(df_raw["timestamp"])
    
    # 1. Pipeline cinematica (Kalman + Rotazione + VMG + AWA)
    lat_ref = float(df_raw["gps_lat"].iloc[0])
    lon_ref = float(df_raw["gps_lon"].iloc[0])
    
    df_processed = kinematics.preprocess_track(
        df_raw, 
        twd_deg=twd_deg, 
        tws_kn=tws_kn,
        lat_ref=lat_ref,
        lon_ref=lon_ref
    )
    
    # 2. Modello idrodinamico inverso (Sbandamento teorico + Drag Timone)
    df_processed = hydrodynamics.estimate_heel_series(df_processed, tws_kn=tws_kn)
    dt_s = max(float(df_processed["timestamp"].diff().dt.total_seconds().median()), 0.1)
    df_processed["rudder_drag_proxy"] = hydrodynamics.estimate_rudder_drag(df_processed, dt_s)
    
    # 3. Virtual Ghost (leader teorico con VMG polare ottimale)
    polar_opts = hydrodynamics.optimal_vmg_angle(tws_kn)
    ghost_vmg = polar_opts["upwind_vmg_kn"]
    
    # Il ghost parte dallo stesso punto e accumula VMG costante
    ghost_y_prime = []
    current_y = 0.0
    for i in range(len(df_processed)):
        current_y -= (ghost_vmg * 0.514444 * dt_s)  # y' diminuisce andando sopravento (Sud)
        ghost_y_prime.append(current_y)
        
    df_processed["ghost_y_prime"] = ghost_y_prime
    df_processed["delta_d_wind_m"] = df_processed["y_prime_wind_axis"] - df_processed["ghost_y_prime"]
    df_processed["delta_vmg_kn"] = df_processed["vmg_kn"] - ghost_vmg
    
    return df_processed

def build_html_report(df: pd.DataFrame, output_path: Path, twd: float, tws: float) -> None:
    """Genera una pagina dashboard HTML interattiva usando Chart.js e Leaflet."""
    # Converti i dati in liste JSON
    timestamps = [t.strftime("%H:%M:%S") for t in df["timestamp"]]
    gps_coords = df[["lat_filt", "lon_filt"]].values.tolist()
    
    x_prime = df["x_prime_transverse"].tolist()
    y_prime = df["y_prime_wind_axis"].tolist()
    ghost_y = df["ghost_y_prime"].tolist()
    
    sog = df["sog_kalman_kn"].tolist()
    vmg = df["vmg_kn"].tolist()
    heel = df["heel_deg_est"].tolist()
    drag = df["rudder_drag_proxy"].tolist()
    delta_d = df["delta_d_wind_m"].tolist()
    
    html_template = """<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>TacticSail AI STEM — Report Offline</title>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        :root {
            --bg: #09131f;
            --card: #122236;
            --text: #f3f4f6;
            --accent: #ffb84d;
            --stroke: rgba(255,255,255,0.08);
        }
        body {
            margin: 0;
            font-family: 'Manrope', sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 24px;
        }
        h1, h2 {
            font-family: 'Space Grotesk', sans-serif;
            margin: 0 0 10px 0;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--stroke);
            padding-bottom: 18px;
            margin-bottom: 24px;
        }
        .badge {
            background: var(--accent);
            color: #000;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.85em;
            font-weight: 800;
        }
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        .card {
            background: var(--card);
            border: 1px solid var(--stroke);
            border-radius: 12px;
            padding: 20px;
            box-sizing: border-box;
        }
        #map {
            height: 380px;
            border-radius: 8px;
        }
        .stats-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 15px;
        }
        .stat-box {
            background: rgba(255,255,255,0.03);
            border: 1px solid var(--stroke);
            border-radius: 8px;
            padding: 12px;
            text-align: center;
        }
        .stat-value {
            font-size: 1.6em;
            font-weight: 700;
            color: var(--accent);
        }
        .stat-label {
            font-size: 0.8em;
            color: #9ca3af;
        }
        canvas {
            max-height: 240px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>TacticSail AI STEM</h1>
            <div style="color: #9ca3af;">Analisi Post-Regata Offline · Lago di Garda Area B</div>
        </div>
        <div>
            <span class="badge">STEM Offline Engine</span>
        </div>
    </div>
    
    <div class="grid">
        <!-- Pannello Mappa GPS -->
        <div class="card" style="grid-column: 1 / 3;">
            <h2>Mappa Tracciamento GPS (Kalman Filtrato)</h2>
            <div class="stats-row">
                <div class="stat-box">
                    <div class="stat-value">__TWD__°</div>
                    <div class="stat-label">Direzione Vento (TWD)</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">__TWS__ kn</div>
                    <div class="stat-label">Velocità Vento (TWS)</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">__AVG_VMG__ kn</div>
                    <div class="stat-label">VMG Medio Risalita</div>
                </div>
            </div>
            <div id="map"></div>
        </div>
        
        <!-- Grafici Proiettati e STEM -->
        <div class="card">
            <h2>Asse del Vento (Proiezione y' vs x')</h2>
            <canvas id="axisChart"></canvas>
            <p style="font-size:0.8em; color:#9ca3af; margin-top:10px;">
                Asse y' allineato alla direzione del vento (sopravento). Asse x' trasversale.
            </p>
        </div>
        
        <div class="card">
            <h2>Performance VMG & SOG</h2>
            <canvas id="performanceChart"></canvas>
        </div>
        
        <div class="card">
            <h2>Sensori Virtuali (Sbandamento & Drag Timone)</h2>
            <canvas id="virtualSensorsChart"></canvas>
        </div>
        
        <div class="card">
            <h2>Delta Leader (Virtual Ghost)</h2>
            <canvas id="ghostChart"></canvas>
        </div>
    </div>

    <script>
        // Mappa Leaflet
        const coords = __COORDS__;
        const map = L.map('map').setView(coords[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'OpenStreetMap'
        }).addTo(map);
        
        L.polyline(coords, {color: '#ffb84d', weight: 4}).addTo(map);
        
        // Segna partenze e boa
        L.marker(coords[0]).addTo(map).bindPopup('Partenza');
        L.marker(coords[coords.length - 1]).addTo(map).bindPopup('Fine Traccia');
        map.fitBounds(L.polyline(coords).getBounds().pad(0.1));

        // Grafici Chart.js
        const timestamps = __TIMESTAMPS__;

        // 1. Asse Vento
        new Chart(document.getElementById('axisChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Atleta (Proiezione)',
                    data: __AXIS_DATA__,
                    borderColor: '#ffb84d',
                    backgroundColor: '#ffb84d',
                    showLine: true
                }, {
                    label: 'Virtual Ghost (Target VMG)',
                    data: __GHOST_AXIS_DATA__,
                    borderColor: '#a3e635',
                    borderDash: [5, 5],
                    showLine: true
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { title: { display: true, text: 'Distanza Trasversale x\' [m]' }, grid: { color: '#2d3748' } },
                    y: { title: { display: true, text: 'Avanzamento al vento y\' [m]' }, grid: { color: '#2d3748' } }
                }
            }
        });

        // 2. VMG & SOG
        new Chart(document.getElementById('performanceChart'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'SOG (Kn)', data: __SOG_DATA__, borderColor: '#60a5fa', fill: false },
                    { label: 'VMG (Kn)', data: __VMG_DATA__, borderColor: '#34d399', fill: false }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { grid: { color: '#2d3748' } } }
            }
        });

        // 3. Sensori Virtuali
        new Chart(document.getElementById('virtualSensorsChart'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'Heel (Sbandamento ° est.)', data: __HEEL_DATA__, borderColor: '#f87171', fill: false },
                    { label: 'Rudder Drag (est.)', data: __DRAG_DATA__, borderColor: '#fb7185', borderDash: [2, 2], fill: false, yAxisID: 'y1' }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { grid: { color: '#2d3748' } },
                    y1: { position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });

        // 4. Ghost Delta
        new Chart(document.getElementById('ghostChart'), {
            type: 'line',
            data: {
                labels: timestamps,
                datasets: [
                    { label: 'Delta Distanza Assiale (m)', data: __DELTA_D_DATA__, borderColor: '#c084fc', fill: false }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { grid: { color: '#2d3748' } } }
            }
        });
    </script>
</body>
</html>
"""
    
    # Formatta le sostituzioni in modo sicuro ed esplicito
    html = html_template
    html = html.replace("__TWD__", str(twd))
    html = html.replace("__TWS__", str(tws))
    html = html.replace("__AVG_VMG__", str(round(float(df["vmg_kn"].mean()), 2)))
    html = html.replace("__COORDS__", json.dumps(gps_coords))
    html = html.replace("__TIMESTAMPS__", json.dumps(timestamps))
    
    axis_data = [{"x": round(x, 1), "y": round(y, 1)} for x, y in zip(x_prime, y_prime)]
    ghost_axis_data = [{"x": 0, "y": round(y, 1)} for y in ghost_y]
    
    html = html.replace("__AXIS_DATA__", json.dumps(axis_data))
    html = html.replace("__GHOST_AXIS_DATA__", json.dumps(ghost_axis_data))
    html = html.replace("__SOG_DATA__", json.dumps([round(v, 2) for v in sog]))
    html = html.replace("__VMG_DATA__", json.dumps([round(v, 2) for v in vmg]))
    html = html.replace("__HEEL_DATA__", json.dumps([round(v, 1) for v in heel]))
    html = html.replace("__DRAG_DATA__", json.dumps([round(v, 4) for v in drag]))
    html = html.replace("__DELTA_D_DATA__", json.dumps([round(v, 1) for v in delta_d]))
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[Dashboard] Report HTML generato con successo: {output_path}")

def main() -> None:
    csv_path = Path("data/raw/metasail_log.csv")
    if not csv_path.exists():
        generate_mock_metasail_log(csv_path)
        
    twd = 185.0
    tws = 11.0
    
    print("[Dashboard] Avvio elaborazione offline...")
    df_analysed = run_analysis_pipeline(csv_path, twd_deg=twd, tws_kn=tws)
    
    report_path = Path("data/generated/dashboard_report.html")
    build_html_report(df_analysed, report_path, twd, tws)
    
    url = f"file://{report_path.resolve()}"
    print(f"[Dashboard] Apertura del report in corso nel browser: {url}")
    webbrowser.open(url)

if __name__ == "__main__":
    main()

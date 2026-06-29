/**
 * topo_wind.js — Modello Vento Topografico 2D per Lago di Garda (Regata Area B)
 * ================================================================================
 * Campo vettoriale 2D calibrato sulla morfologia reale del lago:
 *   - Parete Monte Baldo / Bresciana (est): canalizzazione ORA, pressione +8-14%
 *   - Cono d'ombra Limone (nord-est): zona morta -12-18%, alta turbolenza
 *   - Canale ORA centrale: termica stabile +2-5%, direzione allineata 185°
 *   - Versante Malcesine (ovest): lift anti-orario +3-5%
 *   - Ombra Penisola Campione (sud-ovest): scarso -5-8%
 *   - Gradiente latitudinale: ORA si rinforza procedendo verso nord (+1.5%/100m)
 *   - Heatmap vento in tempo reale su mappa Leaflet (frecce + colore pressione)
 *
 * Coordinate di riferimento (Area B, Campione del Garda / Limone):
 *   Lat: [45.842, 45.880]  →  lat_norm [0=sud, 1=nord]
 *   Lon: [10.836, 10.864]  →  lon_norm [0=Malcesine/Veronese, 1=Bresciana/Limone]
 */

// ── Bbox del campo di regata ────────────────────────────────────────────────
const TOPO_LAT_MIN = 45.842;
const TOPO_LAT_MAX = 45.880;
const TOPO_LON_MIN = 10.836;
const TOPO_LON_MAX = 10.864;

// Punti di ancoraggio geografici dei fenomeni
const TOPO_FEATURES = {
  // Parete Bresciana / Monte Baldo
  BRESCIANA_LON:       10.856,   // longitudine inizio zona pressione Bresciana
  BRESCIANA_EDGE_LON:  10.860,   // bordo roccia (zona d'ombra immediata)
  BRESCIANA_SHADOW_LON:10.862,   // ombra completa < 50m dalla roccia

  // Cono d'ombra Limone (angolo NE del campo)
  LIMONE_LAT:          45.870,   // latitudine inizio cono d'ombra
  LIMONE_LON:          10.857,   // longitudine inizio cono d'ombra

  // Canale ORA centrale (asse principale della termica)
  ORA_CHANNEL_LON:     10.850,   // centro canale termico
  ORA_CHANNEL_WIDTH:   0.005,    // semi-larghezza canale (gradi lon)

  // Versante Malcesine
  MALCESINE_LON:       10.840,   // longitudine confine zona Malcesine
  MALCESINE_EDGE_LON:  10.836,   // bordo ovest campo

  // Penisola Campione (ombra sud-ovest)
  CAMPIONE_LAT:        45.848,   // latitudine penisola Campione
  CAMPIONE_LON:        10.841,   // longitudine centro penisola
  CAMPIONE_RADIUS:     0.003,    // raggio ombra (gradi lat≈lon)
};

// ── Normalizzazione coordinate ───────────────────────────────────────────────
function latNorm(lat) {
  return Math.max(0, Math.min(1, (lat - TOPO_LAT_MIN) / (TOPO_LAT_MAX - TOPO_LAT_MIN)));
}
function lonNorm(lon) {
  return Math.max(0, Math.min(1, (lon - TOPO_LON_MIN) / (TOPO_LON_MAX - TOPO_LON_MIN)));
}

// ── Funzione smooth clamp (S-curve) ─────────────────────────────────────────
function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
function clampLinear(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * topoWindField2D — Nucleo del modello topografico 2D
 * =====================================================
 * Calcola l'effetto del terreno sul vento per un dato punto (lat, lon).
 *
 * @param {number} lat       - Latitudine WGS84
 * @param {number} lon       - Longitudine WGS84
 * @param {number} elapsedMs - Millisecondi dall'inizio della simulazione
 * @returns {{
 *   multiplierDelta: number,   // ±[0.18]: pressione topografica (0=neutro)
 *   directionDelta:  number,   // ±[10°]:  deviazione direzionale
 *   turbulence:      number,   // [0,1]:   turbolenza locale
 *   zone:            string,   // nome zona dominante
 *   gradientVector:  {u:number, v:number},  // componenti vento normalizzate
 *   debugFactors:    object,   // dettaglio contributi per debug/UI
 * }}
 */
export function topoWindField2D(lat, lon, elapsedMs = 0) {
  const lnorm = lonNorm(lon);
  const lanorm = latNorm(lat);
  const tMs = elapsedMs / 1000; // secondi

  // ────────────────────────────────────────────────────────────────────────
  // 1. PARETE BRESCIANA / MONTE BALDO (sponda est)
  //    La scogliera canalizza l'ORA accelerandola.
  //    Zona pressione:  lon [10.856, 10.860]  → +8-14%
  //    Zona d'ombra:    lon [10.860, 10.864]  → -10-15%
  // ────────────────────────────────────────────────────────────────────────
  let brescianaSpeedDelta = 0;
  let brescianaDirectionDelta = 0;
  let brescianaTurbulence = 0;

  const brescianaDist = lon - TOPO_FEATURES.BRESCIANA_LON;
  if (brescianaDist > 0) {
    const shadowStart = TOPO_FEATURES.BRESCIANA_EDGE_LON - TOPO_FEATURES.BRESCIANA_LON;
    const shadowEnd   = TOPO_FEATURES.BRESCIANA_SHADOW_LON - TOPO_FEATURES.BRESCIANA_LON;

    if (brescianaDist <= shadowStart) {
      // Zona di pressione: accelerazione per canalizzazione
      const intensity = smoothstep(brescianaDist / shadowStart);
      brescianaSpeedDelta = +0.11 * intensity;
      // Lift orario: il vento girato dalla parete ruota in senso orario ~5-8°
      brescianaDirectionDelta = -6.5 * intensity; // negativo = orario (verso destra)
      brescianaTurbulence = 0.10 * intensity;
    } else if (brescianaDist <= shadowEnd) {
      // Zona d'ombra diretta: caduta brusca della pressione
      const shadowRatio = (brescianaDist - shadowStart) / (shadowEnd - shadowStart);
      brescianaSpeedDelta = +0.11 * (1 - shadowRatio) - 0.16 * shadowRatio;
      brescianaDirectionDelta = -6.5 + (shadowRatio * 14); // caos direzionale
      brescianaTurbulence = 0.15 + shadowRatio * 0.55; // alta turbolenza
    } else {
      // Oltre il bordo roccia — ombra totale
      brescianaSpeedDelta = -0.18;
      brescianaDirectionDelta = 8; // rimbalzo anti-orario da muro
      brescianaTurbulence = 0.85;
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. CONO D'OMBRA LIMONE (angolo nord-est)
  //    Zona morta di vento per ombra della parete Limone superiore.
  //    Si manifesta per lat > 45.870 E lon > 10.857
  // ────────────────────────────────────────────────────────────────────────
  let limoneSpeedDelta = 0;
  let limoneDirectionDelta = 0;
  let limoneTurbulence = 0;

  const limoneLat = lat - TOPO_FEATURES.LIMONE_LAT;
  const limoneLon = lon - TOPO_FEATURES.LIMONE_LON;
  if (limoneLat > 0 && limoneLon > 0) {
    // Cono: intensità proporzionale al prodotto delle distanze
    const coneIntensity = smoothstep(limoneLat / 0.010) * smoothstep(limoneLon / 0.007);
    limoneSpeedDelta   = -0.16 * coneIntensity;
    // Oscillazioni caotiche da rimescolamento
    const chaosPhase   = Math.sin(tMs * 0.13 + lat * 320 + lon * 410);
    limoneDirectionDelta = chaosPhase * 9 * coneIntensity;
    limoneTurbulence   = 0.60 * coneIntensity;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 3. CANALE TERMICO ORA CENTRALE
  //    La termica principale sale dal centro del lago verso nord.
  //    Più forte al centro, si attenua verso le sponde.
  // ────────────────────────────────────────────────────────────────────────
  const oraDistFromCenter = Math.abs(lon - TOPO_FEATURES.ORA_CHANNEL_LON);
  const oraProfile = Math.max(0, 1 - oraDistFromCenter / TOPO_FEATURES.ORA_CHANNEL_WIDTH);
  const oraPulse = 0.5 + 0.5 * Math.sin(tMs * 0.011 + lanorm * 2.8); // pulsazione termica ~8min
  const oraSpeedDelta = oraProfile * oraProfile * 0.048 * oraPulse;
  // Il canale mantiene la direzione allineata al lago (minima deviazione)
  const oraDirectionDelta = oraProfile * -1.2 * oraPulse; // leggero lift orario sul centro
  const oraTurbulence = oraProfile * 0.06;

  // ────────────────────────────────────────────────────────────────────────
  // 4. VERSANTE MALCESINE (sponda ovest)
  //    Discesa termale valliva dal Monte Baldo est (versante Veronese).
  //    Lift anti-orario moderato, pressione moderata.
  // ────────────────────────────────────────────────────────────────────────
  let malcesineSpeedDelta = 0;
  let malcesineDirectionDelta = 0;
  let malcesineTurbulence = 0;

  const malcesineDist = TOPO_FEATURES.MALCESINE_LON - lon;
  if (malcesineDist > 0) {
    const malcIntensity = smoothstep(malcesineDist / (TOPO_FEATURES.MALCESINE_LON - TOPO_FEATURES.MALCESINE_EDGE_LON));
    malcesineSpeedDelta = +0.04 * malcIntensity;
    malcesineDirectionDelta = +5.2 * malcIntensity; // positivo = anti-orario (verso sinistra)
    malcesineTurbulence = 0.08 * malcIntensity;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 5. OMBRA PENISOLA CAMPIONE (sud-ovest)
  //    La penisola di Campione del Garda interrompe il flusso termico
  //    per le barche che iniziano la bolina nella zona sottovento.
  // ────────────────────────────────────────────────────────────────────────
  let campionaSpeedDelta = 0;
  let campioneTurbulence = 0;

  const dLatCampione = lat - TOPO_FEATURES.CAMPIONE_LAT;
  const dLonCampione = lon - TOPO_FEATURES.CAMPIONE_LON;
  // Ombra si estende verso nord dalla penisola
  if (dLatCampione > 0 && dLatCampione < TOPO_FEATURES.CAMPIONE_RADIUS * 2.5) {
    const distCampione = Math.sqrt(dLonCampione * dLonCampione + dLatCampione * dLatCampione);
    const shadowStrength = Math.max(0, 1 - distCampione / TOPO_FEATURES.CAMPIONE_RADIUS);
    campionaSpeedDelta = -0.07 * shadowStrength * smoothstep(1 - dLatCampione / (TOPO_FEATURES.CAMPIONE_RADIUS * 2.5));
    campioneTurbulence = 0.15 * shadowStrength;
  }

  // ────────────────────────────────────────────────────────────────────────
  // 6. GRADIENTE LATITUDINALE ORA
  //    L'ORA è una brezza di lago che si rinforza procedendo verso nord
  //    (verso la testata del lago, dove il gradiente termico è maggiore).
  //    +1.5% ogni 100m di latitudine → +6% totale tra sud e nord del campo.
  // ────────────────────────────────────────────────────────────────────────
  const latGradient = lanorm * 0.060; // +0% al sud, +6% al nord

  // ────────────────────────────────────────────────────────────────────────
  // 7. MICRO-OSCILLAZIONE TRASVERSALE (onde termiche traverse al lago)
  //    Oscillazione sinusoidale che simula i "libeccio stripes" trasversali
  //    visibili sulle foto aeree del lago in condizioni di ORA.
  // ────────────────────────────────────────────────────────────────────────
  const transverseWave = 0.012 * Math.sin(lat * 920 + lon * 530 + tMs * 0.072);
  const transverseDir  = 1.8  * Math.sin(lat * 680 - lon * 440 + tMs * 0.058);

  // ────────────────────────────────────────────────────────────────────────
  // COMPOSIZIONE FINALE
  // ────────────────────────────────────────────────────────────────────────
  // Priorità: Limone shadow > Bresciana edge > ORA channel > gradiente
  // Le zone si sommano ma i contributi estremi si saturano
  const rawSpeedDelta =
    brescianaSpeedDelta +
    limoneSpeedDelta +
    oraSpeedDelta +
    malcesineSpeedDelta +
    campionaSpeedDelta +
    latGradient +
    transverseWave;

  const rawDirDelta =
    brescianaDirectionDelta +
    limoneDirectionDelta +
    oraDirectionDelta +
    malcesineDirectionDelta +
    transverseDir;

  const rawTurbulence =
    brescianaTurbulence +
    limoneTurbulence +
    oraTurbulence +
    malcesineTurbulence +
    campioneTurbulence;

  const multiplierDelta = clampLinear(rawSpeedDelta, -0.20, 0.18);
  const directionDelta  = clampLinear(rawDirDelta,   -11,   11);
  const turbulence      = clampLinear(rawTurbulence,  0,     1);

  // ── Zona dominante (per UI e debug) ─────────────────────────────────────
  let zone = "ORA-Centrale";
  const absSpeedDeltaThreshold = 0.04;
  if (Math.abs(limoneSpeedDelta) > absSpeedDeltaThreshold)   zone = "Ombra-Limone";
  else if (Math.abs(brescianaSpeedDelta) > absSpeedDeltaThreshold) zone = "Bresciana";
  else if (Math.abs(campionaSpeedDelta) > absSpeedDeltaThreshold) zone = "Ombra-Campione";
  else if (oraSpeedDelta > 0.020 && oraProfile > 0.5)        zone = "Canale-ORA";
  else if (malcesineSpeedDelta > 0.015)                       zone = "Malcesine";
  else if (latGradient > 0.04)                                zone = "Gradiente-Nord";

  // ── Vettore gradiente (u componente E-W, v componente N-S) ──────────────
  // Normalizzato come contributo vettoriale al vento principale
  const totalIntensity = Math.abs(multiplierDelta);
  const realAngleRad = ((185 + directionDelta) * Math.PI) / 180;
  const gradientVector = {
    u: totalIntensity * Math.sin(realAngleRad),   // componente ovest-est
    v: totalIntensity * Math.cos(realAngleRad),   // componente sud-nord
  };

  return {
    multiplierDelta,
    directionDelta,
    turbulence,
    zone,
    gradientVector,
    debugFactors: {
      bresciana:  { speed: +brescianaSpeedDelta.toFixed(4), dir: +brescianaDirectionDelta.toFixed(2), turb: +brescianaTurbulence.toFixed(3) },
      limone:     { speed: +limoneSpeedDelta.toFixed(4),    dir: +limoneDirectionDelta.toFixed(2),    turb: +limoneTurbulence.toFixed(3) },
      ora:        { speed: +oraSpeedDelta.toFixed(4),        dir: +oraDirectionDelta.toFixed(2),       turb: +oraTurbulence.toFixed(3) },
      malcesine:  { speed: +malcesineSpeedDelta.toFixed(4), dir: +malcesineDirectionDelta.toFixed(2),turb: +malcesineTurbulence.toFixed(3) },
      campione:   { speed: +campionaSpeedDelta.toFixed(4),  turb: +campioneTurbulence.toFixed(3) },
      gradient:   { speed: +latGradient.toFixed(4) },
      transverse: { speed: +transverseWave.toFixed(4), dir: +transverseDir.toFixed(2) },
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// WIND HEATMAP LAYER (Leaflet)
// Visualizza il campo vento topografico come overlay sulla mappa
// ════════════════════════════════════════════════════════════════════════════

/**
 * WindHeatmapLayer — Layer Leaflet per visualizzazione campo vento 2D
 *
 * Disegna:
 *  - Gradiente colore di pressione (blu→verde→giallo→rosso)
 *  - Frecce vettoriali di direzione (una ogni ~200m)
 *  - Label della zona dominante
 *
 * Uso:
 *   const layer = new WindHeatmapLayer(map, { gridStep: 0.002 });
 *   layer.update(elapsedMs);
 *   layer.toggle();
 */
export class WindHeatmapLayer {
  constructor(leafletMap, opts = {}) {
    this._map     = leafletMap;
    this._visible = false;
    this._layer   = null;
    this._arrows  = [];
    this._svg     = null;
    this._gridStep = opts.gridStep ?? 0.0022; // ~200m
    this._opacity  = opts.opacity  ?? 0.72;
    this._currentElapsedMs = 0;

    // Canvas per il gradiente colore (heatmap pressione)
    this._canvas = document.createElement("canvas");
    this._canvas.style.pointerEvents = "none";

    this._initLayer();
  }

  _initLayer() {
    // Leaflet custom overlay (canvas)
    const self = this;
    const CanvasOverlay = L.Layer.extend({
      onAdd(map) {
        const pane = map.getPane("overlayPane");
        pane.appendChild(self._canvas);
        map.on("move zoom viewreset", self._redraw, self);
        self._redraw();
      },
      onRemove(map) {
        self._canvas.remove();
        map.off("move zoom viewreset", self._redraw, self);
      },
    });
    this._canvasOverlay = new CanvasOverlay();
  }

  _redraw() {
    if (!this._visible) return;
    this._drawCanvas();
    this._drawArrows();
  }

  /** Disegna il gradiente colore pressione sul canvas */
  _drawCanvas() {
    const map    = this._map;
    const bounds = map.getBounds();
    const size   = map.getSize();
    const canvas = this._canvas;
    canvas.width  = size.x;
    canvas.height = size.y;
    canvas.style.position = "absolute";
    canvas.style.left     = "0";
    canvas.style.top      = "0";
    canvas.style.width    = size.x + "px";
    canvas.style.height   = size.y + "px";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size.x, size.y);

    const stepPx = Math.max(6, Math.floor(size.x / 80));
    const t = this._currentElapsedMs;

    for (let py = 0; py < size.y; py += stepPx) {
      for (let px = 0; px < size.x; px += stepPx) {
        const latLon = map.containerPointToLatLng([px + stepPx / 2, py + stepPx / 2]);
        const lat = latLon.lat;
        const lon = latLon.lng;
        if (lat < TOPO_LAT_MIN || lat > TOPO_LAT_MAX || lon < TOPO_LON_MIN || lon > TOPO_LON_MAX) continue;

        const field = topoWindField2D(lat, lon, t);
        const delta = field.multiplierDelta; // range roughly [-0.20, +0.18]

        // Mappa delta → colore
        // delta < -0.10 → blu intenso (scarso)
        // delta ≈ 0    → verde acqua (neutro)
        // delta > +0.10 → rosso/arancio (forte Bresciana)
        const normalized = clampLinear((delta + 0.20) / 0.38, 0, 1);
        const color = this._pressureColor(normalized, this._opacity * 0.65);
        ctx.fillStyle = color;
        ctx.fillRect(px, py, stepPx, stepPx);
      }
    }
  }

  /** Converte un valore normalizzato [0,1] in un colore heatmap */
  _pressureColor(t, alpha = 0.5) {
    let r, g, b;
    if (t < 0.25) {
      // blu → ciano
      const s = t / 0.25;
      r = 0;
      g = Math.round(80 + s * 120);
      b = Math.round(160 + s * 80);
    } else if (t < 0.50) {
      // ciano → verde
      const s = (t - 0.25) / 0.25;
      r = 0;
      g = Math.round(200 + s * 40);
      b = Math.round(240 - s * 220);
    } else if (t < 0.75) {
      // verde → giallo
      const s = (t - 0.50) / 0.25;
      r = Math.round(60 + s * 185);
      g = Math.round(240 - s * 40);
      b = 0;
    } else {
      // giallo → rosso
      const s = (t - 0.75) / 0.25;
      r = Math.round(245 - s * 10);
      g = Math.round(200 - s * 180);
      b = 0;
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /** Disegna frecce vettoriali di direzione */
  _drawArrows() {
    // Rimuovi frecce precedenti
    this._arrows.forEach(m => m.remove());
    this._arrows = [];

    if (!this._visible) return;

    const t = this._currentElapsedMs;
    const step = this._gridStep;

    for (let lat = TOPO_LAT_MIN + step / 2; lat < TOPO_LAT_MAX; lat += step) {
      for (let lon = TOPO_LON_MIN + step / 2; lon < TOPO_LON_MAX; lon += step) {
        const field = topoWindField2D(lat, lon, t);
        const delta = field.multiplierDelta;
        const dirDeg = field.directionDelta;

        // Intensità freccia proporzionale al delta di pressione
        const arrowLen = 10 + Math.abs(delta) * 60;
        const arrowColor = this._pressureColor(clampLinear((delta + 0.20) / 0.38, 0, 1), 0.9);

        // Crea icona freccia SVG
        const rotDeg = dirDeg; // deviazione rispetto al vento principale
        const svgArrow = `
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-14 -14 28 28">
            <g transform="rotate(${rotDeg})">
              <line x1="0" y1="8" x2="0" y2="-8" stroke="${arrowColor}" stroke-width="2.2" stroke-linecap="round"/>
              <polygon points="0,-10 -3.5,-4 3.5,-4" fill="${arrowColor}"/>
            </g>
          </svg>`;
        const svgUrl = "data:image/svg+xml," + encodeURIComponent(svgArrow);
        const icon = L.icon({
          iconUrl: svgUrl,
          iconSize:   [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([lat, lon], { icon, interactive: false, opacity: 0.82 });
        marker.addTo(this._map);
        this._arrows.push(marker);
      }
    }
  }

  /** Aggiorna il layer con il nuovo timestamp (chiamato ogni secondo dalla sim) */
  update(elapsedMs) {
    this._currentElapsedMs = elapsedMs;
    if (this._visible) this._redraw();
  }

  /** Mostra/nasconde l'overlay */
  toggle() {
    this._visible = !this._visible;
    if (this._visible) {
      this._canvasOverlay.addTo(this._map);
      this._drawCanvas();
      this._drawArrows();
    } else {
      this._canvasOverlay.remove();
      this._arrows.forEach(m => m.remove());
      this._arrows = [];
    }
    return this._visible;
  }

  get visible() { return this._visible; }
}

// ════════════════════════════════════════════════════════════════════════════
// INTERFACCIA SEMPLIFICATA per integrazione con app.js
// ════════════════════════════════════════════════════════════════════════════

/**
 * applyTopoWindToEngine(baseResult, lat, lon, elapsedMs)
 * -------------------------------------------------------
 * Applica il campo topografico 2D al risultato del windEngineAt() esistente.
 * Chiamata dal windEngineAt() di app.js al posto / dopo localWindTexture().
 *
 * @param {object} baseResult  - Output di windEngineAt() (prima della topo correzione)
 * @param {number} lat         - Latitudine punto
 * @param {number} lon         - Longitudine punto
 * @param {number} elapsedMs   - Timestamp simulazione
 * @returns {object}           - baseResult modificato con correzioni topografiche
 */
export function applyTopoWindToEngine(baseResult, lat, lon, elapsedMs = 0) {
  const topo = topoWindField2D(lat, lon, elapsedMs);

  // Somma i contributi topografici al multiplier e alla direzione
  const newMultiplier = clampLinear(
    (baseResult.multiplier ?? 1) + topo.multiplierDelta,
    0.72, 1.22
  );
  const newDirection = ((baseResult.direction ?? 185) + topo.directionDelta + 360) % 360;
  const newTurbulence = clampLinear(
    (baseResult.turbulence ?? 0) + topo.turbulence * 0.4,
    0, 1
  );

  // Ricalcola pressione
  const pressure = newMultiplier >= 1.055 ? "forte"
    : newMultiplier <= 0.945 ? "debole"
    : "media";

  return {
    ...baseResult,
    multiplier:  newMultiplier,
    direction:   newDirection,
    turbulence:  newTurbulence,
    pressure,
    topoZone:    topo.zone,
    topoField:   topo,
    source:      (baseResult.source ?? "fallback") + "+topo2D",
  };
}

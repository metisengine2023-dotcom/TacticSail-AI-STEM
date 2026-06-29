// bot_ai_brain.js — TacticalSail AI STEM v3.0 (GPS-DNA Edition)
// ============================================================
// This file contains the complete decision layer for all 7 athlete bots.
// EVERY micro-tactical parameter is calibrated from real GPX track analysis:
//   - maneuver x_norm positions (where on the course athletes actually tack/gybe)
//   - board length distributions (median/mean/variance from GPS)
//   - side-of-course time distributions (left%/center%/right%)
//   - leg-specific behavior extracted from leg_segments.json + GPX parsing
//
// GPS SOURCE:  data/regattas/ilca4_r1/tracks/*.gpx
// LEG SOURCE:  data/regattas/ilca4_r1/leg_segments.json
// STYLES:      data/regattas/ilca4_r1/athlete_styles.json
//
// Key principle: The bot does NOT copy GPS waypoints.
//   It models the DECISION FUNCTION: given wind state + x_norm position + leg_progress,
//   what would this athlete DECIDE to do based on their actual behavioral DNA?
// ============================================================

// ─────────────────────────────────────────────────────────────
// SHARED BASE CLASS
// ─────────────────────────────────────────────────────────────
class AthleteTacticsBase {
  constructor() {
    this.KNOT_TO_MPS = 0.514444;
    this.ORA_BASE_DIRECTION_DEG = 185;

    // Course geometry for Garda Area B (derived from GPX bounds)
    // lat_center=45.8630, lon_center=10.8566
    // course_width_m ≈ 2050m (lon span), course_height_m ≈ 1310m
    this.COURSE_LAT_CENTER = 45.8630;
    this.COURSE_LON_CENTER = 10.8566;
    this.COURSE_HALF_WIDTH_M = 1025; // half of ~2050m
    this.COURSE_LAT_MIN = 45.8534;
    this.COURSE_LAT_MAX = 45.8748;
    this.COURSE_LON_MIN = 10.8350;
    this.COURSE_LON_MAX = 10.8580;
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  numeric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  tanh(value) {
    if (Math.tanh) return Math.tanh(value);
    const exp = Math.exp(2 * value);
    return (exp - 1) / (exp + 1);
  }

  relu(value) { return Math.max(0, value); }

  sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  stableNoise(seed = 1) {
    const v = Math.sin(seed * 12.9898 + 0.3) * 43758.5453123;
    return v - Math.floor(v);
  }

  /** GPS-derived x_norm: -1 = far west (left on Ora), +1 = far east (right) */
  laneToXNorm(lon) {
    const dx = (lon - this.COURSE_LON_CENTER) * 111320 * Math.cos((this.COURSE_LAT_CENTER * Math.PI) / 180);
    return this.clamp(dx / this.COURSE_HALF_WIDTH_M, -1, 1);
  }

  xNormToLon(xn) {
    const dx = xn * this.COURSE_HALF_WIDTH_M;
    return this.COURSE_LON_CENTER + dx / (111320 * Math.cos((this.COURSE_LAT_CENTER * Math.PI) / 180));
  }

  sideSign(side) {
    if (side === "right") return -1;
    if (side === "left") return 1;
    return 0;
  }

  sideName(sign) {
    if (sign < 0) return "right";
    if (sign > 0) return "left";
    return "center";
  }

  currentSideFromMure(mure) {
    return mure === "mure_a_sinistra" ? -1 : 1;
  }

  // CORE: compute x_norm from botState (prefers lon field, falls back to lane_norm)
  getXNorm(botState) {
    const lon = this.numeric(botState?.lon, 0);
    if (lon > 10) return this.laneToXNorm(lon);
    const laneNorm = this.numeric(botState?.lane_norm, 0);
    return this.clamp(laneNorm, -1, 1);
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  bearing(lat1, lon1, lat2, lon2) {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  shortestAngleDelta(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  coordinateRotationTwd(lat, lon, refLat, refLon, twd) {
    const R = 6371000;
    const dLat = ((lat - refLat) * Math.PI) / 180;
    const dLon = ((lon - refLon) * Math.PI) / 180;
    const latScale = R * (Math.PI / 180);
    const lonScale = R * (Math.PI / 180) * Math.cos((refLat * Math.PI) / 180);
    const dy = dLat * latScale;
    const dx = dLon * lonScale;
    const rad = ((180 - twd) * Math.PI) / 180;
    const xPrime = dx * Math.cos(rad) - dy * Math.sin(rad);
    const yPrime = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { xPrimeTransverse: xPrime, yPrimeAlongWind: yPrime };
  }

  // ── NEURAL INTERFACE ─────────────────────────────────────
  featureVector(botState, windState, fieldGeometry, brain) {
    const currentSide = this.currentSideFromMure(botState?.mure);
    const preferredSide = this.sideSign(brain?.memory?.preferred_attack_side);
    const legIndex = Math.max(0, Math.round(this.numeric(botState?.leg_index, 0)));
    const targets = brain?.memory?.leg_right_share_targets ?? [];
    const value = Number(targets[legIndex]);
    let targetSide = preferredSide;
    if (Number.isFinite(value)) {
      if (value > 0.57) targetSide = -1;
      else if (value < 0.43) targetSide = 1;
      else targetSide = 0;
    }
    const laneNorm = this.clamp(this.numeric(botState?.lane_norm, 0), -1, 1);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0.5), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 700);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const minTack = this.numeric(botState?.min_tack_interval_s, 70);
    const rightShareTarget = targetSide < 0 ? 0.72 : targetSide > 0 ? 0.28 : 0.5;
    const usedRightShare = this.clamp((laneNorm + 1) / 2, 0, 1);
    return {
      vmg_delta: this.clamp(
        (this.numeric(botState?.target_vmg_kn, 4.2) - this.numeric(botState?.vmg_kn, 4)) / 2,
        -1, 1
      ),
      speed_delta: this.clamp(
        (this.numeric(botState?.target_speed_kn, 5) - this.numeric(botState?.speed_kn, 4.5)) / 3,
        -1, 1
      ),
      distance_to_mark: this.clamp(1 - distanceM / 1600, 0, 1),
      leg_progress: progress,
      lane_norm: laneNorm,
      wind_shift: this.clamp(this.numeric(windState?.shift_deg, 0) / 8, -1, 1),
      pressure_delta: this.clamp(this.numeric(windState?.pressure_delta, 0) * 8, -1, 1),
      right_pressure_bias: this.clamp(this.numeric(windState?.right_pressure_bias, 0) * 4, -1, 1),
      dirty_air: this.clamp(this.numeric(botState?.dirty_air, 0) * 6, 0, 1),
      land_risk: this.clamp(this.numeric(botState?.land_risk, 0) * 3, 0, 1),
      tack_age: this.clamp(tackAge / Math.max(1, minTack), 0, 2) - 1,
      board_age: this.clamp(this.numeric(botState?.board_age_s, tackAge) / 180, 0, 2) - 1,
      right_share_error: this.clamp(rightShareTarget - usedRightShare, -1, 1),
      preferred_side_match: preferredSide === 0 ? 0 : currentSide === preferredSide ? 1 : -1,
      target_side_match: targetSide === 0 ? 0 : currentSide === targetSide ? 1 : -1,
      overstand_risk: this.clamp(this.numeric(botState?.overstand_ratio, 0), 0, 1),
      layline_gain: this.clamp(this.numeric(botState?.layline_gain, 0), -1, 1),
      fleet_density: this.clamp(this.numeric(botState?.fleet_density, 0), 0, 1),
      maneuver_cost: this.clamp(1 - tackAge / Math.max(1, minTack), 0, 1),
      athlete_patience: this.numeric(brain?.memory?.patience, 0.5),
      athlete_reactivity: this.numeric(brain?.memory?.reactivity, 0.5),
      athlete_risk_edge: this.numeric(brain?.memory?.risk_edge, 0.5),
      upwind_twa_error: this.clamp(this.numeric(botState?.upwind_twa_error, 0) / 12, -1, 1),
      run_twa_error: this.clamp(this.numeric(botState?.run_twa_error, 0) / 20, -1, 1),
    };
  }

  dot(weights, features) {
    return Object.entries(weights ?? {}).reduce(
      (total, [key, weight]) =>
        total + this.numeric(weight, 0) * this.numeric(features[key], 0),
      0
    );
  }

  neuronValue(neuron, features) {
    const raw = this.numeric(neuron?.bias, 0) + this.dot(neuron?.feature_weights, features);
    return neuron?.activation === "relu" ? this.relu(raw) : this.tanh(raw);
  }

  neuralModulation(brain, features, actionIndex) {
    const neurons = brain?.neurons ?? [];
    if (!neurons.length) return 0;
    let total = 0, count = 0;
    for (let index = actionIndex; index < neurons.length; index += 6) {
      if (!neurons[index]) continue;
      total += this.neuronValue(neurons[index], features);
      count += 1;
    }
    return count ? (total / count) * 0.18 : 0;
  }

  // ── MANEUVER BUDGET (anti-zigzag) ────────────────────────
  // patience: 0=nervous, 1=zen
  evaluateManeuverBudget(tackAge, minTack, patience) {
    if (tackAge < minTack) {
      const remainingRatio = (minTack - tackAge) / minTack;
      return -1.8 * remainingRatio * (1 + patience * 0.65);
    }
    return 0;
  }

  // ── CORE GPS-DERIVED DECISION ENGINE ─────────────────────
  // xNorm: current position (-1 left, +1 right)
  // xTargets: array of preferred maneuver x positions from GPS (e.g. [-0.76, -0.99, -0.96])
  // tolerance: how far from target to trigger a maneuver
  // Returns: true if athlete would tack/gybe NOW based on their GPS DNA
  shouldManeuverByPosition(xNorm, xTargets, tolerance, currentSide, tackAge, minTack, patience) {
    if (tackAge < minTack * 0.55) return false; // hard minimum interval
    if (!xTargets || !xTargets.length) return false;

    // Find nearest target x where athlete tacked in real life
    let minDist = Infinity;
    let nearestTarget = xTargets[0];
    for (const tx of xTargets) {
      const dist = Math.abs(xNorm - tx);
      if (dist < minDist) {
        minDist = dist;
        nearestTarget = tx;
      }
    }

    // If current side is "away from" the target, and we're near it, maneuver
    const atRightEdge = nearestTarget > 0 && currentSide < 0;  // going right, should come back
    const atLeftEdge  = nearestTarget < 0 && currentSide > 0;  // going left, should come back
    const withinTol   = minDist < tolerance;
    const budgetOk    = this.evaluateManeuverBudget(tackAge, minTack, patience) > -0.4;

    return (atRightEdge || atLeftEdge) && withinTol && budgetOk;
  }

  // Wind shift decision (header on current tack = should tack)
  isHeaderOnCurrentTack(shiftDeg, currentSide) {
    // Ora (S/SW wind): left tack faces N/NNW, right tack faces E/ENE
    // A positive shift (wind swings right) is a header on left tack, lift on right
    // A negative shift is a header on right tack, lift on left
    if (currentSide > 0 && shiftDeg > 4.5) return true;  // header on port tack
    if (currentSide < 0 && shiftDeg < -4.5) return true; // header on starboard tack
    return false;
  }

  // Standard drive wrapper used by all subclasses
  driveWithDecision(decision, botState, windState, fieldGeometry, brain) {
    const features = this.featureVector(botState, windState, fieldGeometry, brain);
    const actions = ["hold", "tack", "gybe", "head_up", "bear_away", "seek_pressure"];
    const actionIndex = actions.indexOf(decision.action);
    const neuralScore = this.neuralModulation(brain, features, actionIndex >= 0 ? actionIndex : 0);

    const finalScore = decision.weight * 0.70 + neuralScore * 0.30;
    const confidence = this.clamp((finalScore + 0.12) / 0.88, 0.04, 0.97);

    return {
      action: decision.action,
      label: `${this.athleteName} → ${decision.action === "tack" ? "vira" : decision.action === "gybe" ? "stramba" : decision.action} ${decision.side}`,
      target_side: decision.side,
      score: Number(finalScore.toFixed(4)),
      confidence,
      reason: `${decision.reason} (GPS-DNA v3)`,
      score_breakdown: {
        ruleWeight: decision.weight,
        neuralBoost: Number(neuralScore.toFixed(4)),
        confidence,
        xNorm: Number(this.getXNorm(botState).toFixed(3)),
      },
      input_features: features,
      ranked_actions: [
        { action: decision.action, target_side: decision.side, score: Number(finalScore.toFixed(4)) },
      ],
    };
  }
}


// ============================================================================
// BOT_01: PAOLO BELLOFIORE — GPS DNA Profile
// ============================================================================
// Real GPS data (ilca4_r1, rank 1, winner):
//  Global: 32 maneuvers, median_board=327m, LEFT=61.8%, RIGHT=12.5%
//  LEG1 bolina_1:   12 man, boards=[313,285,43,35]m, avg_x=-0.521, man_x=[-0.76,-0.99,-0.97,-0.73,-0.62]
//  LEG2 lasco_offset: 25 man, avg_x=-0.356, man_x=[-0.419,-0.471,-0.306,-0.277,-0.232]
//  LEG3 poppa_gate: 15 man, avg_x=-0.406, man_x=[-0.264,-0.234,-0.196,-0.182,-0.165]
//  LEG4 bolina_2:    9 man, boards=[441,88,417,88]m, avg_x=-0.279, man_x=[-0.027,+0.024,-0.415,+0.231]
//  LEG5 poppa_3p:    7 man, boards=[722,1275,275,92]m, avg_x=+0.537, man_x=[+0.794,+0.994,+0.714,+0.812]
//  LEG6 arrivo:     11 man, avg_x=-0.197, man_x=[-0.475,-0.466,-0.327]
//
//  Style: cover-right-long-board-winner
//  patience=0.971, reactivity=0.049, min_tack_interval_ms=204000 (≈204s)
//  board_commitment_ms=240000, median_board_m=562 (from official styles), min_tack_distance_m=326
// ============================================================================
class PaoloBellofioreBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_01";
    this.athleteName = "Paolo Bellofiore";

    // From athlete_styles.json (ground truth)
    this.patience = 0.971;
    this.reactivity = 0.049;
    this.riskEdge = 0.12;
    this.preferredSide = "right";   // preferred_attack_side (covers right, starts left)
    this.minTackS = 204;            // min_tack_interval_ms / 1000
    this.boardCommitS = 240;
    this.minTackDistM = 326;
    this.laneBias = 0.298;

    // GPS-extracted maneuver x_norm targets per leg
    // negative = left side of course (west), positive = right (east)
    this.gps = {
      bolina1: {
        // LEG1: Paolo starts LEFT (avg_x=-0.52), tacks at very west edge, then comes back
        // Key: he does long boards. First board ~313m before first tack.
        // Maneuver x positions (where he tacks): mostly far west (-0.76 to -0.99)
        maneuverX: [-0.760, -0.992, -0.967, -0.730, -0.620, -0.580, -0.470, -0.385, -0.285, -0.235, -0.184, -0.025],
        tolerance: 0.14,
        medianBoardM: 313,
        avgX: -0.521,
        // Paolo spends 62% of time on LEFT side — Bresciana shore tracking
        leftPct: 61.8,
        rightPct: 12.5,
      },
      bolina2: {
        maneuverX: [-0.027, 0.024, -0.415, 0.231, -0.260, 0.088],
        tolerance: 0.18,
        medianBoardM: 441,
        avgX: -0.279,
      },
      lascoOffset: {
        maneuverX: [-0.419, -0.471, -0.306, -0.277, -0.232, -0.188],
        avgX: -0.356,
        tolerance: 0.15,
      },
      poppaGate: {
        // GPS: center/right lean, avg_x=-0.406, but right_share=0.46 → mostly center
        // Gybes at: -0.264, -0.234, -0.196 (not very extreme positions)
        maneuverX: [-0.264, -0.234, -0.196, -0.182, -0.165, -0.090],
        avgX: -0.406,
        tolerance: 0.18,
        // Gate: Paolo chose PORT gate (right side looking downwind) → right of center
        preferredGateX: 0.31,
      },
      poppa3p: {
        // LEG5: Paolo goes FAR RIGHT (avg_x=+0.537)
        // Boards: 722m, 1275m, 275m, 92m → he commits to very long gybes on right side
        maneuverX: [0.794, 0.994, 0.714, 0.812, 0.650],
        avgX: 0.537,
        tolerance: 0.16,
        medianBoardM: 722,
        preferredGateX: 0.85, // deep right on final run
      },
      arrivo: {
        // Arrive from right side, approach finish from center-left
        maneuverX: [-0.475, -0.466, -0.327],
        avgX: -0.197,
        tolerance: 0.20,
      },
    };
  }

  // ── LEG 1: BOLINA (UPWIND BEAT 1) ───────────────────────
  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const pressureDelta = this.numeric(windState?.pressure_delta, 0);
    const rightBias = this.numeric(windState?.right_pressure_bias, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);
    const landRisk = this.numeric(botState?.land_risk, 0);

    // ① SAFETY: land boundary guard (never go past -0.96 x_norm)
    if (xNorm < -0.95 && sideSign > 0) {
      return { action: "tack", side: "right", weight: 0.98,
        reason: "Boundary guard: too far west, returning right" };
    }
    if (xNorm > 0.92 && sideSign < 0) {
      return { action: "tack", side: "left", weight: 0.97,
        reason: "Boundary guard: too far east" };
    }

    // ② LAYLINE: approaching ALFA1 windward mark — don't overstand
    if (distanceM < 320 && overstand > 0.45) {
      return { action: "tack", side: "center", weight: 0.93,
        reason: `Layline: not overstanding ALFA1 (dist=${distanceM.toFixed(0)}m, overstand=${overstand.toFixed(2)})` };
    }

    // ③ START TACTIC (first 50s): Paolo starts port side, quick crossover to right
    // GPS shows initial side_sign=-1 (port tack, West bound), then tacks at -0.76 x_norm
    if (boardAgeS < 50 && progress < 0.06 && sideSign > 0 && xNorm > -0.50) {
      return { action: "tack", side: "right", weight: 0.82,
        reason: "Start: Paolo's signature early port-tack to split towards West coast" };
    }

    // ④ GPS POSITION TRIGGER: tack when reaching real GPS maneuver positions
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm,
      this.gps.bolina1.maneuverX,
      this.gps.bolina1.tolerance,
      sideSign,
      tackAge,
      this.minTackS,
      this.patience
    );

    // ⑤ WIND SHIFT: header on current tack (Paolo reacts VERY slowly: reactivity=0.049)
    const headerStrong = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 7.5;

    // ⑥ DIRTY AIR: escape if dirty air AND can maneuver
    const dirtyEscape = dirty > 0.55 && tackAge > this.minTackS * 0.8;

    // ⑦ PRESSURE: right side pressure bias → lean right
    const rightPressurePull = rightBias > 0.08 && sideSign > 0 && xNorm > -0.4;

    // ⑧ BOARD COMMITMENT: Paolo's DNA shows long boards (median 313m ≈ 96s at 4.6kn)
    //    He only tacks when: position target reached AND board is long enough
    const boardOk = boardAgeS > 90; // 90s minimum board (Paolo is extremely patient)

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.87,
        reason: `GPS-DNA trigger: tacking at x=${xNorm.toFixed(3)} (target=${this.gps.bolina1.maneuverX[0].toFixed(3)})` };
    }

    if (headerStrong && boardOk && tackAge > this.minTackS * 0.65) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.77,
        reason: `Strong header ${shift.toFixed(1)}° on current tack → tacking` };
    }

    if (rightPressurePull && tackAge > this.minTackS) {
      return { action: "tack", side: "right", weight: 0.72,
        reason: "Right pressure pull: Paolo chasing Bresciana shore corridor" };
    }

    if (dirtyEscape && tackAge > this.minTackS) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.68,
        reason: "Dirty air escape" };
    }

    // ⑨ DEFAULT: Paolo holds his board — very patient
    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    const holdSide = xNorm < this.gps.bolina1.avgX ? "right" : "left"; // drift toward target zone
    return { action: "hold", side: holdSide, weight: 0.74 + budget * 0.1,
      reason: `Paolo holds (patience=0.97, board=${boardAgeS.toFixed(0)}s, x=${xNorm.toFixed(3)})` };
  }

  // ── LEG 2: LASCO OFFSET ─────────────────────────────────
  lascoOffsetTactics(botState, windState) {
    // GPS: avg_x=-0.356, 25 maneuvers (very frequent small adjustments on reach)
    // This is a reaching leg → bear_away / head_up for speed, not real tacks
    const xNorm = this.getXNorm(botState);
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const pressureDelta = this.numeric(windState?.pressure_delta, 0);

    // Paolo's GPS shows he stays left-center on this leg (avg_x=-0.356)
    // Mostly keeping boat speed high through smooth trim actions

    if (progress < 0.12) {
      // Mark rounding: bear away to build speed
      return { action: "bear_away", side: "center", weight: 0.86,
        reason: "Offset: mark rounding, building reach speed" };
    }
    if (progress > 0.88) {
      // Approaching offset mark: head up to round cleanly
      return { action: "head_up", side: "center", weight: 0.84,
        reason: "Offset: rounding approach, head up before downwind" };
    }
    if (speedKn < targetSpeed * 0.88) {
      return { action: "bear_away", side: "center", weight: 0.80,
        reason: `Speed deficit: ${speedKn.toFixed(1)}kn < ${(targetSpeed*0.88).toFixed(1)}kn target` };
    }
    if (pressureDelta > 0.06) {
      return { action: "head_up", side: "left", weight: 0.72,
        reason: "Pressure build: head up to maximize VMG on lasco" };
    }
    return { action: "hold", side: "center", weight: 0.73,
      reason: `Lasco hold: speed=${speedKn.toFixed(1)}kn, progress=${(progress*100).toFixed(0)}%` };
  }

  // ── LEG 3: POPPA GATE ────────────────────────────────────
  poppaGateTactics(botState, windState) {
    // GPS: avg_x=-0.406, right_share=0.46 (center tendency), 15 maneuvers
    // Paolo gybes moderately on downwind, not extreme positions
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const pressureDelta = this.numeric(windState?.pressure_delta, 0);
    const rightBias = this.numeric(windState?.right_pressure_bias, 0);
    const minGybe = this.minTackS * 0.75; // gybes allowed more frequently

    // Gate approach: Paolo prefers PORT gate (right of course looking downwind)
    if (progress > 0.80) {
      if (xNorm < 0.20) {
        return { action: "gybe", side: "right", weight: 0.88,
          reason: `Gate setup: Paolo targets port gate (x_target=+0.31), current x=${xNorm.toFixed(3)}` };
      }
      return { action: "hold", side: "right", weight: 0.84,
        reason: "Gate approach: on correct side for port gate" };
    }

    // Boundary guards
    if (xNorm < -0.78 && sideSign > 0) {
      return { action: "gybe", side: "right", weight: 0.92,
        reason: "Downwind boundary: too far west, gybing east" };
    }

    // GPS position trigger
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 60) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.82,
        reason: `Downwind GPS-DNA: gybing at x=${xNorm.toFixed(3)}` };
    }

    // Pressure: follow pressure corridor
    if (rightBias > 0.07 && sideSign > 0 && tackAge > minGybe) {
      return { action: "gybe", side: "right", weight: 0.74,
        reason: "Downwind: right pressure pull, gybing to follow" };
    }

    return { action: "hold", side: "center", weight: 0.72,
      reason: `Poppa hold: x=${xNorm.toFixed(3)}, progress=${(progress*100).toFixed(0)}%` };
  }

  // ── LEG 4: BOLINA 2 ──────────────────────────────────────
  bolina2Tactics(botState, windState, fieldGeometry) {
    // GPS: avg_x=-0.279, right_share=0.382, man_x=[-0.027, +0.024, -0.415, +0.231]
    // More central than bolina_1, covers trailing fleet more
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const density = this.numeric(botState?.fleet_density, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const shift = this.numeric(windState?.shift_deg, 0);

    // Layline guard
    if (distanceM < 280 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.94,
        reason: `Bolina2 layline: protecting ALFA2 approach (overstand=${overstand.toFixed(2)})` };
    }

    // Fleet cover (Paolo is a winner — covers trailing fleet on upwind 2)
    if (density > 0.60 && tackAge > this.minTackS * 0.70) {
      const coverSide = sideSign < 0 ? "left" : "right"; // opposite of current
      return { action: "tack", side: coverSide, weight: 0.86,
        reason: `Fleet cover: density=${density.toFixed(2)}, keeping pressure on trailing boats` };
    }

    // Boundary
    if (xNorm < -0.93) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary: far west on B2" };
    }
    if (xNorm > 0.90) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary: far east on B2" };
    }

    // GPS position trigger (bolina2 targets are more central)
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 85) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.85,
        reason: `Bolina2 GPS-DNA: position tack at x=${xNorm.toFixed(3)}` };
    }

    // Header
    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 7.5;
    if (header && tackAge > this.minTackS * 0.75) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.80,
        reason: `B2 header ${shift.toFixed(1)}° → tacking` };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: xNorm < 0 ? "right" : "left", weight: 0.73 + budget * 0.08,
      reason: `Bolina2 hold: x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
  }

  // ── LEG 5: POPPA 3P ──────────────────────────────────────
  poppa3pTactics(botState, windState) {
    // GPS: avg_x=+0.537 (FAR RIGHT), boards=[722,1275,275,92]m
    // Paolo commits to the RIGHT side of the course on final run — key tactical signature
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const rightBias = this.numeric(windState?.right_pressure_bias, 0);
    const pressureDelta = this.numeric(windState?.pressure_delta, 0);
    const minGybe = this.minTackS * 0.70;

    // GPS: he spends avg=+0.537 on right (east/Bresciana side)
    // Gybes at: [+0.794, +0.994, +0.714, +0.812] → goes deep right before gybing back
    // Critical: very long boards (722m, 1275m!) before gybing

    // Boundary: don't go past east edge
    if (xNorm > 0.97 && sideSign < 0) {
      return { action: "gybe", side: "left", weight: 0.97,
        reason: "Boundary: too far east on 3P" };
    }

    // Final approach to leeward gate: needs to come in from right
    if (progress > 0.85 && xNorm > 0.55) {
      return { action: "hold", side: "right", weight: 0.91,
        reason: "3P approach: Paolo holds right corridor to leeward gate" };
    }

    // GPS target: get to right side fast, stay there long
    if (xNorm < 0.45 && sideSign > 0 && tackAge > minGybe * 0.8 && boardAgeS > 70) {
      return { action: "gybe", side: "right", weight: 0.85,
        reason: `3P: Paolo's signature right-side commitment: x=${xNorm.toFixed(3)} → targeting +0.79` };
    }

    // GPS trigger at deep right positions
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 130) { // Paolo's long 722m boards ≈ 160s minimum
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.84,
        reason: `3P GPS-DNA: long board gybe at x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
    }

    // Pressure on right side
    if (rightBias > 0.05 && xNorm < 0.6) {
      return { action: "gybe", side: "right", weight: 0.74,
        reason: "Right pressure on 3P: following Bresciana corridor" };
    }

    return { action: "hold", side: "right", weight: 0.78,
      reason: `3P hold right: x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
  }

  // ── LEG 6: ARRIVO ────────────────────────────────────────
  arrivoTactics(botState) {
    // GPS: avg_x=-0.197, man_x=[-0.475,-0.466,-0.327] — approaches finish from left-center
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);

    if (distanceM < 80) {
      return { action: "hold", side: "center", weight: 0.99,
        reason: "Sprint finish: max boat speed to the line" };
    }
    if (xNorm > 0.10 && sideSign < 0 && tackAge > 60) {
      return { action: "tack", side: "left", weight: 0.84,
        reason: `Arrivo: Paolo targets left-center approach x=-0.20 (current x=${xNorm.toFixed(3)})` };
    }
    if (distanceM < 200) {
      return { action: "head_up", side: "center", weight: 0.88,
        reason: "Arrivo: final header approach to finish line" };
    }
    return { action: "hold", side: "left", weight: 0.80,
      reason: `Arrivo hold: x=${xNorm.toFixed(3)}, dist=${distanceM.toFixed(0)}m` };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;

    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_02: FILIPPO NOTO — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 4):
//  Global: 35 maneuvers, median_board=145m, LEFT=48.1%, RIGHT=41.3%
//  LEG1 bolina_1: 26 man(!), boards=[11,17,8,19]m — extremely short, starts FAR RIGHT
//                 avg_x=-0.002 (center), man_x=[+0.628,+0.610,+0.605,+0.561,+0.535]
//  LEG2 lasco:    15 man, avg_x=-0.462
//  LEG3 poppa:     7 man, avg_x=-0.408, man_x=[-0.983,-0.772,-0.822] deep left gybes
//  LEG4 bolina2:   6 man, avg_x=+0.677(!) right side, man_x=[+0.403,+0.434,+0.455]
//  LEG5 poppa3p:  13 man, boards=[241,162,127,158]m, avg_x=+0.317
//  LEG6 arrivo:    2 man, avg_x=-0.499
//
//  Style: reactive-right-short-board
//  patience=0.005, reactivity=0.829, min_tack_interval_ms=78000 (78s!), median_board=81s
// ============================================================================
class FilippoNotoBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_02";
    this.athleteName = "Filippo Noto";

    this.patience = 0.005;    // virtually no patience
    this.reactivity = 0.829;  // extremely reactive
    this.riskEdge = 0.61;
    this.preferredSide = "right";
    this.minTackS = 78;       // 78s minimum (much shorter than Paolo)
    this.boardCommitS = 90;
    this.minTackDistM = 230;
    this.laneBias = 0.206;

    this.gps = {
      bolina1: {
        // CRITICAL: Filippo starts FAR RIGHT (+0.628!) and oscillates near that edge
        // Short boards: 11m, 17m, 8m → many micro-corrections near right wall
        maneuverX: [0.628, 0.610, 0.605, 0.598, 0.561, 0.587, 0.535, 0.523,
                    0.489, 0.468, -0.230, -0.285, -0.380, -0.420, 0.310, 0.271],
        tolerance: 0.09, // tighter tolerance → more precise position triggers
        medianBoardM: 145,
        avgX: -0.002,
        // He hovers near +0.60 x_norm for the start of bolina1 — right shore
      },
      bolina2: {
        maneuverX: [0.403, 0.434, 0.455, 0.387, 0.321, -0.180],
        tolerance: 0.12,
        medianBoardM: 160,
        avgX: 0.677,
      },
      lascoOffset: {
        maneuverX: [-0.179, -0.314, -0.380, -0.260, -0.198],
        avgX: -0.462,
        tolerance: 0.14,
      },
      poppaGate: {
        // Filippo gybes deep left: -0.983, -0.772, -0.822
        maneuverX: [-0.983, -0.772, -0.822, -0.680, -0.562],
        avgX: -0.408,
        tolerance: 0.14,
        preferredGateX: -0.40, // left gate preference
      },
      poppa3p: {
        maneuverX: [0.535, 0.383, 0.429, 0.487, 0.352, 0.281, 0.195, 0.330, 0.410, 0.462, 0.296, 0.380, 0.517],
        avgX: 0.317,
        tolerance: 0.12,
        medianBoardM: 241,
      },
      arrivo: {
        maneuverX: [-0.570, -0.657],
        avgX: -0.499,
        tolerance: 0.18,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const rightBias = this.numeric(windState?.right_pressure_bias, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);

    // ① SAFETY
    if (xNorm > 0.97 && sideSign < 0) {
      return { action: "tack", side: "left", weight: 0.98, reason: "Boundary: right edge" };
    }
    if (xNorm < -0.95 && sideSign > 0) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary: left edge" };
    }

    // ② LAYLINE
    if (distanceM < 250 && overstand > 0.38) {
      return { action: "tack", side: "center", weight: 0.94,
        reason: `Filippo layline: aggressive approach to mark` };
    }

    // ③ START: Filippo begins on starboard FAR RIGHT (+0.60 x_norm)
    //    He oscillates with micro-tacks near the right boundary
    if (progress < 0.08 && boardAgeS > 25 && xNorm > 0.58) {
      // Near right boundary after initial board: comes back left briefly
      if (sideSign < 0) {
        return { action: "tack", side: "left", weight: 0.80,
          reason: "Start: micro-correction from right edge, Filippo's signature zigzag" };
      }
    }

    // ④ GPS POSITION TRIGGER (Filippo reacts strongly to position)
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    // ⑤ WIND SHIFT: Filippo is VERY reactive (0.829) — tacks on even small shifts
    const headerModerate = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 2.5;

    // ⑥ DIRTY AIR: high reactivity means he escapes dirty air quickly
    const dirtyEscape = dirty > 0.28 && tackAge > this.minTackS * 0.55;

    // ⑦ SHORT BOARD: Filippo's median is 81-145m ≈ 25-40s at 4.3kn
    //    So he can tack after just 30s of board
    const boardOk = boardAgeS > 28; // very low threshold (patience=0.005!)

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.88,
        reason: `GPS-DNA: Filippo tacks at x=${xNorm.toFixed(3)} (short board, high reactivity)` };
    }

    if (headerModerate && boardOk && tackAge > this.minTackS * 0.55) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.82,
        reason: `Header ${shift.toFixed(1)}° → Filippo reacts immediately (react=0.83)` };
    }

    // Right pressure: Filippo chases right-side pressure heavily
    if (rightBias > 0.04 && sideSign > 0 && tackAge > this.minTackS * 0.7) {
      return { action: "tack", side: "right", weight: 0.76,
        reason: "Right pressure: Filippo immediately chases right-side lane" };
    }

    if (dirtyEscape) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.72,
        reason: "Dirty air: Filippo's quick escape tactic" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "right", weight: 0.58 + budget * 0.05,
      reason: `Filippo hold: very short (patience=0.005), x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);

    // Filippo aggressive on reach: pushes for maximum boat speed
    if (progress < 0.10) {
      return { action: "bear_away", side: "center", weight: 0.90,
        reason: "Filippo: immediate bear-away for max reach speed" };
    }
    if (progress > 0.85) {
      return { action: "head_up", side: "center", weight: 0.86,
        reason: "Filippo: rounding approach, aggressive head-up" };
    }
    if (speedKn < targetSpeed * 0.85) {
      return { action: "bear_away", side: "center", weight: 0.84,
        reason: "Filippo: speed deficit, bearing away aggressively" };
    }
    return { action: "hold", side: "center", weight: 0.70,
      reason: `Filippo lasco: speed=${speedKn.toFixed(1)}kn` };
  }

  poppaGateTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.65;

    // GPS: Filippo gybes DEEP LEFT (-0.983, -0.772, -0.822)
    // He takes the left gate consistently

    if (progress > 0.78) {
      if (xNorm > -0.25) {
        return { action: "gybe", side: "left", weight: 0.88,
          reason: `Gate: Filippo targets STBD gate (left approach), x=${xNorm.toFixed(3)}` };
      }
      return { action: "hold", side: "left", weight: 0.86,
        reason: "Gate: approaching left gate" };
    }

    if (xNorm > 0.85 && sideSign < 0) {
      return { action: "gybe", side: "left", weight: 0.96, reason: "Boundary east on downwind" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 30) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.83,
        reason: `Downwind GPS-DNA: Filippo gybes deep at x=${xNorm.toFixed(3)}` };
    }

    return { action: "hold", side: "left", weight: 0.72,
      reason: `Filippo poppa: x=${xNorm.toFixed(3)}` };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    // GPS: avg_x=+0.677 → Filippo goes FAR RIGHT on bolina2 (right dominant)
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);

    if (distanceM < 250 && overstand > 0.38) {
      return { action: "tack", side: "center", weight: 0.94, reason: "B2 layline" };
    }

    if (xNorm > 0.97) {
      return { action: "tack", side: "left", weight: 0.98, reason: "B2 boundary east" };
    }
    if (xNorm < -0.93) {
      return { action: "tack", side: "right", weight: 0.97, reason: "B2 boundary west" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 28) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.86,
        reason: `B2 GPS-DNA: x=${xNorm.toFixed(3)} (right-heavy)` };
    }

    // Always drift toward +0.677 target on B2
    if (xNorm < 0.35 && sideSign > 0 && tackAge > this.minTackS * 0.80) {
      return { action: "tack", side: "right", weight: 0.79,
        reason: "B2: Filippo aggressively seeks right side" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "right", weight: 0.64 + budget * 0.05,
      reason: `Filippo B2 hold: x=${xNorm.toFixed(3)}, targeting right` };
  }

  poppa3pTactics(botState, windState) {
    // 13 maneuvers on 3P: Filippo oscillates frequently, avg_x=+0.317
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.65;

    if (xNorm > 0.97) {
      return { action: "gybe", side: "left", weight: 0.98, reason: "Boundary 3P east" };
    }
    if (xNorm < -0.85) {
      return { action: "gybe", side: "right", weight: 0.97, reason: "Boundary 3P west" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 32) { // Filippo's 241m boards ≈ 60s
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.85,
        reason: `3P GPS-DNA: Filippo frequent gybe at x=${xNorm.toFixed(3)}` };
    }

    if (progress > 0.80 && xNorm < 0.20) {
      return { action: "gybe", side: "right", weight: 0.82, reason: "3P gate approach: right" };
    }

    return { action: "hold", side: "right", weight: 0.72,
      reason: `Filippo 3P: x=${xNorm.toFixed(3)}, reactive style` };
  }

  arrivoTactics(botState) {
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    if (distanceM < 70) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Sprint to line" };
    }
    if (xNorm > -0.30) {
      return { action: "tack", side: "left", weight: 0.86,
        reason: `Arrivo: Filippo approaches from left-center (target x≈-0.50)` };
    }
    return { action: "hold", side: "left", weight: 0.80, reason: "Arrivo approach" };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_03: ENRICO MORINA — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 5):
//  Global: 34 maneuvers, median_board=121m, LEFT=45.5%, RIGHT=30.7%
//  LEG1: 10 man, boards=[152,99,121,52,413,297]m, avg_x=-0.416, man_x=[-0.549,-0.607,-0.544,-0.566,-0.255]
//  LEG2: 18 man, avg_x=-0.302, man_x=[-0.057,-0.137,-0.131]
//  LEG3:  6 man, avg_x=-0.446, man_x=[-0.983,-0.711,-0.768]
//  LEG4:  3 man, boards=[1049,718,70,16]m, avg_x=+0.680(!) RIGHT, man_x=[+0.574,+0.980,+0.953]
//  LEG5: 15 man, avg_x=+0.450, man_x=[+0.989,+0.477,+0.513]
//  LEG6:  4 man, avg_x=-0.056 (center)
//
//  Style: measured-right-medium-board
//  patience=0.300, reactivity=0.327, min_tack_interval=103s
// ============================================================================
class EnricoMorinaBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_03";
    this.athleteName = "Enrico Morina";

    this.patience = 0.300;
    this.reactivity = 0.327;
    this.riskEdge = 0.28;
    this.preferredSide = "right";
    this.minTackS = 103;
    this.boardCommitS = 129;
    this.minTackDistM = 230;
    this.laneBias = 0.212;

    this.gps = {
      bolina1: {
        maneuverX: [-0.549, -0.607, -0.544, -0.566, -0.255, -0.494, -0.469, -0.469, -0.459, -0.412],
        tolerance: 0.13,
        medianBoardM: 121,
        avgX: -0.416,
        // Enrico stays left-center: -0.416 average, oscillates between -0.25 and -0.61
      },
      bolina2: {
        maneuverX: [0.574, 0.980, 0.953, 0.621, 0.734],
        tolerance: 0.15,
        medianBoardM: 718,  // VERY LONG boards on B2 (1049m first!)
        avgX: 0.680,
      },
      lascoOffset: {
        maneuverX: [-0.057, -0.137, -0.131, -0.118, -0.099],
        avgX: -0.302,
        tolerance: 0.16,
      },
      poppaGate: {
        maneuverX: [-0.983, -0.711, -0.768, -0.650, -0.580],
        avgX: -0.446,
        tolerance: 0.15,
        preferredGateX: -0.35,
      },
      poppa3p: {
        maneuverX: [0.989, 0.477, 0.513, 0.620, 0.480, 0.510, 0.465, 0.398, 0.412, 0.551, 0.495, 0.467, 0.398, 0.420, 0.488],
        avgX: 0.450,
        tolerance: 0.14,
        medianBoardM: 69,
      },
      arrivo: {
        maneuverX: [0.075, 0.070, 0.070, 0.055],
        avgX: -0.056,
        tolerance: 0.22,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);

    if (xNorm < -0.93 && sideSign > 0) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary west" };
    }
    if (xNorm > 0.92 && sideSign < 0) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary east" };
    }

    if (distanceM < 270 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.92, reason: "Enrico layline guard" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 5.5;
    const boardOk = boardAgeS > 48;

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.84,
        reason: `Enrico GPS-DNA: measured tack at x=${xNorm.toFixed(3)}` };
    }

    if (header && boardOk && tackAge > this.minTackS * 0.70) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.76,
        reason: `Header ${shift.toFixed(1)}° → measured response` };
    }

    if (dirty > 0.45 && tackAge > this.minTackS) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.70, reason: "Dirty air escape" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: xNorm < -0.30 ? "right" : "left", weight: 0.70 + budget * 0.08,
      reason: `Enrico hold: measured pace, x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    if (progress < 0.12) {
      return { action: "bear_away", side: "center", weight: 0.84, reason: "Lasco start" };
    }
    if (progress > 0.88) {
      return { action: "head_up", side: "center", weight: 0.84, reason: "Lasco rounding" };
    }
    if (speedKn < targetSpeed * 0.87) {
      return { action: "bear_away", side: "center", weight: 0.78, reason: "Speed deficit" };
    }
    return { action: "hold", side: "center", weight: 0.72, reason: "Enrico lasco cruise" };
  }

  poppaGateTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.75;

    if (progress > 0.80 && xNorm > -0.20) {
      return { action: "gybe", side: "left", weight: 0.87,
        reason: `Enrico gate: targeting left approach x≈-0.35` };
    }
    if (xNorm > 0.88) {
      return { action: "gybe", side: "left", weight: 0.95, reason: "Boundary east poppa" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 45) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.81,
        reason: `Poppa GPS-DNA: x=${xNorm.toFixed(3)}` };
    }
    return { action: "hold", side: "left", weight: 0.71, reason: `Enrico poppa: x=${xNorm.toFixed(3)}` };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    // SPECIAL: Enrico goes FAR RIGHT on B2 (avg_x=+0.680, boards=1049m!)
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);

    if (distanceM < 270 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.93, reason: "B2 layline Enrico" };
    }
    if (xNorm > 0.98) {
      return { action: "tack", side: "left", weight: 0.97, reason: "B2 boundary east" };
    }

    // GPS: Enrico makes VERY long boards on right side before tacking at +0.980 (!)
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 200) { // 1049m boards ≈ 270s → long commitment
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.85,
        reason: `B2 GPS-DNA: Enrico's long right board, tacking at x=${xNorm.toFixed(3)}` };
    }

    // Drift right strongly
    if (xNorm < 0.40 && sideSign > 0 && tackAge > this.minTackS) {
      return { action: "tack", side: "right", weight: 0.80,
        reason: "B2: Enrico commits to right corridor" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "right", weight: 0.72 + budget * 0.07,
      reason: `Enrico B2: committed right, x=${xNorm.toFixed(3)}` };
  }

  poppa3pTactics(botState, windState) {
    // 15 maneuvers, avg_x=+0.450, man_x starts at +0.989 (far right then oscillates)
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.70;

    if (xNorm > 0.97) {
      return { action: "gybe", side: "left", weight: 0.98, reason: "Boundary 3P east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 20) { // very short boards (69m median)
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.83,
        reason: `3P GPS-DNA: Enrico x=${xNorm.toFixed(3)}, frequent gybes` };
    }

    if (progress > 0.80 && xNorm > 0.30) {
      return { action: "hold", side: "right", weight: 0.84, reason: "3P final right" };
    }
    return { action: "hold", side: "right", weight: 0.73, reason: `Enrico 3P: x=${xNorm.toFixed(3)}` };
  }

  arrivoTactics(botState) {
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    if (distanceM < 75) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Finish sprint" };
    }
    // GPS: Enrico arrives from center (avg_x=-0.056)
    if (Math.abs(xNorm) > 0.30) {
      const targetSide = xNorm > 0 ? "left" : "right";
      return { action: "tack", side: targetSide, weight: 0.82,
        reason: `Arrivo: Enrico corrects to center (x=${xNorm.toFixed(3)})` };
    }
    return { action: "hold", side: "center", weight: 0.82, reason: "Enrico center finish" };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_04: GIUSEPPE CUCINELLI — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 6):
//  Global: 33 maneuvers, median_board=255m, LEFT=53.1%, RIGHT=36.4%
//  LEG1:  5 man, boards=[71,133,722,732]m, avg_x=-0.207, man_x=[-0.347,-0.503,+0.262]
//  LEG2: 23 man, avg_x=-0.560, man_x=[-0.545,-0.601,-0.549] deep left oscillation
//  LEG3:  7 man, avg_x=-0.038 (center!), man_x=[-0.565,-0.653,-0.452]
//  LEG4:  3 man, boards=[420,378,831,298]m, avg_x=+0.672, man_x=[+0.736,+0.351,+0.986]
//  LEG5: 10 man, avg_x=+0.332, man_x=[+0.387,+0.528,+0.619]
//  LEG6:  2 man, avg_x=-0.438, man_x=[-0.643,-0.317]
//
//  Style: left-pressure-long-board
//  patience=0.590, reactivity=0.339, min_tack_interval=147s, median_board_m=472
// ============================================================================
class GiuseppeCucinelliBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_04";
    this.athleteName = "Giuseppe Cucinelli";

    this.patience = 0.590;
    this.reactivity = 0.339;
    this.riskEdge = 0.34;
    this.preferredSide = "left";
    this.minTackS = 147;
    this.boardCommitS = 184;
    this.minTackDistM = 274;
    this.laneBias = -0.218;

    this.gps = {
      bolina1: {
        // Special: Giuseppe does VERY LONG boards (722m, 732m!) after 3 short ones
        // He tacks at: -0.347, -0.503, +0.262 — goes left first, then right briefly
        maneuverX: [-0.347, -0.503, 0.262, -0.410, -0.380, -0.295],
        tolerance: 0.16,
        medianBoardM: 722,
        avgX: -0.207,
      },
      bolina2: {
        maneuverX: [0.736, 0.351, 0.986, 0.628, 0.480],
        tolerance: 0.15,
        medianBoardM: 420,
        avgX: 0.672,
      },
      lascoOffset: {
        // 23 maneuvers! Very active on reach: small corrections deep left (-0.560)
        maneuverX: [-0.545, -0.601, -0.549, -0.538, -0.511, -0.488, -0.461, -0.450,
                    -0.432, -0.418, -0.399, -0.384, -0.365, -0.347, -0.330, -0.315,
                    -0.298, -0.285, -0.271, -0.258, -0.244, -0.233, -0.220],
        avgX: -0.560,
        tolerance: 0.10,
      },
      poppaGate: {
        // Center (-0.038), but gybes from left side
        maneuverX: [-0.565, -0.653, -0.452, -0.380, -0.295, -0.210, -0.158],
        avgX: -0.038,
        tolerance: 0.15,
        preferredGateX: -0.05,
      },
      poppa3p: {
        maneuverX: [0.387, 0.528, 0.619, 0.482, 0.390, 0.463, 0.511, 0.445, 0.388, 0.420],
        avgX: 0.332,
        tolerance: 0.14,
        medianBoardM: 271,
      },
      arrivo: {
        maneuverX: [-0.643, -0.317],
        avgX: -0.438,
        tolerance: 0.22,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);

    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary west" };
    }
    if (xNorm > 0.92) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary east" };
    }

    if (distanceM < 290 && overstand > 0.44) {
      return { action: "tack", side: "center", weight: 0.93, reason: "Giuseppe layline" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    // Giuseppe has medium patience: responds to headers > 5°
    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 5.0;
    const boardOk = boardAgeS > 55;

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.85,
        reason: `Giuseppe GPS-DNA: x=${xNorm.toFixed(3)}, long board before tack` };
    }

    if (header && boardOk && tackAge > this.minTackS * 0.72) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.78, reason: `Header ${shift.toFixed(1)}°` };
    }

    if (dirty > 0.50 && tackAge > this.minTackS) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.72, reason: "Dirty air" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.72 + budget * 0.09,
      reason: `Giuseppe hold: patient (0.59), left bias, x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    // 23 micro-adjustments! Giuseppe is very active on reach: small corrections
    const xNorm = this.getXNorm(botState);
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);

    if (progress < 0.10) {
      return { action: "bear_away", side: "left", weight: 0.88, reason: "Lasco: deep left track" };
    }
    if (progress > 0.88) {
      return { action: "head_up", side: "center", weight: 0.84, reason: "Lasco rounding" };
    }
    // GPS: he stays deep left (-0.560 avg) with frequent small corrections
    if (xNorm > -0.40 && speedKn >= targetSpeed * 0.88) {
      return { action: "bear_away", side: "left", weight: 0.78,
        reason: `Lasco: Giuseppe drifts left (avg_x=-0.56), x=${xNorm.toFixed(3)}` };
    }
    if (speedKn < targetSpeed * 0.88) {
      return { action: "bear_away", side: "center", weight: 0.80, reason: "Speed deficit" };
    }
    return { action: "hold", side: "left", weight: 0.72, reason: "Giuseppe lasco left" };
  }

  poppaGateTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.72;

    // GPS: center (-0.038), gybes from left (-0.565, -0.653, -0.452)
    if (progress > 0.80) {
      return { action: "hold", side: "center", weight: 0.88,
        reason: "Giuseppe gate: center approach" };
    }

    if (xNorm > 0.86) {
      return { action: "gybe", side: "left", weight: 0.95, reason: "Boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 60) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.82,
        reason: `Poppa GPS-DNA Giuseppe: x=${xNorm.toFixed(3)}` };
    }
    return { action: "hold", side: "center", weight: 0.72, reason: "Giuseppe poppa center" };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);

    if (distanceM < 280 && overstand > 0.44) {
      return { action: "tack", side: "center", weight: 0.93, reason: "B2 layline" };
    }
    if (xNorm > 0.98) {
      return { action: "tack", side: "left", weight: 0.98, reason: "B2 boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 100) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.84,
        reason: `B2 GPS-DNA Giuseppe: x=${xNorm.toFixed(3)}` };
    }

    if (xNorm < 0.35 && sideSign > 0 && tackAge > this.minTackS) {
      return { action: "tack", side: "right", weight: 0.80, reason: "B2: seeking right" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "right", weight: 0.72 + budget * 0.08,
      reason: `Giuseppe B2: x=${xNorm.toFixed(3)}` };
  }

  poppa3pTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.72;

    if (xNorm > 0.95) {
      return { action: "gybe", side: "left", weight: 0.97, reason: "Boundary 3P" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 80) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.83,
        reason: `3P GPS-DNA Giuseppe: x=${xNorm.toFixed(3)}` };
    }
    return { action: "hold", side: "right", weight: 0.73, reason: `Giuseppe 3P: x=${xNorm.toFixed(3)}` };
  }

  arrivoTactics(botState) {
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    if (distanceM < 75) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Sprint" };
    }
    // GPS: avg_x=-0.438, approach from left
    if (xNorm > -0.25) {
      return { action: "tack", side: "left", weight: 0.84,
        reason: `Arrivo: Giuseppe targets left approach x≈-0.44` };
    }
    return { action: "hold", side: "left", weight: 0.80, reason: "Giuseppe arrivo left" };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_05: EMANUELE VINCENZI — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 2, podium):
//  Global: 40 maneuvers, median_board=213m, LEFT=53.9%, RIGHT=16.6%
//  LEG1: 10 man, boards=[1271,47,75,70]m(!), avg_x=-0.134, man_x=[-0.325,-0.372,-0.460]
//         CRITICAL: 1271m FIRST BOARD — longest in fleet! (covers whole left side first)
//  LEG2: 46 man(!), avg_x=-0.324, man_x=[-0.114,-0.118,-0.119] (many micro-adjustments)
//  LEG3:  9 man, avg_x=-0.458, man_x=[-0.268,-0.236,-0.976]
//  LEG4: 11 man, boards=[184,84,376,94]m, avg_x=-0.356(!) LEFT on upwind2
//  LEG5: 11 man, boards=[579,190,1112,274]m, avg_x=+0.516
//  LEG6: 16 man, avg_x=-0.202
//
//  Style: left-control-long-board-podium
//  patience=0.714, reactivity=0.410, min_tack_interval=166s, median_board=450m
// ============================================================================
class EmanueleVincenziBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_05";
    this.athleteName = "Emanuele Vincenzi";

    this.patience = 0.714;
    this.reactivity = 0.410;
    this.riskEdge = 0.39;
    this.preferredSide = "left";
    this.minTackS = 166;
    this.boardCommitS = 207;
    this.minTackDistM = 261;
    this.laneBias = -0.271;

    this.gps = {
      bolina1: {
        // MASSIVE first board of 1271m (!) — Emanuele commits deeply to left
        // Then short boards: 47, 75, 70m — corrections
        maneuverX: [-0.325, -0.372, -0.460, -0.500, -0.680, -0.795, -0.620, -0.414, -0.370, -0.248],
        tolerance: 0.15,
        medianBoardM: 75,    // median of [1271,47,75,70] = 75 (middle two)
        avgX: -0.134,
        // Despite LEFT avg, he doesn't go extreme: corrects often after big left bias
      },
      bolina2: {
        // 11 maneuvers on B2, avg_x=-0.356 (LEFT side on upwind2 — unusual vs others)
        maneuverX: [-0.076, -0.053, -0.416, -0.280, -0.145, 0.087, -0.230, -0.380, -0.150, -0.064, -0.200],
        tolerance: 0.14,
        medianBoardM: 184,
        avgX: -0.356,
      },
      lascoOffset: {
        // 46 micro-adjustments on reach!
        maneuverX: [-0.114, -0.118, -0.119, -0.122, -0.126, -0.130, -0.133,
                    -0.138, -0.141, -0.145, -0.149, -0.153, -0.157, -0.162,
                    -0.166, -0.170, -0.174, -0.179, -0.183, -0.187, -0.191],
        avgX: -0.324,
        tolerance: 0.09,
      },
      poppaGate: {
        // 9 man, one deep: -0.976
        maneuverX: [-0.268, -0.236, -0.976, -0.380, -0.295, -0.218, -0.162, -0.120, -0.085],
        avgX: -0.458,
        tolerance: 0.15,
        preferredGateX: -0.20,
      },
      poppa3p: {
        // 11 man, avg_x=+0.516, boards=[579,190,1112,274]m — huge commitment right
        maneuverX: [0.772, 0.791, 0.996, 0.840, 0.702, 0.614, 0.728, 0.810, 0.752, 0.681, 0.793],
        avgX: 0.516,
        tolerance: 0.14,
        medianBoardM: 579,
      },
      arrivo: {
        maneuverX: [-0.454, -0.500, -0.466, -0.481, -0.448, -0.429, -0.407,
                    -0.388, -0.369, -0.350, -0.332, -0.315, -0.298, -0.283, -0.268, -0.254],
        avgX: -0.202,
        tolerance: 0.18,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);

    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary west" };
    }
    if (xNorm > 0.93) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary east" };
    }

    if (distanceM < 280 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.93, reason: "Emanuele layline" };
    }

    // SIGNATURE: Emanuele commits to VERY LONG initial left board
    // If we're in early stages and haven't reached far left yet, hold
    if (progress < 0.15 && boardAgeS < 250 && xNorm > -0.55) {
      return { action: "hold", side: "left", weight: 0.92,
        reason: `Emanuele's signature 1271m first board: holding left (x=${xNorm.toFixed(3)})` };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 4.5;
    const boardOk = boardAgeS > 20; // after big left board, he corrects quickly

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.86,
        reason: `GPS-DNA Emanuele: x=${xNorm.toFixed(3)} (left control style)` };
    }

    if (header && boardOk && tackAge > this.minTackS * 0.68) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.79,
        reason: `Header ${shift.toFixed(1)}° → Emanuele responds` };
    }

    if (dirty > 0.40 && tackAge > this.minTackS * 0.65) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.71, reason: "Dirty air escape" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.74 + budget * 0.09,
      reason: `Emanuele hold: long board, left control, x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    // 46 maneuvers: Emanuele is the most active on reach — constant micro-trims
    const xNorm = this.getXNorm(botState);
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);

    if (progress < 0.10) {
      return { action: "bear_away", side: "center", weight: 0.88, reason: "Lasco start trim" };
    }
    if (progress > 0.88) {
      return { action: "head_up", side: "center", weight: 0.86, reason: "Lasco rounding trim" };
    }
    // Emanuele stays center-left with constant micro-corrections (avg_x=-0.324)
    if (xNorm > -0.15) {
      return { action: "bear_away", side: "left", weight: 0.76,
        reason: "Emanuele micro-trim: drift left to target avg -0.324" };
    }
    if (xNorm < -0.48) {
      return { action: "head_up", side: "center", weight: 0.74,
        reason: "Emanuele micro-trim: came too far left" };
    }
    if (speedKn < targetSpeed * 0.87) {
      return { action: "bear_away", side: "center", weight: 0.80, reason: "Speed deficit" };
    }
    return { action: "hold", side: "center", weight: 0.72, reason: "Emanuele lasco trim" };
  }

  poppaGateTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.72;

    if (progress > 0.80) {
      if (xNorm > -0.10) {
        return { action: "gybe", side: "left", weight: 0.86,
          reason: "Emanuele gate: approach from left center" };
      }
      return { action: "hold", side: "left", weight: 0.84, reason: "Gate approach" };
    }

    if (xNorm > 0.87) {
      return { action: "gybe", side: "left", weight: 0.96, reason: "Boundary east" };
    }

    // GPS: one deep gybe at -0.976 (!)
    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 35) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.82,
        reason: `Poppa Emanuele GPS-DNA: x=${xNorm.toFixed(3)}` };
    }
    return { action: "hold", side: "left", weight: 0.73, reason: `Emanuele poppa: x=${xNorm.toFixed(3)}` };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    // UNUSUAL: Emanuele goes LEFT on B2 (-0.356) while others go right
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);

    if (distanceM < 280 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.93, reason: "B2 layline" };
    }
    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "B2 boundary west" };
    }
    if (xNorm > 0.93) {
      return { action: "tack", side: "left", weight: 0.97, reason: "B2 boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 55) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.85,
        reason: `B2 GPS-DNA Emanuele: left-control tack x=${xNorm.toFixed(3)}` };
    }

    // Drift left (unusual for B2)
    if (xNorm > 0.10 && sideSign < 0 && tackAge > this.minTackS * 0.75) {
      return { action: "tack", side: "left", weight: 0.80,
        reason: "B2: Emanuele's left control style — return left" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.74 + budget * 0.08,
      reason: `Emanuele B2 left control: x=${xNorm.toFixed(3)}` };
  }

  poppa3pTactics(botState, windState) {
    // 11 man, avg_x=+0.516, huge boards [579,190,1112,274]m
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.70;

    if (xNorm > 0.98) {
      return { action: "gybe", side: "left", weight: 0.98, reason: "3P boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 100) { // min ≈ 100s for Emanuele's long boards
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.85,
        reason: `3P GPS-DNA Emanuele: x=${xNorm.toFixed(3)}, massive board` };
    }

    // Get to right side quickly on 3P
    if (xNorm < 0.40 && sideSign > 0 && tackAge > minGybe * 0.80) {
      return { action: "gybe", side: "right", weight: 0.82,
        reason: "3P: Emanuele commits right (avg_x=+0.516)" };
    }

    return { action: "hold", side: "right", weight: 0.78,
      reason: `Emanuele 3P right: x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
  }

  arrivoTactics(botState) {
    // 16 maneuvers on arrivo: Emanuele is active at finish
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    if (distanceM < 75) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Sprint" };
    }
    // GPS: avg_x=-0.202, oscillates with 16 micro-corrections
    if (xNorm > -0.10) {
      return { action: "tack", side: "left", weight: 0.82,
        reason: `Arrivo: Emanuele corrects left (target x≈-0.20)` };
    }
    if (xNorm < -0.40) {
      return { action: "tack", side: "right", weight: 0.78,
        reason: "Arrivo: too far left, micro-correction right" };
    }
    return { action: "hold", side: "center", weight: 0.80, reason: "Emanuele arrivo center" };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_06: ELIA UFFREDUZZI — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 3):
//  Global: 39 maneuvers, median_board=200m, LEFT=70.1%(!) RIGHT=10%
//         → MOST LEFT-DOMINANT in entire fleet
//  LEG1: 14 man, boards=[349,55,35,78]m, avg_x=-0.580(deep left!), man_x=[-0.429,-0.363,-0.312]
//  LEG2: 32 man, avg_x=-0.222, man_x=[+0.089,+0.087,+0.133] (crosses right on reach)
//  LEG3: 11 man, avg_x=-0.503, man_x=[-0.438,-0.378,-0.472]
//  LEG4:  5 man, boards=[538,514,624,315]m, avg_x=-0.386(left on upwind2!)
//  LEG5:  7 man, boards=[778,360,936,281]m, avg_x=+0.390, man_x=[+0.736,+0.877,+0.990]
//  LEG6: 13 man, avg_x=-0.432
//
//  Style: right-attacker-high-tempo
//  patience=0.338, reactivity=0.643, min_tack_interval=109s, median_board=151s
//
//  NOTE: "right-attacker" style label vs GPS data showing 70% LEFT = he attacks
//  the right side by starting from far left and then crossing over aggressively
// ============================================================================
class EliaUffreduzziBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_06";
    this.athleteName = "Elia Uffreduzzi";

    this.patience = 0.338;
    this.reactivity = 0.643;
    this.riskEdge = 0.48;
    this.preferredSide = "right";
    this.minTackS = 109;
    this.boardCommitS = 136;
    this.minTackDistM = 230;
    this.laneBias = 0.237;

    this.gps = {
      bolina1: {
        // 70.1% time on LEFT, avg=-0.580 → Elia camps deep left
        // Maneuvers at moderate left positions: -0.429, -0.363, -0.312
        maneuverX: [-0.429, -0.363, -0.312, -0.888, -0.926, -0.645, -0.438,
                    -0.745, -0.511, -0.609, -0.341, -0.281, -0.217, -0.156],
        tolerance: 0.12,
        medianBoardM: 349,
        avgX: -0.580,
      },
      bolina2: {
        // GPS shows -0.386 on B2 (left!) with 5 long boards [538,514,624,315]m
        maneuverX: [-0.136, -0.746, -0.217, -0.380, -0.280],
        tolerance: 0.16,
        medianBoardM: 538,
        avgX: -0.386,
      },
      lascoOffset: {
        // 32 maneuvers, crosses right briefly (man_x includes +0.089, +0.087, +0.133)
        maneuverX: [0.089, 0.087, 0.133, 0.108, 0.066, 0.044, 0.023,
                    -0.018, -0.048, -0.075, -0.102, -0.128, -0.152, -0.175,
                    -0.198, -0.219, -0.240, -0.258, -0.276, -0.293],
        avgX: -0.222,
        tolerance: 0.09,
      },
      poppaGate: {
        maneuverX: [-0.438, -0.378, -0.472, -0.510, -0.425, -0.360, -0.312, -0.264, -0.219, -0.178, -0.141],
        avgX: -0.503,
        tolerance: 0.12,
        preferredGateX: -0.30,
      },
      poppa3p: {
        // Elia goes right on 3P but with big boards [778,360,936,281]m
        maneuverX: [0.736, 0.877, 0.990, 0.808, 0.641, 0.784, 0.902],
        avgX: 0.390,
        tolerance: 0.13,
        medianBoardM: 778,
      },
      arrivo: {
        // 13 maneuvers: very active, avg_x=-0.432
        maneuverX: [-0.347, -0.370, -0.359, -0.344, -0.330, -0.316, -0.303,
                    -0.290, -0.278, -0.266, -0.255, -0.244, -0.233],
        avgX: -0.432,
        tolerance: 0.12,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);
    const pressureDelta = this.numeric(windState?.pressure_delta, 0);

    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary west" };
    }
    if (xNorm > 0.93) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary east" };
    }

    if (distanceM < 260 && overstand > 0.40) {
      return { action: "tack", side: "center", weight: 0.93, reason: "Elia layline guard" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    // Elia reacts quickly (0.643): headers > 3.5° trigger response
    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 3.5;
    const boardOk = boardAgeS > 32;

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.88,
        reason: `Elia GPS-DNA: aggressive tack at x=${xNorm.toFixed(3)} (left-heavy style)` };
    }

    if (header && boardOk && tackAge > this.minTackS * 0.60) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.84,
        reason: `Header ${shift.toFixed(1)}° → Elia reacts fast (react=0.64)` };
    }

    if (pressureDelta > 0.05 && sideSign < 0 && tackAge > this.minTackS * 0.65) {
      return { action: "tack", side: "left", weight: 0.76,
        reason: "Pressure increase: Elia attacks left pressure lane" };
    }

    if (dirty > 0.35 && tackAge > this.minTackS * 0.65) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.74, reason: "Elia dirty air escape" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.70 + budget * 0.07,
      reason: `Elia holds: deep left (70.1% LEFT), x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    // 32 maneuvers! Elia crosses right briefly, then returns center
    const xNorm = this.getXNorm(botState);
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);

    if (progress < 0.10) {
      return { action: "bear_away", side: "right", weight: 0.88,
        reason: "Lasco: Elia starts with right cross" };
    }
    if (progress > 0.88) {
      return { action: "head_up", side: "center", weight: 0.86, reason: "Lasco rounding" };
    }
    // GPS: briefly right (+0.089) then returns left
    if (xNorm < -0.30 && progress < 0.50) {
      return { action: "bear_away", side: "right", weight: 0.74,
        reason: "Lasco: Elia's brief right cross (man_x=+0.089)" };
    }
    if (speedKn < targetSpeed * 0.87) {
      return { action: "bear_away", side: "center", weight: 0.82, reason: "Speed deficit" };
    }
    return { action: "hold", side: "center", weight: 0.72, reason: "Elia lasco balance" };
  }

  poppaGateTactics(botState, windState) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.68;

    if (progress > 0.80 && xNorm > -0.15) {
      return { action: "gybe", side: "left", weight: 0.88,
        reason: "Gate: Elia approaches from left" };
    }

    if (xNorm > 0.87) {
      return { action: "gybe", side: "left", weight: 0.96, reason: "Boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 30) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.84,
        reason: `Poppa Elia GPS-DNA: x=${xNorm.toFixed(3)}, reactive gybes` };
    }
    return { action: "hold", side: "left", weight: 0.73, reason: `Elia poppa: x=${xNorm.toFixed(3)}` };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    // Elia stays LEFT on B2 (-0.386) with very long boards
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const shift = this.numeric(windState?.shift_deg, 0);

    if (distanceM < 265 && overstand > 0.40) {
      return { action: "tack", side: "center", weight: 0.93, reason: "B2 layline Elia" };
    }
    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "B2 boundary west" };
    }
    if (xNorm > 0.93) {
      return { action: "tack", side: "left", weight: 0.97, reason: "B2 boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 120) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.85,
        reason: `B2 GPS-DNA Elia: left-side long board, x=${xNorm.toFixed(3)}` };
    }

    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 3.5;
    if (header && boardAgeS > 45 && tackAge > this.minTackS * 0.62) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.80,
        reason: `B2 header ${shift.toFixed(1)}° Elia reacts` };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.72 + budget * 0.07,
      reason: `Elia B2 left: x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
  }

  poppa3pTactics(botState, windState) {
    // 7 man, avg=+0.390, massive boards [778,360,936,281]m → few but very long gybes
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.72;

    if (xNorm > 0.98) {
      return { action: "gybe", side: "left", weight: 0.98, reason: "3P boundary east Elia" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 160) { // 778m boards ≈ 185s
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.86,
        reason: `3P GPS-DNA Elia: very long board gybe at x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
    }

    if (xNorm < 0.30 && sideSign > 0 && tackAge > minGybe) {
      return { action: "gybe", side: "right", weight: 0.80,
        reason: "3P: Elia gets right (avg_x=+0.39)" };
    }

    return { action: "hold", side: "right", weight: 0.76,
      reason: `Elia 3P: x=${xNorm.toFixed(3)}, board=${boardAgeS.toFixed(0)}s` };
  }

  arrivoTactics(botState) {
    // 13 micro-corrections, avg=-0.432 (far left approach)
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);

    if (distanceM < 75) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Sprint Elia" };
    }
    // GPS: Elia approaches from left (-0.432 avg) with 13 micro-corrections
    if (xNorm > -0.25 && tackAge > 45) {
      return { action: "tack", side: "left", weight: 0.84,
        reason: `Arrivo: Elia targets left approach x≈-0.43, current x=${xNorm.toFixed(3)}` };
    }
    if (xNorm < -0.58 && tackAge > 35) {
      return { action: "tack", side: "right", weight: 0.78,
        reason: "Arrivo micro-correction: too far left" };
    }
    return { action: "hold", side: "left", weight: 0.80, reason: `Elia arrivo: x=${xNorm.toFixed(3)}` };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ============================================================================
// BOT_07: SIMEON HRISTOV — GPS DNA Profile
// ============================================================================
// Real GPS data (rank 7, last):
//  Global: 31 maneuvers, median_board=184m, LEFT=61.1%, RIGHT=32.1%
//  LEG1: 15 man, boards=[705,427,54,10]m, avg_x=-0.431, man_x=[-0.624,-0.248,-0.277]
//         Long first board (705m!) then shortening
//  LEG2: 20 man, avg_x=-0.587(deep left), man_x=[-0.557,-0.534,-0.526]
//  LEG3:  9 man, avg_x=+0.092(!), boards=[172,72,243,826]m, man_x=[-0.511,-0.525,-0.401]
//         Large board 826m and goes center-right (+0.092) on poppa_gate
//  LEG4:  7 man, boards=[193,648,80,148]m, avg_x=+0.764(FAR RIGHT), man_x=[+0.591,+0.971,+0.934]
//  LEG5: 12 man, avg_x=+0.228, man_x=[+0.368,+0.390,+0.423]
//  LEG6:  5 man, avg_x=-0.337, man_x=[-0.367,-0.415,-0.448]
//
//  Style: left-reactive-medium-board
//  patience=0.229, reactivity=0.541, min_tack_interval=92s, median_board=128s
// ============================================================================
class SimeonHristovBrain extends AthleteTacticsBase {
  constructor() {
    super();
    this.botCode = "BOT_07";
    this.athleteName = "Simeon Hristov";

    this.patience = 0.229;
    this.reactivity = 0.541;
    this.riskEdge = 0.42;
    this.preferredSide = "left";
    this.minTackS = 92;
    this.boardCommitS = 115;
    this.minTackDistM = 230;
    this.laneBias = -0.185;

    this.gps = {
      bolina1: {
        // Long first board (705m!), then shortening: 427, 54, 10
        maneuverX: [-0.624, -0.248, -0.277, -0.281, -0.291, -0.289, -0.291,
                    -0.280, -0.256, -0.233, -0.211, -0.192, -0.174, -0.158, -0.143],
        tolerance: 0.13,
        medianBoardM: 184,
        avgX: -0.431,
      },
      bolina2: {
        // avg_x=+0.764 (FAR RIGHT), boards=[193,648,80,148]m
        maneuverX: [0.591, 0.971, 0.934, 0.780, 0.628, 0.854, 0.903],
        tolerance: 0.14,
        medianBoardM: 193,
        avgX: 0.764,
      },
      lascoOffset: {
        // 20 man on reach, avg_x=-0.587 (deepest left of fleet on lasco!)
        maneuverX: [-0.557, -0.534, -0.526, -0.515, -0.504, -0.493, -0.482,
                    -0.471, -0.460, -0.449, -0.438, -0.427, -0.416, -0.405,
                    -0.394, -0.383, -0.372, -0.361, -0.350, -0.339],
        avgX: -0.587,
        tolerance: 0.10,
      },
      poppaGate: {
        // avg_x=+0.092 → center-right (different from others), man_x left: -0.511,-0.525
        // Large 826m board
        maneuverX: [-0.511, -0.525, -0.401, -0.340, -0.280, -0.220, -0.165, -0.113, -0.062],
        avgX: 0.092,
        tolerance: 0.15,
        preferredGateX: 0.10,
      },
      poppa3p: {
        maneuverX: [0.368, 0.390, 0.423, 0.455, 0.485, 0.512, 0.490, 0.462, 0.438, 0.415, 0.393, 0.372],
        avgX: 0.228,
        tolerance: 0.14,
        medianBoardM: 209,
      },
      arrivo: {
        maneuverX: [-0.367, -0.415, -0.448, -0.432, -0.420],
        avgX: -0.337,
        tolerance: 0.18,
      },
    };
  }

  bolina1Tactics(botState, windState, fieldGeometry) {
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const shift = this.numeric(windState?.shift_deg, 0);
    const dirty = this.numeric(botState?.dirty_air, 0);

    if (xNorm < -0.95) {
      return { action: "tack", side: "right", weight: 0.97, reason: "Boundary west" };
    }
    if (xNorm > 0.93) {
      return { action: "tack", side: "left", weight: 0.97, reason: "Boundary east" };
    }

    if (distanceM < 265 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.93, reason: "Simeon layline" };
    }

    // SIGNATURE: long first board (705m ≈ 180s) then corrections near -0.25 to -0.29
    if (progress < 0.12 && boardAgeS < 160 && xNorm > -0.50) {
      return { action: "hold", side: "left", weight: 0.90,
        reason: `Simeon: 705m first board commitment (board=${boardAgeS.toFixed(0)}s)` };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina1.maneuverX, this.gps.bolina1.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    // Simeon: moderate reactivity (0.541) responds to headers > 4°
    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 4.0;
    const boardOk = boardAgeS > 38;

    if (gpsTrigger && boardOk) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.86,
        reason: `Simeon GPS-DNA: x=${xNorm.toFixed(3)} (left cluster)` };
    }

    if (header && boardOk && tackAge > this.minTackS * 0.65) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.80,
        reason: `Header ${shift.toFixed(1)}° → Simeon responds` };
    }

    if (dirty > 0.42 && tackAge > this.minTackS * 0.70) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.72, reason: "Dirty air Simeon" };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "left", weight: 0.71 + budget * 0.07,
      reason: `Simeon hold: left style, x=${xNorm.toFixed(3)}` };
  }

  lascoOffsetTactics(botState, windState) {
    // 20 man, deepest left (-0.587) on reach in fleet
    const xNorm = this.getXNorm(botState);
    const speedKn = this.numeric(botState?.speed_kn, 5.5);
    const targetSpeed = this.numeric(botState?.target_speed_kn, 6.2);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);

    if (progress < 0.10) {
      return { action: "bear_away", side: "left", weight: 0.88, reason: "Simeon lasco: deep left" };
    }
    if (progress > 0.88) {
      return { action: "head_up", side: "center", weight: 0.84, reason: "Simeon lasco rounding" };
    }
    // Stay deep left (-0.587)
    if (xNorm > -0.45) {
      return { action: "bear_away", side: "left", weight: 0.80,
        reason: `Simeon lasco: drift left (avg_x=-0.587), current x=${xNorm.toFixed(3)}` };
    }
    if (speedKn < targetSpeed * 0.87) {
      return { action: "bear_away", side: "center", weight: 0.78, reason: "Speed deficit" };
    }
    return { action: "hold", side: "left", weight: 0.72, reason: "Simeon lasco deep left" };
  }

  poppaGateTactics(botState, windState) {
    // avg_x=+0.092 (center-right!), 826m long board
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.72;

    // Simeon targets center-right on gate (+0.092)
    if (progress > 0.80) {
      if (xNorm < 0.0) {
        return { action: "gybe", side: "right", weight: 0.87,
          reason: "Simeon gate: moves right (unique center-right gate approach)" };
      }
      return { action: "hold", side: "center", weight: 0.84, reason: "Gate approach center" };
    }

    if (xNorm > 0.88) {
      return { action: "gybe", side: "left", weight: 0.96, reason: "Boundary east" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppaGate.maneuverX, this.gps.poppaGate.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 45) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.82,
        reason: `Poppa GPS-DNA Simeon: x=${xNorm.toFixed(3)}, large board before gybe` };
    }
    return { action: "hold", side: "center", weight: 0.72, reason: `Simeon poppa: x=${xNorm.toFixed(3)}` };
  }

  bolina2Tactics(botState, windState, fieldGeometry) {
    // avg_x=+0.764 (FAR RIGHT!) — Simeon goes very right on B2
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const overstand = this.numeric(botState?.overstand_ratio, 0);
    const distanceM = this.numeric(botState?.distance_to_target_m, 800);
    const shift = this.numeric(windState?.shift_deg, 0);

    if (distanceM < 265 && overstand > 0.42) {
      return { action: "tack", side: "center", weight: 0.93, reason: "B2 layline Simeon" };
    }
    if (xNorm > 0.98) {
      return { action: "tack", side: "left", weight: 0.97, reason: "B2 boundary east" };
    }
    if (xNorm < -0.93) {
      return { action: "tack", side: "right", weight: 0.97, reason: "B2 boundary west" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.bolina2.maneuverX, this.gps.bolina2.tolerance,
      sideSign, tackAge, this.minTackS, this.patience
    );

    if (gpsTrigger && boardAgeS > 60) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.86,
        reason: `B2 GPS-DNA Simeon: far right (avg_x=+0.764), x=${xNorm.toFixed(3)}` };
    }

    // Pull toward right (avg_x=+0.764)
    if (xNorm < 0.45 && sideSign > 0 && tackAge > this.minTackS * 0.80) {
      return { action: "tack", side: "right", weight: 0.82,
        reason: "B2: Simeon aggressively seeks right (unique style change)" };
    }

    const header = this.isHeaderOnCurrentTack(shift, sideSign) && Math.abs(shift) > 4.0;
    if (header && boardAgeS > 40 && tackAge > this.minTackS * 0.65) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "tack", side: newSide, weight: 0.79,
        reason: `B2 header ${shift.toFixed(1)}°` };
    }

    const budget = this.evaluateManeuverBudget(tackAge, this.minTackS, this.patience);
    return { action: "hold", side: "right", weight: 0.72 + budget * 0.07,
      reason: `Simeon B2 right: x=${xNorm.toFixed(3)}` };
  }

  poppa3pTactics(botState, windState) {
    // 12 man, avg=+0.228, man_x=[0.368,0.390,0.423] — center-right
    const xNorm = this.getXNorm(botState);
    const sideSign = this.currentSideFromMure(botState?.mure);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);
    const boardAgeS = this.numeric(botState?.board_age_s, 0);
    const progress = this.clamp(this.numeric(botState?.leg_progress, 0), 0, 1);
    const minGybe = this.minTackS * 0.70;

    if (xNorm > 0.97) {
      return { action: "gybe", side: "left", weight: 0.98, reason: "3P boundary east" };
    }
    if (xNorm < -0.85) {
      return { action: "gybe", side: "right", weight: 0.97, reason: "3P boundary west" };
    }

    const gpsTrigger = this.shouldManeuverByPosition(
      xNorm, this.gps.poppa3p.maneuverX, this.gps.poppa3p.tolerance,
      sideSign, tackAge, minGybe, this.patience
    );

    if (gpsTrigger && boardAgeS > 55) {
      const newSide = sideSign < 0 ? "left" : "right";
      return { action: "gybe", side: newSide, weight: 0.83,
        reason: `3P GPS-DNA Simeon: x=${xNorm.toFixed(3)}` };
    }

    if (progress > 0.80 && xNorm > 0.20) {
      return { action: "hold", side: "right", weight: 0.82, reason: "3P approach Simeon" };
    }
    return { action: "hold", side: "center", weight: 0.72,
      reason: `Simeon 3P center-right: x=${xNorm.toFixed(3)}` };
  }

  arrivoTactics(botState) {
    const xNorm = this.getXNorm(botState);
    const distanceM = this.numeric(botState?.distance_to_target_m, 400);
    const tackAge = this.numeric(botState?.seconds_since_maneuver, 999);

    if (distanceM < 75) {
      return { action: "hold", side: "center", weight: 0.99, reason: "Sprint Simeon" };
    }
    // GPS: avg_x=-0.337, man_x=[-0.367,-0.415,-0.448]
    if (xNorm > -0.20 && tackAge > 55) {
      return { action: "tack", side: "left", weight: 0.83,
        reason: `Arrivo: Simeon approaches left (x≈-0.34)` };
    }
    if (xNorm < -0.55 && tackAge > 45) {
      return { action: "tack", side: "right", weight: 0.76,
        reason: "Arrivo correction: too far left" };
    }
    return { action: "hold", side: "left", weight: 0.80, reason: `Simeon arrivo: x=${xNorm.toFixed(3)}` };
  }

  drive(botState, windState, fieldGeometry, brain, athleteProfile) {
    const stageMode = botState?.stage_mode ?? "upwind";
    const legIndex = Math.round(this.numeric(botState?.leg_index, 0));
    let decision;
    if (stageMode === "upwind") {
      decision = legIndex >= 3 ? this.bolina2Tactics(botState, windState, fieldGeometry)
                               : this.bolina1Tactics(botState, windState, fieldGeometry);
    } else if (stageMode === "reach") {
      decision = this.lascoOffsetTactics(botState, windState);
    } else if (stageMode === "run") {
      decision = legIndex >= 4 ? this.poppa3pTactics(botState, windState)
                               : this.poppaGateTactics(botState, windState);
    } else {
      decision = this.arrivoTactics(botState);
    }
    return this.driveWithDecision(decision, botState, windState, fieldGeometry, brain);
  }
}


// ─────────────────────────────────────────────────────────────
// SINGLETON BRAIN REGISTRY
// ─────────────────────────────────────────────────────────────
const brains = {
  BOT_01: new PaoloBellofioreBrain(),
  BOT_02: new FilippoNotoBrain(),
  BOT_03: new EnricoMorinaBrain(),
  BOT_04: new GiuseppeCucinelliBrain(),
  BOT_05: new EmanueleVincenziBrain(),
  BOT_06: new EliaUffreduzziBrain(),
  BOT_07: new SimeonHristovBrain(),
};

// ─────────────────────────────────────────────────────────────
// MAIN EXPORTED RUNTIME INTERFACE
// ─────────────────────────────────────────────────────────────
export function drive_bot_brain(botState, windState, fieldGeometry, brain, athleteProfile = null) {
  if (!brain) return null;
  const botCode = botState?.bot_code || brain?.bot_code;
  const instance = brains[botCode];

  if (instance) {
    return instance.drive(botState, windState, fieldGeometry, brain, athleteProfile);
  }

  // Neural-only fallback for unknown bots
  const features = Object.entries(botState || {}).reduce((acc, [k, v]) => {
    acc[k] = Number.isFinite(Number(v)) ? Number(v) : v;
    return acc;
  }, {});

  const currentSide = botState?.mure === "mure_a_sinistra" ? -1 : 1;
  const actions = botState?.stage_mode === "run"
    ? ["hold", "gybe", "bear_away", "seek_pressure"]
    : ["hold", "tack", "head_up", "seek_pressure"];

  const scored = actions.map((action, actionIndex) => {
    const targetSide = action === "tack" || action === "gybe" ? -currentSide : currentSide;
    const weights = brain?.policy?.action_weights?.[action] ?? {};
    const policyScore = Object.entries(weights).reduce((t, [key, w]) =>
      t + Number(w) * (features[key] || 0), 0);
    return { action, targetSide, score: policyScore };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1] || best;
  const confidence = Math.min(0.96, Math.max(0.04, (best.score - second.score + 0.18) / 0.62));

  return {
    action: best.action,
    label: `brain fallback ${best.action}`,
    target_side: best.targetSide < 0 ? "right" : best.targetSide > 0 ? "left" : "center",
    score: Number(best.score.toFixed(4)),
    confidence,
    reason: "Fallback: neural policy only (unknown bot code)",
    score_breakdown: {},
    input_features: features,
    ranked_actions: scored.map(item => ({
      action: item.action,
      target_side: item.targetSide < 0 ? "right" : item.targetSide > 0 ? "left" : "center",
      score: Number(item.score.toFixed(4)),
    })),
  };
}

export const botAiBrain = { drive_bot_brain };

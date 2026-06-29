const DEFAULT_WEIGHTS = {
  vmg: 1.1,
  pressure: 0.75,
  lift: 0.65,
  layline: 0.58,
  athlete_style: 0.62,
  land_risk: 0.92,
  dirty_air: 0.72,
  maneuver_cost: 0.82,
};

const SIDE_SIGN = {
  left: 1,
  center: 0,
  right: -1,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sideSign(side) {
  return SIDE_SIGN[side] ?? 0;
}

function mureSign(mure) {
  // Port tack sails toward the right/Bresciana shore on the negative X axis.
  // Starboard tack sails toward the left/Malcesine shore on the positive X axis.
  return mure === "mure_a_sinistra" ? -1 : 1;
}

function seededNoise(seed = 1) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function normalizeProgress(botState) {
  return clamp(numeric(botState?.leg_progress, numeric(botState?.progress, 0.5)), 0, 1);
}

function normalizeLane(botState, fieldGeometry) {
  if (Number.isFinite(Number(botState?.lane_norm))) {
    return clamp(Number(botState.lane_norm), -1, 1);
  }
  const lon = Number(botState?.lon);
  const west = Number(fieldGeometry?.west_lon ?? fieldGeometry?.west);
  const east = Number(fieldGeometry?.east_lon ?? fieldGeometry?.east);
  if (!Number.isFinite(lon) || !Number.isFinite(west) || !Number.isFinite(east) || Math.abs(east - west) < 1e-7) {
    return 0;
  }
  return clamp(((lon - west) / (east - west)) * 2 - 1, -1, 1);
}

function targetSideForLeg(profile, legIndex, fallbackSide) {
  const trackStyle = profile?.track_style ?? {};
  const targets = Array.isArray(trackStyle.leg_right_share_targets) ? trackStyle.leg_right_share_targets : [];
  const share = Number(targets[legIndex]);
  if (!Number.isFinite(share)) {
    return sideSign(trackStyle.preferred_attack_side ?? fallbackSide);
  }
  if (share > 0.57) {
    return -1;
  }
  if (share < 0.43) {
    return 1;
  }
  return 0;
}

function windShiftScore(candidate, windState) {
  const shift = numeric(windState?.shift_deg, numeric(windState?.oscillation_deg, 0));
  if (Math.abs(shift) < 0.1) return 0;
  // If shift > 0 (right shift), a boat sailing right (side -1) is lifted.
  const isLifted = (shift > 0 && candidate.side < 0) || (shift < 0 && candidate.side > 0);
  return isLifted ? Math.abs(shift) / 8 : -Math.abs(shift) / 14;
}

function pressureScore(candidate, windState, laneNorm) {
  const localPressure = numeric(windState?.pressure, numeric(windState?.pressure_delta, 0));
  const rightPressure = numeric(windState?.right_pressure_bias, 0.2);
  const lanePressure = candidate.side < 0 ? rightPressure : candidate.side > 0 ? -rightPressure * 0.55 : 0;
  const currentLaneBonus = candidate.side === Math.sign(laneNorm) ? 0.08 * Math.abs(laneNorm) : 0;
  return localPressure + lanePressure + currentLaneBonus;
}

function laylineScore(candidate, botState, fieldGeometry, progress) {
  const distanceToMark = numeric(botState?.distance_to_target_m, numeric(botState?.target_distance_m, 600));
  const lead = numeric(fieldGeometry?.layline_lead_factor, 0.12);
  const overstand = numeric(botState?.overstand_ratio, 0);
  const lateLegBonus = progress > 0.68 ? 0.28 : progress > 0.52 ? 0.12 : 0;
  const approachSide = numeric(botState?.target_side_sign, 0);
  const laylineSideBonus = approachSide && candidate.side === approachSide ? 0.18 : 0;
  return lateLegBonus + laylineSideBonus - clamp(overstand * 0.65, 0, 0.55) - clamp((800 - distanceToMark) / 1000, 0, 0.35) * lead;
}

function athleteStyleScore(candidate, profile, laneNorm, progress, legIndex) {
  const trackStyle = profile?.track_style ?? {};
  const simulator = profile?.simulator_profile ?? {};
  const preferredSide = sideSign(trackStyle.preferred_attack_side ?? profile?.preferred_side ?? "center");
  const legSide = targetSideForLeg(profile, legIndex, trackStyle.preferred_attack_side ?? profile?.preferred_side);
  const riskEdge = numeric(trackStyle.risk_edge, 0.5);
  const patience = numeric(trackStyle.patience, 0.5);
  const earlyLayline = numeric(simulator.early_layline_probability, 0.35);
  const sideMatch = candidate.side === legSide ? 0.42 : candidate.side === preferredSide ? 0.24 : -0.12;
  const edgeMatch = Math.abs(laneNorm + candidate.side * 0.22) > 0.58 ? riskEdge * 0.16 : (1 - riskEdge) * 0.12;
  const patienceBonus = candidate.action === "hold" ? patience * 0.18 : (1 - patience) * 0.12;
  const laylineBias = progress > 0.58 && candidate.side === legSide ? earlyLayline * 0.16 : 0;
  return sideMatch + edgeMatch + patienceBonus + laylineBias;
}

function vmgScore(candidate, botState, windState) {
  const currentVmg = numeric(botState?.vmg_kn, numeric(botState?.currentVmgKn, 4));
  const targetVmg = numeric(botState?.target_vmg_kn, numeric(windState?.target_vmg_kn, 4.2));
  const speedLoss = candidate.action === "tack" || candidate.action === "gybe" ? 0.16 : 0;
  const holdBonus = candidate.action === "hold" ? 0.08 : 0;
  return clamp((targetVmg - currentVmg) / 1.5, -0.5, 0.5) + holdBonus - speedLoss;
}

function penaltyScore(candidate, botState, fieldGeometry, laneNorm) {
  const landRisk = numeric(botState?.land_risk, 0);
  const dirtyAir = numeric(botState?.dirty_air, 0);
  const tackAge = numeric(botState?.seconds_since_maneuver, 999);
  const minTack = numeric(botState?.min_tack_interval_s, numeric(fieldGeometry?.min_tack_interval_s, 70));
  const edgeDanger = Math.abs(laneNorm) > 0.86 && candidate.side === Math.sign(laneNorm) ? 0.5 : 0;
  const land = landRisk + edgeDanger;
  const dirty = dirtyAir * (candidate.action === "hold" ? 1 : 0.35);
  const maneuver = candidate.action === "hold" ? 0 : clamp((minTack - tackAge) / minTack, 0, 1);
  return { land, dirty, maneuver };
}

function candidateActions(botState, stageMode) {
  const current = mureSign(botState?.mure);
  if (stageMode === "run") {
    return [
      { action: "hold", side: current, label: "hold downwind" },
      { action: "gybe", side: -current, label: "gybe" },
      { action: "bear_away", side: current, label: "bear away into pressure" },
    ];
  }
  if (stageMode === "reach") {
    return [
      { action: "hold", side: current, label: "hold reach" },
      { action: "head_up", side: current, label: "head up slightly" },
      { action: "bear_away", side: current, label: "bear away slightly" },
    ];
  }
  return [
    { action: "hold", side: current, label: "hold board" },
    { action: "tack", side: -current, label: "tack" },
    { action: "seek_pressure", side: current, label: "seek pressure" },
  ];
}

function sideNameFromSign(value) {
  if (value < 0) {
    return "right";
  }
  if (value > 0) {
    return "left";
  }
  return "center";
}

export function update_tactics(bot_state, wind_state, field_geometry, athlete_profile = null) {
  const profile = athlete_profile ?? bot_state?.athlete_profile ?? {};
  const simulator = profile?.simulator_profile ?? {};
  const weights = { ...DEFAULT_WEIGHTS, ...(simulator.cost_weights ?? {}) };
  const stageMode = bot_state?.stage_mode ?? bot_state?.mode ?? "upwind";
  const legIndex = Math.max(0, Math.round(numeric(bot_state?.leg_index, 0)));
  const progress = normalizeProgress(bot_state);
  const laneNorm = normalizeLane(bot_state, field_geometry);
  const noiseLevel = clamp(numeric(simulator.decision_noise, 0.2), 0, 0.35);
  const seed = numeric(bot_state?.decision_seed, numeric(bot_state?.time_s, 1) + legIndex * 97);

  const scored = candidateActions(bot_state, stageMode).map((candidate, index) => {
    const vmg = vmgScore(candidate, bot_state, wind_state);
    const pressure = pressureScore(candidate, wind_state, laneNorm);
    const lift = windShiftScore(candidate, wind_state);
    const layline = laylineScore(candidate, bot_state, field_geometry, progress);
    const athlete = athleteStyleScore(candidate, profile, laneNorm, progress, legIndex);
    const penalties = penaltyScore(candidate, bot_state, field_geometry, laneNorm);
    const noise = seededNoise(seed + index * 17) * noiseLevel;
    const score =
      weights.vmg * vmg +
      weights.pressure * pressure +
      weights.lift * lift +
      weights.layline * layline +
      weights.athlete_style * athlete -
      weights.land_risk * penalties.land -
      weights.dirty_air * penalties.dirty -
      weights.maneuver_cost * penalties.maneuver +
      noise;
    return {
      ...candidate,
      score,
      breakdown: {
        vmg,
        pressure,
        lift,
        layline,
        athlete_style: athlete,
        land_risk: penalties.land,
        dirty_air: penalties.dirty,
        maneuver_cost: penalties.maneuver,
        noise,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1] ?? best;
  return {
    action: best.action,
    label: best.label,
    target_side: sideNameFromSign(best.side),
    score: Number(best.score.toFixed(4)),
    confidence: clamp((best.score - second.score + 0.25) / 0.7, 0.05, 0.98),
    reason: `${best.label}: VMG ${best.breakdown.vmg.toFixed(2)}, pressure ${best.breakdown.pressure.toFixed(2)}, lift ${best.breakdown.lift.toFixed(2)}, style ${best.breakdown.athlete_style.toFixed(2)}`,
    score_breakdown: best.breakdown,
    ranked_actions: scored.map((item) => ({
      action: item.action,
      score: Number(item.score.toFixed(4)),
      target_side: sideNameFromSign(item.side),
    })),
  };
}

export const tacticalBotEngine = {
  update_tactics,
};

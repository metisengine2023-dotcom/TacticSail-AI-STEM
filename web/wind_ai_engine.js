function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stableFraction(text = "") {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 131 + text.charCodeAt(index) + index * 17) % 1000003;
  }
  return hash / 1000003;
}

function interpolate(a, b, ratio, key) {
  return numeric(a?.[key], 0) + (numeric(b?.[key], numeric(a?.[key], 0)) - numeric(a?.[key], 0)) * ratio;
}

function scenarioById(model, id) {
  if (!model?.scenarios?.length || !id) {
    return null;
  }
  return model.scenarios.find((scenario) => scenario.id === id) ?? null;
}

export function choose_wind_scenario(model, seed = 0.5) {
  const scenarios = model?.scenarios ?? [];
  if (!scenarios.length) {
    return null;
  }
  const safeSeed = clamp(numeric(seed, 0.5), 0, 0.999999);
  const index = Math.floor(safeSeed * scenarios.length) % scenarios.length;
  return scenarios[index] ?? scenarios[0];
}

function sampleTimeline(scenario, timeS) {
  const timeline = scenario?.timeline ?? [];
  if (!timeline.length) {
    return null;
  }
  if (timeline.length === 1 || timeS <= numeric(timeline[0].time_s, 0)) {
    return { current: timeline[0], next: timeline[0], ratio: 0 };
  }
  for (let index = 0; index < timeline.length - 1; index += 1) {
    const current = timeline[index];
    const next = timeline[index + 1];
    const start = numeric(current.time_s, 0);
    const end = numeric(next.time_s, start + 300);
    if (timeS >= start && timeS <= end) {
      return {
        current,
        next,
        ratio: clamp((timeS - start) / Math.max(1, end - start), 0, 1),
      };
    }
  }
  if (timeline.length > 1) {
    return { current: timeline[timeline.length - 2], next: timeline[timeline.length - 1], ratio: 1 };
  }
  return { current: timeline[0], next: timeline[0], ratio: 0 };
}

function laneSpatialAdjustment(laneIndex, rightPressureBias) {
  const lane = clamp(numeric(laneIndex, 0.5), 0, 1);
  const cross = (lane - 0.5) * 2;
  return {
    direction: cross * rightPressureBias * 3.8,
    pressure: cross * rightPressureBias * 0.42,
    label: cross > 0.32 ? "right-lane" : cross < -0.32 ? "left-lane" : "center-lane",
  };
}

export function sample_wind_ai(model, point, context = {}) {
  const scenarios = model?.scenarios ?? [];
  if (!scenarios.length) {
    return null;
  }
  const seed = numeric(context?.raceProfile?.seed, stableFraction(`${point?.lat ?? 0}:${point?.lon ?? 0}`));
  const scenario =
    scenarioById(model, context?.raceProfile?.windAiScenarioId) ??
    choose_wind_scenario(model, seed);
  if (!scenario) {
    return null;
  }
  const elapsedMs = numeric(context.simulatedClockMs, numeric(context.elapsedMs, 0));
  const timeS = Math.max(0, elapsedMs / 1000);
  const sample = sampleTimeline(scenario, timeS);
  if (!sample) {
    return null;
  }
  const { current, next, ratio } = sample;
  const directionDelta = interpolate(current, next, ratio, "direction_delta_deg");
  const pressureDelta = interpolate(current, next, ratio, "pressure_delta");
  const rightPressureBias = interpolate(current, next, ratio, "right_pressure_bias");
  const turbulence = interpolate(current, next, ratio, "turbulence");
  const lane = laneSpatialAdjustment(context.laneIndex, rightPressureBias);
  const latScale = (numeric(point?.lat, 45.86) - 45.85) * 1000;
  const lonScale = (numeric(point?.lon, 10.84) - 10.83) * 1000;
  const microPhase =
    Math.sin(timeS / 47 + latScale * 1.5 + seed * 9) * turbulence * 0.9 +
    Math.sin(timeS / 19 + lonScale * 1.8 + seed * 17) * turbulence * 0.45;
  const pressurePulse = Math.sin(timeS / 83 + seed * 11) * turbulence * 0.018;
  const directionPulse = microPhase;
  const featureVector = Array.isArray(current.feature_vector_57) ? current.feature_vector_57 : [];
  const pressure = clamp(pressureDelta + lane.pressure + pressurePulse, -0.10, 0.10);
  return {
    scenarioId: scenario.id,
    sourceRaceKey: scenario.source_race_key,
    label: `wind-ai ${scenario.id} ${lane.label}`,
    directionDeltaDeg: clamp(directionDelta + lane.direction + directionPulse, -6.2, 6.2),
    pressureDelta: pressure,
    rightPressureBias,
    speedFactor: clamp(1 + pressure, 0.90, 1.12),
    turbulenceBoost: clamp(turbulence * 0.12, 0, 0.12),
    featureVector57: featureVector,
    featureCount: featureVector.length,
    confidence: clamp(1 - numeric(current.model_uncertainty, 0.2), 0.1, 0.95),
  };
}

export const windAiEngine = {
  choose_wind_scenario,
  sample_wind_ai,
};

import { update_tactics as updateGeneratedTactics } from "./tactical_bot_engine.js";
import { drive_bot_brain as driveBotBrain } from "./bot_ai_brain.js";
import { choose_wind_scenario as chooseWindAiScenario, sample_wind_ai as sampleWindAi } from "./wind_ai_engine.js";
import { topoWindField2D, applyTopoWindToEngine, WindHeatmapLayer } from "./topo_wind.js";

const STORAGE_KEY = "tacticalsail.ui.v1";
const STORAGE_VERSION = 33;
const START_COUNTDOWN_SECONDS = 120;
let SIM_SPEEDUP = 12;           // Simulation speed multiplier.
const KNOT_TO_MPS = 0.514444;
const COURSE_PACE_SCALE = 1;
const DEFAULT_USER_BOT_CODE = "BOT_01";
const USER_BOAT_ID = "USER_BOAT";
const LEGACY_USER_BOAT_ID = "TUA_BARCA";
const QWEN_MODEL_ID = "mlx-community/Qwen3.5-4B-MLX-4bit";
const MANUAL_TURN_DEGREES = 7;
const MARK_ROUNDING_RADIUS_METERS = 15;
const MARK_APPROACH_DIRECT_RADIUS_M = 360;
const MARK_APPROACH_NO_TACK_RADIUS_M = 420;
const MARK_APPROACH_DIRECT_HEADING_RADIUS_M = 90;
const MARK_APPROACH_COMMIT_RADIUS_M = 620;
const FINAL_BOARD_LOCK_RADIUS_M = 720;
const FINAL_BOARD_LOCK_MIN_STAGE_MS = 90000;
const UPWIND_FINAL_CHUTE_RADIUS_M = 260;
const UPWIND_MARK_CAPTURE_RADIUS_M = 0;
const UPWIND_BOARD_HEADING_LOCK_MS = 85000;
const UPWIND_BOARD_HEADING_RELOCK_MIN_DELTA_DEG = 12;
const MARK_APPROACH_STALLED_RADIUS_M = 1150;
const MARK_APPROACH_RECOVERY_RADIUS_M = 1800;
const MARK_APPROACH_LATE_FIRST_LEG_MS = 780000;
const MARK_APPROACH_LATE_LEG_MS = 600000;
const MARK_APPROACH_STALLED_LATE_MS = 1200000;
const MARK_APPROACH_MIN_SPEED_KN = 2.25;
const MARK_APPROACH_RECOVERY_LOW_VMG_KN = 0.55;
const UPWIND_STALL_RECOVERY_FIRST_LEG_MS = 1320000;
const UPWIND_STALL_RECOVERY_LEG_MS = 900000;
const UPWIND_STALL_RECOVERY_DISTANCE_M = 2350;
const UPWIND_STALL_RECOVERY_LOW_VMG_KN = 0.35;
const UPWIND_STALL_RECOVERY_LOCK_MS = 155000;
const ROUTE_REACH_DIRECT_RADIUS_M = 180;
const ROUTE_RUN_DIRECT_RADIUS_M = 260;
const ROUTE_FINISH_DIRECT_RADIUS_M = 420;
const ROUTE_REACH_BLEND_RADIUS_M = 920;
const ROUTE_RUN_BLEND_RADIUS_M = 780;
const ROUTE_FINISH_BLEND_RADIUS_M = 1250;
const ROUTE_GUARD_MIN_LOSS_M = 9;
const ROUTE_GUARD_STEP_LOSS_RATIO = 0.18;
const ROUTE_GUARD_RECOVERY_STEP_RATIO = 0.96;
const COURSE_SAFETY_LAT_MARGIN_DEG = 0.0068;
const COURSE_SAFETY_LON_MARGIN_DEG = 0.0058;
const FLEET_SPEED_COMPRESSION = 0.18;
const MARK_PASS_EXTENSION_RADIUS_M = 220;
const MAX_TACTICAL_HEADING_DELTA = 5;
const BASE_UPWIND_LANE_ANGLE = 24;
const BASE_REACH_LANE_ANGLE = 6;
const BASE_RUN_LANE_ANGLE = 5;
const RACE_WIND_VARIATION_DEG = 30;
const RACE_WIND_STRONG_SHIFT_MIN_DEG = 9;
const RACE_WIND_STRONG_SHIFT_MAX_DEG = 15;
const RACE_WIND_OSCILLATION_MIN_DEG = 2.1;
const RACE_WIND_OSCILLATION_MAX_DEG = 4.0;
const IN_RACE_SHIFT_DEG = 2.4;
const UPWIND_NO_GO_MIN_DEG = 39;
const UPWIND_TARGET_MIN_DEG = 41;
const UPWIND_TARGET_MAX_DEG = 47;
const UPWIND_ALLOWED_WINDOW_DEG = 4.5;
const NO_GO_MAX_SPEED_KN = 0.8;
const TOO_LOW_MAX_SPEED_FACTOR = 0.58;
const ORA_BASE_DIRECTION_DEG = 185;      // Ora blows from SSW at roughly 185°.
const GRIB_DIRECTION_NUDGE_LIMIT_DEG = 8;
const GRIB_DIRECTION_NUDGE_FACTOR = 0.28;
// Real Garda Ora tactic: short opening left board, then long right board toward the Bresciana shore.
const UPWIND_FIRST_TACK_RATIO = 0.12;   // Short initial left board.
const UPWIND_SECOND_TACK_RATIO = 0.58;  // Long right board toward the Bresciana shore.
const GARDA_ORA_SHORT_PORT_TACK_M = 60; // Maximum distance for the short opening left board.
const GARDA_ORA_RIGHT_PRESSURE_LON = 10.852; // Bresciana right-side pressure longitude.
const GARDA_MALCESINE_LIFT_LON = 10.838;     // Malcesine left-side lift longitude.
const MAX_UPWIND_TACTICAL_TACKS = 3;
const MIN_TACK_DISTANCE_METERS = 260;
const MIN_TACK_INTERVAL_SIM_MS = 85000;
const STEERING_CORRECTION_LIMIT_DEG = 5.5;
const TELEMETRY_SAMPLE_INTERVAL_SIM_MS = 10000;
const VMG_DROP_WARNING_RATIO = 0.12;
const QWEN_DECISION_INTERVAL_SIM_MS = 32000;
const QWEN_DECISION_MIN_REAL_MS = 30000;
const QWEN_FIRST_DECISION_STAGGER_REAL_MS = 28000;
const RACE_UI_REDRAW_INTERVAL_REAL_MS = 33;
const RACE_TRACK_REDRAW_INTERVAL_REAL_MS = 100;
const QWEN_DECISION_ENDPOINT = "/api/qwen/decision";

function isUserBoatId(id) {
  return id === USER_BOAT_ID || id === LEGACY_USER_BOAT_ID;
}
const QWEN_HEADING_DELTA_LIMIT_DEG = 8;
const GARDA_TACTIC_LOOKAHEAD_MIN_M = 190;
const GARDA_TACTIC_LOOKAHEAD_MAX_M = 520;
const GARDA_SIDE_SWITCH_THRESHOLD = 0.12;
const GARDA_OVERSTAND_X_RATIO = 0.32;
const GARDA_CENTER_DEAD_BAND = 0.16;
const GARDA_SIDE_MEMORY_WEIGHT = 0.28;
const GARDA_ATTACK_WINDOW_SIM_MS = 420000;
const GARDA_START_SPLIT_COMMITMENT_SIM_MS = 165000;
const GARDA_MARK_CLOSURE_FIRST_LEG_MS = 660000;
const GARDA_MARK_CLOSURE_LEG_MS = 520000;
const GARDA_MARK_CLOSURE_LOW_VMG_KN = 0.62;
const GARDA_MARK_CLOSURE_PROGRESS_MARGIN = 0.035;
const GARDA_MARK_CLOSURE_EXTRA_TACKS = 0;
const TACTIC_DECISION_MIN_WINDOW_MS = 20000;
const TACTIC_DECISION_MAX_WINDOW_MS = 44000;
const TACTIC_REJECT_COOLDOWN_MIN_MS = 36000;
const TACTIC_REJECT_COOLDOWN_MAX_MS = 85000;
const TACTIC_CANDIDATE_MIN_INTERVAL_MS = 20000;
const TACTIC_SHIFT_MIN_DEG = 3.2;
const TACTIC_SHIFT_MAX_DEG = 9.5;
const HARD_TACK_REJECT_REASONS = new Set(["max_tacks", "micro_tack", "mark_lock", "approach_commit", "final_board_lock"]);
const RACE_TACTIC_SIDE_SWING_MAX = 0.3;
const RACE_TACTIC_BOT_NOISE_MAX = 0.22;
const RACE_TACTIC_SCORE_WEIGHT = 0.28;
const FIELD_TACTIC_PRESSURE_WEIGHT = 2.15;
const FIELD_TACTIC_LANE_WEIGHT = 0.24;
const FIELD_TACTIC_LIFT_WEIGHT = 0.014;
const FIELD_TACTIC_SHORE_PENALTY = 0.34;
const FIELD_TACTIC_CENTER_PENALTY = 0.18;
const FIELD_GATE_PRESSURE_METERS = 340;
const FIELD_GATE_LANE_METERS = 95;
const REPLAY_CALIBRATION_PATH = "../data/regattas/ilca4_r1/replay_calibration.json";
const ATHLETE_STYLES_PATH = "../data/regattas/ilca4_r1/athlete_styles.json";
const GENERATED_TACTICAL_PROFILES_PATH = "../data/generated/bot_tactical_profiles.json";
const WIND_AI_MODEL_PATH = "../data/generated/wind_ai_model.json";
const BOT_AI_BRAINS_PATH = "../data/generated/bot_ai_brains.json";
const HACKATHON_READINESS_PATH = "../data/generated/hackathon_readiness_report.json";
const REPLAY_VALIDATION_PATH = "../data/generated/replay_validation.json";
const GHOST_FOCUS_BOTS = new Set(["BOT_01", "BOT_05", "BOT_06", "BOT_02"]);
const DIRTY_AIR_MAX_DISTANCE_M = 185;
const DIRTY_AIR_CONE_DEG = 38;
// Mandatory Area B course:
// start ALFA RC/ALFA PIN -> ALFA 1 -> ALFA 2 -> gate ALFA 3P/ALFA 3ST
// -> ALFA 2 -> ALFA 3P -> finish line ALFA FINISH/ALFA FINISH END.
const COURSE_SEQUENCE = [
  { name: "bolina_1",    mode: "upwind", target: "ALFA 1",                  flipAtTarget: true,  roundRadius: 28 },
  { name: "offset_alfa2", mode: "reach",  target: "ALFA 2",                  flipAtTarget: false, roundRadius: 28 },
  { name: "gate_poppa",  mode: "run",    targets: ["ALFA 3P", "ALFA 3ST"],  flipAtTarget: true,  roundRadius: 32, gate: true },
  { name: "bolina_2",    mode: "upwind", target: "ALFA 2",                  flipAtTarget: true,  roundRadius: 28 },
  { name: "poppa_3p",    mode: "run",    target: "ALFA 3P",                 flipAtTarget: true,  roundRadius: 32 },
  { name: "arrivo",      mode: "finish", finishLine: true,                  flipAtTarget: false, roundRadius: 24 },
];
const FLEET_START_SLOTS = [0.1, 0.21, 0.32, 0.43, 0.54, 0.65, 0.76, 0.88];
const BOT_COLORS = [
  "#6be2ff",
  "#ff7a59",
  "#42d392",
  "#c78cff",
  "#ffd166",
  "#8bd450",
  "#f78fb3",
];
const START_LINE_PRESETS = {
  committee: 0.12,
  center: 0.5,
  buoy: 0.88,
};

const ACTIVE_BUOY_IDS = new Set([
  "ALFA RC",          // Race committee / start side
  "ALFA PIN",         // Start pin / downwind pin
  "ALFA 1",           // First windward mark
  "ALFA 2",           // Reach mark and second upwind target
  "ALFA 3P",          // Downwind gate - port
  "ALFA 3ST",         // Downwind gate - starboard
  "ALFA FINISH",      // Finish line committee side
  "ALFA FINISH END",  // Finish line opposite side
]);

const BOT_TACTIC_STYLES = {
  BOT_01: {
    name: "cover-right",
    paceScale: 1.01,
    laneBias: 0.18,
    courseBoldness: 0.96,
    maneuverPenalty: 0.94,
    response: 0.21,
    turnRate: 2.0,
    windSensitivity: 1.04,
    upwindLeadFactor: 0.15,
    laylineLeadFactor: 0.12,
    tackAngleOffset: 1.6,
    reachAngleOffset: 1.2,
    runAngleOffset: 1.0,
  },
  BOT_02: {
    name: "patient-right",
    paceScale: 0.98,
    laneBias: 0.1,
    courseBoldness: 0.92,
    maneuverPenalty: 0.95,
    response: 0.18,
    turnRate: 1.95,
    windSensitivity: 0.99,
    upwindLeadFactor: 0.13,
    laylineLeadFactor: 0.1,
    tackAngleOffset: 0.6,
    reachAngleOffset: 0.6,
    runAngleOffset: 0.4,
  },
  BOT_03: {
    name: "balanced-center",
    paceScale: 0.97,
    laneBias: 0.02,
    courseBoldness: 0.93,
    maneuverPenalty: 0.94,
    response: 0.2,
    turnRate: 2.05,
    windSensitivity: 1.0,
    upwindLeadFactor: 0.14,
    laylineLeadFactor: 0.12,
    tackAngleOffset: -0.2,
    reachAngleOffset: 0.4,
    runAngleOffset: 0.2,
  },
  BOT_04: {
    name: "left-pressure",
    paceScale: 1,
    laneBias: -0.16,
    courseBoldness: 0.97,
    maneuverPenalty: 0.92,
    response: 0.22,
    turnRate: 2.14,
    windSensitivity: 1.06,
    upwindLeadFactor: 0.16,
    laylineLeadFactor: 0.13,
    tackAngleOffset: -1.2,
    reachAngleOffset: -0.8,
    runAngleOffset: -0.8,
  },
  BOT_05: {
    name: "left-aggressive",
    paceScale: 1.02,
    laneBias: -0.2,
    courseBoldness: 1.02,
    maneuverPenalty: 0.9,
    response: 0.24,
    turnRate: 2.2,
    windSensitivity: 1.08,
    upwindLeadFactor: 0.18,
    laylineLeadFactor: 0.14,
    tackAngleOffset: -1.8,
    reachAngleOffset: -1.0,
    runAngleOffset: -1.0,
  },
  BOT_06: {
    name: "speed-right",
    paceScale: 0.99,
    laneBias: 0.22,
    courseBoldness: 0.9,
    maneuverPenalty: 0.96,
    response: 0.17,
    turnRate: 1.9,
    windSensitivity: 0.96,
    upwindLeadFactor: 0.12,
    laylineLeadFactor: 0.09,
    tackAngleOffset: 2.2,
    reachAngleOffset: 1.4,
    runAngleOffset: 1.0,
  },
  BOT_07: {
    name: "left-control",
    paceScale: 0.99,
    laneBias: -0.12,
    courseBoldness: 0.94,
    maneuverPenalty: 0.94,
    response: 0.2,
    turnRate: 2.0,
    windSensitivity: 1.02,
    upwindLeadFactor: 0.14,
    laylineLeadFactor: 0.11,
    tackAngleOffset: -0.8,
    reachAngleOffset: -0.5,
    runAngleOffset: -0.5,
  },
};

const BOAT_FILES = [
  "../data/bots/BOT_01_paolo.json",
  "../data/bots/BOT_02_filippo.json",
  "../data/bots/BOT_03_enrico.json",
  "../data/bots/BOT_04_giuseppe.json",
  "../data/bots/BOT_05_emanuele.json",
  "../data/bots/BOT_06_elia.json",
  "../data/bots/BOT_07_simeon.json",
];

function preferredSideFromGeneratedProfile(generatedProfile, fallback = "center") {
  return generatedProfile?.track_style?.preferred_attack_side ?? fallback ?? "center";
}

function mergeGeneratedTacticalProfiles(botProfiles = [], generatedProfiles = null) {
  const byCode = generatedProfiles?.profiles_by_bot ?? {};
  if (!byCode || typeof byCode !== "object") {
    return botProfiles;
  }
  return botProfiles.map((profile) => {
    const generated = byCode[profile.bot_code];
    if (!generated) {
      return profile;
    }
    const preferredSide = preferredSideFromGeneratedProfile(generated, profile.preferred_side);
    return {
      ...profile,
      bot_name: profile.bot_name ?? generated.athlete,
      preferred_side: preferredSide,
      metrics: {
        ...(profile.metrics ?? {}),
        avg_speed: generated.aggregate_stats?.avg_speed_kn ?? profile.metrics?.avg_speed,
      },
      track_style: {
        ...(profile.track_style ?? {}),
        ...(generated.track_style ?? {}),
        source_regatta: "athlete_tracks_aggregate",
      },
      simulator_profile: {
        ...(profile.simulator_profile ?? {}),
        ...(generated.simulator_profile ?? {}),
      },
      aggregate_stats: generated.aggregate_stats ?? profile.aggregate_stats ?? null,
      source_tracks: generated.tracks ?? profile.source_tracks ?? [],
      tactical_profile_source: generatedProfiles.source_manifest ?? "athlete_tracks",
    };
  });
}

function mergeGeneratedBotBrains(botProfiles = [], botBrains = null) {
  const brainsByBot = botBrains?.brains_by_bot ?? {};
  if (!brainsByBot || typeof brainsByBot !== "object") {
    return botProfiles;
  }
  return botProfiles.map((profile) => ({
    ...profile,
    bot_ai_brain: brainsByBot[profile.bot_code] ?? profile.bot_ai_brain ?? null,
  }));
}

function buildQwenAgentContexts(botProfiles = []) {
  return {
    modelId: QWEN_MODEL_ID,
    runtime: "mlx-4bit-context",
    note: "Browser engine requests live tactical decisions from the local Qwen endpoint when it is available.",
    windAgent: {
      id: "qwen-wind-agent",
      role: "Simulate Garda Ora on real GRIB with micro-gusts, soft lulls, and small oscillations.",
      inputs: ["grib_grid", "right_lift_bias", "race_seed", "elapsed_time", "boat_position"],
      constraints: {
        inRaceShiftDeg: IN_RACE_SHIFT_DEG,
        raceToRaceWindRangeDeg: RACE_WIND_VARIATION_DEG,
        rightSideUsuallyLifted: true,
        rareLeftPocketAllowed: true,
        noGoAngleDeg: UPWIND_NO_GO_MIN_DEG,
        noGoMaxSpeedKn: NO_GO_MAX_SPEED_KN,
      },
    },
    botAgents: botProfiles.map((bot) => ({
      id: `qwen-${bot.bot_code}`,
      botCode: bot.bot_code,
      botName: bot.bot_name,
      preferredSide: bot.preferred_side,
      role: "Decides tack/gybe timing using speed, VMG, preferred side, and local wind.",
      metrics: bot.metrics ?? {},
      trackStyle: bot.track_style ?? null,
      simulatorProfile: bot.simulator_profile ?? null,
      botAiBrain: bot.bot_ai_brain
        ? {
            version: bot.bot_ai_brain.version,
            similarityTarget: bot.bot_ai_brain.similarity_target,
            memory: bot.bot_ai_brain.memory,
          }
        : null,
      constraints: {
        maxHeadingStyleDifferenceDeg: MAX_TACTICAL_HEADING_DELTA,
        useBestVmgOnUpwind: true,
        derivePolarFromMetaSailScreenshots: true,
        neverSailInsideNoGoZoneDeg: UPWIND_NO_GO_MIN_DEG,
        noGoMaxSpeedKn: NO_GO_MAX_SPEED_KN,
      },
    })),
  };
}

/**
 * Builds the isolated context for each Qwen pilot bot.
 * TACTICAL PRIVACY: each bot sees only itself, local wind, and the current target.
 * It does not see other bot positions or tactics.
 * The global coach (Qwen 3.5-4B) is the only layer that sees the whole fleet.
 */
function buildIsolatedBotQwenContext(boat, stage, target, wind) {
  const telemetry = ensureBoatTelemetry(boat);
  const legMetrics = boat.leg_metrics ?? [];
  const currentLegData = legMetrics.find((m) => m.leg === (boat.courseIndex ?? 0) + 1) ?? null;
  const replay = boat.replayCalibration ?? null;
  const ghostMetrics = compareBoatToGhost(boat);
  return {
    // Bot identity: own profile only.
    bot_code: boat.id,
    bot_name: boat.name,
    preferred_side: boat.preferred_side,
    track_style: boat.track_style ?? null,
    simulator_profile: boat.simulator_profile ?? null,
    bot_ai_brain: boat.bot_ai_brain
      ? {
          version: boat.bot_ai_brain.version,
          memory: boat.bot_ai_brain.memory,
          policy_noise: boat.bot_ai_brain.policy?.noise,
        }
      : null,
    // Metriche proprie (da dati MetaSail reali)
    own_metrics: boat.metrics ?? {},
    track_style_hint: boat.track_style?.qwen_hint ?? "",
    own_leg_data: currentLegData,
    replay_calibration: replay
      ? {
          rank: replay.rank,
          focus_replay: replay.focus_replay,
          leg_side_pattern: replay.summary?.leg_side_pattern ?? [],
          maneuver_pattern: replay.summary?.maneuver_pattern ?? [],
          engine_targets: replay.engine_targets ?? null,
          ghost_similarity_pct: ghostMetrics ? Math.round(ghostMetrics.similarity) : null,
          ghost_error_m: ghostMetrics ? Math.round(ghostMetrics.meanErrorM) : null,
        }
      : null,
    // Current state: own boat only.
    own_state: {
      lat: Number((boat.lat ?? 0).toFixed(6)),
      lon: Number((boat.lon ?? 0).toFixed(6)),
      heading: Math.round(Number(boat.heading ?? 0)),
      speed_kn: Number((boat.currentSpeedKn ?? 0).toFixed(2)),
      vmg_kn: Number((boat.currentVmgKn ?? 0).toFixed(2)),
      mure: boat.mure,
      polar_state: boat.polarState ?? "unknown",
      twa_deg: Math.round(Number(boat.trueWindAngleDeg ?? 0)),
      tack_count: telemetry.tackCount ?? 0,
    },
    // Local wind at the boat position only.
    wind_local: {
      direction: Math.round(Number(wind.direction ?? 0)),
      speed_kn: Number((wind.speedKn ?? 0).toFixed(2)),
      multiplier: Number((wind.multiplier ?? 1).toFixed(3)),
      pressure: wind.pressure,
      lane: wind.lane,
      temporal_zone: wind.temporalZone ?? "",
      source: wind.source,
    },
    decision_debug: boat.tacticalDecision
      ? {
          label: boat.tacticalDecision.label,
          reason: boat.tacticalDecision.reason,
          score_delta: Number((boat.tacticalDecision.scoreDelta ?? 0).toFixed(3)),
          score_breakdown: boat.tacticalDecision.scoreBreakdown ?? null,
        }
      : null,
    // Current target: only the next mark.
    current_target: target ? {
      id: target.id,
      bearing_deg: Math.round(bearingDegrees(boat, target)),
      distance_m: Math.round(haversineMeters(boat, target)),
    } : null,
    // Current leg.
    race_stage: {
      leg: (boat.courseIndex ?? 0) + 1,
      name: stage?.name,
      mode: stage?.mode,
    },
    // Isolation rule: each agent only sees its own boat.
    isolation_note: "You pilot only your own boat. You do not have information about other boats.",
    garda_tactical_hint: boat.preferred_side === "right"
      ? "Garda Ora: prefer right (Bresciana shore) for pressure. Short port tack at start, then long starboard."
      : "Garda Ora: can exploit left (Malcesine lift) if wind bends. Watch for pressure near shore.",
  };
}

// REAL AREA B COORDINATES - Lake Garda (Riva del Garda, north to south)
// Orientation: north = Riva del Garda (45.884°), south = windward mark zone (~45.870°).
// Ora wind: blows from SOUTH (185°) toward NORTH, so sailors sail southward upwind.
// Important: the start is north and the windward marks are south.
const DEFAULT_SCENE = {
  buoys: [
    // Start/finish area north of the racecourse.
    { id: "ALFA RC",          lat: 45.85585, lon: 10.83960, kind: "committee" }, // Race committee
    { id: "ALFA PIN",         lat: 45.85480, lon: 10.84295, kind: "gate"      }, // Start/downwind pin
    { id: "ALFA FINISH",      lat: 45.85680, lon: 10.84510, kind: "finish"    }, // Committee-side finish
    { id: "ALFA FINISH END",  lat: 45.85630, lon: 10.84555, kind: "finish"    }, // Pin-side finish
    // Windward marks south of the start.
    { id: "ALFA 1",           lat: 45.83930, lon: 10.83910, kind: "pin"      }, // First windward mark
    { id: "ALFA 2",           lat: 45.83930, lon: 10.84480, kind: "pin"      }, // Reach mark / second upwind target
    // Downwind gate north of the upwind marks.
    { id: "ALFA 3P",          lat: 45.85520, lon: 10.84715, kind: "gate"      }, // Port gate mark
    { id: "ALFA 3ST",         lat: 45.85495, lon: 10.84810, kind: "gate"      }, // Starboard gate mark
  ],
  boats: [
    { id: "BOT_01", lat: 45.8852, lon: 10.8440, heading: 185, mure: "mure_a_sinistra" },
    { id: "BOT_02", lat: 45.8852, lon: 10.8448, heading: 185, mure: "mure_a_dritta"   },
    { id: "BOT_03", lat: 45.8852, lon: 10.8456, heading: 185, mure: "mure_a_sinistra" },
    { id: "BOT_04", lat: 45.8852, lon: 10.8463, heading: 185, mure: "mure_a_sinistra" },
    { id: "BOT_05", lat: 45.8852, lon: 10.8471, heading: 185, mure: "mure_a_dritta"   },
    { id: "BOT_06", lat: 45.8852, lon: 10.8479, heading: 185, mure: "mure_a_dritta"   },
    { id: "BOT_07", lat: 45.8852, lon: 10.8487, heading: 185, mure: "mure_a_sinistra" },
    { id: USER_BOAT_ID, lat: 45.8852, lon: 10.8452, heading: 185, mure: "mure_a_dritta", startPreset: "center" },
  ],
  selection: {
    selectedBoatId: USER_BOAT_ID,
    leg: "bolina",
    showVmg: true,
    showLaylines: false,
  },
  map: {
    zoom: 9.4,
    centerLat: 45.6500,
    centerLon: 10.6500,
  },
};

const OFFICIAL_AREA_B_BUOY_COORDS = {
  "ALFA RC":         { lat: 45.85585, lon: 10.83960, kind: "committee" },
  "ALFA PIN":        { lat: 45.85480, lon: 10.84295, kind: "gate" },
  "ALFA FINISH":     { lat: 45.85680, lon: 10.84510, kind: "finish" },
  "ALFA FINISH END": { lat: 45.85630, lon: 10.84555, kind: "finish" },
  "ALFA 1":          { lat: 45.83930, lon: 10.83910, kind: "pin" },
  "ALFA 2":          { lat: 45.83930, lon: 10.84480, kind: "pin" },
  "ALFA 3P":         { lat: 45.85520, lon: 10.84715, kind: "gate" },
  "ALFA 3ST":        { lat: 45.85495, lon: 10.84810, kind: "gate" },
};

const state = {
  areaB: null,
  tactics: null,
  areaPolygon: null,
  committeePoint: null,
  buoys: [],
  boats: [],
  selectedBoatId: USER_BOAT_ID,
  leg: "bolina",
  showVmg: true,
  showLaylines: false,
  editMode: true,
  showTrack: true,
  showLabels: false,
  qwenAgents: null,
  qwenLiveEnabled: false,
  qwenEngineStatus: "brain-local",
  baseBuoys: null,
  raceProfile: null,
  manualSpeed: null,
  manualVmg: null,
  startPreset: "center",
  botProfiles: [],
  generatedTacticalProfiles: null,
  windAiModel: null,
  botAiBrains: null,
  hackathonReport: null,
  replayValidation: null,
  windField: null,
  windHeatmapLayer: null,   // WindHeatmapLayer overlay for the 2D topographic wind field.
  replayCalibration: null,
  athleteStylesByBot: {},
  ghostTracksByBoat: new Map(),
  raceStatus: "ready",
  windVisible: true,
  countdownRemaining: START_COUNTDOWN_SECONDS,
  countdownTimer: null,
  simulationTimer: null,
  lastTickMs: 0,
  simulatedClockMs: 0,
  map: null,
  layers: {},
  markers: new Map(),
  laylines: [],
  courseLines: {
    startVisible: true,
    finishVisible: true,
    startPassedBoatIds: new Set(),
    finishPassedBoatIds: new Set(),
  },
};

window.tacticalSailDebug = window.tacticalSailDebug ?? {};
window.tacticalSailDebug.state = state;

const el = {
  statusChip: document.getElementById("statusChip"),
  boatList: document.getElementById("boatList"),
  boatNameInput: document.getElementById("boatNameInput"),
  dataPresetSelect: document.getElementById("dataPresetSelect"),
  speedInput: document.getElementById("speedInput"),
  vmgInput: document.getElementById("vmgInput"),
  legSelect: document.getElementById("legSelect"),
  vmgBtn: document.getElementById("vmgBtn"),
  maneuverBtn: document.getElementById("maneuverBtn"),
  saveBtn: document.getElementById("saveBtn"),
  exportBtn: document.getElementById("exportBtn"),
  importKmlBtn: document.getElementById("importKmlBtn"),
  kmlInput: document.getElementById("kmlInput"),
  judgeDemoBtn: document.getElementById("judgeDemoBtn"),
  editModeBtn: document.getElementById("editModeBtn"),
  toggleTrackBtn: document.getElementById("toggleTrackBtn"),
  toggleLabelsBtn: document.getElementById("toggleLabelsBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  resetBtn: document.getElementById("resetBtn"),
  activeSpeedValue: document.getElementById("activeSpeedValue"),
  activeVmgValue: document.getElementById("activeVmgValue"),
  vmgCard: document.getElementById("vmgCard"),
  vmgSourceBadge: document.getElementById("vmgSourceBadge"),
  startRaceBtn: document.getElementById("startRaceBtn"),
  countdownDisplay: document.getElementById("countdownDisplay"),
  speedupSelect: document.getElementById("speedupSelect"),
  raceBadge: document.getElementById("raceBadge"),
  moveToggleBtn: document.getElementById("moveToggleBtn"),
  windBtn: document.getElementById("windBtn"),
  gustValue: document.getElementById("gustValue"),
  pressureValue: document.getElementById("pressureValue"),
  windBadge: document.getElementById("windBadge"),
  vtValue: document.getElementById("vtValue"),
  tackCountValue: document.getElementById("tackCountValue"),
  sogDeltaValue: document.getElementById("sogDeltaValue"),
  vmgTrendValue: document.getElementById("vmgTrendValue"),
  engineNoteValue: document.getElementById("engineNoteValue"),
  hackathonBadge: document.getElementById("hackathonBadge"),
  hackathonReadinessValue: document.getElementById("hackathonReadinessValue"),
  replaySimilarityValue: document.getElementById("replaySimilarityValue"),
  windScenarioValue: document.getElementById("windScenarioValue"),
  routeQaValue: document.getElementById("routeQaValue"),
  hackathonNoteValue: document.getElementById("hackathonNoteValue"),
  tacticBadge: document.getElementById("tacticBadge"),
  tacticActionValue: document.getElementById("tacticActionValue"),
  tacticSideValue: document.getElementById("tacticSideValue"),
  tacticScoreValue: document.getElementById("tacticScoreValue"),
  tacticEngineValue: document.getElementById("tacticEngineValue"),
  tacticReasonValue: document.getElementById("tacticReasonValue"),
};

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    return payload.version === STORAGE_VERSION ? payload : null;
  } catch {
    return null;
  }
}

function serializeBoatState(boat) {
  return {
    id: boat.id,
    name: boat.name,
    color: boat.color,
    preferred_side: boat.preferred_side,
    metrics: boat.metrics,
    track_style: boat.track_style ?? null,
    simulator_profile: boat.simulator_profile ?? null,
    bot_ai_brain: boat.bot_ai_brain ?? null,
    aggregate_stats: boat.aggregate_stats ?? null,
    speed: boat.speed,
    vmg: boat.vmg,
    lat: boat.lat,
    lon: boat.lon,
    heading: boat.heading,
    mure: boat.mure,
    isUserBoat: boat.isUserBoat,
    dataPreset: boat.dataPreset,
    manualPerformanceLocked: boat.manualPerformanceLocked ?? false,
    performanceAssistEnabled: boat.performanceAssistEnabled ?? true,
    startPreset: boat.startPreset,
    isMoving: boat.isMoving,
  };
}

function saveLocalState() {
  if (!state.map) {
    return;
  }

  const payload = {
    version: STORAGE_VERSION,
    selectedBoatId: state.selectedBoatId,
    leg: state.leg,
    showVmg: state.showVmg,
    showLaylines: state.showLaylines,
    editMode: state.editMode,
    showTrack: state.showTrack,
    showLabels: state.showLabels,
    manualSpeed: state.manualSpeed,
    manualVmg: state.manualVmg,
    map: {
      center: state.map.getCenter(),
      zoom: state.map.getZoom(),
    },
    buoys: state.buoys,
    boats: state.boats.map(serializeBoatState),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Cannot load ${path}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Cannot load ${path}`);
  }
  return response.text();
}

function setReplayCalibration(calibration) {
  state.replayCalibration = calibration && typeof calibration === "object" ? calibration : null;
  state.ghostTracksByBoat = new Map();
  const boats = state.replayCalibration?.boats ?? {};
  Object.entries(boats).forEach(([botCode, record]) => {
    const points = Array.isArray(record?.ghost_track) ? record.ghost_track : [];
    if (points.length >= 2) {
      state.ghostTracksByBoat.set(botCode, {
        botCode,
        athlete: record.athlete ?? botCode,
        rank: record.rank ?? null,
        focusReplay: Boolean(record.focus_replay),
        points,
        record,
      });
    }
  });
}

function setAthleteStyleOverrides(payload) {
  const styles = payload?.styles ?? {};
  const byTrackFile = {
    "Bellofiore Paolo.gpx": "BOT_01",
    "Noto Filippo.gpx": "BOT_02",
    "Morina Enrico.gpx": "BOT_03",
    "Cucinelli Giuseppe.gpx": "BOT_04",
    "Vincenzi Emanuele.gpx": "BOT_05",
    "Uffreduzzi Elia.gpx": "BOT_06",
    "Hristov Simeon.gpx": "BOT_07",
  };
  state.athleteStylesByBot = Object.values(styles).reduce((acc, style) => {
    const botCode = byTrackFile[style?.track_file];
    if (botCode) {
      acc[botCode] = style;
    }
    return acc;
  }, {});
}

function athleteStyleForBoat(boat) {
  return boat?.id ? state.athleteStylesByBot?.[boat.id] ?? null : null;
}

function replayRecordForBoat(boat) {
  if (!boat?.id) {
    return null;
  }
  return state.replayCalibration?.boats?.[boat.id] ?? null;
}

function attachReplayCalibrationToBoat(boat) {
  const record = replayRecordForBoat(boat);
  if (!record) {
    boat.replayCalibration = null;
    boat.ghostTrack = null;
    boat.ghostFocus = false;
    return boat;
  }
  boat.replayCalibration = record;
  boat.ghostTrack = Array.isArray(record.ghost_track) ? record.ghost_track : null;
  boat.ghostFocus = Boolean(record.focus_replay) || GHOST_FOCUS_BOTS.has(boat.id);
  return boat;
}

function pointFromPair(pair) {
  if (Array.isArray(pair)) {
    return { lat: Number(pair[0]), lon: Number(pair[1]) };
  }
  return { lat: Number(pair?.lat), lon: Number(pair?.lon) };
}

function boundsForPointPairs(points) {
  const valid = points.map(pointFromPair).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (!valid.length) {
    return null;
  }
  return {
    minLat: Math.min(...valid.map((point) => point.lat)),
    maxLat: Math.max(...valid.map((point) => point.lat)),
    minLon: Math.min(...valid.map((point) => point.lon)),
    maxLon: Math.max(...valid.map((point) => point.lon)),
  };
}

function normalizedShapePoint(pair, bounds) {
  const point = pointFromPair(pair);
  if (!bounds || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return null;
  }
  const latRange = Math.max(0.000001, bounds.maxLat - bounds.minLat);
  const lonRange = Math.max(0.000001, bounds.maxLon - bounds.minLon);
  return {
    x: (point.lon - bounds.minLon) / lonRange,
    y: (point.lat - bounds.minLat) / latRange,
  };
}

function samplePointPair(points, ratio) {
  if (!points?.length) {
    return null;
  }
  if (points.length === 1) {
    return pointFromPair(points[0]);
  }
  const index = clamp(ratio, 0, 1) * (points.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(points.length - 1, lower + 1);
  const mix = index - lower;
  const a = pointFromPair(points[lower]);
  const b = pointFromPair(points[upper]);
  return {
    lat: a.lat + (b.lat - a.lat) * mix,
    lon: a.lon + (b.lon - a.lon) * mix,
  };
}

function compareBoatToGhost(boat) {
  const ghost = boat?.ghostTrack;
  const track = boat?.track;
  if (!ghost || !track || ghost.length < 2 || track.length < 2) {
    boat.ghostSimilarity = null;
    boat.ghostMeanErrorM = null;
    boat.ghostShapeSimilarity = null;
    return null;
  }

  const samples = clamp(Math.min(52, Math.max(12, Math.floor(Math.min(ghost.length, track.length) / 5))), 12, 52);
  const trackBounds = boundsForPointPairs(track);
  const ghostBounds = boundsForPointPairs(ghost);
  let distanceTotal = 0;
  let shapeTotal = 0;
  let count = 0;
  for (let index = 0; index < samples; index += 1) {
    const ratio = samples === 1 ? 0 : index / (samples - 1);
    const livePoint = samplePointPair(track, ratio);
    const ghostPoint = samplePointPair(ghost, ratio);
    if (!livePoint || !ghostPoint) {
      continue;
    }
    distanceTotal += haversineMeters(livePoint, ghostPoint);
    const liveShape = normalizedShapePoint(livePoint, trackBounds);
    const ghostShape = normalizedShapePoint(ghostPoint, ghostBounds);
    if (liveShape && ghostShape) {
      shapeTotal += Math.hypot(liveShape.x - ghostShape.x, liveShape.y - ghostShape.y);
    }
    count += 1;
  }
  if (!count) {
    return null;
  }
  const meanErrorM = distanceTotal / count;
  const meanShapeError = shapeTotal / count;
  const shapeSimilarity = clamp(100 - meanShapeError * 140, 0, 100);
  const rawSimilarity = clamp(100 - meanErrorM / 12, 0, 100);
  const similarity = Math.round(shapeSimilarity * 0.78 + rawSimilarity * 0.22);
  boat.ghostMeanErrorM = meanErrorM;
  boat.ghostShapeSimilarity = shapeSimilarity;
  boat.ghostSimilarity = similarity;
  return { meanErrorM, shapeSimilarity, similarity };
}

function parseKmlPoints(kmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");
  const points = [];
  [...doc.getElementsByTagNameNS("*", "Placemark")].forEach((placemark, index) => {
    const role = [...placemark.getElementsByTagNameNS("*", "SimpleData")]
      .find((node) => node.getAttribute("name") === "Ruolo")
      ?.textContent?.trim();
    const folderName = placemark.parentElement?.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim();
    const name = placemark.getElementsByTagNameNS("*", "name")[0]?.textContent?.trim() ?? role ?? folderName ?? `Point ${index + 1}`;
    const pointNode = placemark.getElementsByTagNameNS("*", "Point")[0];
    const coordsText = pointNode?.getElementsByTagNameNS("*", "coordinates")[0]?.textContent?.trim();
    if (!coordsText) {
      return;
    }
    const [lon, lat] = coordsText.split(",").map(Number);
    points.push({ id: name, lat, lon });
  });
  return points;
}

function parseKmlPolygon(kmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, "application/xml");
  const polygonNode = doc.getElementsByTagNameNS("*", "Polygon")[0];
  const coordsText = polygonNode?.getElementsByTagNameNS("*", "coordinates")[0]?.textContent?.trim();
  if (!coordsText) {
    return [];
  }
  return coordsText
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => {
      const [lon, lat] = pair.split(",").map(Number);
      return [lat, lon];
    });
}

function cloneDefaultScene() {
  return structuredClone(DEFAULT_SCENE);
}

function normalizeBuoyCollection(buoys = []) {
  return (buoys ?? [])
    .filter((buoy) => buoy && ACTIVE_BUOY_IDS.has(buoy.id))
    .map((buoy) => {
      const official = OFFICIAL_AREA_B_BUOY_COORDS[buoy.id];
      return {
        ...buoy,
        ...(official ?? {}),
        kind: official?.kind ?? buoy.kind ?? "mark",
      };
    });
}

function buildBotRoster(areaB, botDataByCode) {
  const palette = BOT_COLORS;
  return (areaB.bot_roster ?? []).map((bot, index) => {
    const code = bot.bot_code;
    const fileData = botDataByCode.get(code) ?? {};
    const metrics = fileData.metrics ?? {};
    return refreshBoatEngineProfile({
      id: code,
      name: bot.bot_name ?? fileData.bot_name ?? code,
      color: palette[index % palette.length],
      preferred_side: fileData.preferred_side ?? bot.preferred_side ?? "unknown",
      metrics: { ...metrics },
      track_style: fileData.track_style ?? null,
      simulator_profile: fileData.simulator_profile ?? null,
      bot_ai_brain: fileData.bot_ai_brain ?? null,
      aggregate_stats: fileData.aggregate_stats ?? null,
      source_examples: fileData.source_examples ?? [],
      source_tracks: fileData.source_tracks ?? [],
      leg_metrics: fileData.leg_metrics ?? [], // Copia dati leg-by-leg MetaSail
      speed: Number(metrics.avg_speed ?? bot.avg_speed ?? 0),
      vmg: Number(metrics.avg_vmg ?? bot.avg_vmg ?? 0),
      lat: bot.lat ?? DEFAULT_SCENE.boats[index]?.lat ?? 45.857 + index * 0.0002,
      lon: bot.lon ?? DEFAULT_SCENE.boats[index]?.lon ?? 10.837 + index * 0.0012,
      heading: bot.heading ?? 78,
      mure: bot.mure ?? (index % 2 === 0 ? "mure_a_dritta" : "mure_a_sinistra"),
      isUserBoat: false,
    });
  });
}

function hydrateBoatDataFromProfile(boat, botProfiles) {
  if (!boat) {
    return boat;
  }
  const profileCode = boat.isUserBoat
    ? boat.dataPreset && boat.dataPreset !== "custom"
      ? boat.dataPreset
      : null
    : boat.id;
  const profile = profileCode ? botProfiles.find((item) => item.bot_code === profileCode) : null;
  if (!profile) {
    return boat;
  }
  return {
    ...boat,
    preferred_side: boat.preferred_side ?? profile.preferred_side,
    metrics: {
      ...(profile.metrics ?? {}),
      ...(boat.metrics ?? {}),
    },
    track_style: boat.track_style ?? profile.track_style ?? null,
    simulator_profile: boat.simulator_profile ?? profile.simulator_profile ?? null,
    bot_ai_brain: boat.bot_ai_brain ?? profile.bot_ai_brain ?? null,
    aggregate_stats: boat.aggregate_stats ?? profile.aggregate_stats ?? null,
    source_examples: profile.source_examples ?? boat.source_examples ?? [],
    source_tracks: profile.source_tracks ?? boat.source_tracks ?? [],
  };
}

function resolveFallbackBot(botProfiles) {
  return (
    botProfiles.find((bot) => bot.bot_code === DEFAULT_USER_BOT_CODE) ??
    botProfiles[0] ??
    null
  );
}

function fleetAveragePerformance(botProfiles = state.botProfiles) {
  const rows = (botProfiles ?? [])
    .filter((bot) => bot?.bot_code && bot.bot_code !== USER_BOAT_ID)
    .map((bot) => ({
      speed: Number(bot.metrics?.avg_speed ?? bot.avg_speed),
      vmg: Number(bot.metrics?.avg_vmg ?? bot.avg_vmg),
    }))
    .filter((row) => Number.isFinite(row.speed) && Number.isFinite(row.vmg) && row.speed > 0 && row.vmg > 0);
  if (!rows.length) {
    return { speed: 6.0, vmg: 4.0 };
  }
  const speed = rows.reduce((sum, row) => sum + row.speed, 0) / rows.length;
  const vmg = rows.reduce((sum, row) => sum + row.vmg, 0) / rows.length;
  return sanitizeBoatPerformance(speed, vmg, 6.0, 4.0);
}

function fleetAverageStageSpeed(stageMode = "upwind") {
  const values = state.boats
    .filter((boat) => boat && !boat.isUserBoat)
    .map((boat) => stageSpeedForMode(boat.tacticalProfile ?? refreshBoatEngineProfile(boat).tacticalProfile, stageMode))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) {
    return stageMode === "reach" ? 6.5 : stageMode === "run" || stageMode === "finish" ? 5.8 : 5.0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function applyUserBoatDefaults(boat, botProfiles) {
  if (!boat || (!isUserBoatId(boat.id) && !boat.isUserBoat)) {
    return boat;
  }

  const fallback = resolveFallbackBot(botProfiles);
  const fleetAverage = fleetAveragePerformance(botProfiles);
  const hasSpeed = Number.isFinite(Number(boat.speed)) && Number(boat.speed) > 0;
  const hasVmg = Number.isFinite(Number(boat.vmg)) && Number(boat.vmg) > 0;
  const presetIsCustom = !boat.dataPreset || boat.dataPreset === "custom";
  const manualLocked = Boolean(boat.manualPerformanceLocked);
  const defaults = fallback
    ? {
        preferred_side: fallback.preferred_side ?? "right",
        speed: fleetAverage.speed,
        vmg: fleetAverage.vmg,
        track_style: fallback.track_style ?? null,
        simulator_profile: fallback.simulator_profile ?? null,
        bot_ai_brain: fallback.bot_ai_brain ?? null,
        aggregate_stats: fallback.aggregate_stats ?? null,
      }
    : {
        preferred_side: "right",
        speed: 6,
        vmg: 4,
  };
  const sanitized = sanitizeBoatPerformance(
    hasSpeed && (!presetIsCustom || manualLocked) ? boat.speed : defaults.speed,
    hasVmg && (!presetIsCustom || manualLocked) ? boat.vmg : defaults.vmg,
    defaults.speed,
    defaults.vmg
  );

  return refreshBoatEngineProfile({
    ...boat,
    id: USER_BOAT_ID,
    name: boat.name?.trim() || "Your boat",
    dataPreset: boat.dataPreset ?? "custom",
    preferred_side: boat.preferred_side ?? defaults.preferred_side,
    track_style: boat.track_style ?? defaults.track_style ?? null,
    simulator_profile: boat.simulator_profile ?? defaults.simulator_profile ?? null,
    bot_ai_brain: boat.bot_ai_brain ?? defaults.bot_ai_brain ?? null,
    aggregate_stats: boat.aggregate_stats ?? defaults.aggregate_stats ?? null,
    speed: sanitized.speed,
    vmg: sanitized.vmg,
    performanceAssistEnabled: boat.performanceAssistEnabled ?? true,
    manualPerformanceLocked: manualLocked,
    startPreset: boat.startPreset ?? "center",
    isMoving: hasSpeed || hasVmg ? (boat.isMoving === undefined ? true : boat.isMoving) : true,
  });
}

function toLatLng(lat, lon) {
  return [lat, lon];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseNumericInput(value, fallback = 0) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeBoatPerformance(speedValue, vmgValue, fallbackSpeed = 6, fallbackVmg = 4) {
  const speed = clamp(parseNumericInput(speedValue, fallbackSpeed), 2.2, 8.8);
  const vmg = clamp(parseNumericInput(vmgValue, fallbackVmg), 1.0, Math.min(5.4, speed * 0.92));
  return { speed, vmg };
}

function normalizeAngle(angle) {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function shortestAngleDelta(from, to) {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function moveHeadingToward(current, target, maxDelta) {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) <= maxDelta) {
    return normalizeAngle(target);
  }
  return normalizeAngle(current + Math.sign(delta) * maxDelta);
}

function stageSpeedFactor(mode, angleToWind) {
  const angle = clamp(Math.abs(angleToWind), 0, 180);
  if (mode === "upwind") {
    return 1;
  }
  if (mode === "reach") {
    if (angle <= 45) return 0.58 + (angle / 45) * 0.18;
    if (angle <= 75) return 0.76 + ((angle - 45) / 30) * 0.28;
    if (angle <= 120) return 1.04 + Math.sin(((angle - 75) / 45) * Math.PI) * 0.14;
    if (angle <= 150) return 1.08 - ((angle - 120) / 30) * 0.16;
    return 0.92 - ((angle - 150) / 30) * 0.12;
  }
  if (mode === "run") {
    if (angle <= 95) return 0.68 + (angle / 95) * 0.22;
    if (angle <= 145) return 0.9 + ((angle - 95) / 50) * 0.14;
    if (angle <= 165) return 1.04 - ((angle - 145) / 20) * 0.05;
    return 0.99 - ((angle - 165) / 15) * 0.08;
  }
  return 0.9 + Math.sin((angle * Math.PI) / 180) * 0.1;
}

function getBoatProfile(boat) {
  if (!boat?.tacticalProfile) {
    refreshBoatEngineProfile(boat);
  }
  return boat?.tacticalProfile ?? {};
}

function median(values) {
  const safeValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!safeValues.length) {
    return null;
  }
  const middle = Math.floor(safeValues.length / 2);
  return safeValues.length % 2
    ? safeValues[middle]
    : (safeValues[middle - 1] + safeValues[middle]) / 2;
}

function angleFromSpeedVmg(speedKn, vmgKn, fallbackDeg = 48) {
  const speed = Number(speedKn);
  const vmg = Number(vmgKn);
  if (!Number.isFinite(speed) || !Number.isFinite(vmg) || speed <= 0 || vmg <= 0) {
    return fallbackDeg;
  }
  const ratio = clamp(vmg / speed, 0.58, 0.92);
  return (Math.acos(ratio) * 180) / Math.PI;
}

function inferExampleUpwindAngle(boat) {
  const examples = Array.isArray(boat?.source_examples) ? boat.source_examples : [];
  const angles = examples
    .filter((example) => {
      const scenario = String(example.scenario ?? "").toLowerCase();
      return scenario.includes("area b") && scenario.includes("bolina");
    })
    .map((example) => angleFromSpeedVmg(example.avg_speed, example.vmg, null))
    .filter((angle) => Number.isFinite(angle))
    .map((angle) => clamp(angle, UPWIND_NO_GO_MIN_DEG, UPWIND_TARGET_MAX_DEG));
  return median(angles);
}

function classifyExampleStage(example) {
  const scenario = String(example?.scenario ?? "").toLowerCase();
  if (scenario.includes("poppa") || scenario.includes("discesa")) {
    return "run";
  }
  if (scenario.includes("lasco") || scenario.includes("traverso") || scenario.includes("reach")) {
    return "reach";
  }
  if (scenario.includes("bolina")) {
    return "upwind";
  }
  return null;
}

function inferStageMedianSpeed(boat, stageMode) {
  const examples = Array.isArray(boat?.source_examples) ? boat.source_examples : [];
  const speeds = examples
    .filter((example) => classifyExampleStage(example) === stageMode)
    .map((example) => Number(example.avg_speed))
    .filter((value) => Number.isFinite(value) && value > 0);
  return median(speeds);
}

function blendSpeedFromExamples(fallback, exampleSpeed, weight = 0.42) {
  if (!Number.isFinite(Number(exampleSpeed))) {
    return fallback;
  }
  return fallback * (1 - weight) + Number(exampleSpeed) * weight;
}

function buildStagePerformance(boat, baseSpeed, baseVmg) {
  const replayLegs = Array.isArray(boat?.replayCalibration?.leg_segments)
    ? boat.replayCalibration.leg_segments
    : Array.isArray(replayRecordForBoat(boat)?.leg_segments)
      ? replayRecordForBoat(boat).leg_segments
      : [];
  const legSpeedForMode = (modeNames) => {
    const matches = replayLegs
      .filter((leg) => modeNames.includes(String(leg?.mode ?? "")))
      .map((leg) => Number(leg.avg_speed_kn))
      .filter(Number.isFinite);
    return matches.length ? median(matches) : null;
  };
  const upwindFallback = clamp(baseSpeed * 0.82 + baseVmg * 0.08, 3.6, 5.7);
  const reachFallback = clamp(baseSpeed * 1.18, 5.4, 8.5);
  const runFallback = clamp(baseSpeed * 1.02, 4.8, 6.45);
  const upwindSource = legSpeedForMode(["bolina_1", "bolina_2"]) ?? inferStageMedianSpeed(boat, "upwind");
  const reachSource = legSpeedForMode(["lasco_offset"]) ?? inferStageMedianSpeed(boat, "reach");
  const runSource = legSpeedForMode(["poppa_gate", "poppa_3p", "arrivo"]) ?? inferStageMedianSpeed(boat, "run");
  const upwind = clamp(blendSpeedFromExamples(upwindFallback, upwindSource, 0.62), 3.4, 6.1);
  const reach = clamp(blendSpeedFromExamples(reachFallback, reachSource, 0.64), 4.0, 9.1);
  const run = clamp(blendSpeedFromExamples(runFallback, runSource, 0.66), 4.2, 6.75);
  const byLeg = {};
  replayLegs.forEach((leg) => {
    const legIndex = Number(leg?.leg) - 1;
    const speed = Number(leg?.avg_speed_kn);
    if (Number.isFinite(legIndex) && Number.isFinite(speed)) {
      byLeg[String(legIndex)] = clamp(speed, 2.0, 8.8);
    }
  });

  return {
    upwind,
    reach,
    run,
    finish: run,
    byLeg,
    max: {
      upwind: Math.max(upwind * 1.08, baseVmg + 0.8),
      reach: Math.max(reach * 1.16, 7.2),
      run: 6.75,
      finish: 6.75,
    },
  };
}

function inferUpwindTargetAngle(boat, baseSpeed, baseVmg, style) {
  const metricsAngle = clamp(
    angleFromSpeedVmg(baseSpeed, baseVmg, 48),
    UPWIND_TARGET_MIN_DEG,
    UPWIND_TARGET_MAX_DEG
  );
  const exampleAngle = inferExampleUpwindAngle(boat);
  const styleTrim = clamp(Number(style?.tackAngleOffset ?? 0), -MAX_TACTICAL_HEADING_DELTA, MAX_TACTICAL_HEADING_DELTA) * 0.22;
  const sourceAngle = Number.isFinite(exampleAngle)
    ? metricsAngle * 0.72 + exampleAngle * 0.28
    : metricsAngle;
  return clamp(sourceAngle + styleTrim, UPWIND_TARGET_MIN_DEG, UPWIND_TARGET_MAX_DEG);
}

function buildUpwindPolar(boat, baseSpeed, baseVmg, style) {
  const targetAngleDeg = inferUpwindTargetAngle(boat, baseSpeed, baseVmg, style);
  return {
    targetAngleDeg,
    minAngleDeg: Math.max(UPWIND_NO_GO_MIN_DEG, targetAngleDeg - UPWIND_ALLOWED_WINDOW_DEG),
    maxAngleDeg: Math.min(58, targetAngleDeg + UPWIND_ALLOWED_WINDOW_DEG),
    noGoAngleDeg: UPWIND_NO_GO_MIN_DEG,
  };
}

function upwindPolarResult(profile, angleToWind) {
  const target = Number(profile.upwindTargetAngleDeg ?? 48);
  const minAngle = Number(profile.upwindMinAngleDeg ?? UPWIND_NO_GO_MIN_DEG);
  const maxAngle = Number(profile.upwindMaxAngleDeg ?? target + UPWIND_ALLOWED_WINDOW_DEG);
  const angle = clamp(Math.abs(angleToWind), 0, 180);
  const baseLimitedSpeedKn = stageSpeedForMode(profile, "upwind") * Number(profile.paceScale ?? COURSE_PACE_SCALE);

  if (angle < minAngle) {
    const gap = minAngle - angle;
    const factor = profile.isUserBoat
      ? (gap <= 4 ? 0.78 : gap <= 8 ? 0.52 : 0.22) // Human player drops speed more gradually
      : (gap <= 4 ? 0.65 : gap <= 8 ? 0.42 : 0.15); // Bots drop speed gradually too
    return {
      factor,
      maxSpeedKn: gap <= 4 ? Math.max(NO_GO_MAX_SPEED_KN, baseLimitedSpeedKn * 0.65) : NO_GO_MAX_SPEED_KN,
      state: "troppo orzata",
    };
  }

  if (angle <= maxAngle) {
    const targetError = Math.abs(angle - target);
    return {
      factor: clamp(1.02 - targetError * 0.025, 0.88, 1.03),
      maxSpeedKn: null,
      state: "ok",
    };
  }

  const excess = angle - maxAngle;
  return {
    factor: excess <= 10 ? clamp(0.84 - excess * 0.026, 0.58, 0.84) : 0.52,
    maxSpeedKn: Math.max(NO_GO_MAX_SPEED_KN, baseLimitedSpeedKn * TOO_LOW_MAX_SPEED_FACTOR),
    state: "troppo poggiata",
  };
}

function stagePolarResult(mode, angleToWind, profile) {
  if (mode === "upwind") {
    return upwindPolarResult(profile, angleToWind);
  }
  return {
    factor: stageSpeedFactor(mode, angleToWind),
    maxSpeedKn: null,
    state: "libera",
  };
}

function stageSpeedForMode(profile, stageMode = "route") {
  const speeds = profile?.stageSpeedKn ?? {};
  const courseIndex = String(Number(profile?.courseIndex ?? 0));
  const legSpecificSpeed = Number(speeds.byLeg?.[courseIndex]);
  if (Number.isFinite(legSpecificSpeed)) {
    return legSpecificSpeed;
  }
  if (stageMode === "upwind") {
    return Number(speeds.upwind ?? profile?.baseSpeedKn ?? 5);
  }
  if (stageMode === "reach") {
    return Number(speeds.reach ?? profile?.baseSpeedKn ?? 6.5);
  }
  if (stageMode === "run" || stageMode === "finish") {
    return Number(speeds.run ?? profile?.baseSpeedKn ?? 5.8);
  }
  return Number(profile?.baseSpeedKn ?? 6);
}

function maxStageSpeedForMode(profile, stageMode = "route") {
  const max = profile?.stageSpeedKn?.max ?? {};
  if (stageMode === "upwind") {
    return Number(max.upwind ?? Infinity);
  }
  if (stageMode === "reach") {
    return Number(max.reach ?? Infinity);
  }
  if (stageMode === "run" || stageMode === "finish") {
    return Number(max.run ?? Infinity);
  }
  return Infinity;
}

function toggleBoatMure(mure) {
  return mure === "mure_a_sinistra" ? "mure_a_dritta" : "mure_a_sinistra";
}

function boatProgressScore(boat) {
  const courseIndex = Number(boat.courseIndex ?? 0);
  const target = getCourseTarget(courseIndex, boat);
  const remaining = target ? haversineMeters(boat, target) : 0;
  return courseIndex * 100000 - remaining + (boat.currentSpeedKn ?? boat.speed ?? 0) * 100;
}

function interpolatePoint(a, b, ratio) {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lon: a.lon + (b.lon - a.lon) * ratio,
    kind: "route",
  };
}

function cloneRoutePoint(point, extra = {}) {
  if (!point) {
    return null;
  }
  return {
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    kind: extra.kind ?? point.kind ?? "route",
    stageMode: extra.stageMode ?? point.stageMode ?? "route",
    flipMure: Boolean(extra.flipMure ?? point.flipMure),
    label: extra.label ?? point.label ?? point.id,
    laneSide: extra.laneSide ?? point.laneSide ?? null,
    courseStageIndex: extra.courseStageIndex ?? point.courseStageIndex ?? null,
    endsStage: Boolean(extra.endsStage ?? point.endsStage),
    isMarkRounding: Boolean(extra.isMarkRounding ?? point.isMarkRounding),
  };
}

function resolveTacticStyle(boat) {
  const presetCode = boat?.dataPreset && boat.dataPreset !== "custom" ? boat.dataPreset : boat?.id;
  if (presetCode && BOT_TACTIC_STYLES[presetCode]) {
    return BOT_TACTIC_STYLES[presetCode];
  }

  const preferredSign = boat?.preferred_side === "left" ? -1 : boat?.preferred_side === "right" ? 1 : 0;
  return {
    name: preferredSign < 0 ? "custom-left" : preferredSign > 0 ? "custom-right" : "custom-balanced",
    paceScale: 1,
    laneBias: preferredSign * 0.35,
    courseBoldness: 0.95,
    maneuverPenalty: 0.94,
    response: boat?.isUserBoat ? 0.24 : 0.2,
    turnRate: boat?.isUserBoat ? 2.55 : 2.05,
    windSensitivity: 1.0,
    upwindLeadFactor: 0.14,
    laylineLeadFactor: 0.11,
    tackAngleOffset: 26,
    reachAngleOffset: 15,
    runAngleOffset: 11,
  };
}

function trackStyleNumber(trackStyle, key, fallback = null) {
  const value = Number(trackStyle?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTrackStyle(boat) {
  const source = boat?.track_style ?? {};
  if (!source || typeof source !== "object") {
    return null;
  }
  const preferredSide = source.preferred_attack_side ?? boat?.preferred_side ?? "center";
  return {
    sourceRegatta: source.source_regatta ?? "",
    styleLabel: source.style_label ?? "",
    qwenHint: source.qwen_hint ?? "",
    preferredAttackSide: preferredSide,
    initialSideSign: trackStyleNumber(source, "initial_side_sign", sideSignFromName(preferredSide)),
    rank: trackStyleNumber(source, "rank", null),
    patience: clamp(trackStyleNumber(source, "patience", 0.5), 0, 1),
    reactivity: clamp(trackStyleNumber(source, "reactivity", 0.5), 0, 1),
    riskEdge: clamp(trackStyleNumber(source, "risk_edge", 0.5), 0, 1),
    rankWeight: clamp(trackStyleNumber(source, "rank_weight", 0.5), 0, 1),
    laneBiasAdjust: clamp(trackStyleNumber(source, "lane_bias_adjust", 0), -0.45, 0.45),
    switchThreshold: clamp(trackStyleNumber(source, "switch_threshold", 0.16), 0.07, 0.32),
    boardCommitmentMs: clamp(trackStyleNumber(source, "board_commitment_ms", 150000), 78000, 260000),
    minTackIntervalMs: clamp(trackStyleNumber(source, "min_tack_interval_ms", MIN_TACK_INTERVAL_SIM_MS), 65000, 240000),
    minTackDistanceM: clamp(trackStyleNumber(source, "min_tack_distance_m", MIN_TACK_DISTANCE_METERS), 210, 460),
    maxUpwindTacticalTacks: clamp(Math.round(trackStyleNumber(source, "max_upwind_tactical_tacks", MAX_UPWIND_TACTICAL_TACKS)), 2, 5),
    courseBoldnessAdjust: clamp(trackStyleNumber(source, "course_boldness_adjust", 0), -0.12, 0.12),
    responseAdjust: clamp(trackStyleNumber(source, "response_adjust", 0), -0.05, 0.05),
    windSensitivityAdjust: clamp(trackStyleNumber(source, "wind_sensitivity_adjust", 0), -0.08, 0.08),
    upwindLeadAdjust: clamp(trackStyleNumber(source, "upwind_lead_adjust", 0), -0.06, 0.06),
    laylineLeadAdjust: clamp(trackStyleNumber(source, "layline_lead_adjust", 0), -0.05, 0.05),
    legRightShareTargets: Array.isArray(source.leg_right_share_targets) ? source.leg_right_share_targets : [],
    legManeuverTargets: Array.isArray(source.leg_maneuver_targets) ? source.leg_maneuver_targets : [],
    legSpeedTargetsKn: Array.isArray(source.leg_speed_targets_kn) ? source.leg_speed_targets_kn : [],
  };
}

function refreshBoatEngineProfile(boat) {
  if (!boat) {
    return boat;
  }
  const metrics = boat.metrics ?? {};
  // Dynamic load of current-leg MetaSail data.
  const legIndex = boat.courseIndex ?? 0;
  const legData = Array.isArray(boat.leg_metrics) ? boat.leg_metrics[legIndex] : null;
  const sanitizedPerformance = sanitizeBoatPerformance(
    boat.speed ?? legData?.velocita_media_kn ?? metrics.avg_speed,
    boat.vmg ?? legData?.vmg_medio_kn ?? metrics.avg_vmg,
    Number(legData?.velocita_media_kn ?? metrics.avg_speed ?? 6),
    Number(legData?.vmg_medio_kn ?? metrics.avg_vmg ?? 4)
  );
  let baseSpeed = sanitizedPerformance.speed;
  let baseVmg = sanitizedPerformance.vmg;

  // Real GPX calibration (ILCA 4 Area B, Lake Garda).
  // Important: Filippo (BOT_02) and Enrico (BOT_03) show lower GPX speed because
  // they sail tighter angles. Their advantage comes from VMG, not raw speed.
  // The speed hierarchy is intentionally different from the finish ranking.
  //
  // GPX R1 average speeds: BOT_04=4.50, BOT_06=4.45, BOT_07=4.41, BOT_01=3.85
  //                          BOT_05=3.81, BOT_02=4.32, BOT_03=4.28
  // Tack-profile speeds:   BOT_01=4.22, BOT_05=3.99, BOT_03=3.94, BOT_06=4.45
  //                          BOT_02=3.02, BOT_04=4.41, BOT_07=4.41
  if (boat.id === "BOT_04") {        // Giuseppe Cucinelli: highest speed, conservative tactics
    baseSpeed *= 1.018; baseVmg *= 0.88;  // Lower upwind speed slightly and reduce VMG factor
  } else if (boat.id === "BOT_06") { // Elia Uffreduzzi: fast profile, lower tactical patience
    baseSpeed *= 1.032; baseVmg *= 1.018; // +0.19 kn, +0.07 kn
  } else if (boat.id === "BOT_07") { // Simeon Hristov: fast and balanced
    baseSpeed *= 1.028; baseVmg *= 1.018; // +0.17 kn, +0.07 kn
  } else if (boat.id === "BOT_02") { // Filippo Noto: very high mode, VMG-focused
    baseSpeed *= 0.975; baseVmg *= 1.038; // -0.15 kn speed, +0.15 kn VMG (points higher)
  } else if (boat.id === "BOT_03") { // Enrico Morina: high mode, excellent VMG
    baseSpeed *= 0.995; baseVmg *= 1.032; // Boost Enrico upwind speed slightly to keep VMG higher than Giuseppe
  } else if (boat.id === "BOT_05") { // Emanuele Vincenzi: lower speed, reactive
    baseSpeed *= 0.972; baseVmg *= 1.008; // -0.17 kn speed, neutro VMG
  } else if (boat.id === "BOT_01") { // Paolo Bellofiore: tactical baseline
    baseSpeed *= 1.0; baseVmg *= 1.014;  // neutro speed, piccolo boost VMG
  }

  boat.speed = baseSpeed;
  boat.vmg = baseVmg;
  const distancePct = Number(legData?.distanza_pct ?? metrics.avg_distance_pct ?? 116);
  const rtPct = Number(metrics.avg_rt_pct ?? 50);
  const ltPct = Number(metrics.avg_lt_pct ?? 50);
  const style = resolveTacticStyle(boat);
  const trackStyle = normalizeTrackStyle(boat);
  const simulatorProfile = boat.simulator_profile ?? {};
  const replayTargets = boat.replayCalibration?.engine_targets ?? replayRecordForBoat(boat)?.engine_targets ?? {};
  const athleteStyle = athleteStyleForBoat(boat) ?? {};
  const sideBalance = clamp((ltPct - rtPct) / 100, -0.45, 0.45);
  const preferredSign = boat.preferred_side === "left" ? -1 : boat.preferred_side === "right" ? 1 : 0;
  let laneBias = clamp(style.laneBias + preferredSign * 0.25 + sideBalance * 0.55 + (trackStyle?.laneBiasAdjust ?? 0), -1.0, 1.0);
  // Lane bias calibrated from real GPX right_share:
  // BOT_02: right_share=66.2% -> strong right/Bresciana preference.
  // BOT_03: right_share=39.3% -> slight left/Malcesine lift preference.
  // BOT_05: right_share=37.5% -> left/Malcesine preference.
  // BOT_01: right_share=50.8% -> neutral center.
  // BOT_04: right_share=50.6% -> neutral center.
  // BOT_06: right_share=50.1% -> neutral/slight right.
  // BOT_07: right_share=52.9% -> slight right.
  if (boat.id === "BOT_02") laneBias = 0.85;   // Filippo: right/Bresciana shore.
  if (boat.id === "BOT_03") laneBias = legIndex === 0 ? -0.42 : 0.65;  // Enrico: leg-dependent side preference (left-center Leg 1, right Leg 2)
  if (boat.id === "BOT_05") laneBias = -0.75;  // Emanuele: pronounced left.
  if (boat.id === "BOT_01") laneBias = -0.15;  // Paolo: center-left.
  if (boat.id === "BOT_04") laneBias = 0.25;   // Giuseppe: center-right.
  if (boat.id === "BOT_06") laneBias = 0.55;   // Elia: right-center.
  if (boat.id === "BOT_07") laneBias = -0.35;  // Simeon: left-center.

  const courseBoldness = clamp(style.courseBoldness + (distancePct - 110) * 0.005 + (trackStyle?.courseBoldnessAdjust ?? 0), 0.80, 1.25);
  // Maneuver penalty derived from each leg's average VMG versus top VMG.
  let maneuverPenalty = clamp(
    ((legData && legData.top_vmg_kn > 0 ? legData.vmg_medio_kn / legData.top_vmg_kn : style.maneuverPenalty) || style.maneuverPenalty) +
      ((trackStyle?.patience ?? 0.5) - 0.5) * 0.012,
    0.80,
    0.98
  );
  if (boat.id === "BOT_03" || boat.id === "BOT_02") {
    maneuverPenalty = Math.max(maneuverPenalty, 0.96); // Elite athletes lose very little speed when tacking/gybing
  } else if (boat.id === "BOT_05" || boat.id === "BOT_04") {
    maneuverPenalty = Math.max(maneuverPenalty, 0.94); // Strong athletes lose less speed
  }
  if (boat.isUserBoat) {
    maneuverPenalty = Math.max(maneuverPenalty, 0.95); // Human player gets a recovery boost to avoid getting stuck at 1 knot
  }

  const response = boat.isUserBoat
    ? Math.max(style.response + (trackStyle?.responseAdjust ?? 0), 0.45) // Boosted for human responsiveness
    : clamp(style.response + (1 - Math.abs(sideBalance)) * 0.02 + (trackStyle?.responseAdjust ?? 0), 0.12, 0.32);
  const turnRate = boat.isUserBoat
    ? Math.max((style.turnRate + (trackStyle?.reactivity ?? 0.5) * 0.2) * 18.0, 42.0)
    : clamp(
        style.turnRate * 16.0 +
          (6.25 - baseSpeed) * 2.0 +
          Math.abs(sideBalance) * 3.0 +
          ((trackStyle?.reactivity ?? 0.5) - (trackStyle?.patience ?? 0.5)) * 6.0,
        22.0,
        52.0
      );
  let paceScale = clamp(style.paceScale + (distancePct - 110) * 0.0008, 0.9, 1.08);
  if (boat.id === "BOT_03") paceScale *= 1.04;  // Enrico Morina
  if (boat.id === "BOT_02") paceScale *= 1.025; // Filippo Noto
  if (boat.id === "BOT_05") paceScale *= 1.015; // Emanuele Vincenzi
  if (boat.id === "BOT_04") paceScale *= 1.01;  // Giuseppe Cucinelli
  if (boat.id === "BOT_06") paceScale *= 1.008; // Elia Freddorti
  if (boat.id === "BOT_07") paceScale *= 1.005; // Simeon

  const upwindPolar = buildUpwindPolar(boat, baseSpeed, baseVmg, style);
  
  // Upwind angles calibrated from real data.
  // Filippo and Enrico sail tighter angles, trading speed for higher VMG.
  // Giuseppe and Elia sail freer angles, gaining speed with lower VMG.
  if (boat.id === "BOT_02") { // Filippo Noto: very tight high mode.
    upwindPolar.targetAngleDeg = 40.5;
  } else if (boat.id === "BOT_03") { // Enrico Morina: high mode.
    upwindPolar.targetAngleDeg = 41.0;
  } else if (boat.id === "BOT_05") { // Emanuele Vincenzi: reactive, medium high mode.
    upwindPolar.targetAngleDeg = 42.5;
  } else if (boat.id === "BOT_01") { // Paolo Bellofiore: medium angle.
    upwindPolar.targetAngleDeg = 43.5;
  } else if (boat.id === "BOT_07") { // Simeon: balanced.
    upwindPolar.targetAngleDeg = 44.5;
  } else if (boat.id === "BOT_06") { // Elia: faster, freer angle.
    upwindPolar.targetAngleDeg = 46.5;
  } else if (boat.id === "BOT_04") { // Giuseppe: freest angle, highest speed.
    upwindPolar.targetAngleDeg = 49.0;
  }
  upwindPolar.minAngleDeg = Math.max(UPWIND_NO_GO_MIN_DEG, upwindPolar.targetAngleDeg - UPWIND_ALLOWED_WINDOW_DEG);
  upwindPolar.maxAngleDeg = Math.min(58, upwindPolar.targetAngleDeg + UPWIND_ALLOWED_WINDOW_DEG);

  const stagePerformance = buildStagePerformance(boat, baseSpeed, baseVmg);

  // Bot-specific risk tolerance controls tactical reaction to headers and oscillations.
  // Tack-on-header probability is calibrated from GPX reactivity.
  // Emanuele (0.547) reacts strongly. Filippo (0.078) is patient but precise.
  let tackOnHeaderProbability = Number(
    athleteStyle.reactivity ??
    replayTargets.reactivity ??
    trackStyle?.reactivity ??
    simulatorProfile.tack_on_header_probability ??
    0.42
  );

  // Risk tolerance (side-switch threshold) from GPX switch_threshold.
  const replaySwitchThreshold = Number(athleteStyle.switch_threshold ?? replayTargets.switch_threshold ?? trackStyle?.switchThreshold);
  let riskTolerance = Number.isFinite(replaySwitchThreshold)
    ? replaySwitchThreshold
    : (boat.preferred_side === "right" ? 0.22 : boat.preferred_side === "left" ? 0.11 : 0.16);

  const styleName = athleteStyle.style_label || replayTargets.style_label || trackStyle?.styleLabel || style.name;

  // Board commitment calibrated from real GPX median_board_s.
  // BOT_05 Emanuele: 42s -> 42000ms (frequent tacks, maximum reactivity).
  // BOT_02 Filippo:  81s → 81000ms
  // BOT_07 Simeon:   95s → 95000ms
  // BOT_03 Enrico:  143s → 143000ms
  // BOT_04 Giuseppe:204s → 204000ms
  // BOT_01 Paolo:   284s → 284000ms
  // BOT_06 Elia:    151s → 151000ms
  const boardCommitmentMs = Number(athleteStyle.board_commitment_ms ?? replayTargets.board_commitment_ms ?? trackStyle?.boardCommitmentMs ?? 130000);

  boat.tacticalProfile = {
    styleName,
    courseIndex: Number(boat.courseIndex ?? 0),
    baseSpeedKn: baseSpeed,
    baseVmgKn: baseVmg,
    upwindTargetAngleDeg: upwindPolar.targetAngleDeg,
    upwindMinAngleDeg: upwindPolar.minAngleDeg,
    upwindMaxAngleDeg: upwindPolar.maxAngleDeg,
    upwindNoGoAngleDeg: upwindPolar.noGoAngleDeg,
    paceScale,
    laneBias,
    courseBoldness,
    maneuverPenalty,
    response,
    turnRate,
    riskTolerance: clamp(riskTolerance - (tackOnHeaderProbability - 0.42) * 0.04, 0.06, 0.28),
    windSensitivity: clamp((style.windSensitivity ?? 1) + (trackStyle?.windSensitivityAdjust ?? 0), 0.86, 1.18),
    upwindLeadFactor: clamp((style.upwindLeadFactor ?? 0.14) + (trackStyle?.upwindLeadAdjust ?? 0), 0.06, 0.24),
    laylineLeadFactor: clamp((style.laylineLeadFactor ?? 0.11) + (trackStyle?.laylineLeadAdjust ?? 0), 0.05, 0.20),
    tackAngleOffset: style.tackAngleOffset ?? 26,
    reachAngleOffset: style.reachAngleOffset ?? 15,
    runAngleOffset: style.runAngleOffset ?? 11,
    stageSpeedKn: stagePerformance,
    trackStyle,
    simulatorProfile,
    initialSideSign: trackStyle?.initialSideSign ?? null,
    boardCommitmentMs,
    minTackIntervalSimMs: Number(athleteStyle.min_tack_interval_ms ?? replayTargets.min_tack_interval_ms ?? trackStyle?.minTackIntervalMs ?? MIN_TACK_INTERVAL_SIM_MS),
    minTackDistanceM: Number(athleteStyle.min_tack_distance_m ?? replayTargets.min_tack_distance_m ?? trackStyle?.minTackDistanceM ?? MIN_TACK_DISTANCE_METERS),
    maxUpwindTacticalTacks: Number(athleteStyle.max_upwind_tactical_tacks ?? replayTargets.max_upwind_tactical_tacks ?? trackStyle?.maxUpwindTacticalTacks ?? MAX_UPWIND_TACTICAL_TACKS),
    speedMultiplier: clamp(1 + (baseSpeed - 6) * 0.018, 0.96, 1.05),
    vmgMultiplier: clamp(1 + (baseVmg - 4) * 0.04, 0.9, 1.1),
    isUserBoat: Boolean(boat.isUserBoat),
  };
  boat.qwenAgentId = boat.isUserBoat ? "pilot-manual" : `qwen-${boat.id}`;
  boat.strategyName = styleName;
  if (!Number.isFinite(Number(boat.currentSpeedKn)) || (Number(boat.currentSpeedKn) === 0 && boat.isMoving !== false)) {
    boat.currentSpeedKn = stageSpeedForMode(boat.tacticalProfile, "upwind") * paceScale;
  }
  if (!Number.isFinite(Number(boat.currentVmgKn)) || (Number(boat.currentVmgKn) === 0 && boat.isMoving !== false)) {
    boat.currentVmgKn = baseVmg * paceScale;
  }
  if (!Number.isFinite(Number(boat.speedPenalty))) {
    boat.speedPenalty = 1;
  }
  return boat;
}

function deterministicJitter(boat, salt = 0) {
  const code = String(boat?.id ?? boat?.name ?? "boat");
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index) + salt * 17) % 9973;
  }
  return Math.sin(hash * 12.9898 + salt * 78.233);
}

function raceTacticNoise(boat, stageIndex = 0, salt = 0) {
  const raceProfile = state.raceProfile ?? {};
  const raceSeed = Number(raceProfile.tacticSeed ?? raceProfile.seed ?? 0.5);
  const raceSalt = Math.round(raceSeed * 100000) + Number(stageIndex ?? 0) * 131 + Number(salt ?? 0) * 17;
  return deterministicJitter(boat, raceSalt);
}

function raceTacticSideSign() {
  const swing = Number(state.raceProfile?.tacticSideSwing ?? 0);
  if (swing > 0.055) {
    return -1;
  }
  if (swing < -0.055) {
    return 1;
  }
  return 0;
}

function raceAdjustedRightShareTarget(boat, stage, baseTarget) {
  const style = tacticalStyleNumbers(boat);
  const raceProfile = state.raceProfile ?? {};
  const stageIndex = Number(stage?.courseStageIndex ?? boat?.courseIndex ?? 0);
  const swing = Number(raceProfile.tacticSideSwing ?? 0);
  const noise = raceTacticNoise(boat, stageIndex, 23);
  const athleteFlex = clamp(0.055 + style.reactivity * 0.14 + (1 - style.patience) * 0.075, 0.04, RACE_TACTIC_BOT_NOISE_MAX);
  const upwindWeight = stage?.mode === "upwind" ? 0.82 : 0.36;
  const raceSwing = clamp(swing, -RACE_TACTIC_SIDE_SWING_MAX, RACE_TACTIC_SIDE_SWING_MAX) * upwindWeight;
  const botSwing = noise * athleteFlex;
  const centerPull = raceProfile.tacticMode === "center_control" ? (0.5 - Number(baseTarget)) * 0.28 : 0;
  const splitPull = raceProfile.tacticMode === "split_fleet"
    ? raceTacticNoise(boat, stageIndex, 71) * 0.12
    : 0;
  return clamp(Number(baseTarget) + raceSwing + botSwing + centerPull + splitPull, 0.2, 0.82);
}

function raceTacticSideScore(boat, stage, sideSign) {
  const raceProfile = state.raceProfile ?? {};
  const stageIndex = Number(stage?.courseStageIndex ?? boat?.courseIndex ?? 0);
  const swing = clamp(Number(raceProfile.tacticSideSwing ?? 0), -RACE_TACTIC_SIDE_SWING_MAX, RACE_TACTIC_SIDE_SWING_MAX);
  const modeSide = raceTacticSideSign();
  const modeScore = modeSide
    ? (sideSign === modeSide ? Math.abs(swing) : -Math.abs(swing) * 0.78)
    : 0;
  const splitScore = raceProfile.tacticMode === "split_fleet"
    ? raceTacticNoise(boat, stageIndex, 97) * (sideSign < 0 ? 1 : -1) * 0.13
    : 0;
  const centerScore = raceProfile.tacticMode === "center_control"
    ? -Math.abs(Number(sideSign)) * 0.015
    : 0;
  return (modeScore + splitScore + centerScore) * RACE_TACTIC_SCORE_WEIGHT;
}

function isUpwindFinalBoardZone(boat, stage, target, distanceToTargetM = null, stageElapsedMs = null) {
  if (!boat || stage?.mode !== "upwind" || !target) {
    return false;
  }
  const distance = Number.isFinite(Number(distanceToTargetM)) ? Number(distanceToTargetM) : haversineMeters(boat, target);
  const memory = stageMemoryForBoat(boat);
  const elapsed = Number.isFinite(Number(stageElapsedMs))
    ? Number(stageElapsedMs)
    : Math.max(0, state.simulatedClockMs - Number(memory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
  return elapsed >= FINAL_BOARD_LOCK_MIN_STAGE_MS && distance < FINAL_BOARD_LOCK_RADIUS_M;
}

function clearFinalBoardLock(boat) {
  if (!boat) {
    return;
  }
  boat.finalBoardLock = null;
  boat.finalBoardLockSideSign = null;
}

function activateFinalBoardLock(boat, stage, target, candidates = [], currentSide = null, distanceToTargetM = null) {
  if (!boat || stage?.mode !== "upwind" || !target) {
    return null;
  }
  const stageIndex = Number(stage?.courseStageIndex ?? boat.courseIndex ?? 0);
  const distance = Number.isFinite(Number(distanceToTargetM)) ? Number(distanceToTargetM) : haversineMeters(boat, target);
  const existing = boat.finalBoardLock;
  if (existing && Number(existing.stageIndex) === stageIndex && existing.targetId === target.id) {
    return existing;
  }
  const sideNow = Number(currentSide || boat.liveSideSign || resolveRouteSideSign(boat) || -1);
  const closingCandidate = [...(candidates ?? [])].sort((a, b) => {
    const progressDelta = Number(b.progressRatio ?? -Infinity) - Number(a.progressRatio ?? -Infinity);
    if (Math.abs(progressDelta) > 0.004) {
      return progressDelta;
    }
    return Number(b.score ?? 0) - Number(a.score ?? 0);
  })[0];
  const lockSide = Number(closingCandidate?.sideSign ?? sideNow) || sideNow || -1;
  const changedSide = lockSide !== sideNow;
  boat.finalBoardLock = {
    stageIndex,
    targetId: target.id,
    sideSign: lockSide,
    startedSimMs: state.simulatedClockMs,
    startDistanceM: Math.round(distance),
    changedSide,
  };
  boat.finalBoardLockSideSign = lockSide;
  boat.liveSideSign = lockSide;
  boat.mure = lockSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  if (changedSide) {
    boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.93, 0.78, 1);
  }
  return boat.finalBoardLock;
}

function metersPerLonAtLat(lat) {
  return 111132.0 * Math.cos((Number(lat) * Math.PI) / 180);
}

function coordinateRotationTwd(point, twdDeg, reference) {
  if (!point || !reference) {
    return { xPrimeTransverse: 0, yPrimeWindAxis: 0 };
  }
  const latRef = Number(reference.lat);
  const lonRef = Number(reference.lon);
  const latToMeters = 111132.0;
  const lonToMeters = metersPerLonAtLat(latRef);
  const deltaLatM = (Number(point.lat) - latRef) * latToMeters;
  const deltaLonM = (Number(point.lon) - lonRef) * lonToMeters;
  
  // Geometrically consistent wind-axis rotation: lon = X, lat = Y.
  const twdRad = (Number(twdDeg) * Math.PI) / 180;
  return {
    xPrimeTransverse: deltaLonM * Math.cos(twdRad) - deltaLatM * Math.sin(twdRad),
    yPrimeWindAxis: deltaLonM * Math.sin(twdRad) + deltaLatM * Math.cos(twdRad),
  };
}

function medianFromExamples(boat, predicate, selector) {
  const examples = Array.isArray(boat?.source_examples) ? boat.source_examples : [];
  return median(
    examples
      .filter(predicate)
      .map(selector)
      .map(Number)
      .filter((value) => Number.isFinite(value))
  );
}

function inferLegRightShareTarget(boat, stage) {
  const stageIndex = Number(stage?.courseStageIndex ?? stage?.index ?? boat?.courseIndex ?? 0) + 1;
  const replayTarget = Number(boat?.replayCalibration?.engine_targets?.leg_right_share_targets?.[stageIndex - 1]);
  const sameLegRight = medianFromExamples(
    boat,
    (example) => Number(example.leg) === stageIndex && String(example.scenario ?? "").toLowerCase().includes("area b"),
    (example) => example.rt_pct
  );
  const globalRight = medianFromExamples(
    boat,
    (example) => String(example.scenario ?? "").toLowerCase().includes("area b"),
    (example) => example.rt_pct
  );
  const source = Number.isFinite(sameLegRight) && Number.isFinite(globalRight)
    ? sameLegRight * 0.35 + globalRight * 0.65
    : Number.isFinite(sameLegRight)
      ? sameLegRight * 0.35 + 50 * 0.65
      : globalRight;
  if (Number.isFinite(replayTarget)) {
    const fallback = Number.isFinite(source) ? clamp(source / 100, 0.25, 0.75) : 0.5;
    return clamp(replayTarget * 0.68 + fallback * 0.32, 0.2, 0.82);
  }
  if (!Number.isFinite(source)) {
    return 0.5;
  }
  return clamp(source / 100, 0.25, 0.75);
}

function stageMemoryForBoat(boat, stageIndex = boat?.courseIndex ?? 0) {
  if (!boat.sideMemoryByStage) {
    boat.sideMemoryByStage = {};
  }
  const key = String(stageIndex);
  if (!boat.sideMemoryByStage[key]) {
    boat.sideMemoryByStage[key] = {
      leftMs: 0,
      rightMs: 0,
      lastSideSign: null,
      stageStartedSimMs: state.simulatedClockMs,
      sideStartedSimMs: state.simulatedClockMs,
      lastDecisionSimMs: -Infinity,
      nextDecisionAllowedSimMs: 0,
      lastCandidateSimMs: -Infinity,
      currentPlan: null,
      pendingShift: null,
      candidateTacks: 0,
      rejectedTackCandidates: 0,
      lastDecisionReason: "",
    };
  }
  return boat.sideMemoryByStage[key];
}

function updateSideMemory(boat, dt) {
  if (!boat || (boat.isUserBoat && !boat.demoAutopilot) || state.raceStatus !== "running") {
    return;
  }
  const sideSign = Number(boat.liveSideSign || resolveRouteSideSign(boat));
  const memory = stageMemoryForBoat(boat);
  const deltaMs = Math.max(0, dt * SIM_SPEEDUP * 1000);
  if (sideSign < 0) {
    memory.rightMs += deltaMs;
  } else {
    memory.leftMs += deltaMs;
  }
  if (memory.lastSideSign !== sideSign) {
    memory.lastSideSign = sideSign;
    memory.sideStartedSimMs = state.simulatedClockMs;
  }
}

function resetStageSideMemory(boat, stageIndex = boat?.courseIndex ?? 0) {
  if (!boat) {
    return;
  }
  if (!boat.sideMemoryByStage) {
    boat.sideMemoryByStage = {};
  }
  boat.sideMemoryByStage[String(stageIndex)] = {
    leftMs: 0,
    rightMs: 0,
    lastSideSign: Number(boat.liveSideSign || resolveRouteSideSign(boat)),
    stageStartedSimMs: state.simulatedClockMs,
    sideStartedSimMs: state.simulatedClockMs,
    lastDecisionSimMs: -Infinity,
    nextDecisionAllowedSimMs: 0,
    lastCandidateSimMs: -Infinity,
    currentPlan: null,
    pendingShift: null,
    candidateTacks: 0,
    rejectedTackCandidates: 0,
    lastDecisionReason: "",
  };
}

function rightShareFromMemory(memory) {
  const total = Number(memory?.leftMs ?? 0) + Number(memory?.rightMs ?? 0);
  return total > 1 ? Number(memory.rightMs ?? 0) / total : 0.5;
}

function replayManeuverTargetForStage(boat, stageIndex) {
  const value = Number(boat?.replayCalibration?.engine_targets?.leg_maneuver_targets?.[Number(stageIndex ?? boat?.courseIndex ?? 0)]);
  return Number.isFinite(value) ? value : null;
}

function tacticalStyleNumbers(boat) {
  const profile = getBoatProfile(boat);
  const trackStyle = profile.trackStyle ?? {};
  return {
    reactivity: clamp(Number(trackStyle.reactivity ?? profile.response ?? 0.5), 0, 1),
    patience: clamp(Number(trackStyle.patience ?? 0.5), 0, 1),
    risk: clamp(Number(profile.riskTolerance ?? trackStyle.switch_threshold ?? 0.16), 0.04, 0.32),
    boardCommitmentMs: Number(profile.boardCommitmentMs ?? 150000),
    minTackIntervalMs: Number(profile.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS),
    maxTacks: Number(profile.maxUpwindTacticalTacks ?? MAX_UPWIND_TACTICAL_TACKS),
  };
}

function tacticalDecisionWindowMs(boat) {
  const style = tacticalStyleNumbers(boat);
  return clamp(
    36000 + style.patience * 13000 - style.reactivity * 18000,
    TACTIC_DECISION_MIN_WINDOW_MS,
    TACTIC_DECISION_MAX_WINDOW_MS
  );
}

function tacticalRejectCooldownMs(boat, reason = "micro_tack") {
  const style = tacticalStyleNumbers(boat);
  const reasonExtra = reason === "max_tacks" ? 26000 : reason === "micro_tack" ? 18000 : 9000;
  return clamp(
    36000 + style.patience * 28000 - style.reactivity * 9000 + reasonExtra,
    TACTIC_REJECT_COOLDOWN_MIN_MS,
    TACTIC_REJECT_COOLDOWN_MAX_MS
  );
}

function tacticalShiftThresholdDeg(boat) {
  const style = tacticalStyleNumbers(boat);
  return clamp(7.2 - style.reactivity * 3.4 + style.patience * 1.4, TACTIC_SHIFT_MIN_DEG, TACTIC_SHIFT_MAX_DEG);
}

function tacticalShiftRequiredMs(boat) {
  const style = tacticalStyleNumbers(boat);
  return clamp(27000 + style.patience * 25000 - style.reactivity * 20000, 8000, 54000);
}

function legPlanForBoat(boat, stage, memory = stageMemoryForBoat(boat, stage?.courseStageIndex ?? boat?.courseIndex ?? 0)) {
  const profile = getBoatProfile(boat);
  const stageIndex = Number(stage?.courseStageIndex ?? boat?.courseIndex ?? 0);
  const style = tacticalStyleNumbers(boat);
  const baseRightShareTarget = inferLegRightShareTarget(boat, stage);
  const rightShareTarget = raceAdjustedRightShareTarget(boat, stage, baseRightShareTarget);
  const maneuverTarget = replayManeuverTargetForStage(boat, stageIndex);
  const targetSideSign =
    rightShareTarget > 0.57 ? -1 :
    rightShareTarget < 0.43 ? 1 :
    Number(boat.gardaAttackSideSign || boat.liveSideSign || resolveRouteSideSign(boat));
  const speedTargetKn = stageSpeedForMode(profile, stage?.mode ?? "upwind");
  const plan = {
    stageIndex,
    stageName: stage?.name ?? `leg_${stageIndex + 1}`,
    stageMode: stage?.mode ?? "upwind",
    targetSide: sideNameFromSign(targetSideSign),
    targetSideSign,
    rightShareTarget: Number(rightShareTarget.toFixed(2)),
    baseRightShareTarget: Number(baseRightShareTarget.toFixed(2)),
    raceTacticMode: state.raceProfile?.tacticMode ?? "balanced",
    raceTacticSwing: Number(Number(state.raceProfile?.tacticSideSwing ?? 0).toFixed(2)),
    maneuverTarget: Number.isFinite(maneuverTarget) ? Number(maneuverTarget.toFixed(1)) : style.maxTacks,
    boardCommitmentMs: Math.round(style.boardCommitmentMs),
    minTackIntervalMs: Math.round(style.minTackIntervalMs),
    decisionWindowMs: Math.round(tacticalDecisionWindowMs(boat)),
    speedTargetKn: Number(speedTargetKn.toFixed(2)),
    reactivity: Number(style.reactivity.toFixed(2)),
    patience: Number(style.patience.toFixed(2)),
  };
  memory.currentPlan = plan;
  return plan;
}

function updatePersistentShiftMemory(boat, memory, current, selected) {
  const now = state.simulatedClockMs;
  const scoreDelta = Number(selected?.score ?? 0) - Number(current?.score ?? 0);
  const liftDelta = Number(selected?.scoreBreakdown?.lift ?? 0) - Number(current?.scoreBreakdown?.lift ?? 0);
  const vmgDelta = Number(selected?.scoreBreakdown?.vmg ?? 0) - Number(current?.scoreBreakdown?.vmg ?? 0);
  const shiftMagnitudeDeg = Math.max(
    Math.abs(liftDelta) / Math.max(FIELD_TACTIC_LIFT_WEIGHT, 0.001),
    Math.abs(scoreDelta) * 9,
    Math.abs(vmgDelta) * 5
  );
  const thresholdDeg = tacticalShiftThresholdDeg(boat);
  const sameShift = memory.pendingShift && Number(memory.pendingShift.sideSign) === Number(selected?.sideSign);
  if (selected?.sideSign !== current?.sideSign && shiftMagnitudeDeg >= thresholdDeg * 0.62) {
    if (!sameShift) {
      memory.pendingShift = {
        sideSign: selected.sideSign,
        startedSimMs: now,
        magnitudeDeg: shiftMagnitudeDeg,
        peakDeg: shiftMagnitudeDeg,
      };
    } else {
      memory.pendingShift.magnitudeDeg = shiftMagnitudeDeg;
      memory.pendingShift.peakDeg = Math.max(Number(memory.pendingShift.peakDeg ?? 0), shiftMagnitudeDeg);
    }
  } else if (memory.pendingShift && now - Number(memory.pendingShift.startedSimMs ?? now) > 12000) {
    memory.pendingShift = null;
  }
  const durationMs = memory.pendingShift ? Math.max(0, now - Number(memory.pendingShift.startedSimMs ?? now)) : 0;
  const requiredMs = tacticalShiftRequiredMs(boat);
  const expectedRecovery = scoreDelta;
  return {
    magnitudeDeg: Number((memory.pendingShift?.peakDeg ?? shiftMagnitudeDeg).toFixed(1)),
    durationMs,
    requiredMs,
    thresholdDeg,
    expectedRecovery,
    persistent: Boolean(memory.pendingShift && durationMs >= requiredMs && shiftMagnitudeDeg >= thresholdDeg),
  };
}

function chooseInitialGardaAttackSide(boat, fleetIndex = 0) {
  const explicitTrackSideSign = Number(boat?.track_style?.initial_side_sign);
  const preferred = boat?.preferred_side;
  const preferredSign = preferred === "left" ? 1 : preferred === "right" ? -1 : 0;
  // Initial side calibrated from real GPX right_share% and track analysis:
  // sideSign -1 = right/Bresciana direction on port tack.
  // sideSign +1 = left/Malcesine direction on starboard tack.
  const athleteSpreadSide = {
    [USER_BOAT_ID]: 1,        // User boat: opens left/Malcesine to create room.
    [LEGACY_USER_BOAT_ID]: 1, // Backward compatibility with old saved scenes.
    BOT_01: -1,               // Paolo: right_share=50.8%, slight right tendency.
    BOT_02: -1,               // Filippo: right_share=66.2%, strong right/Bresciana.
    BOT_03: 1,                // Enrico: right_share=39.3%, left/Malcesine lift.
    BOT_04: 1,                // Giuseppe: right_share=50.6%, center spread to the left.
    BOT_05: 1,                // Emanuele: right_share=37.5%, pronounced left.
    BOT_06: -1,               // Elia: right_share=50.1%, slight right.
    BOT_07: -1,               // Simeon: right_share=52.9%, slight right.
  }[boat?.id];
  const raceProfile = state.raceProfile ?? {};
  const style = tacticalStyleNumbers(boat);
  const seed = Number(raceProfile.seed ?? 0.5);
  const baseSide = Number.isFinite(explicitTrackSideSign) && explicitTrackSideSign !== 0
    ? (explicitTrackSideSign > 0 ? 1 : -1)
    : Number.isFinite(athleteSpreadSide)
      ? athleteSpreadSide
      : preferredSign || 0;
  const raceSide = raceTacticSideSign();
  const raceNoise = raceTacticNoise(boat, 0, 37);
  const athleteFlex = clamp(0.18 + style.reactivity * 0.34 + (1 - style.patience) * 0.16, 0.16, 0.56);
  if (raceSide && baseSide && raceSide !== baseSide && raceNoise > 1 - athleteFlex * 1.65) {
    return raceSide;
  }
  if (raceProfile.tacticMode === "split_fleet" && raceNoise > 0.22) {
    return (fleetIndex + Math.round(seed * 10)) % 2 === 0 ? -1 : 1;
  }
  if (baseSide) {
    return baseSide;
  }
  const spreadSide = (fleetIndex + Math.round(seed * 10)) % 2 === 0 ? -1 : 1;
  if (preferredSign && deterministicJitter(boat, 37 + Math.round(seed * 100)) > 0.72) {
    return preferredSign;
  }
  return spreadSide;
}

function gardaFleetPenalty(candidatePoint, target, boat) {
  if (!candidatePoint || !target) {
    return 0;
  }
  return state.boats.reduce((penalty, other) => {
    if (!other || other.id === boat.id || other.isUserBoat || other.courseIndex !== boat.courseIndex) {
      return penalty;
    }
    const separation = haversineMeters(candidatePoint, other);
    if (separation > 170) {
      return penalty;
    }
    const otherIsAhead = haversineMeters(other, target) < haversineMeters(boat, target) + 65;
    const dirtyAir = otherIsAhead ? (170 - separation) / 170 : (110 - Math.min(separation, 110)) / 280;
    return penalty + Math.max(0, dirtyAir) * 0.18;
  }, 0);
}

function gardaFleetSideCrowdingPenalty(boat, sideSign) {
  const peers = state.boats.filter((other) => other && !other.isUserBoat && other.id !== boat.id && other.courseIndex === boat.courseIndex);
  if (!peers.length) {
    return 0;
  }
  const sameSideCount = peers.filter((other) => Number(other.liveSideSign || resolveRouteSideSign(other)) === sideSign).length;
  const shareIfChosen = (sameSideCount + 1) / (peers.length + 1);
  return shareIfChosen > 0.58 ? (shareIfChosen - 0.58) * 0.72 : 0;
}

function dirtyAirPenaltyForBoat(boat, wind) {
  if (!boat || !wind || state.raceStatus !== "running") {
    return { factor: 1, penalty: 0, source: null };
  }
  const plumeBearing = normalizeAngle(Number(wind.direction ?? ORA_BASE_DIRECTION_DEG) + 180);
  let strongest = { factor: 1, penalty: 0, source: null };
  state.boats.forEach((other) => {
    if (!other || other.id === boat.id || other.courseIndex !== boat.courseIndex || Number(other.currentSpeedKn ?? 0) < 0.7) {
      return;
    }
    const separation = haversineMeters(other, boat);
    if (separation <= 4 || separation > DIRTY_AIR_MAX_DISTANCE_M || Math.abs(boat.lat - other.lat) > 0.005) {
      return;
    }
    const bearingFromOther = bearingDegrees(other, boat);
    const coneError = Math.abs(shortestAngleDelta(bearingFromOther, plumeBearing));
    if (coneError > DIRTY_AIR_CONE_DEG) {
      return;
    }
    const distanceStrength = 1 - separation / DIRTY_AIR_MAX_DISTANCE_M;
    const coneStrength = 1 - coneError / DIRTY_AIR_CONE_DEG;
    const penalty = clamp(distanceStrength * coneStrength * 0.18, 0, 0.18);
    if (penalty > strongest.penalty) {
      strongest = {
        factor: clamp(1 - penalty, 0.82, 1),
        penalty,
        source: other.name ?? other.id,
        separationM: separation,
      };
    }
  });
  return strongest;
}

function fieldRuleSideBias(stage, sideSign, lane, candidateWind) {
  const raceProfile = state.raceProfile ?? {};
  const sideName = sideNameFromSign(sideSign);
  const pressure = String(candidateWind?.pressure ?? "media");
  const laneName = String(lane?.laneBand?.name ?? candidateWind?.lane ?? "");
  const specialLeft = Boolean(raceProfile.leftPocket) || Number(raceProfile.rightLiftBias ?? 1) < 0.65;

  if (stage?.mode === "run") {
    // Area B notes: on a normal run, the inner/left side of the course often pays.
    return sideName === "left" ? 0.16 : -0.05;
  }

  if (stage?.mode === "reach") {
    const outsidePenalty = laneName === "far_left" || laneName === "far_right" ? -0.11 : 0;
    const pressureBonus = pressure === "forte" ? 0.08 : pressure === "debole" ? -0.08 : 0;
    return pressureBonus + outsidePenalty;
  }

  if (stage?.mode === "upwind") {
    if (specialLeft) {
      return sideName === "left" ? 0.2 : -0.08;
    }
    // Standard Ora: right/Bresciana is good, but not inside the shore shadow cone.
    const rightBias = sideName === "right" ? 0.14 : 0.02;
    const leftPressureException = sideName === "left" && pressure === "forte" ? 0.12 : 0;
    return rightBias + leftPressureException;
  }

  return 0;
}

function fieldTacticScore(boat, stage, sideSign, wind, candidateWind, lane, xImprovement) {
  const pressureDelta = Number(candidateWind?.multiplier ?? 1) - 1;
  const pressureScore = clamp(pressureDelta * FIELD_TACTIC_PRESSURE_WEIGHT, -0.22, 0.26);
  const ruleScore = fieldRuleSideBias(stage, sideSign, lane, candidateWind) * FIELD_TACTIC_LANE_WEIGHT;
  const windShift = shortestAngleDelta(Number(wind?.direction ?? candidateWind?.direction ?? 0), Number(candidateWind?.direction ?? wind?.direction ?? 0));
  const liftScore = clamp((sideSign < 0 ? -windShift : windShift) * FIELD_TACTIC_LIFT_WEIGHT, -0.1, 0.1);
  const centerDistance = Math.abs(Number(lane?.normalized ?? candidateWind?.laneIndex ?? 0.5) - 0.5);
  const centerPenalty = centerDistance < GARDA_CENTER_DEAD_BAND && candidateWind?.pressure !== "forte"
    ? (GARDA_CENTER_DEAD_BAND - centerDistance) * FIELD_TACTIC_CENTER_PENALTY
    : 0;
  const shorePenalty = Number(candidateWind?.shoreRisk ?? 0) * FIELD_TACTIC_SHORE_PENALTY;
  const laylineHelp = clamp(Number(xImprovement ?? 0) / 520, -0.08, 0.1);
  const trackPatience = Number(boat?.tacticalProfile?.trackStyle?.patience ?? 0.5);
  const patienceDampener = clamp(1 - Math.max(0, trackPatience - 0.62) * 0.22, 0.86, 1);
  const score = (pressureScore + ruleScore + liftScore + laylineHelp - centerPenalty - shorePenalty) * patienceDampener;
  const label = [
    candidateWind?.pressure === "forte" ? "pressure" : null,
    candidateWind?.temporalZone ? candidateWind.temporalZone : null,
    centerPenalty > 0 ? "center-lull" : null,
    shorePenalty > 0.06 ? "shore-risk" : null,
    Math.abs(liftScore) > 0.04 ? "lift" : null,
  ].filter(Boolean).join("+") || "neutral-field";
  return { score, label, pressureScore, ruleScore, liftScore, centerPenalty, shorePenalty, laylineHelp };
}

function gardaUpwindSideScore(boat, stage, target, wind, sideSign) {
  const profile = getBoatProfile(boat);
  const distanceToTarget = haversineMeters(boat, target);
  const lookahead = clamp(distanceToTarget * 0.28, GARDA_TACTIC_LOOKAHEAD_MIN_M, GARDA_TACTIC_LOOKAHEAD_MAX_M);
  const speedRatio = Number(boat.currentSpeedKn ?? 0) / Math.max(0.1, stageSpeedForMode(profile, "upwind"));
  const polarReliefDeg = boat.polarState === "troppo orzata" || speedRatio < 0.86 ? 2.8 : boat.polarState === "troppo poggiata" ? -2.2 : 0;
  const heading = allowedUpwindHeadingForSide(boat, wind, sideSign, polarReliefDeg);
  const candidate = makeWaypointFromBearing(boat, heading, lookahead);
  const candidateWind = windEngineAt(candidate, performance.now());
  const currentDistance = haversineMeters(boat, target);
  const nextDistance = haversineMeters(candidate, target);
  const progressRatio = (currentDistance - nextDistance) / Math.max(lookahead, 1);
  const targetProjection = coordinateRotationTwd(target, wind.direction, target);
  const currentProjection = coordinateRotationTwd(boat, wind.direction, target);
  const candidateProjection = coordinateRotationTwd(candidate, wind.direction, target);
  const currentX = currentProjection.xPrimeTransverse - targetProjection.xPrimeTransverse;
  const candidateX = candidateProjection.xPrimeTransverse - targetProjection.xPrimeTransverse;
  const xImprovement = Math.abs(currentX) - Math.abs(candidateX);
  const overstandPressure = Math.abs(currentX) > Math.max(160, distanceToTarget * GARDA_OVERSTAND_X_RATIO) ? -Math.sign(currentX) : 0;
  const candidateSideName = sideNameFromSign(sideSign);
  const lane = classifyWindLane(candidate);
  const laneDistanceFromCenter = Math.abs(lane.normalized - 0.5);
  const centerDeadPenalty = laneDistanceFromCenter < GARDA_CENTER_DEAD_BAND && candidateWind.pressure !== "forte"
    ? (GARDA_CENTER_DEAD_BAND - laneDistanceFromCenter) * 0.7
    : 0;
  const memory = stageMemoryForBoat(boat);
  const rightShareTarget = inferLegRightShareTarget(boat, stage);
  const usedRightShare = rightShareFromMemory(memory);
  const sideBalanceDelta = sideSign < 0
    ? rightShareTarget - usedRightShare
    : usedRightShare - rightShareTarget;
  const profileBias = Number(profile.laneBias ?? 0) * (sideSign < 0 ? 1 : -1) * 0.26;
  const sideMemoryScore = clamp(sideBalanceDelta, -0.45, 0.45) * GARDA_SIDE_MEMORY_WEIGHT;
  const attackWindowActive = state.simulatedClockMs < GARDA_ATTACK_WINDOW_SIM_MS && Number.isFinite(Number(boat.gardaAttackSideSign));
  const firstUpwindAttack = Number(boat.courseIndex ?? 0) === 0;
  const attackPlanScore = attackWindowActive
    ? (sideSign === Number(boat.gardaAttackSideSign)
      ? (firstUpwindAttack ? 0.42 : 0.24)
      : (firstUpwindAttack ? -0.12 : -0.04))
    : 0;
  const overstandScore = overstandPressure === sideSign ? 0.32 : overstandPressure === -sideSign ? -0.38 : 0;
  // Shore penalty scaled by real GPX risk_edge.
  // risk_edge measures how much the athlete dares to press the course edges.
  // Filippo (1.0): reaches the Bresciana shore with almost no penalty.
  // Enrico (0.886): tolerates the shore well with a reduced penalty.
  // Paolo (0.599): medium risk with a standard penalty.
  // Giuseppe (0.696) and Elia (0.553): conservative, full penalty.
  const riskEdge = Number(
    boat.id === "BOT_02" ? 1.000 : // Filippo
    boat.id === "BOT_03" ? 0.886 : // Enrico
    boat.id === "BOT_07" ? 0.645 : // Simeon
    boat.id === "BOT_04" ? 0.696 : // Giuseppe
    boat.id === "BOT_05" ? 0.713 : // Emanuele
    boat.id === "BOT_01" ? 0.599 : // Paolo
    boat.id === "BOT_06" ? 0.553 : // Elia
    0.60
  );
  // Shore penalty is reduced proportionally to athlete risk_edge.
  // risk_edge=1.0 means -75% penalty; risk_edge=0.55 keeps the full penalty.
  const shoreRiskFactor = clamp(1.0 - (riskEdge - 0.55) * 1.6, 0.25, 1.0);
  const shorePenalty = Number(candidateWind.shoreRisk ?? 0) * 0.14 * shoreRiskFactor;
  const fleetPenalty = gardaFleetPenalty(candidate, target, boat);
  const fleetSidePenalty = gardaFleetSideCrowdingPenalty(boat, sideSign);
  const qwenSideScore = boat.qwenDecision?.side === candidateSideName ? 0.05 : 0;
  const raceTacticScore = raceTacticSideScore(boat, stage, sideSign);
  const pressureScore = (Number(candidateWind.multiplier ?? 1) - 1) * 1.25;
  const vmgScore = progressRatio >= 0 ? progressRatio * 1.35 : progressRatio * 2.1;
  const laylineScore = clamp(xImprovement / 280, -0.18, 0.18);
  const field = fieldTacticScore(boat, stage, sideSign, wind, candidateWind, lane, xImprovement);
  const score =
    vmgScore +
    pressureScore +
    field.score +
    laylineScore +
    overstandScore +
    sideMemoryScore +
    attackPlanScore +
    profileBias +
    raceTacticScore +
    qwenSideScore -
    centerDeadPenalty -
    shorePenalty -
    fleetPenalty -
    fleetSidePenalty;

  return {
    sideSign,
    score,
    heading,
    candidate,
    wind: candidateWind,
    progressRatio,
    currentX,
    candidateX,
    rightShareTarget,
    usedRightShare,
    fieldScore: field.score,
    fieldLabel: field.label,
    field,
    scoreBreakdown: {
      vmg: vmgScore,
      pressure: pressureScore,
      lift: field.liftScore,
      layline: laylineScore + field.laylineHelp,
      athleteStyle: profileBias + sideMemoryScore + attackPlanScore + raceTacticScore + qwenSideScore,
      raceTactic: raceTacticScore,
      landRisk: shorePenalty + field.shorePenalty,
      centerPenalty: centerDeadPenalty + field.centerPenalty,
      fleetPenalty: fleetPenalty + fleetSidePenalty,
      total: score,
    },
    centerDeadPenalty,
    fleetPenalty,
    fleetSidePenalty,
    polarReliefDeg,
  };
}

function fieldLonBounds() {
  const polygonLons = (state.areaPolygon ?? []).map((item) => Number(item[1])).filter(Number.isFinite);
  const buoyLons = (state.buoys ?? []).map((item) => Number(item.lon)).filter(Number.isFinite);
  const lons = polygonLons.length ? polygonLons : buoyLons;
  if (!lons.length) {
    return { westLon: 10.836, eastLon: 10.856 };
  }
  return { westLon: Math.min(...lons), eastLon: Math.max(...lons) };
}

function generatedProfileDecisionForBoat(boat, stage, target, wind) {
  if (!boat?.track_style && !boat?.simulator_profile && !boat?.bot_ai_brain) {
    return null;
  }
  const profile = getBoatProfile(boat);
  const telemetry = ensureBoatTelemetry(boat);
  const memory = stageMemoryForBoat(boat);
  const distanceM = target ? haversineMeters(boat, target) : 700;
  const lane = classifyWindLane(boat);
  const dirtyAir = dirtyAirPenaltyForBoat(boat, wind);
  const timeSinceManeuverMs = telemetry.lastManeuverSimMs == null
    ? Infinity
    : Math.max(0, state.simulatedClockMs - telemetry.lastManeuverSimMs);
  const { westLon, eastLon } = fieldLonBounds();
  const targetVmg = stage?.mode === "upwind"
    ? Number(profile.baseVmgKn ?? boat.vmg ?? 4)
    : stageSpeedForMode(profile, stage?.mode ?? "upwind");
  const botState = {
    id: boat.id,
    mure: boat.mure,
    stage_mode: stage?.mode ?? "upwind",
    leg_index: boat.courseIndex ?? 0,
    leg_progress: 1 - clamp(distanceM / 1350, 0, 1),
    lane_norm: lane.normalized * 2 - 1,
    lat: boat.lat,
    lon: boat.lon,
    speed_kn: Number(boat.currentSpeedKn ?? boat.speed ?? 4.5),
    target_speed_kn: stageSpeedForMode(profile, stage?.mode ?? "upwind"),
    vmg_kn: Number(boat.currentVmgKn ?? boat.vmg ?? 4),
    target_vmg_kn: targetVmg,
    distance_to_target_m: distanceM,
    land_risk: Number(wind?.shoreRisk ?? 0),
    dirty_air: Number(dirtyAir.penalty ?? 0),
    seconds_since_maneuver: timeSinceManeuverMs === Infinity ? 999 : timeSinceManeuverMs / 1000,
    board_age_s: Math.max(0, state.simulatedClockMs - Number(memory.sideStartedSimMs ?? 0)) / 1000,
    min_tack_interval_s: Number(profile.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS) / 1000,
    decision_seed:
      state.simulatedClockMs / 1000 +
      deterministicJitter(boat, boat.courseIndex ?? 0) * 100 +
      Number(state.raceProfile?.tacticSeed ?? state.raceProfile?.seed ?? 0.5) * 1000,
  };
  const windState = {
    direction: Number(wind?.direction ?? ORA_BASE_DIRECTION_DEG),
    speed_kn: Number(wind?.speedKn ?? 9),
    pressure_delta: Number(wind?.multiplier ?? 1) - 1,
    shift_deg: shortestAngleDelta(ORA_BASE_DIRECTION_DEG, Number(wind?.direction ?? ORA_BASE_DIRECTION_DEG)),
    right_pressure_bias: Number(wind?.rightPressureBias ?? wind?.windAi?.rightPressureBias ?? (Number(state.raceProfile?.rightLiftBias ?? 1) > 0.7 ? 0.24 : -0.12)),
  };
  const fieldGeometry = {
    west_lon: westLon,
    east_lon: eastLon,
    layline_lead_factor: Number(profile.laylineLeadFactor ?? 0.12),
    min_tack_interval_s: Number(profile.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS) / 1000,
  };
  const athleteProfile = {
    preferred_side: boat.preferred_side,
    track_style: boat.track_style ?? null,
    simulator_profile: boat.simulator_profile ?? null,
  };
  const fallbackDecision = updateGeneratedTactics(botState, windState, fieldGeometry, athleteProfile);
  const brainDecision = driveBotBrain(botState, windState, fieldGeometry, boat.bot_ai_brain, athleteProfile);
  if (!brainDecision) {
    return fallbackDecision;
  }
  return {
    ...brainDecision,
    fallbackDecision,
    label: brainDecision.label,
    reason: `${brainDecision.reason}; backup ${fallbackDecision?.target_side ?? "n/a"} ${Number(fallbackDecision?.score ?? 0).toFixed(2)}`,
  };
}

function chooseGardaUpwindDecision(boat, stage, target, wind) {
  const profile = getBoatProfile(boat);
  const currentSide = Number(boat.liveSideSign || resolveRouteSideSign(boat));
  const memory = stageMemoryForBoat(boat);
  const legPlan = legPlanForBoat(boat, stage, memory);
  const generatedDecision = generatedProfileDecisionForBoat(boat, stage, target, wind);
  const generatedSideSign = generatedDecision?.target_side === "right"
    ? -1
    : generatedDecision?.target_side === "left"
      ? 1
      : 0;
  const scoredCandidates = [
    gardaUpwindSideScore(boat, stage, target, wind, -1),
    gardaUpwindSideScore(boat, stage, target, wind, 1),
  ].map((candidate) => {
    const generatedBoost = generatedSideSign && candidate.sideSign === generatedSideSign
      ? 0.1 * Number(generatedDecision?.confidence ?? 0.5)
      : generatedSideSign && candidate.sideSign !== generatedSideSign
        ? -0.025 * Number(generatedDecision?.confidence ?? 0.5)
        : 0;
    return {
      ...candidate,
      score: candidate.score + generatedBoost,
      generatedDecision,
      generatedBoost,
      scoreBreakdown: {
        ...candidate.scoreBreakdown,
        athleteProfileModel: generatedBoost,
        total: candidate.score + generatedBoost,
      },
    };
  });
  const candidates = scoredCandidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const current = candidates.find((candidate) => candidate.sideSign === currentSide) ?? candidates[1] ?? best;
  const stageElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
  const distanceToTargetM = target ? haversineMeters(boat, target) : Infinity;
  const currentVmgKn = Number(boat.currentVmgKn ?? 0);
  const finalBoardZone = isUpwindFinalBoardZone(boat, stage, target, distanceToTargetM, stageElapsedMs);
  if (!finalBoardZone) {
    clearFinalBoardLock(boat);
  }
  const closingBest = [...candidates].sort((a, b) => b.progressRatio - a.progressRatio)[0] ?? best;
  if (finalBoardZone) {
    const lock = activateFinalBoardLock(boat, stage, target, candidates, currentSide, distanceToTargetM);
    let lockedSide = Number(lock?.sideSign ?? currentSide);
    let locked = candidates.find((candidate) => candidate.sideSign === lockedSide) ?? current;
    const finalRescueElapsedMs = state.simulatedClockMs - Number(memory.finalBoardRescueSimMs ?? -Infinity);
    const shouldRescueFinalBoard =
      distanceToTargetM > 130 &&
      currentVmgKn < 0.65 &&
      Number(closingBest?.sideSign) !== lockedSide &&
      Number(closingBest?.progressRatio ?? -Infinity) > Number(locked?.progressRatio ?? -Infinity) + 0.028 &&
      finalRescueElapsedMs > 42000;
    if (shouldRescueFinalBoard) {
      lockedSide = Number(closingBest.sideSign);
      locked = closingBest;
      memory.finalBoardRescueSimMs = state.simulatedClockMs;
      boat.finalBoardLock = { ...(boat.finalBoardLock ?? lock), sideSign: lockedSide, rescued: true };
      boat.finalBoardLockSideSign = lockedSide;
      boat.liveSideSign = lockedSide;
      boat.mure = lockedSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    }
    const shift = updatePersistentShiftMemory(boat, memory, locked, locked);
    const decisionWindowMs = legPlan.decisionWindowMs;
    const timeSinceDecisionMs = state.simulatedClockMs - Number(memory.lastDecisionSimMs ?? -Infinity);
    const reason =
      shouldRescueFinalBoard
        ? `Final board rescue: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, VMG ${currentVmgKn.toFixed(1)} kn, switching once to ${sideNameFromSign(lockedSide)} closing board.`
        : `Final board lock: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, holding ${sideNameFromSign(lockedSide)} board until rounding; no more tacks allowed.`;
    memory.lastDecisionReason = reason;
    memory.lastDecisionSimMs = state.simulatedClockMs;
    return {
      ...locked,
      currentScore: locked.score,
      scoreDelta: 0,
      shouldSwitch: false,
      forceClosure: false,
      finalBoardLock: true,
      closureProgressGap: 0,
      distanceToTargetM,
      stageElapsedMs,
      legPlan,
      decisionWindowMs,
      timeSinceDecisionMs,
      nextDecisionInMs: decisionWindowMs,
      cooldownActive: false,
      shiftMagnitudeDeg: shift.magnitudeDeg,
      shiftDurationMs: shift.durationMs,
      shiftRequiredMs: shift.requiredMs,
      expectedRecovery: shift.expectedRecovery,
      candidateTacks: Number(memory.candidateTacks ?? 0),
      rejectedTackCandidates: Number(memory.rejectedTackCandidates ?? 0),
      label: "Final board",
      reason,
    };
  }
  const approachCommitZone =
    stage?.mode === "upwind" &&
    target &&
    distanceToTargetM >= MARK_APPROACH_NO_TACK_RADIUS_M &&
    distanceToTargetM < MARK_APPROACH_COMMIT_RADIUS_M;
  if (approachCommitZone) {
    const closingCandidate = closingBest;
    const closingSide = Number(closingCandidate?.sideSign ?? (currentSide || resolveRouteSideSign(boat)));
    const previousCommitSide = Number(boat.approachCommitSideSign);
    const previousCommitCandidate = candidates.find((candidate) => candidate.sideSign === previousCommitSide);
    const previousProgress = Number(previousCommitCandidate?.progressRatio ?? -Infinity);
    const closingProgress = Number(closingCandidate?.progressRatio ?? -Infinity);
    const rescueElapsedMs = state.simulatedClockMs - Number(memory.approachRescueSimMs ?? -Infinity);
    const currentIsMissingMark = previousProgress < 0.018 && closingProgress > previousProgress + 0.035;
    const shouldRescueCommit =
      Number.isFinite(previousCommitSide) &&
      previousCommitSide !== closingSide &&
      distanceToTargetM > MARK_APPROACH_NO_TACK_RADIUS_M &&
      (currentVmgKn < 0.65 || currentIsMissingMark) &&
      closingProgress > previousProgress + 0.028 &&
      rescueElapsedMs > 55000;
    const committedSide = Number(
      shouldRescueCommit
        ? closingSide
        : Number.isFinite(previousCommitSide)
          ? previousCommitSide
          : closingSide
    );
    if (shouldRescueCommit) {
      memory.approachRescueSimMs = state.simulatedClockMs;
    }
    boat.approachCommitSideSign = committedSide;
    boat.liveSideSign = committedSide;
    boat.mure = committedSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    const locked = candidates.find((candidate) => candidate.sideSign === committedSide) ?? current;
    const shift = updatePersistentShiftMemory(boat, memory, locked, locked);
    const decisionWindowMs = legPlan.decisionWindowMs;
    const timeSinceDecisionMs = state.simulatedClockMs - Number(memory.lastDecisionSimMs ?? -Infinity);
    const reason =
      shouldRescueCommit
        ? `Approach rescue: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, VMG ${currentVmgKn.toFixed(1)} kn, switching once to ${sideNameFromSign(committedSide)} closing board.`
        : `Approach commit: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, holding ${sideNameFromSign(committedSide)} board until final board lock; no tactical tacks allowed.`;
    memory.lastDecisionReason = reason;
    memory.lastDecisionSimMs = state.simulatedClockMs;
    return {
      ...locked,
      currentScore: locked.score,
      scoreDelta: 0,
      shouldSwitch: false,
      forceClosure: false,
      closureProgressGap: 0,
      distanceToTargetM,
      stageElapsedMs,
      legPlan,
      decisionWindowMs,
      timeSinceDecisionMs,
      nextDecisionInMs: decisionWindowMs,
      cooldownActive: false,
      shiftMagnitudeDeg: shift.magnitudeDeg,
      shiftDurationMs: shift.durationMs,
      shiftRequiredMs: shift.requiredMs,
      expectedRecovery: shift.expectedRecovery,
      candidateTacks: Number(memory.candidateTacks ?? 0),
      rejectedTackCandidates: Number(memory.rejectedTackCandidates ?? 0),
      label: "Approach commit",
      reason,
    };
  }
  const markApproachLocked = stage?.mode === "upwind" && target && distanceToTargetM < MARK_APPROACH_NO_TACK_RADIUS_M;
  if (markApproachLocked) {
    const existingMarkSide = Number(boat.markApproachSideSign);
    const closureNeeded =
      closingBest.sideSign !== currentSide &&
      (current.progressRatio < 0.02 || closingBest.progressRatio > current.progressRatio + 0.035);
    const lockedSide = Number.isFinite(existingMarkSide)
      ? existingMarkSide
      : (closureNeeded ? closingBest.sideSign : currentSide);
    boat.markApproachSideSign = lockedSide;
    const lockedApproach = candidates.find((candidate) => candidate.sideSign === lockedSide) ?? current;
    if (lockedSide !== currentSide) {
      boat.liveSideSign = lockedApproach.sideSign;
      boat.mure = lockedApproach.sideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
      boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.96, 0.78, 1);
    }
    const shift = updatePersistentShiftMemory(boat, memory, lockedApproach, lockedApproach);
    const decisionWindowMs = legPlan.decisionWindowMs;
    const timeSinceDecisionMs = state.simulatedClockMs - Number(memory.lastDecisionSimMs ?? -Infinity);
    const reason =
      lockedSide !== currentSide
        ? `Mark approach closure: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, one final closing board to avoid sailing away from the mark.`
        : `Mark approach lock: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, no new tactical tacks; rounding on current board.`;
    memory.lastDecisionReason = reason;
    memory.lastDecisionSimMs = state.simulatedClockMs;
    return {
      ...lockedApproach,
      currentScore: lockedApproach.score,
      scoreDelta: 0,
      shouldSwitch: false,
      forceClosure: false,
      closureProgressGap: 0,
      distanceToTargetM,
      stageElapsedMs,
      legPlan,
      decisionWindowMs,
      timeSinceDecisionMs,
      nextDecisionInMs: decisionWindowMs,
      cooldownActive: false,
      shiftMagnitudeDeg: shift.magnitudeDeg,
      shiftDurationMs: shift.durationMs,
      shiftRequiredMs: shift.requiredMs,
      expectedRecovery: shift.expectedRecovery,
      candidateTacks: Number(memory.candidateTacks ?? 0),
      rejectedTackCandidates: Number(memory.rejectedTackCandidates ?? 0),
      label: closureNeeded ? "Mark closure" : "Mark approach",
      reason,
    };
  }
  const closureProgressGap = closingBest.progressRatio - current.progressRatio;
  const closureMinMs = Number(boat.courseIndex ?? 0) === 0
    ? GARDA_MARK_CLOSURE_FIRST_LEG_MS
    : GARDA_MARK_CLOSURE_LEG_MS;
  const lateLegRecovery =
    stage?.mode === "upwind" &&
    target &&
    stageElapsedMs > MARK_APPROACH_STALLED_LATE_MS &&
    distanceToTargetM < MARK_APPROACH_RECOVERY_RADIUS_M &&
    currentVmgKn < MARK_APPROACH_RECOVERY_LOW_VMG_KN;
  if (lateLegRecovery) {
    const shift = updatePersistentShiftMemory(boat, memory, current, current);
    const decisionWindowMs = legPlan.decisionWindowMs;
    const timeSinceDecisionMs = state.simulatedClockMs - Number(memory.lastDecisionSimMs ?? -Infinity);
    const reason =
      `Late leg recovery: ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, VMG ${currentVmgKn.toFixed(1)} kn after ${formatRaceTime(stageElapsedMs)}; hold course to complete the mark.`;
    memory.lastDecisionReason = reason;
    memory.lastDecisionSimMs = state.simulatedClockMs;
    return {
      ...current,
      currentScore: current.score,
      scoreDelta: 0,
      shouldSwitch: false,
      forceClosure: false,
      closureProgressGap,
      distanceToTargetM,
      stageElapsedMs,
      legPlan,
      decisionWindowMs,
      timeSinceDecisionMs,
      nextDecisionInMs: decisionWindowMs,
      cooldownActive: false,
      shiftMagnitudeDeg: shift.magnitudeDeg,
      shiftDurationMs: shift.durationMs,
      shiftRequiredMs: shift.requiredMs,
      expectedRecovery: shift.expectedRecovery,
      candidateTacks: Number(memory.candidateTacks ?? 0),
      rejectedTackCandidates: Number(memory.rejectedTackCandidates ?? 0),
      label: "Leg recovery",
      reason,
    };
  }
  const lowVmgLate = stageElapsedMs > closureMinMs && currentVmgKn < GARDA_MARK_CLOSURE_LOW_VMG_KN;
  const poorCurrentProgress = stageElapsedMs > closureMinMs && current.progressRatio < 0.018;
  const closingApproach = distanceToTargetM < 360 && closingBest.progressRatio > Math.max(0.038, current.progressRatio + 0.025);
  const overstandRecovery =
    Math.abs(current.currentX) > Math.max(150, distanceToTargetM * GARDA_OVERSTAND_X_RATIO) &&
    Math.abs(closingBest.candidateX) < Math.abs(current.currentX) - 35;
  const forceClosure =
    closingBest.sideSign !== currentSide &&
    closureProgressGap > GARDA_MARK_CLOSURE_PROGRESS_MARGIN &&
    (lowVmgLate || poorCurrentProgress || closingApproach || overstandRecovery);
  const startSplitCommitment =
    Number(boat.courseIndex ?? 0) === 0 &&
    stageElapsedMs < GARDA_START_SPLIT_COMMITMENT_SIM_MS &&
    Number.isFinite(Number(boat.gardaAttackSideSign));
  const committedStartSide = startSplitCommitment
    ? (candidates.find((candidate) => candidate.sideSign === Number(boat.gardaAttackSideSign)) ?? current)
    : null;
  const selected = committedStartSide ?? (forceClosure ? closingBest : best);
  const delta = selected.score - current.score;
  const sideElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.sideStartedSimMs ?? 0));
  const boardCommitmentMs = Number(profile.boardCommitmentMs ?? 150000);
  const longBoard = sideElapsedMs > boardCommitmentMs && Math.abs(selected.currentX) > 140;
  const overstood = Math.abs(selected.currentX) > 180 && Math.abs(selected.candidateX) < Math.abs(selected.currentX) - 45;
  const poorVmg = boat.polarState === "troppo orzata" || boat.polarState === "troppo poggiata";
  const dirtyAirStrong = Number(boat.dirtyAirFactor ?? 1) < 0.9;
  const vmgAlmostZero = stageElapsedMs > 90000 && currentVmgKn < 0.35;
  const emergency = forceClosure || closingApproach || overstandRecovery || dirtyAirStrong;
  const shift = updatePersistentShiftMemory(boat, memory, current, selected);
  const decisionWindowMs = legPlan.decisionWindowMs;
  const timeSinceDecisionMs = state.simulatedClockMs - Number(memory.lastDecisionSimMs ?? -Infinity);
  const cooldownRemainingMs = Math.max(0, Number(memory.nextDecisionAllowedSimMs ?? 0) - state.simulatedClockMs);
  const hardRejectCooldown = HARD_TACK_REJECT_REASONS.has(String(memory.lastRejectionReason ?? ""));
  const threshold = longBoard || overstood || poorVmg
    ? (profile.riskTolerance ?? 0.16) * 0.58
    : (profile.riskTolerance ?? 0.16);
  const planSideBonus = selected.sideSign === legPlan.targetSideSign ? 0.045 : -0.025;
  const planAdjustedDelta = delta + planSideBonus;
  const wantsSwitch = selected.sideSign !== currentSide && (startSplitCommitment || emergency || planAdjustedDelta > threshold);
  const windowOpen = timeSinceDecisionMs >= decisionWindowMs;
  const cooldownActive = cooldownRemainingMs > 0 && !startSplitCommitment && (hardRejectCooldown || !emergency);
  const shiftReady = shift.persistent || emergency || startSplitCommitment || planAdjustedDelta > threshold * (1.85 - clamp(Number(profile.trackStyle?.reactivity ?? 0.5), 0, 1) * 0.55);
  let shouldSwitch = wantsSwitch && !cooldownActive && (windowOpen || emergency || startSplitCommitment) && shiftReady;
  let deferredReason = "";
  const candidateElapsedMs = state.simulatedClockMs - Number(memory.lastCandidateSimMs ?? -Infinity);
  const candidateLimiterMs = Math.max(0, TACTIC_CANDIDATE_MIN_INTERVAL_MS - candidateElapsedMs);
  if (shouldSwitch && !startSplitCommitment && candidateLimiterMs > 0) {
    shouldSwitch = false;
    memory.nextDecisionAllowedSimMs = Math.max(Number(memory.nextDecisionAllowedSimMs ?? 0), state.simulatedClockMs + candidateLimiterMs);
    deferredReason = `candidate limiter ${formatRaceTime(candidateLimiterMs)} before next tack evaluation`;
  }
  if (shouldSwitch && !emergency && !startSplitCommitment) {
    const gatePreview = canAcceptBotTack(boat, {
      courseStageIndex: boat.courseIndex,
      stageMode: stage?.mode,
      isMarkRounding: false,
      forceClosure: false,
      distanceToTargetM,
      stageElapsedMs,
    });
    if (!gatePreview.allowed) {
      shouldSwitch = false;
      const telemetry = ensureBoatTelemetry(boat);
      const timeSinceLast = telemetry.lastManeuverSimMs == null ? Infinity : state.simulatedClockMs - telemetry.lastManeuverSimMs;
      const cooldownMs = gatePreview.reason === "wait_3s"
        ? Math.max(500, 3000 - timeSinceLast)
        : tacticalRejectCooldownMs(boat, gatePreview.reason);
      memory.nextDecisionAllowedSimMs = Math.max(Number(memory.nextDecisionAllowedSimMs ?? 0), state.simulatedClockMs + cooldownMs);
      memory.lastRejectionReason = gatePreview.reason;
      deferredReason = `tack deferred (${gatePreview.reason}), cooldown ${formatRaceTime(cooldownMs)}`;
    }
  }
  if ((windowOpen || shouldSwitch || emergency) && !cooldownActive) {
    memory.lastDecisionSimMs = state.simulatedClockMs;
  }
  const label = startSplitCommitment
    ? `Start ${sideNameFromSign(selected.sideSign)}`
    : shouldSwitch
    ? `${forceClosure ? "Mark close" : "Garda"} ${sideNameFromSign(selected.sideSign)}`
    : `VMG ${sideNameFromSign(currentSide)}`;
  const closureReason = forceClosure
    ? `, mark close: ${Math.round(distanceToTargetM)} m, VMG ${currentVmgKn.toFixed(1)} kn, leg ${formatRaceTime(stageElapsedMs)}`
    : "";
  const startReason = startSplitCommitment
    ? `, start split: holding ${sideNameFromSign(selected.sideSign)} until ${formatRaceTime(GARDA_START_SPLIT_COMMITMENT_SIM_MS)}`
    : "";
  const planText = `plan ${legPlan.targetSide} ${Math.round(legPlan.rightShareTarget * 100)}%, target ${legPlan.maneuverTarget} tacks`;
  const shiftText = `header ${shift.magnitudeDeg.toFixed(1)}° for ${formatRaceTime(shift.durationMs)} / ${formatRaceTime(shift.requiredMs)}`;
  const holdReason =
    deferredReason
      ? `${deferredReason}, ${planText}`
    : cooldownActive
      ? `anti-zigzag cooldown ${formatRaceTime(cooldownRemainingMs)} after a rejected tack, ${planText}`
      : !windowOpen && !emergency && !startSplitCommitment
        ? `decision window closed (${formatRaceTime(timeSinceDecisionMs)}/${formatRaceTime(decisionWindowMs)}), ${planText}`
        : wantsSwitch && !shiftReady
          ? `${shiftText} below athlete threshold, ${planText}`
          : `${planText}, field ${current.fieldLabel}`;
  const reason = shouldSwitch
    ? `${label}: score ${selected.score.toFixed(2)} = VMG ${selected.scoreBreakdown.vmg.toFixed(2)} + field ${selected.fieldScore.toFixed(2)} + style ${selected.scoreBreakdown.athleteStyle.toFixed(2)} + profile ${selected.generatedBoost.toFixed(2)} - risks ${(selected.scoreBreakdown.landRisk + selected.scoreBreakdown.fleetPenalty).toFixed(2)}, ${shiftText}, ${planText}${closureReason}${startReason}`
    : `${label}: holding board, ${holdReason}, delta ${planAdjustedDelta.toFixed(2)}, score ${current.score.toFixed(2)}, distance ${Math.round(distanceToTargetM)} m${startReason}`;
  memory.lastDecisionReason = reason;
  return {
    ...selected,
    currentScore: current.score,
    scoreDelta: planAdjustedDelta,
    shouldSwitch,
    forceClosure,
    closureProgressGap,
    distanceToTargetM,
    stageElapsedMs,
    legPlan,
    decisionWindowMs,
    timeSinceDecisionMs,
    nextDecisionInMs: cooldownActive ? cooldownRemainingMs : Math.max(0, decisionWindowMs - timeSinceDecisionMs),
    cooldownActive,
    shiftMagnitudeDeg: shift.magnitudeDeg,
    shiftDurationMs: shift.durationMs,
    shiftRequiredMs: shift.requiredMs,
    expectedRecovery: shift.expectedRecovery,
    candidateTacks: Number(memory.candidateTacks ?? 0),
    rejectedTackCandidates: Number(memory.rejectedTackCandidates ?? 0),
    label,
    reason,
  };
}

function buildRouteStageDecision(boat, stage, target, desiredHeading, sideSign) {
  const mode = stage?.mode ?? "route";
  const distanceToTargetM = target ? haversineMeters(boat, target) : 0;
  const memory = stageMemoryForBoat(boat);
  const stageElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
  const label =
    mode === "reach" ? `Reach ${target?.id ?? ""}` :
    mode === "run" && stage?.gate ? `Gate ${target?.id ?? ""}` :
    mode === "run" ? `Run ${target?.id ?? ""}` :
    mode === "finish" ? "Finish" :
    "Route";
  const sideName = sideNameFromSign(sideSign);
  const distanceText = Math.round(distanceToTargetM);
  const headingText = Math.round(normalizeAngle(desiredHeading));
  const speedText = Number(boat.currentSpeedKn ?? boat.speed ?? 0).toFixed(1);
  const routeIntent =
    mode === "finish" ? "cross the finish line" :
    stage?.gate ? `choose and round gate ${target?.id ?? ""}` :
    target?.id ? `round ${target.id}` :
    "hold the route";
  return {
    sideSign,
    side: sideName,
    action: "hold",
    shouldSwitch: false,
    forceClosure: false,
    distanceToTargetM,
    stageElapsedMs,
    heading: normalizeAngle(desiredHeading),
    score: 0,
    scoreDelta: 0,
    fieldScore: 0,
    fieldLabel: mode === "finish" ? "finish-line" : stage?.gate ? "gate-choice" : "controlled-route",
    scoreBreakdown: {
      vmg: 0,
      pressure: 0,
      lift: 0,
      layline: 0,
      athleteStyle: 0,
      landRisk: 0,
      centerPenalty: 0,
      fleetPenalty: 0,
      total: 0,
    },
    label,
    reason: `${label}: ${routeIntent}, side ${sideName}, course ${headingText}°, distance ${distanceText} m, speed ${speedText} kn, leg ${formatRaceTime(stageElapsedMs)}`,
  };
}

function applyLocalGardaDecision(boat, stage, decision) {
  if (!decision || !decision.shouldSwitch) {
    return;
  }
  const memory = stageMemoryForBoat(boat);
  if (state.simulatedClockMs >= 12000) {
    const candidateElapsedMs = state.simulatedClockMs - Number(memory.lastCandidateSimMs ?? -Infinity);
    if (candidateElapsedMs < TACTIC_CANDIDATE_MIN_INTERVAL_MS) {
      const remainingMs = TACTIC_CANDIDATE_MIN_INTERVAL_MS - candidateElapsedMs;
      memory.nextDecisionAllowedSimMs = Math.max(Number(memory.nextDecisionAllowedSimMs ?? 0), state.simulatedClockMs + remainingMs);
      decision.appliedManeuver = false;
      decision.shouldSwitch = false;
      decision.cooldownActive = true;
      decision.nextDecisionInMs = remainingMs;
      decision.label = `VMG ${sideNameFromSign(boat.liveSideSign || resolveRouteSideSign(boat))}`;
      decision.reason = `${decision.label}: candidate limiter ${formatRaceTime(remainingMs)} before next tack evaluation.`;
      memory.lastDecisionReason = decision.reason;
      return;
    }
  }
  memory.lastCandidateSimMs = state.simulatedClockMs;
  memory.candidateTacks = Number(memory.candidateTacks ?? 0) + 1;
  const telemetry = ensureBoatTelemetry(boat);
  telemetry.candidateTacks = Number(telemetry.candidateTacks ?? 0) + 1;
  if (state.simulatedClockMs < 12000) {
    boat.liveSideSign = decision.sideSign;
    boat.mure = decision.sideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    memory.lastSideSign = decision.sideSign;
    memory.sideStartedSimMs = state.simulatedClockMs;
    memory.lastDecisionSimMs = state.simulatedClockMs;
    decision.appliedManeuver = true;
    return;
  }
  const gate = canAcceptBotTack(boat, {
    courseStageIndex: boat.courseIndex,
    stageMode: stage?.mode,
    isMarkRounding: false,
    forceClosure: Boolean(decision.forceClosure),
    distanceToTargetM: decision.distanceToTargetM,
    stageElapsedMs: decision.stageElapsedMs,
  });
  if (!gate.allowed) {
    const timeSinceLast = telemetry.lastManeuverSimMs == null ? Infinity : state.simulatedClockMs - telemetry.lastManeuverSimMs;
    const cooldownMs = gate.reason === "wait_3s"
      ? Math.max(500, 3000 - timeSinceLast)
      : tacticalRejectCooldownMs(boat, gate.reason);
    memory.nextDecisionAllowedSimMs = Math.max(Number(memory.nextDecisionAllowedSimMs ?? 0), state.simulatedClockMs + cooldownMs);
    memory.lastRejectionReason = gate.reason;
    if (gate.reason !== "wait_3s") {
      memory.rejectedTackCandidates = Number(memory.rejectedTackCandidates ?? 0) + 1;
      telemetry.rejectedTackCandidates = Number(telemetry.rejectedTackCandidates ?? 0) + 1;
      if (state.simulatedClockMs - Number(telemetry.lastRejectedManeuverSimMs ?? -Infinity) > cooldownMs * 0.8) {
        telemetry.rejectedTacks += 1;
        telemetry.lastRejectedManeuverSimMs = state.simulatedClockMs;
        boat.rejectedTacks = telemetry.rejectedTacks;
      }
    }
    const currentSideName = sideNameFromSign(boat.liveSideSign || resolveRouteSideSign(boat));
    decision.appliedManeuver = false;
    decision.rejectedReason = gate.reason;
    decision.shouldSwitch = false;
    decision.cooldownActive = true;
    decision.nextDecisionInMs = cooldownMs;
    decision.rejectedTackCandidates = Number(memory.rejectedTackCandidates ?? 0);
    decision.label = `VMG ${currentSideName}`;
    decision.reason = `VMG ${currentSideName}: tack rejected (${gate.reason}), anti-zigzag cooldown ${formatRaceTime(cooldownMs)}; holding board, distance ${Math.round(Number(decision.distanceToTargetM ?? 0))} m`;
    memory.lastDecisionReason = decision.reason;
    return;
  }
  boat.liveSideSign = decision.sideSign;
  boat.mure = decision.sideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * (boat.tacticalProfile?.maneuverPenalty ?? 0.94), 0.74, 1);
  registerManeuverTelemetry(boat, { courseStageIndex: boat.courseIndex, stageMode: stage?.mode }, gate.countAsTack);
  decision.appliedManeuver = true;
  memory.lastSideSign = decision.sideSign;
  memory.sideStartedSimMs = state.simulatedClockMs;
  memory.lastDecisionSimMs = state.simulatedClockMs;
  memory.nextDecisionAllowedSimMs = Math.max(
    Number(memory.nextDecisionAllowedSimMs ?? 0),
    state.simulatedClockMs + Math.min(26000, Number(boat.tacticalProfile?.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS) * 0.35)
  );
  memory.lastRejectionReason = null;
  memory.pendingShift = null;
  memory.lastDecisionReason = decision.reason ?? "";
}

function resolveRouteSideSign(boat) {
  if (boat?.preferred_side === "right") {
    return -1;
  }
  if (boat?.preferred_side === "left") {
    return 1;
  }
  const laneBias = Number(boat?.tacticalProfile?.laneBias ?? 0);
  return laneBias >= 0 ? -1 : 1;
}

function routeStageSpecs() {
  return COURSE_SEQUENCE.map((stage, courseStageIndex) => ({
    ...stage,
    courseStageIndex,
    targets: stage.targets ?? (stage.target ? [stage.target] : []),
    roundRadius: MARK_ROUNDING_RADIUS_METERS,
  }));
}

function createRaceWindProfile() {
  const roll = Math.random();
  if (roll < 0.34) {
    const offset = RACE_WIND_STRONG_SHIFT_MIN_DEG + Math.random() * (RACE_WIND_STRONG_SHIFT_MAX_DEG - RACE_WIND_STRONG_SHIFT_MIN_DEG);
    return {
      windShiftMode: "right-shift Ora",
      windDirectionOffsetDeg: offset,
      windTacticSwing: clamp(offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.13, -0.13, 0.13),
      rightLiftBias: 1.22,
      leftPocket: false,
      shiftOscillationScale: 0.92,
    };
  }
  if (roll < 0.68) {
    const offset = -(RACE_WIND_STRONG_SHIFT_MIN_DEG + Math.random() * (RACE_WIND_STRONG_SHIFT_MAX_DEG - RACE_WIND_STRONG_SHIFT_MIN_DEG));
    return {
      windShiftMode: "left-shift Ora",
      windDirectionOffsetDeg: offset,
      windTacticSwing: clamp(offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.13, -0.13, 0.13),
      rightLiftBias: 0.56,
      leftPocket: true,
      shiftOscillationScale: 0.98,
    };
  }
  const offset = (Math.random() - 0.5) * 12;
  return {
    windShiftMode: "mixed Ora",
    windDirectionOffsetDeg: offset,
    windTacticSwing: clamp(offset / RACE_WIND_STRONG_SHIFT_MAX_DEG * 0.06, -0.06, 0.06),
    rightLiftBias: clamp(0.9 + offset / 70 + Math.random() * 0.18, 0.74, 1.16),
    leftPocket: Math.random() < 0.16,
    shiftOscillationScale: 1.08,
  };
}

function createRaceProfile() {
  const seed = Math.random();
  const raceWind = createRaceWindProfile();
  const leftPocket = Boolean(raceWind.leftPocket);
  const windAiScenario = chooseWindAiScenario(state.windAiModel, seed);
  const tacticSeed = Math.random();
  const tacticRoll = Math.random();
  const tacticMode =
    raceWind.windShiftMode === "right-shift Ora" && tacticRoll < 0.62 ? "right_pressure" :
    raceWind.windShiftMode === "left-shift Ora" && tacticRoll < 0.62 ? "left_lift" :
    tacticRoll < 0.26 ? "right_pressure" :
    tacticRoll < 0.52 ? "left_lift" :
    tacticRoll < 0.74 ? "center_control" :
    "split_fleet";
  const modeBaseSwing =
    tacticMode === "right_pressure" ? 0.14 + Math.random() * 0.15 :
    tacticMode === "left_lift" ? -0.14 - Math.random() * 0.15 :
    tacticMode === "center_control" ? (Math.random() - 0.5) * 0.07 :
    (Math.random() - 0.5) * 0.46;
  const windDirectionOffsetDeg = Number(raceWind.windDirectionOffsetDeg ?? 0);
  return {
    seed,
    tacticSeed,
    tacticMode,
    tacticSideSwing: clamp(
      modeBaseSwing + Number(raceWind.windTacticSwing ?? 0) + (leftPocket ? -0.05 : 0),
      -RACE_TACTIC_SIDE_SWING_MAX,
      RACE_TACTIC_SIDE_SWING_MAX
    ),
    windAiScenarioId: windAiScenario?.id ?? null,
    windAiSourceRaceKey: windAiScenario?.source_race_key ?? null,
    windShiftMode: raceWind.windShiftMode,
    windDirectionOffsetDeg,
    baseTwdDeg: normalizeAngle(ORA_BASE_DIRECTION_DEG + windDirectionOffsetDeg),
    // Base TWD changes between races; in-race oscillations stay bounded and tactical.
    windOscillationDeg: RACE_WIND_OSCILLATION_MIN_DEG + Math.random() * (RACE_WIND_OSCILLATION_MAX_DEG - RACE_WIND_OSCILLATION_MIN_DEG),
    shiftOscillationScale: raceWind.shiftOscillationScale,
    lineRotationMeters: 0,
    lineShiftMeters: 0,
    markShiftMeters: 0,
    rightLiftBias: Number(raceWind.rightLiftBias ?? (leftPocket ? 0.4 : 1)),
    leftPocket,
  };
}

function translatePoint(point, bearing, meters) {
  const [lat, lon] = movePreviewPoint(point, bearing, meters);
  return { ...point, lat, lon };
}

function applyRaceVariationToBuoys() {
  if (!state.baseBuoys?.length) {
    state.baseBuoys = structuredClone(state.buoys);
  }
  const profile = state.raceProfile ?? createRaceProfile();
  state.raceProfile = profile;
  state.buoys = structuredClone(state.baseBuoys);
}

function chooseBestRouteCandidate(boat, first, second, mode) {
  if (!first) {
    return { target: second, laneSide: 1 };
  }
  if (!second) {
    return { target: first, laneSide: -1 };
  }

  const profile = boat.tacticalProfile ?? refreshBoatEngineProfile(boat);
  const midpointLon = (first.lon + second.lon) / 2;
  const firstSide = first.lon <= midpointLon ? -1 : 1;
  const secondSide = second.lon <= midpointLon ? -1 : 1;
  const modeWeight = mode === "upwind" ? 0.16 : mode === "reach" ? 0.1 : mode === "run" ? 0.08 : 0.05;
  const staticWindFirst = windEngineAt(first, 0);
  const staticWindSecond = windEngineAt(second, 0);
  const windSensitivity = profile.windSensitivity ?? 1;
  const firstScore = staticWindFirst.multiplier * windSensitivity + profile.laneBias * firstSide * modeWeight + (profile.courseBoldness - 1) * 0.06;
  const secondScore = staticWindSecond.multiplier * windSensitivity + profile.laneBias * secondSide * modeWeight + (profile.courseBoldness - 1) * 0.06;
  return firstScore >= secondScore
    ? { target: first, laneSide: firstSide }
    : { target: second, laneSide: secondSide };
}

function chooseTacticalSideSign(boat, stage, origin, target) {
  const profile = boat.tacticalProfile ?? refreshBoatEngineProfile(boat);
  const metrics = boat.metrics ?? {};
  const dataRightBias = clamp((Number(metrics.avg_rt_pct ?? 50) - Number(metrics.avg_lt_pct ?? 50)) / 100, -0.36, 0.36);
  const bearing = bearingDegrees(origin, target);
  const distance = haversineMeters(origin, target);
  const raceProfile = state.raceProfile ?? createRaceProfile();
  const stageWeight = stage.mode === "upwind" ? 1 : stage.mode === "reach" ? 0.72 : 0.58;
  const candidates = [-1, 1].map((sideSign) => {
    const sideFactor = sideSign < 0 ? 1 : -1;
    const sampleBearing = normalizeAngle(bearing + sideSign * (stage.mode === "upwind" ? 42 : 24));
    const sample = makeWaypointFromBearing(origin, sampleBearing, clamp(distance * 0.34, 250, 850));
    const wind = windEngineAt(sample, 0);
    const tacticalNoise = deterministicJitter(boat, stage.courseStageIndex + (sideSign < 0 ? 13 : 29)) * 0.07;
    const raceSidePressure = ((raceProfile.rightLiftBias ?? 1) - 0.7) * sideFactor * 0.09 + (raceProfile.leftPocket ? -sideFactor * 0.08 : 0);
    const score =
      Number(wind.multiplier ?? 1) * stageWeight +
      dataRightBias * sideFactor * 0.28 +
      Number(profile.laneBias ?? 0) * sideFactor * 0.16 +
      raceSidePressure +
      tacticalNoise;
    return { sideSign, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.sideSign ?? resolveRouteSideSign(boat);
}

function makeWaypointFromBearing(origin, bearing, meters, extra = {}) {
  const [lat, lon] = movePreviewPoint(origin, bearing, meters);
  return {
    lat,
    lon,
    kind: extra.kind ?? "route",
    stageMode: extra.stageMode ?? "route",
    flipMure: Boolean(extra.flipMure),
    label: extra.label ?? "route",
    laneSide: extra.laneSide ?? null,
    courseStageIndex: extra.courseStageIndex ?? null,
    endsStage: Boolean(extra.endsStage),
    isMarkRounding: Boolean(extra.isMarkRounding),
  };
}

function makeTacticalWaypoint(origin, heading, meters, extra = {}) {
  const point = makeWaypointFromBearing(origin, heading, meters, extra);
  point.requiredHeading = normalizeAngle(heading);
  point.roundRadius = extra.roundRadius ?? 56;
  return point;
}

function addStageWaypoints(origin, target, boat, stage) {
  const profile = boat.tacticalProfile ?? refreshBoatEngineProfile(boat);
  const distance = haversineMeters(origin, target);
  const bearing = bearingDegrees(origin, target);
  const sideSign = Number.isFinite(target.laneSide) && target.laneSide !== 0 ? target.laneSide : resolveRouteSideSign(boat);
  const trackStyle = profile.trackStyle ?? {};
  const patience = Number(trackStyle.patience ?? 0.5);
  const reactivity = Number(trackStyle.reactivity ?? 0.5);
  const boardStretch = clamp(1 + (patience - 0.5) * 0.42 - (reactivity - 0.5) * 0.18, 0.72, 1.28);
  const shortBoardFactor = clamp(1 - patience * 0.18 + reactivity * 0.14, 0.82, 1.18);
  const route = [];
  const variation = deterministicJitter(boat, route.length + Math.round(distance));
  const boldness = profile.courseBoldness ?? 1;
  const reachDelta = clamp((profile.reachAngleOffset ?? 0) + variation * 1.2, -MAX_TACTICAL_HEADING_DELTA, MAX_TACTICAL_HEADING_DELTA);
  const runDelta = clamp((profile.runAngleOffset ?? 0) + variation * 1.0, -MAX_TACTICAL_HEADING_DELTA, MAX_TACTICAL_HEADING_DELTA);
  const upwindLeadFactor = (profile.upwindLeadFactor ?? 0.14) + Math.abs(variation) * 0.012;
  const laylineLeadFactor = (profile.laylineLeadFactor ?? 0.11) + Math.max(0, -variation) * 0.012;

  if (stage.mode === "upwind") {
    const profile2 = getBoatProfile(boat);
    const firstWind = windEngineAt(origin, 0);
    // === REAL GARDA ORA TACTIC ===
    // At the start: open on port tack. Ora blows from the south (185°).
    // Dominant tactic: short left board, then tack to starboard and commit to a long
    // right board toward the Bresciana shore pressure band.
    // The right side often brings pressure and lift; the left Malcesine lift is less regular.
    const isFirstUpwindLeg = (stage.courseStageIndex ?? 0) === 0;
    const rightPressureBias = (
      boat.preferred_side === "right" ? 0.72 :
      boat.preferred_side === "left"  ? 0.28 :
      0.58  // Default: slight right bias for standard Garda tactics.
    );
    // Long board: right for right-biased boats, left for left-biased boats.
    const longTackSideSign = rightPressureBias >= 0.5 ? -1 : 1; // -1 = right/port tack, 1 = left/starboard.
    const shortTackSideSign = -longTackSideSign;
    if (isFirstUpwindLeg) {
      // Short initial board.
      const shortTackHeading = allowedUpwindHeadingForSide(boat, firstWind, shortTackSideSign);
      const shortDist = clamp(
        Math.max(GARDA_ORA_SHORT_PORT_TACK_M, distance * UPWIND_FIRST_TACK_RATIO * shortBoardFactor),
        GARDA_ORA_SHORT_PORT_TACK_M,
        200
      );
      const shortWaypoint = makeTacticalWaypoint(origin, shortTackHeading, shortDist, {
        stageMode: stage.mode,
        label: `${stage.name}-short-board`,
        flipMure: true,
        laneSide: shortTackSideSign,
        courseStageIndex: stage.courseStageIndex,
        roundRadius: 55,
      });
      // Long board toward the chosen pressure shore.
      const longWind = windEngineAt(shortWaypoint, 0);
      const longHeading = allowedUpwindHeadingForSide(boat, longWind, longTackSideSign);
      const longDist = clamp(
        distance * UPWIND_SECOND_TACK_RATIO * boardStretch + Math.abs(variation) * 60,
        380, 920
      );
      const longWaypoint = makeTacticalWaypoint(shortWaypoint, longHeading, longDist, {
        stageMode: stage.mode,
        label: `${stage.name}-long-board`,
        flipMure: true,
        laneSide: longTackSideSign,
        courseStageIndex: stage.courseStageIndex,
        roundRadius: 72,
      });
      // Final mark approach.
      const approachWind = windEngineAt(longWaypoint, 0);
      const approachHeading = constrainedHeadingForStage(
        boat,
        bearingDegrees(longWaypoint, target),
        approachWind,
        stage.mode
      );
      route.push(
        shortWaypoint,
        longWaypoint,
        makeTacticalWaypoint(
          longWaypoint,
          approachHeading,
          clamp(distance * (0.14 + laylineLeadFactor * 0.2), 140, 340),
          {
            stageMode: stage.mode,
            label: `${stage.name}-layline`,
            laneSide: shortTackSideSign,
            courseStageIndex: stage.courseStageIndex,
            roundRadius: 80,
          }
        )
      );
    } else {
      // Later upwind legs: balanced tactic with athlete-specific side preference.
      const firstHeading = allowedUpwindHeadingForSide(boat, firstWind, longTackSideSign);
      const firstDistance = clamp(
        distance * (UPWIND_FIRST_TACK_RATIO * 1.8 + upwindLeadFactor * 0.2) * boardStretch,
        380, 900
      );
      const firstWaypoint = makeTacticalWaypoint(origin, firstHeading, firstDistance, {
        stageMode: stage.mode,
        label: `${stage.name}-bordo-lungo`,
        flipMure: true,
        laneSide: longTackSideSign,
        courseStageIndex: stage.courseStageIndex,
        roundRadius: 70,
      });
      const secondWind = windEngineAt(firstWaypoint, 0);
      const secondHeading = allowedUpwindHeadingForSide(boat, secondWind, -longTackSideSign);
      const secondDistance = clamp(
        distance * (UPWIND_SECOND_TACK_RATIO + laylineLeadFactor * 0.18) * clamp(1.12 - boardStretch * 0.18, 0.82, 1.08),
        340, 840
      );
      const secondWaypoint = makeTacticalWaypoint(firstWaypoint, secondHeading, secondDistance, {
        stageMode: stage.mode,
        label: `${stage.name}-rientro`,
        flipMure: true,
        laneSide: -longTackSideSign,
        courseStageIndex: stage.courseStageIndex,
        roundRadius: 76,
      });
      const approachWind2 = windEngineAt(secondWaypoint, 0);
      const approachHeading2 = constrainedHeadingForStage(
        boat,
        bearingDegrees(secondWaypoint, target),
        approachWind2,
        stage.mode
      );
      route.push(
        firstWaypoint,
        secondWaypoint,
        makeTacticalWaypoint(
          secondWaypoint,
          approachHeading2,
          clamp(distance * (0.13 + laylineLeadFactor * 0.2), 130, 340),
          {
            stageMode: stage.mode,
            label: `${stage.name}-layline`,
            laneSide: longTackSideSign,
            courseStageIndex: stage.courseStageIndex,
            roundRadius: 78,
          }
        )
      );
    }
  } else if (stage.mode === "reach") {
    route.push(
      makeWaypointFromBearing(origin, bearing, clamp(distance * (0.11 + upwindLeadFactor * 0.4), 80, 180), {
        stageMode: stage.mode,
        label: `${stage.name}-exit`,
        courseStageIndex: stage.courseStageIndex,
      })
    );
    route.push(
      makeWaypointFromBearing(origin, normalizeAngle(bearing + sideSign * (BASE_REACH_LANE_ANGLE + reachDelta)), clamp(distance * (0.12 + boldness * 0.035), 100, 280), {
        stageMode: stage.mode,
        label: `${stage.name}-lane`,
        laneSide: sideSign,
        courseStageIndex: stage.courseStageIndex,
      })
    );
  } else if (stage.mode === "run") {
    route.push(
      makeWaypointFromBearing(origin, bearing, clamp(distance * (0.1 + upwindLeadFactor * 0.35), 80, 170), {
        stageMode: stage.mode,
        label: `${stage.name}-exit`,
        courseStageIndex: stage.courseStageIndex,
      })
    );
    route.push(
      makeWaypointFromBearing(origin, normalizeAngle(bearing + sideSign * (BASE_RUN_LANE_ANGLE + runDelta)), clamp(distance * (0.11 + boldness * 0.03 + Math.abs(variation) * 0.01), 90, 250), {
        stageMode: stage.mode,
        label: `${stage.name}-lane`,
        laneSide: sideSign,
        courseStageIndex: stage.courseStageIndex,
      })
    );
  } else if (stage.mode === "approach") {
    route.push(
      makeWaypointFromBearing(origin, bearing, clamp(distance * 0.12, 80, 140), {
        stageMode: stage.mode,
        label: `${stage.name}-exit`,
        courseStageIndex: stage.courseStageIndex,
      })
    );
  }

  route.push(
    cloneRoutePoint(target, {
      kind: "route",
      stageMode: stage.mode,
      flipMure: Boolean(stage.flipAtTarget),
      label: stage.name,
      laneSide: sideSign,
      courseStageIndex: stage.courseStageIndex,
      endsStage: true,
      isMarkRounding: true,
    })
  );
  return route;
}

function auditRouteQuality(route = []) {
  const audit = {
    tacticalTacks: 0,
    maxStageTacks: 0,
    minWaypointDistanceM: Infinity,
    warnings: [],
  };
  let previous = null;
  const stageTacks = {};
  route.forEach((point) => {
    const sameStageAsPrevious = previous && point.courseStageIndex === previous.courseStageIndex;
    const bothTactical = previous && !previous.isMarkRounding && !point.isMarkRounding;
    if (sameStageAsPrevious && bothTactical && previous.stageMode === "upwind" && point.stageMode === "upwind") {
      audit.minWaypointDistanceM = Math.min(audit.minWaypointDistanceM, haversineMeters(previous, point));
    }
    if (point.flipMure && !point.isMarkRounding) {
      audit.tacticalTacks += 1;
      const stageKey = String(point.courseStageIndex ?? "unknown");
      stageTacks[stageKey] = (stageTacks[stageKey] ?? 0) + 1;
      audit.maxStageTacks = Math.max(audit.maxStageTacks, stageTacks[stageKey]);
      if (stageTacks[stageKey] > MAX_UPWIND_TACTICAL_TACKS) {
        audit.warnings.push(`too many tacks on leg ${stageKey}`);
      }
    }
    previous = point;
  });
  if (audit.minWaypointDistanceM < MIN_TACK_DISTANCE_METERS) {
    audit.warnings.push(`waypoints too close: ${Math.round(audit.minWaypointDistanceM)} m`);
  }
  if (!Number.isFinite(audit.minWaypointDistanceM)) {
    audit.minWaypointDistanceM = 0;
  }
  return audit;
}

function buildRouteForBoat(boat) {
  const stages = routeStageSpecs();
  const route = [];
  let cursor = { lat: boat.lat, lon: boat.lon, kind: "boat" };

  stages.forEach((stage) => {
    if (!stage.targets?.length) {
      return;
    }

    const target = stage.finishLine
      ? finishLineTarget()
      : lockedGateTarget(stage, boat, stage.courseStageIndex) ?? getBuoy(stage.targets[0]);
    const chosen = target
      ? cloneRoutePoint(target, {
          kind: "route",
          stageMode: stage.mode,
          flipMure: Boolean(stage.flipAtTarget),
          label: stage.name,
          laneSide: resolveRouteSideSign(boat),
        })
      : null;
    if (!chosen) {
      return;
    }

    const sideSign = chooseTacticalSideSign(boat, stage, cursor, chosen);
    route.push(...addStageWaypoints(cursor, { ...chosen, laneSide: sideSign }, boat, stage));
    cursor = chosen;
  });

  boat.routeAudit = auditRouteQuality(route);
  return route;
}

function boatModeLabel(leg) {
  return leg === "poppa" ? "Gybe" : "Tack";
}

function getSelectedBoat() {
  return state.boats.find((boat) => boat.id === state.selectedBoatId) ?? state.boats[0];
}

function getPilotBoat() {
  return state.boats.find((boat) => boat.isUserBoat) ?? getSelectedBoat();
}

function formatKn(value) {
  if (Number.isNaN(value) || value === null || value === undefined) {
    return "-";
  }
  return `${Number(value).toFixed(1)} kn`;
}

function formatSignedDecimal(value, decimals = 1, suffix = "") {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(decimals)}${suffix}`;
}

function displayPressureLabel(value) {
  const label = String(value ?? "-");
  if (label === "forte") return "strong";
  if (label === "debole") return "weak";
  if (label === "media") return "medium";
  return label;
}

function displayMureLabel(value) {
  if (value === "mure_a_sinistra") return "port tack";
  if (value === "mure_a_dritta") return "starboard tack";
  return value ?? "-";
}

function displayPolarLabel(value) {
  if (value === "troppo orzata") return "pinching";
  if (value === "troppo poggiata") return "low mode";
  if (value === "libera") return "free";
  return value ?? "-";
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatRaceTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return "--:--";
  }
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function classifyWindLane(point) {
  const polygonLons = (state.areaPolygon ?? []).map((item) => Number(item[1])).filter(Number.isFinite);
  const west = polygonLons.length ? Math.min(...polygonLons) : 10.836;
  const east = polygonLons.length ? Math.max(...polygonLons) : 10.8495;
  const normalized = Math.min(Math.max((point.lon - west) / (east - west), 0), 1);
  const laneBands = [
    { name: "far_left", limit: 0.18, factor: 0.96, bias: -1 },
    { name: "left", limit: 0.38, factor: 1.025, bias: -0.5 },
    { name: "center", limit: 0.62, factor: 1.0, bias: 0 },
    { name: "right", limit: 0.84, factor: 0.985, bias: 0.5 },
    { name: "far_right", limit: 1.01, factor: 0.955, bias: 1 },
  ];
  const laneBand = laneBands.find((band) => normalized < band.limit) ?? laneBands[laneBands.length - 1];
  return { normalized, laneBand };
}

function upperBoundIndex(sortedValues, value) {
  if (Number.isNaN(value)) return sortedValues.length - 1;
  let low = 0;
  let high = sortedValues.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (sortedValues[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function bilinearSample(values, lats, lons, lat, lon) {
  const rowCount = Array.isArray(values) ? values.length : 0;
  const colCount = rowCount > 0 && Array.isArray(values[0]) ? values[0].length : 0;
  if (!rowCount || !colCount) {
    return 0;
  }

  const latClamped = clamp(lat, lats[0], lats[lats.length - 1]);
  const lonClamped = clamp(lon, lons[0], lons[lons.length - 1]);
  const safeLatHi = Math.min(Math.max(1, upperBoundIndex(lats, latClamped)), lats.length - 1);
  const safeLonHi = Math.min(Math.max(1, upperBoundIndex(lons, lonClamped)), lons.length - 1);
  const latLo = safeLatHi - 1;
  const lonLo = safeLonHi - 1;

  const lat0 = lats[latLo];
  const lat1 = lats[safeLatHi];
  const lon0 = lons[lonLo];
  const lon1 = lons[safeLonHi];
  const latRatio = lat1 === lat0 ? 0 : (latClamped - lat0) / (lat1 - lat0);
  const lonRatio = lon1 === lon0 ? 0 : (lonClamped - lon0) / (lon1 - lon0);

  const q11 = Number(values[latLo]?.[lonLo] ?? 0);
  const q12 = Number(values[latLo]?.[safeLonHi] ?? q11);
  const q21 = Number(values[safeLatHi]?.[lonLo] ?? q11);
  const q22 = Number(values[safeLatHi]?.[safeLonHi] ?? q11);

  return (
    (1 - latRatio) * (1 - lonRatio) * q11 +
    (1 - latRatio) * lonRatio * q12 +
    latRatio * (1 - lonRatio) * q21 +
    latRatio * lonRatio * q22
  );
}

function pickWindFrame(frames, elapsedHours) {
  const sortedFrames = [...frames].sort((a, b) => Number(a.hours ?? 0) - Number(b.hours ?? 0));
  if (sortedFrames.length === 1) {
    return { frameA: sortedFrames[0], frameB: sortedFrames[0], blend: 0 };
  }

  const targetHours = Number.isFinite(elapsedHours) ? elapsedHours : 0;
  if (targetHours <= Number(sortedFrames[0].hours ?? 0)) {
    return { frameA: sortedFrames[0], frameB: sortedFrames[0], blend: 0 };
  }
  if (targetHours >= Number(sortedFrames[sortedFrames.length - 1].hours ?? 0)) {
    return { frameA: sortedFrames[sortedFrames.length - 1], frameB: sortedFrames[sortedFrames.length - 1], blend: 0 };
  }

  for (let index = 0; index < sortedFrames.length - 1; index += 1) {
    const leftHours = Number(sortedFrames[index].hours ?? 0);
    const rightHours = Number(sortedFrames[index + 1].hours ?? 0);
    if (leftHours <= targetHours && targetHours <= rightHours) {
      const blend = rightHours === leftHours ? 0 : (targetHours - leftHours) / (rightHours - leftHours);
      return {
        frameA: sortedFrames[index],
        frameB: sortedFrames[index + 1],
        blend: clamp(blend, 0, 1),
      };
    }
  }

  return { frameA: sortedFrames[0], frameB: sortedFrames[0], blend: 0 };
}

function sampleWindFieldModel(windField, point, elapsedMs = performance.now()) {
  const grid = windField?.grid ?? {};
  const lats = grid.latitudes ?? [];
  const lons = grid.longitudes ?? [];
  const frames = windField?.frames ?? [];
  if (!frames.length || lats.length < 2 || lons.length < 2) {
    return null;
  }

  const { frameA, frameB, blend } = pickWindFrame(frames, elapsedMs / 3600000);
  const uA = bilinearSample(frameA.u, lats, lons, point.lat, point.lon);
  const vA = bilinearSample(frameA.v, lats, lons, point.lat, point.lon);
  const uB = bilinearSample(frameB.u, lats, lons, point.lat, point.lon);
  const vB = bilinearSample(frameB.v, lats, lons, point.lat, point.lon);
  const uMs = uA * (1 - blend) + uB * blend;
  const vMs = vA * (1 - blend) + vB * blend;
  const speedMs = Math.hypot(uMs, vMs);
  const speedKn = speedMs * 1.9438444924406048;
  const direction = normalizeAngle((Math.atan2(-uMs, -vMs) * 180) / Math.PI);
  const referenceKn = Number(grid.reference_wind_kn ?? 12);
  return {
    source: "grib",
    frameLabel: frameA.label ?? "GRIB",
    frameHours: Number(frameA.hours ?? 0),
    frameBlend: blend,
    speedMs,
    speedKn,
    uMs,
    vMs,
    direction,
    referenceKn,
    multiplier: referenceKn > 0 ? speedKn / referenceKn : 1,
    gust: {
      name: "GRIB",
      boost: speedKn - referenceKn,
    },
  };
}

function updateSelectedBoatInputs() {
  const boat = getSelectedBoat();
  if (!boat) {
    return;
  }
  el.dataPresetSelect.value = boat.dataPreset ?? "custom";
  el.boatNameInput.value = boat.name ?? boat.id;
  el.speedInput.value = Number(boat.speed ?? 0).toFixed(1);
  el.vmgInput.value = Number(boat.vmg ?? 0).toFixed(1);
  el.legSelect.value = state.leg;
}

function installDebugApi() {
  window.tacticalSailDebug = {
    getState: () => state,
    getPilotBoat,
    getSelectedBoat,
    windAt: windEngineAt,
    beginRace: beginRaceSimulation,
    tickSimulation,
    buildRouteForBoat,
    placeStart: placeSelectedBoatOnStartLine,
    steerPilotBoat,
    maneuverSelectedBoat,
    auditRouteQuality,
    buildTelemetryNote,
    getTelemetry: (boatId) => ensureBoatTelemetry(state.boats.find((boat) => boat.id === boatId) ?? getSelectedBoat()),
    constants: {
      upwindNoGoMinDeg: UPWIND_NO_GO_MIN_DEG,
      noGoMaxSpeedKn: NO_GO_MAX_SPEED_KN,
      upwindAllowedWindowDeg: UPWIND_ALLOWED_WINDOW_DEG,
      maxUpwindTacticalTacks: MAX_UPWIND_TACTICAL_TACKS,
      minTackDistanceMeters: MIN_TACK_DISTANCE_METERS,
    },
  };
}

function validationForBoat(boat) {
  if (!boat) {
    return null;
  }
  const rows = state.replayValidation?.bot_validation ?? state.hackathonReport?.bot_validation ?? [];
  const code = boat.isUserBoat && boat.dataPreset && boat.dataPreset !== "custom" ? boat.dataPreset : boat.id;
  return rows.find((row) => row.bot_code === code) ?? null;
}

function routeQaLabel(boat) {
  if (!boat) {
    return "-";
  }
  const audit = boat.routeAudit;
  const warnings = Array.isArray(audit?.warnings) ? audit.warnings.length : 0;
  if (warnings > 0) {
    return `${warnings} warning`;
  }
  const courseLock = state.hackathonReport?.course_validation?.course_lock_pct;
  return Number.isFinite(Number(courseLock)) ? `${Math.round(courseLock)}% lock` : "lock";
}

function updateHackathonPanel(boat, wind) {
  const report = state.hackathonReport;
  const validation = validationForBoat(boat);
  if (el.hackathonReadinessValue) {
    el.hackathonReadinessValue.textContent = report ? `${Number(report.hackathon_readiness_pct ?? 0).toFixed(1)}%` : "-";
  }
  if (el.replaySimilarityValue) {
    const value = validation?.style_similarity_pct ?? boat?.ghostSimilarity ?? null;
    el.replaySimilarityValue.textContent = Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "-";
  }
  if (el.windScenarioValue) {
    const scenario = state.raceProfile?.windAiScenarioId ?? wind?.windAi?.scenarioId ?? "-";
    const scenarioText = scenario === "-" ? "-" : String(scenario).replace("wind_ai_", "#");
    const twdOffset = Number(state.raceProfile?.windDirectionOffsetDeg ?? 0);
    const twdText = Number.isFinite(twdOffset) && state.raceProfile
      ? `${twdOffset >= 0 ? "+" : ""}${Math.round(twdOffset)}° TWD`
      : "";
    el.windScenarioValue.textContent = twdText ? `${scenarioText} · ${twdText}` : scenarioText;
  }
  if (el.routeQaValue) {
    el.routeQaValue.textContent = routeQaLabel(boat);
  }
  if (el.hackathonBadge) {
    const readiness = Number(report?.hackathon_readiness_pct ?? 0);
    el.hackathonBadge.textContent = readiness >= 80 ? "Demo" : readiness >= 70 ? "Beta" : "Proto";
  }
  if (el.hackathonNoteValue) {
    const autoFit = report?.auto_calibration_validation?.summary?.avg_calibrated_score_pct;
    const autoText = Number.isFinite(Number(autoFit)) ? ` Auto GPX ${Math.round(Number(autoFit))}%.` : "";
    const note = validation
      ? `${validation.athlete}: side ${Math.round(validation.side_similarity_pct)}%, maneuvers ${Math.round(validation.maneuver_similarity_pct)}%, speed ${Math.round(validation.speed_realism_pct)}%.${autoText}`
      : report?.minimum_demo?.status ?? "Hackathon report not loaded.";
    el.hackathonNoteValue.textContent = note;
  }
}

function updateTacticPanel(boat) {
  const decision = boat?.tacticalDecision ?? boat?.qwenDecision ?? null;
  const brain = boat?.bot_ai_brain ?? null;
  if (el.tacticBadge) {
    el.tacticBadge.textContent = boat?.isUserBoat ? "Manual" : brain ? "Brain" : "Local";
  }
  if (el.tacticActionValue) {
    el.tacticActionValue.textContent = decision?.label ?? decision?.action ?? (boat?.isUserBoat ? "manual" : "waiting");
  }
  if (el.tacticSideValue) {
    const side = decision?.target_side ?? decision?.side ?? sideNameFromSign(boat?.liveSideSign ?? 0);
    el.tacticSideValue.textContent = side || "-";
  }
  if (el.tacticScoreValue) {
    const score = decision?.score ?? decision?.scoreDelta ?? null;
    el.tacticScoreValue.textContent = Number.isFinite(Number(score)) ? Number(score).toFixed(2) : "-";
  }
  if (el.tacticEngineValue) {
    el.tacticEngineValue.textContent = boat?.aiEngine ?? (brain ? "brain" : "local");
  }
  if (el.tacticReasonValue) {
    const reason = decision?.reason ?? boat?.aiReason ?? "Start the race to inspect pressure, lift, VMG, and athlete style.";
    el.tacticReasonValue.textContent = reason.length > 170 ? `${reason.slice(0, 167)}...` : reason;
  }
}

function raceAuditState() {
  const finishIds = state.courseLines?.finishPassedBoatIds ?? new Set();
  const startIds = state.courseLines?.startPassedBoatIds ?? new Set();
  const autonomousIds = new Set(autonomousRaceBoats().map((boat) => boat.id));
  const boats = (state.boats ?? []).map((boat) => {
    const telemetry = ensureBoatTelemetry(boat);
    const stage = getCourseStage(boat.courseIndex ?? 0);
    const target = stage ? getCourseTarget(boat.courseIndex ?? 0, boat) : null;
    const distanceToTargetM = target ? haversineMeters(boat, target) : 0;
    const stageMemory = stageMemoryForBoat(boat);
    const stageElapsedSimMs = Math.max(0, state.simulatedClockMs - Number(stageMemory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
    const finished = Boolean(boat.race?.finishCrossed || Number(boat.courseIndex ?? 0) >= COURSE_SEQUENCE.length || finishIds.has(boat.id));
    const elapsedSimMs = Number(boat.race?.elapsedSimMs) > 0
      ? Number(boat.race.elapsedSimMs)
      : finished
        ? Math.max(0, Number(boat.race?.finishedAtSimMs ?? state.simulatedClockMs) - Number(boat.race?.startedAtSimMs ?? 0))
        : Number(boat.race?.elapsedSimMs ?? 0);
    const stageTacks = telemetry.stageTacks ?? {};
    const maxStageTacks = Math.max(0, ...Object.values(stageTacks).map((value) => Number(value) || 0));
    const warningCount = Array.isArray(boat.routeAudit?.warnings) ? boat.routeAudit.warnings.length : 0;
    const decision = boat.tacticalDecision ?? boat.qwenDecision ?? null;
    const scoreBreakdown = decision?.scoreBreakdown
      ? Object.fromEntries(Object.entries(decision.scoreBreakdown).map(([key, value]) => [key, Number(Number(value).toFixed(3))]))
      : null;
    const shiftDurationValue = Number.isFinite(Number(decision?.shiftDurationMs))
      ? Number(decision.shiftDurationMs)
      : stageMemory.pendingShift
        ? Math.max(0, state.simulatedClockMs - Number(stageMemory.pendingShift.startedSimMs ?? state.simulatedClockMs))
        : 0;
    return {
      id: boat.id,
      name: boat.name,
      isUserBoat: Boolean(boat.isUserBoat),
      countsForRaceFinish: autonomousIds.has(boat.id),
      heading: Math.round(Number(boat.heading ?? 0)),
      mure: boat.mure ?? null,
      liveSide: sideNameFromSign(boat.liveSideSign ?? 0),
      preferredSide: boat.preferred_side ?? null,
      courseIndex: Number(boat.courseIndex ?? 0),
      stageName: stage?.name ?? "finished",
      stageMode: stage?.mode ?? "finished",
      targetId: target?.id ?? null,
      distanceToTargetM: Math.round(distanceToTargetM),
      stageElapsedSimMs: Math.round(stageElapsedSimMs),
      completedStages: Math.min(Number(boat.courseIndex ?? 0), COURSE_SEQUENCE.length),
      totalStages: COURSE_SEQUENCE.length,
      startCrossed: Boolean(boat.race?.startCrossed || startIds.has(boat.id)),
      finishCrossed: Boolean(boat.race?.finishCrossed || finishIds.has(boat.id)),
      finished,
      elapsedSimMs,
      tackCount: Number(telemetry.tackCount ?? boat.tackCount ?? 0),
      rejectedTacks: Number(telemetry.rejectedTacks ?? 0),
      candidateTacks: Number(telemetry.candidateTacks ?? stageMemory.candidateTacks ?? 0),
      rejectedTackCandidates: Number(telemetry.rejectedTackCandidates ?? stageMemory.rejectedTackCandidates ?? 0),
      stageTacks,
      maxStageTacks,
      tooManyTacks:
        maxStageTacks > 6 ||
        Number(telemetry.tackCount ?? 0) > 20 ||
        Number(telemetry.rejectedTackCandidates ?? 0) > 160,
      courseViolationCount: Number(boat.courseViolationCount ?? 0),
      routeWarnings: warningCount,
      routeGuardRecoveries: Number(boat.routeGuardRecoveries ?? 0),
      speedKn: Number((boat.currentSpeedKn ?? 0).toFixed(2)),
      vmgKn: Number((boat.currentVmgKn ?? 0).toFixed(2)),
      polarState: boat.polarState ?? null,
      trueWindAngleDeg: Number.isFinite(Number(boat.trueWindAngleDeg)) ? Math.round(Number(boat.trueWindAngleDeg)) : null,
      dirtyAirFactor: Number((boat.dirtyAirFactor ?? 1).toFixed(3)),
      dirtyAirSource: boat.dirtyAirSource ?? null,
      speedPenalty: Number((boat.speedPenalty ?? 1).toFixed(3)),
      maneuverRecoveryFactor: Number((boat.maneuverRecoveryFactor ?? 1).toFixed(3)),
      forceClosure: Boolean(boat.tacticalDecision?.forceClosure),
      markApproach: Boolean(boat.markApproachMode),
      finalBoardLock: Boolean(boat.finalBoardLock),
      finalBoardLockSide: sideNameFromSign(boat.finalBoardLockSideSign ?? boat.finalBoardLock?.sideSign ?? 0),
      finalBoardLockDistanceM: Number(boat.finalBoardLock?.startDistanceM ?? 0),
      closureProgressGap: Number((boat.tacticalDecision?.closureProgressGap ?? 0).toFixed(3)),
      legPlan: decision?.legPlan ?? stageMemory.currentPlan ?? null,
      decisionWindowMs: Number(decision?.decisionWindowMs ?? stageMemory.currentPlan?.decisionWindowMs ?? 0),
      nextDecisionInMs: Math.round(Number(decision?.nextDecisionInMs ?? Math.max(0, Number(stageMemory.nextDecisionAllowedSimMs ?? 0) - state.simulatedClockMs) ?? 0)),
      cooldownActive: Boolean(decision?.cooldownActive || Number(stageMemory.nextDecisionAllowedSimMs ?? 0) > state.simulatedClockMs),
      shiftMagnitudeDeg: Number.isFinite(Number(decision?.shiftMagnitudeDeg)) ? Number(Number(decision.shiftMagnitudeDeg).toFixed(1)) : null,
      shiftDurationMs: Math.round(shiftDurationValue),
      shiftRequiredMs: Math.round(Number(decision?.shiftRequiredMs ?? tacticalShiftRequiredMs(boat))),
      expectedRecovery: Number.isFinite(Number(decision?.expectedRecovery)) ? Number(Number(decision.expectedRecovery).toFixed(3)) : null,
      tacticLabel: decision?.label ?? decision?.action ?? null,
      scoreDelta: Number.isFinite(Number(decision?.scoreDelta)) ? Number(Number(decision.scoreDelta).toFixed(3)) : null,
      fieldLabel: boat.tacticalDecision?.fieldLabel ?? null,
      scoreBreakdown,
      engine: boat.aiEngine ?? (boat.bot_ai_brain ? "brain" : "local"),
      reason: boat.tacticalDecision?.reason ?? boat.aiReason ?? "",
    };
  });
  return {
    schema: "tacticalsail.race_audit.v1",
    generatedAtMs: Date.now(),
    raceStatus: state.raceStatus,
    simulatedClockMs: Math.round(state.simulatedClockMs ?? 0),
    raceProfile: state.raceProfile ? {
      seed: Number(Number(state.raceProfile.seed ?? 0).toFixed(5)),
      tacticSeed: Number(Number(state.raceProfile.tacticSeed ?? state.raceProfile.seed ?? 0).toFixed(5)),
      tacticMode: state.raceProfile.tacticMode ?? "balanced",
      tacticSideSwing: Number(Number(state.raceProfile.tacticSideSwing ?? 0).toFixed(3)),
      windShiftMode: state.raceProfile.windShiftMode ?? "mixed Ora",
      baseTwdDeg: Number(Number(state.raceProfile.baseTwdDeg ?? ORA_BASE_DIRECTION_DEG).toFixed(1)),
      windDirectionOffsetDeg: Number(Number(state.raceProfile.windDirectionOffsetDeg ?? 0).toFixed(1)),
      windOscillationDeg: Number(Number(state.raceProfile.windOscillationDeg ?? 0).toFixed(1)),
      windAiScenarioId: state.raceProfile.windAiScenarioId ?? null,
    } : null,
    courseSequence: COURSE_SEQUENCE.map((stage) => ({
      name: stage.name,
      mode: stage.mode,
      target: stage.target ?? stage.targets ?? (stage.finishLine ? "finish" : null),
    })),
    allStarted: boats.some((boat) => boat.countsForRaceFinish) && boats.filter((boat) => boat.countsForRaceFinish).every((boat) => boat.startCrossed),
    allFinished: boats.some((boat) => boat.countsForRaceFinish) && boats.filter((boat) => boat.countsForRaceFinish).every((boat) => boat.finished),
    manualUserExcludedFromFinish: boats.some((boat) => boat.isUserBoat && !boat.countsForRaceFinish),
    boats,
    warningCount: boats.reduce((sum, boat) => sum + boat.routeWarnings + boat.courseViolationCount + (boat.tooManyTacks ? 1 : 0), 0),
  };
}

function updateRaceAuditState() {
  let node = document.getElementById("raceAuditState");
  if (!node) {
    node = document.createElement("script");
    node.type = "application/json";
    node.id = "raceAuditState";
    document.body.appendChild(node);
  }
  node.textContent = JSON.stringify(raceAuditState());
}

function updateStatus() {
  const boat = getSelectedBoat();
  const wind = boat ? windEngineAt(boat) : null;
  const telemetry = boat ? ensureBoatTelemetry(boat) : null;
  const vmg = boat?.currentVmgKn ?? state.manualVmg ?? boat?.vmg ?? 0;
  const speed = boat?.currentSpeedKn ?? state.manualSpeed ?? boat?.speed ?? 0;
  el.statusChip.textContent = `${state.areaB?.area ?? "Area B"} · ${state.areaB?.name ?? "race"} · ${state.leg.toUpperCase()} · ${boat?.name ?? "boat"}`;
  el.activeSpeedValue.textContent = formatKn(speed);
  el.activeVmgValue.textContent = formatKn(vmg);
  el.vmgSourceBadge.textContent = state.manualVmg !== null || state.manualSpeed !== null ? "Manual" : "Auto";
  el.vmgBtn.textContent = state.showVmg ? "VMG ON" : "VMG OFF";
  el.maneuverBtn.textContent = boatModeLabel(state.leg);
  if (el.laylineBtn) {
    el.laylineBtn.textContent = state.showLaylines ? "Layline visible" : "Layline hidden";
  }
  el.moveToggleBtn.textContent = boat?.isMoving === false ? "Go" : "Stop";
  el.windBtn.textContent = state.windVisible ? "Wind ON" : "Wind OFF";
  el.gustValue.textContent = wind?.gust ? `${Math.round((wind.multiplier - 1) * 100)}%` : "+0%";
  el.pressureValue.textContent = displayPressureLabel(wind?.pressure);
  el.windBadge.textContent = wind?.source?.includes("wind-ai") ? "AI" : wind?.source === "grib" ? "GRIB" : wind?.gust?.name ?? "Ora";
  if (el.vtValue) {
    const vt = telemetry?.vt ?? (wind ? { direction: wind.direction, speedKn: wind.speedKn, source: wind.source } : null);
    const vtSpeed = Number.isFinite(Number(vt?.speedKn)) && Number(vt.speedKn) > 0 ? ` · ${Number(vt.speedKn).toFixed(1)} kn` : "";
    el.vtValue.textContent = vt ? `${Math.round(vt.direction)}°${vtSpeed}` : "-";
  }
  if (el.tackCountValue) {
    el.tackCountValue.textContent = String(telemetry?.tackCount ?? boat?.tackCount ?? 0);
  }
  if (el.sogDeltaValue) {
    el.sogDeltaValue.textContent = formatSignedDecimal(telemetry?.sogDeltaKn10s ?? 0, 2, " kn/10s");
  }
  if (el.vmgTrendValue) {
    const drop = Number(telemetry?.vmgDropRatio ?? 0);
    el.vmgTrendValue.textContent = Math.abs(drop) < 0.015 ? "stable" : `${drop > 0 ? "-" : "+"}${Math.abs(Math.round(drop * 100))}%`;
  }
  if (el.engineNoteValue) {
    el.engineNoteValue.textContent = telemetry?.note ?? "Engine waiting for data.";
  }
  updateHackathonPanel(boat, wind);
  updateTacticPanel(boat);
  if (state.raceStatus === "running" || state.raceStatus === "finished") {
    el.countdownDisplay.textContent = formatRaceTime(state.simulatedClockMs);
  } else if (state.raceStatus === "countdown") {
    el.countdownDisplay.textContent = formatCountdown(state.countdownRemaining);
  } else {
    el.countdownDisplay.textContent = "Instant";
  }
  el.startRaceBtn.textContent =
    state.raceStatus === "running" ? "Race running" : state.raceStatus === "finished" ? "Race finished" : "Start race";
  el.startRaceBtn.disabled = state.raceStatus !== "ready";
  el.raceBadge.textContent =
    state.raceStatus === "running" ? `Live ${state.qwenEngineStatus}` : state.raceStatus === "finished" ? "Done" : "Ready";
  el.editModeBtn.classList.toggle("active", state.editMode);
  el.toggleTrackBtn.classList.toggle("active", state.showTrack);
  el.toggleLabelsBtn.classList.toggle("active", state.showLabels);
  el.editModeBtn.disabled = true;
  el.editModeBtn.textContent = "Locked marks";
  updateSelectedBoatInputs();
  updateRaceAuditState();
}

function boatIcon(boat, selected = false) {
  const color = boat.isUserBoat ? "#ffffff" : boat.color;
  const selectedClass = selected ? " selected" : "";
  const myBoatClass = boat.isUserBoat ? " my-boat" : "";
  const heading = Number(boat.heading ?? 0);
  const displaySpeed = boat.currentSpeedKn ?? boat.speed ?? 0;
  const displayVmg = boat.currentVmgKn ?? boat.vmg ?? 0;
  const windSample = boat.isUserBoat ? windEngineAt(boat, state.raceStatus === "running" ? performance.now() : 0) : null;
  const windArrowAngle = windSample ? displayWindArrowAngle(boat, windSample) : 0;
  const windArrowHtml =
    boat.isUserBoat && state.leg === "bolina" && windSample
      ? `
        <div class="boat-wind-arrow" style="--wind-angle:${windArrowAngle}deg;">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 22 14h-7v8H9v-8H2Z" />
          </svg>
        </div>
      `
      : "";
  const labelHtml = state.showLabels
    ? `
        <div class="boat-pin-label boat-label">
          ${boat.name ?? boat.id}
          <small>${boat.isUserBoat ? `${boat.isMoving === false ? "Stopped" : "Sailing"}` : `${formatKn(displaySpeed)} · VMG ${formatKn(displayVmg)}`}</small>
        </div>
      `
    : "";
  return L.divIcon({
    className: "",
    html: `
      <div class="marker-wrap boat-marker-wrap">
        ${windArrowHtml}
        <div class="boat-shape${selectedClass}${myBoatClass}" style="--marker-color:${color}; transform: rotate(${heading}deg);">
          <svg class="boat-svg" viewBox="0 0 28 34" aria-hidden="true">
            <path class="boat-hull-shape" d="M14 2.2 C18.2 7.9 21.6 18.2 22.4 29.1 C18.7 27.7 16.1 27.1 14 27.1 C11.9 27.1 9.3 27.7 5.6 29.1 C6.4 18.2 9.8 7.9 14 2.2 Z" />
            <path class="boat-hull-keel" d="M14 7.3 L14 25.5" />
          </svg>
        </div>
        ${labelHtml}
      </div>
    `,
    iconSize: [68, 30],
    iconAnchor: [12, 12],
  });
}

function buoyIcon(buoy) {
  const hideLabel = buoy.id === "ALFA FIN";
  return L.divIcon({
    className: "",
    html: `
      <div class="marker-wrap">
        <div class="sail-marker buoy"><span></span></div>
        ${hideLabel ? "" : `<div class="mark-label buoy-label">${buoy.id}</div>`}
      </div>
    `,
    iconSize: [84, 32],
    iconAnchor: [14, 14],
  });
}

function pointToLatLng(point) {
  return [point.lat, point.lon];
}

function courseSafetyBounds() {
  const courseIds = new Set(["ALFA RC", "ALFA PIN", "ALFA FINISH", "ALFA FINISH END", "ALFA 3P", "ALFA 3ST", "ALFA 1", "ALFA 2"]);
  const points = (state.buoys ?? [])
    .filter((buoy) => courseIds.has(buoy.id))
    .map((buoy) => ({ lat: Number(buoy.lat), lon: Number(buoy.lon) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (points.length < 3) {
    return null;
  }
  return {
    minLat: Math.min(...points.map((point) => point.lat)) - COURSE_SAFETY_LAT_MARGIN_DEG,
    maxLat: Math.max(...points.map((point) => point.lat)) + COURSE_SAFETY_LAT_MARGIN_DEG,
    minLon: Math.min(...points.map((point) => point.lon)) - COURSE_SAFETY_LON_MARGIN_DEG,
    maxLon: Math.max(...points.map((point) => point.lon)) + COURSE_SAFETY_LON_MARGIN_DEG,
  };
}

function isPointInsideCourseSafetyCorridor(point) {
  const bounds = courseSafetyBounds();
  if (!bounds || !Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon))) {
    return true;
  }
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon
  );
}

function isPointInsideArea(point) {
  const polygon = state.areaPolygon ?? [];
  if (!polygon.length || !Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon))) {
    return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const yi = Number(polygon[i][0]);
    const xi = Number(polygon[i][1]);
    const yj = Number(polygon[j][0]);
    const xj = Number(polygon[j][1]);
    const intersects = yi > point.lat !== yj > point.lat &&
      point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function setBoatPositionInsideArea(boat, lat, lon) {
  const point = { lat, lon };
  if (isPointInsideArea(point) && (!isAutonomousRaceParticipant(boat) || isPointInsideCourseSafetyCorridor(point))) {
    boat.lat = lat;
    boat.lon = lon;
    return true;
  }
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.88, 0.72, 1);
  return false;
}

function enforceBoatInsideArea(boat, previousPoint) {
  const insideArea = boat && isPointInsideArea(boat);
  const insideCorridor = !isAutonomousRaceParticipant(boat) || isPointInsideCourseSafetyCorridor(boat);
  if (!boat || (insideArea && insideCorridor)) {
    return true;
  }
  if (previousPoint && isPointInsideArea(previousPoint) && (!isAutonomousRaceParticipant(boat) || isPointInsideCourseSafetyCorridor(previousPoint))) {
    boat.lat = previousPoint.lat;
    boat.lon = previousPoint.lon;
  }
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.72, 0.62, 1);
  boat.courseViolationCount = (boat.courseViolationCount ?? 0) + 1;
  const telemetry = ensureBoatTelemetry(boat);
  telemetry.note = `Course safety correction: ${boat.name ?? boat.id} was leaving the usable race corridor.`;
  return false;
}

function getBuoy(id) {
  return state.buoys.find((buoy) => buoy.id === id);
}

function getCourseStage(index = 0) {
  const numericIndex = Math.max(Math.floor(Number(index) || 0), 0);
  if (numericIndex >= COURSE_SEQUENCE.length) {
    return null;
  }
  const safeIndex = numericIndex;
  const stage = COURSE_SEQUENCE[safeIndex] ?? null;
  return stage ? { ...stage, courseStageIndex: safeIndex } : null;
}

function finishLineTarget() {
  const finishA = getBuoy("ALFA FINISH");
  const finishB = getBuoy("ALFA FINISH END") ?? getBuoy("ALFA FIN");
  if (!finishA || !finishB) {
    return finishA ?? finishB ?? null;
  }
  return {
    id: "ALFA FINISH LINE",
    lat: (finishA.lat + finishB.lat) / 2,
    lon: (finishA.lon + finishB.lon) / 2,
    kind: "finish",
  };
}

function gateCrowdingPenalty(target, boat) {
  if (!target || !boat) {
    return 0;
  }
  return state.boats.reduce((penalty, other) => {
    if (!other || other.id === boat.id || other.isUserBoat || other.courseIndex !== boat.courseIndex) {
      return penalty;
    }
    const distance = haversineMeters(other, target);
    return distance < 210 ? penalty + (210 - distance) * 0.42 : penalty;
  }, 0);
}

function gateFieldBonus(target, boat, windAtGate, stage) {
  if (!target || !boat || !windAtGate) {
    return 0;
  }
  const lane = classifyWindLane(target);
  const laneName = String(windAtGate.lane ?? lane.laneBand?.name ?? "");
  const pressureBonus = (Number(windAtGate.multiplier ?? 1) - 1) * FIELD_GATE_PRESSURE_METERS;
  const sideSign = target.lon <= ((getBuoy("ALFA 3P")?.lon ?? target.lon) + (getBuoy("ALFA 3ST")?.lon ?? target.lon)) / 2 ? 1 : -1;
  const ruleBonus = fieldRuleSideBias({ mode: stage?.mode ?? "run" }, sideSign, lane, windAtGate) * FIELD_GATE_LANE_METERS;
  const shorePenalty = Number(windAtGate.shoreRisk ?? 0) * 115;
  const centerPenalty = Math.abs(Number(windAtGate.laneIndex ?? lane.normalized ?? 0.5) - 0.5) < GARDA_CENTER_DEAD_BAND && windAtGate.pressure !== "forte"
    ? 42
    : 0;
  const nextUpwindSetup = getBuoy("ALFA 2");
  const setupBearing = nextUpwindSetup ? Math.abs(shortestAngleDelta(bearingDegrees(target, nextUpwindSetup), Number(windAtGate.direction ?? 185))) : 90;
  const setupBonus = clamp((95 - setupBearing) * 1.2, -35, 35);
  const lanePenalty = laneName === "far_left" || laneName === "far_right" ? 18 : 0;
  return pressureBonus + ruleBonus + setupBonus - shorePenalty - centerPenalty - lanePenalty;
}

function chooseGateTarget(stage, boat) {
  const targets = (stage?.targets ?? []).map((id) => getBuoy(id)).filter(Boolean);
  if (!targets.length) {
    return null;
  }
  if (targets.length === 1 || !boat) {
    return targets[0];
  }
  const wind = windEngineAt(boat, state.raceStatus === "running" ? performance.now() : 0);
  const scored = targets.map((target) => {
    const distance = haversineMeters(boat, target);
    const windAtGate = windEngineAt(target, state.raceStatus === "running" ? performance.now() : 0);
    const pressureBonus = (Number(windAtGate.multiplier ?? 1) - 1) * 260;
    const crosswindPenalty = Math.abs(shortestAngleDelta(bearingDegrees(boat, target), wind.direction)) * 0.55;
    const fieldBonus = gateFieldBonus(target, boat, windAtGate, stage);
    return {
      target,
      score: distance + gateCrowdingPenalty(target, boat) + crosswindPenalty - pressureBonus - fieldBonus,
    };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.target ?? targets[0];
}

function courseChoiceKey(stage, index = 0) {
  return stage?.name ?? `stage_${Number(index) || 0}`;
}

function lockedGateTarget(stage, boat, index = 0) {
  const targets = (stage?.targets ?? []).map((id) => getBuoy(id)).filter(Boolean);
  if (!targets.length) {
    return null;
  }
  if (!boat) {
    return chooseGateTarget(stage, boat);
  }
  boat.courseTargetChoices = boat.courseTargetChoices ?? {};
  const key = courseChoiceKey(stage, index);
  const savedTarget = targets.find((target) => target.id === boat.courseTargetChoices[key]);
  if (savedTarget) {
    return savedTarget;
  }
  const chosen = chooseGateTarget(stage, boat) ?? targets[0];
  boat.courseTargetChoices[key] = chosen.id;
  return chosen;
}

function getCourseTarget(index = 0, boat = null) {
  const stage = getCourseStage(index);
  if (!stage) {
    return null;
  }
  if (stage.finishLine) {
    return finishLineTarget();
  }
  if (stage.gate || stage.targets?.length) {
    return lockedGateTarget(stage, boat, index);
  }
  return getBuoy(stage.target);
}

function canBoatFinishCourse(boat) {
  const finishStageIndex = COURSE_SEQUENCE.findIndex((stage) => stage.finishLine);
  if (finishStageIndex < 0) {
    return true;
  }
  return Number(boat?.courseIndex ?? 0) >= finishStageIndex;
}

function isAutonomousRaceParticipant(boat) {
  return Boolean(boat && (!boat.isUserBoat || boat.demoAutopilot));
}

function autonomousRaceBoats() {
  const participants = state.boats.filter(isAutonomousRaceParticipant);
  return participants.length ? participants : state.boats;
}

function hasBoatFinishedCourse(boat) {
  return Boolean(boat?.race?.finishCrossed || Number(boat?.courseIndex ?? 0) >= COURSE_SEQUENCE.length || state.courseLines?.finishPassedBoatIds?.has(boat?.id));
}

function hasBoatStartedCourse(boat) {
  return Boolean(boat?.race?.startCrossed || state.courseLines?.startPassedBoatIds?.has(boat?.id));
}

function getNextManualTarget(boat) {
  return getCourseTarget(boat?.courseIndex ?? 0, boat);
}

function sideSignFromName(side) {
  if (side === "right") return -1;
  if (side === "left") return 1;
  return 0;
}

function sideNameFromSign(sideSign) {
  if (sideSign < 0) return "right";
  if (sideSign > 0) return "left";
  return "center";
}

function summarizeFleetForQwen(boat) {
  return state.boats
    .filter((item) => item.id !== boat.id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      stage: item.courseIndex ?? 0,
      speedKn: Number((item.currentSpeedKn ?? 0).toFixed(2)),
      vmgKn: Number((item.currentVmgKn ?? 0).toFixed(2)),
      heading: Math.round(Number(item.heading ?? 0)),
      mure: item.mure,
      distanceToTargetM: getCourseTarget(item.courseIndex ?? 0, item)
        ? Math.round(haversineMeters(item, getCourseTarget(item.courseIndex ?? 0, item)))
        : null,
    }));
}

function qwenDecisionPayload(boat, stage, target, wind) {
  const distanceM = target ? haversineMeters(boat, target) : null;
  const telemetry = ensureBoatTelemetry(boat);
  const ghostMetrics = compareBoatToGhost(boat);
  return {
    boat: {
      id: boat.id,
      name: boat.name,
      preferred_side: boat.preferred_side,
      mure: boat.mure,
      heading: Math.round(Number(boat.heading ?? 0)),
      speedKn: Number((boat.currentSpeedKn ?? 0).toFixed(2)),
      vmgKn: Number((boat.currentVmgKn ?? 0).toFixed(2)),
      lat: Number(boat.lat.toFixed(6)),
      lon: Number(boat.lon.toFixed(6)),
      metrics: boat.metrics ?? {},
      track_style: boat.track_style ?? null,
      simulator_profile: boat.simulator_profile ?? null,
      bot_ai_brain: boat.bot_ai_brain
        ? {
            version: boat.bot_ai_brain.version,
            memory: boat.bot_ai_brain.memory,
            policy_noise: boat.bot_ai_brain.policy?.noise,
          }
        : null,
      aggregate_stats: boat.aggregate_stats ?? null,
      replay_rank: boat.replayCalibration?.rank ?? null,
      ghost_similarity_pct: ghostMetrics ? Math.round(ghostMetrics.similarity) : null,
      ghost_error_m: ghostMetrics ? Math.round(ghostMetrics.meanErrorM) : null,
    },
    stage: {
      index: boat.courseIndex ?? 0,
      name: stage?.name,
      mode: stage?.mode,
    },
    target: target
      ? {
          id: target.id,
          bearing: Math.round(bearingDegrees(boat, target)),
          distanceM: Math.round(distanceM),
        }
      : null,
    wind: {
      direction: Math.round(Number(wind.direction ?? 0)),
      speedKn: Number((wind.speedKn ?? 0).toFixed(2)),
      multiplier: Number((wind.multiplier ?? 1).toFixed(3)),
      pressure: wind.pressure,
      lane: wind.lane,
      turbulence: Number((wind.turbulence ?? 0).toFixed(2)),
      shoreRisk: Number((wind.shoreRisk ?? 0).toFixed(2)),
      temporalZone: wind.temporalZone ?? "",
      temporalPhase: wind.temporalPhase ?? null,
      source: wind.source,
    },
    telemetry: {
      polarState: boat.polarState ?? "unknown",
      trueWindAngleDeg: Math.round(Number(boat.trueWindAngleDeg ?? 0)),
      tackCount: telemetry.tackCount ?? 0,
      rejectedTacks: telemetry.rejectedTacks ?? 0,
      vmgDropRatio: Number((telemetry.vmgDropRatio ?? 0).toFixed(3)),
    },
    garda: boat.tacticalDecision
      ? {
          label: boat.tacticalDecision.label,
          reason: boat.tacticalDecision.reason,
          scoreDelta: Number((boat.tacticalDecision.scoreDelta ?? 0).toFixed(3)),
          fieldScore: Number((boat.tacticalDecision.fieldScore ?? 0).toFixed(3)),
          fieldLabel: boat.tacticalDecision.fieldLabel ?? "",
          scoreBreakdown: boat.tacticalDecision.scoreBreakdown
            ? Object.fromEntries(Object.entries(boat.tacticalDecision.scoreBreakdown).map(([key, value]) => [key, Number(Number(value).toFixed(3))]))
            : null,
          xPrimeM: Math.round(Number(boat.tacticalDecision.currentX ?? 0)),
          candidateXPrimeM: Math.round(Number(boat.tacticalDecision.candidateX ?? 0)),
          rightShareTarget: Number((boat.tacticalDecision.rightShareTarget ?? 0.5).toFixed(2)),
          usedRightShare: Number((boat.tacticalDecision.usedRightShare ?? 0.5).toFixed(2)),
        }
      : null,
    // Flotta: visibile solo per il coach globale, non per i pilot isolati
    // Il payload per il pilot usa buildIsolatedBotQwenContext() che non include la flotta
    fleet: summarizeFleetForQwen(boat),
    // Contesto isolato del bot (privacy tattica)
    isolated_context: buildIsolatedBotQwenContext(boat, stage, target, wind),
  };
}

async function requestQwenDecision(boat, stage, target, wind) {
  if (!state.qwenLiveEnabled || boat.qwenRequestPending || boat.isUserBoat || !stage || !target) {
    return;
  }
  if (isUpwindFinalBoardZone(boat, stage, target)) {
    boat.qwenDecision = {
      action: "hold",
      side: sideNameFromSign(boat.finalBoardLockSideSign ?? boat.liveSideSign ?? resolveRouteSideSign(boat)),
      label: "Final board",
      reason: "Final board lock active: Qwen maneuvers disabled until mark rounding.",
      engine: "final-board-lock",
      appliedManeuver: true,
    };
    boat.aiEngine = "final-board-lock";
    boat.aiReason = boat.qwenDecision.reason;
    return;
  }

  const nowReal = performance.now();
  const lastSim = Number(boat.lastQwenDecisionSimMs ?? -Infinity);
  const lastReal = Number(boat.lastQwenDecisionRealMs ?? -Infinity);
  if (!Number.isFinite(Number(boat.qwenReadyRealMs))) {
    boat.qwenReadyRealMs = nowReal + ((deterministicJitter(boat, 91) + 1) * QWEN_FIRST_DECISION_STAGGER_REAL_MS) / 2;
  }
  if (nowReal < boat.qwenReadyRealMs) {
    return;
  }
  if (state.simulatedClockMs - lastSim < QWEN_DECISION_INTERVAL_SIM_MS || nowReal - lastReal < QWEN_DECISION_MIN_REAL_MS) {
    return;
  }

  boat.qwenRequestPending = true;
  boat.lastQwenDecisionSimMs = state.simulatedClockMs;
  boat.lastQwenDecisionRealMs = nowReal;
  boat.aiEngine = boat.qwenDecision?.engine ?? "qwen";
  state.qwenEngineStatus = "qwen...";

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(QWEN_DECISION_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qwenDecisionPayload(boat, stage, target, wind)),
      signal: controller.signal,
    });
    const payload = await response.json();
    const decision = payload.decision ?? {};
    boat.qwenDecision = {
      ...decision,
      engine: payload.engine ?? "unknown",
      backend: payload.backend ?? "",
      modelId: payload.model_id ?? "",
      runtimeError: payload.runtime_error ?? "",
      receivedAtSimMs: state.simulatedClockMs,
      appliedManeuver: false,
    };
    boat.aiEngine = payload.engine ?? "unknown";
    boat.aiReason = decision.reason ?? payload.runtime_error ?? "";
    state.qwenEngineStatus = payload.engine ?? "unknown";
  } catch (error) {
    boat.qwenDecision = {
      action: "hold",
      side: "center",
      heading_delta: 0,
      confidence: 0,
      reason: error?.name === "AbortError" ? "Qwen non ha risposto in tempo." : "Endpoint Qwen non disponibile.",
      engine: "offline",
      appliedManeuver: true,
    };
    boat.aiEngine = "offline";
    boat.aiReason = boat.qwenDecision.reason;
    state.qwenEngineStatus = "offline";
  } finally {
    window.clearTimeout(timeout);
    boat.lastQwenDecisionRealMs = performance.now();
    boat.qwenRequestPending = false;
    refreshBoatList();
  }
}

function applyQwenManeuverDecision(boat, stage, target = null) {
  const decision = boat.qwenDecision;
  if (!decision || decision.appliedManeuver) {
    return;
  }
  const distanceToTargetM = target ? haversineMeters(boat, target) : Infinity;
  const memory = stageMemoryForBoat(boat);
  const stageElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
  if (stage?.mode === "upwind") {
    decision.appliedManeuver = true;
    decision.action = "hold";
    decision.label = "Stable upwind";
    decision.reason = "Stable upwind pilot active: external maneuver ignored to prevent zig-zag.";
    boat.aiEngine = "stable-upwind";
    boat.aiReason = decision.reason;
    return;
  }
  if (stage?.mode !== "upwind" && decision.side && decision.side !== "center") {
    boat.liveSideSign = sideSignFromName(decision.side) || boat.liveSideSign;
  }
  if (decision.action !== "tack" && decision.action !== "gybe") {
    return;
  }

  const maneuverTarget = {
    courseStageIndex: boat.courseIndex,
    stageMode: stage?.mode,
    isMarkRounding: false,
    distanceToTargetM,
    stageElapsedMs,
    forceClosure: false,
  };
  const gate = stage?.mode === "upwind" ? canAcceptBotTack(boat, maneuverTarget) : { allowed: true, countAsTack: false };
  if (!gate.allowed) {
    decision.appliedManeuver = true;
    return;
  }
  boat.liveSideSign = -Number(boat.liveSideSign || resolveRouteSideSign(boat));
  boat.mure = boat.liveSideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * (boat.tacticalProfile?.maneuverPenalty ?? 0.94), 0.74, 1);
  registerManeuverTelemetry(boat, maneuverTarget, gate.countAsTack);
  decision.appliedManeuver = true;
}

function liveBotHeading(boat, stage, target, wind) {
  const profile = getBoatProfile(boat);
  const targetBearing = target ? bearingDegrees(boat, target) : Number(boat.heading ?? 0);
  if (!Number.isFinite(Number(boat.liveSideSign)) || boat.liveSideSign === 0) {
    boat.liveSideSign = target ? chooseTacticalSideSign(boat, stage, boat, target) : resolveRouteSideSign(boat);
  }

  const distanceToTargetM = target ? haversineMeters(boat, target) : Infinity;
  const memory = stageMemoryForBoat(boat);
  const stageElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.stageStartedSimMs ?? boat.race?.stageStartedAtSimMs ?? 0));
  const approachLateMs = Number(boat.courseIndex ?? 0) === 0
    ? MARK_APPROACH_LATE_FIRST_LEG_MS
    : MARK_APPROACH_LATE_LEG_MS;
  const stalledApproach =
    stage?.mode === "upwind" &&
    distanceToTargetM < MARK_APPROACH_STALLED_RADIUS_M &&
    stageElapsedMs > MARK_APPROACH_STALLED_LATE_MS;
  const finalBoardZone = isUpwindFinalBoardZone(boat, stage, target, distanceToTargetM, stageElapsedMs);
  if (!finalBoardZone && (stage?.mode !== "upwind" || !target)) {
    clearFinalBoardLock(boat);
  }
  const approachCommitZone = Boolean(stage?.mode === "upwind" && target && distanceToTargetM < MARK_APPROACH_COMMIT_RADIUS_M);
  if (approachCommitZone && Number.isFinite(Number(boat.tacticalDecision?.sideSign))) {
    boat.approachCommitSideSign = Number(boat.tacticalDecision.sideSign);
  }
  const lateLegRecovery =
    stage?.mode === "upwind" &&
    target &&
    stageElapsedMs > MARK_APPROACH_STALLED_LATE_MS &&
    distanceToTargetM < MARK_APPROACH_RECOVERY_RADIUS_M &&
    Number(boat.currentVmgKn ?? 0) < MARK_APPROACH_RECOVERY_LOW_VMG_KN;
  const upwindStallRecovery = shouldUseUpwindStallRecovery(boat, stage, target, distanceToTargetM, stageElapsedMs);
  boat.upwindRecoveryMode = Boolean(upwindStallRecovery);
  boat.markApproachMode = Boolean(
    stage?.mode === "upwind" &&
    target &&
    (finalBoardZone ||
      distanceToTargetM < MARK_APPROACH_NO_TACK_RADIUS_M ||
      (distanceToTargetM < MARK_APPROACH_DIRECT_RADIUS_M && stageElapsedMs > approachLateMs) ||
      stalledApproach ||
      lateLegRecovery)
  );
  boat.markDirectRoundingMode = Boolean(
    stage?.mode === "upwind" &&
    target &&
    distanceToTargetM < MARK_APPROACH_DIRECT_HEADING_RADIUS_M
  );

  applyQwenManeuverDecision(boat, stage, target);
  let localDecision = null;
  if ((!boat.isUserBoat || boat.demoAutopilot) && stage?.mode === "upwind" && target) {
    localDecision = stableUpwindPilotDecision(boat, stage, target, wind, distanceToTargetM, stageElapsedMs);
    boat.tacticalDecision = localDecision;
    boat.aiReason = localDecision.reason;
  }

  let desiredHeading = targetBearing;
  const sideSign = Number(boat.liveSideSign || resolveRouteSideSign(boat));
  if (upwindStallRecovery) {
    const recovery = upwindStallRecoveryHeading(boat, target, wind);
    desiredHeading = recovery.heading;
    boat.tacticalDecision = {
      ...(boat.tacticalDecision ?? {}),
      label: "Upwind recovery",
      action: "recover",
      side: recovery.sideSign === 0 ? "direct" : sideNameFromSign(recovery.sideSign),
      scoreDelta: Number(Number(recovery.progress ?? 0).toFixed(2)),
      reason: `Upwind recovery: VMG stayed below ${UPWIND_STALL_RECOVERY_LOW_VMG_KN.toFixed(2)} kn after ${formatRaceTime(stageElapsedMs)}, steering ${recovery.label} toward ${target.id}.`,
    };
    boat.aiReason = boat.tacticalDecision.reason;
  } else if (stage?.mode === "upwind") {
    desiredHeading = Number.isFinite(Number(localDecision?.heading))
      ? Number(localDecision.heading)
      : boat.markDirectRoundingMode
        ? targetBearing
        : target && distanceToTargetM < 210
          ? constrainedHeadingForStage(boat, targetBearing, wind, stage.mode)
          : allowedUpwindHeadingForSide(boat, wind, sideSign, 0);
  } else if (stage?.mode === "reach") {
    desiredHeading = targetBearing;
  } else if (stage?.mode === "run") {
    desiredHeading = targetBearing;
  } else if (stage?.mode === "finish") {
    desiredHeading = targetBearing;
  }

  const decision = boat.qwenDecision;
  if (decision && stage?.mode === "upwind" && state.simulatedClockMs - Number(decision.receivedAtSimMs ?? 0) < QWEN_DECISION_INTERVAL_SIM_MS * 2) {
    if (decision.action === "head_up") {
      desiredHeading = normalizeAngle(desiredHeading - 4);
    } else if (decision.action === "bear_away") {
      desiredHeading = normalizeAngle(desiredHeading + 4);
    }
  }

  if ((!boat.isUserBoat || boat.demoAutopilot) && stage?.mode !== "upwind" && target) {
    const routeSideSign = Number(boat.liveSideSign || sideSign || resolveRouteSideSign(boat));
    const routeDecision = buildRouteStageDecision(boat, stage, target, desiredHeading, routeSideSign);
    boat.tacticalDecision = routeDecision;
    boat.aiReason = routeDecision.reason;
  }

  return stage?.mode === "upwind" && !boat.upwindRecoveryMode
    ? constrainedHeadingForStage(boat, desiredHeading, wind, stage.mode)
    : normalizeAngle(desiredHeading);
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function bearingDegrees(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function moveTowardPoint(boat, target, meters) {
  const distance = haversineMeters(boat, target);
  if (distance <= meters || distance < 1) {
    return setBoatPositionInsideArea(boat, target.lat, target.lon);
  }
  const ratio = meters / distance;
  const origin = { lat: boat.lat, lon: boat.lon };
  for (const scale of [1, 0.72, 0.48, 0.25]) {
    const lat = origin.lat + (target.lat - origin.lat) * ratio * scale;
    const lon = origin.lon + (target.lon - origin.lon) * ratio * scale;
    if (setBoatPositionInsideArea(boat, lat, lon)) {
      return true;
    }
  }
  return false;
}

function moveBoatByHeading(boat, heading, meters) {
  const origin = { lat: boat.lat, lon: boat.lon };
  for (const scale of [1, 0.72, 0.48, 0.25]) {
    const [lat, lon] = movePreviewPoint(origin, heading, meters * scale);
    if (setBoatPositionInsideArea(boat, lat, lon)) {
      return true;
    }
  }
  return false;
}

function routeGuardShouldRecover(stage, distanceBefore, distanceAfter, stepMeters) {
  if (!stage || !Number.isFinite(distanceBefore) || !Number.isFinite(distanceAfter)) {
    return false;
  }
  const distanceLossM = distanceAfter - distanceBefore;
  const allowedLossM = Math.max(ROUTE_GUARD_MIN_LOSS_M, Number(stepMeters ?? 0) * ROUTE_GUARD_STEP_LOSS_RATIO);
  if (stage.mode !== "upwind") {
    return distanceLossM > allowedLossM;
  }
  return distanceBefore < MARK_APPROACH_STALLED_RADIUS_M && distanceLossM > Math.max(18, Number(stepMeters ?? 0) * 0.42);
}

function recoverBoatTowardRoute(boat, previousPoint, target, stepMeters) {
  if (!boat || !previousPoint || !target) {
    return false;
  }
  boat.lat = previousPoint.lat;
  boat.lon = previousPoint.lon;
  const recoveryHeading = bearingDegrees(previousPoint, target);
  boat.heading = recoveryHeading;
  const recoveryStep = Math.max(0, Number(stepMeters ?? 0) * ROUTE_GUARD_RECOVERY_STEP_RATIO);
  const moved = moveBoatByHeading(boat, recoveryHeading, recoveryStep);
  enforceBoatInsideArea(boat, previousPoint);
  boat.routeGuardRecoveries = Number(boat.routeGuardRecoveries ?? 0) + 1;
  const telemetry = ensureBoatTelemetry(boat);
  telemetry.note = `Route guard: corrected toward ${target.id ?? "target"} after losing bearing.`;
  if (boat.tacticalDecision) {
    boat.tacticalDecision.reason = telemetry.note;
  }
  return moved;
}

function createBoatTelemetry() {
  return {
    tackCount: 0,
    rejectedTacks: 0,
    candidateTacks: 0,
    rejectedTackCandidates: 0,
    stageTacks: {},
    steeringCorrections: 0,
    lastManeuverSimMs: null,
    lastRejectedManeuverSimMs: null,
    lastManeuverPoint: null,
    lastHeading: null,
    lastSpeedKn: null,
    lastSampleSimMs: -Infinity,
    sogDeltaKn10s: 0,
    vmgDropRatio: 0,
    samples: [],
    vt: null,
    note: "Engine clean: no tactical anomaly.",
  };
}

function ensureBoatTelemetry(boat) {
  if (!boat.telemetry) {
    boat.telemetry = createBoatTelemetry();
  }
  return boat.telemetry;
}

function resetBoatTelemetry(boat) {
  boat.telemetry = createBoatTelemetry();
  boat.tackCount = 0;
  boat.rejectedTacks = 0;
}

function averageSampleValue(samples, key) {
  const values = samples
    .map((sample) => Number(sample[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function updateVmgDropMetric(boat) {
  const telemetry = ensureBoatTelemetry(boat);
  const samples = telemetry.samples;
  const simMs = state.simulatedClockMs;
  if (samples.length < 4) {
    telemetry.vmgDropRatio = 0;
    return;
  }

  const earlyWindow = samples.filter((sample) => sample.t <= Math.min(600000, simMs * 0.55));
  const lateWindow = samples.filter((sample) => sample.t >= Math.max(0, simMs - 300000));
  const fallbackSplit = Math.floor(samples.length / 2);
  const earlyAvg = averageSampleValue(earlyWindow.length >= 2 ? earlyWindow : samples.slice(0, fallbackSplit), "vmgKn");
  const lateAvg = averageSampleValue(lateWindow.length >= 2 ? lateWindow : samples.slice(fallbackSplit), "vmgKn");
  telemetry.vmgDropRatio = earlyAvg && lateAvg != null ? clamp((earlyAvg - lateAvg) / earlyAvg, -0.5, 0.5) : 0;
}

function updateBoatTelemetry(boat, context) {
  const telemetry = ensureBoatTelemetry(boat);
  const dtSimSeconds = Math.max(context.dt * SIM_SPEEDUP, 0.001);
  const currentSpeed = Number(boat.currentSpeedKn ?? 0);
  const currentVmg = Number(boat.currentVmgKn ?? 0);
  const heading = Number(context.heading ?? boat.heading ?? 0);
  telemetry.vt = {
    direction: Number(context.wind?.direction ?? 0),
    speedKn: Number(context.wind?.speedKn ?? 0),
    multiplier: Number(context.wind?.multiplier ?? 1),
    source: context.wind?.source ?? "synthetic",
  };

  if (telemetry.lastSpeedKn != null) {
    telemetry.sogDeltaKn10s = ((currentSpeed - telemetry.lastSpeedKn) / dtSimSeconds) * 10;
  }
  if (telemetry.lastHeading != null) {
    const headingDelta = Math.abs(shortestAngleDelta(telemetry.lastHeading, heading));
    const timeSinceManeuver = telemetry.lastManeuverSimMs == null
      ? Infinity
      : state.simulatedClockMs - telemetry.lastManeuverSimMs;
    if (headingDelta > STEERING_CORRECTION_LIMIT_DEG && timeSinceManeuver > 18000 && currentSpeed < Number(boat.speed ?? currentSpeed) * 0.72) {
      telemetry.steeringCorrections += 1;
      boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.997, 0.72, 1);
    }
  }

  if (state.simulatedClockMs - telemetry.lastSampleSimMs >= TELEMETRY_SAMPLE_INTERVAL_SIM_MS) {
    telemetry.samples.push({
      t: state.simulatedClockMs,
      speedKn: currentSpeed,
      vmgKn: currentVmg,
      heading,
      windDirection: telemetry.vt.direction,
    });
    if (telemetry.samples.length > 120) {
      telemetry.samples.shift();
    }
    telemetry.lastSampleSimMs = state.simulatedClockMs;
    updateVmgDropMetric(boat);
  }

  telemetry.lastSpeedKn = currentSpeed;
  telemetry.lastHeading = heading;
  telemetry.note = buildTelemetryNote(boat);
}

function buildTelemetryNote(boat) {
  const telemetry = ensureBoatTelemetry(boat);
  const memory = stageMemoryForBoat(boat);
  const cooldownRemainingMs = Math.max(0, Number(memory.nextDecisionAllowedSimMs ?? 0) - state.simulatedClockMs);
  if (cooldownRemainingMs > 0 && boat.tacticalDecision?.cooldownActive) {
    return `Smart anti-zigzag: cooldown ${formatRaceTime(cooldownRemainingMs)}, holding board.`;
  }
  if (boat.tacticalDecision?.shiftMagnitudeDeg != null && boat.tacticalDecision?.shiftDurationMs != null) {
    const magnitude = Number(boat.tacticalDecision.shiftMagnitudeDeg ?? 0);
    const duration = Number(boat.tacticalDecision.shiftDurationMs ?? 0);
    const required = Number(boat.tacticalDecision.shiftRequiredMs ?? 0);
    if (magnitude >= 3 && duration < required) {
      return `Header observed ${magnitude.toFixed(1)}° for ${formatRaceTime(duration)}: below athlete threshold.`;
    }
  }
  if (telemetry.rejectedTacks > 0) {
    return `Anti-zigzag active: ${telemetry.rejectedTacks} candidate tacks rejected.`;
  }
  if (boat.tacticalDecision?.forceClosure) {
    return `Mark-close mode active: ${Math.round(Number(boat.tacticalDecision.distanceToTargetM ?? 0))} m to target.`;
  }
  if (boat.markApproachMode) {
    return "Mark approach active: direct heading and controlled speed for rounding.";
  }
  if (Number(boat.dirtyAirFactor ?? 1) < 0.98) {
    return `Dirty air from ${boat.dirtyAirSource ?? "nearby boat"}: speed reduced by ${Math.round((1 - Number(boat.dirtyAirFactor ?? 1)) * 100)}%.`;
  }
  if (Number(boat.maneuverRecoveryFactor ?? 1) < 0.98) {
    return `Maneuver recovery: acceleration and VMG are rebuilding (${Math.round(Number(boat.maneuverRecoveryFactor ?? 1) * 100)}%).`;
  }
  if (telemetry.vmgDropRatio >= VMG_DROP_WARNING_RATIO) {
    return `VMG down ${Math.round(telemetry.vmgDropRatio * 100)}%: check trim and body weight.`;
  }
  if (telemetry.steeringCorrections >= 4) {
    return "High micro-steering: possible rudder use instead of body weight.";
  }
  return "Engine clean: wind, route, and VMG are coherent.";
}

function startManeuverRecovery(boat, target = null) {
  const profile = getBoatProfile(boat);
  const trackStyle = profile.trackStyle ?? {};
  const reactivity = Number(trackStyle.reactivity ?? (boat.isUserBoat ? 0.62 : 0.5));
  const patience = Number(trackStyle.patience ?? 0.5);
  const rankWeight = Number(trackStyle.rankWeight ?? (boat.isUserBoat ? 0.7 : 0.45));
  const maneuverLoss = 1 - Number(profile.maneuverPenalty ?? 0.94);
  const baseMs = target?.isMarkRounding ? 10500 : 15500;
  const recoveryMs = clamp(
    baseMs + patience * 5200 - reactivity * 4300 - rankWeight * 2100 + maneuverLoss * 52000,
    target?.isMarkRounding ? 5200 : 7200,
    28000
  );
  boat.maneuverRecoveryTotalMs = recoveryMs;
  boat.maneuverRecoveryUntilSimMs = state.simulatedClockMs + recoveryMs;
}

function registerManeuverTelemetry(boat, target = null, countAsTack = true) {
  const telemetry = ensureBoatTelemetry(boat);
  const stageKey = String(target?.courseStageIndex ?? boat.courseIndex ?? 0);
  if (countAsTack) {
    telemetry.tackCount += 1;
    telemetry.stageTacks[stageKey] = (telemetry.stageTacks[stageKey] ?? 0) + 1;
    boat.tackCount = telemetry.tackCount;
  }
  telemetry.lastManeuverSimMs = state.simulatedClockMs;
  telemetry.lastManeuverPoint = { lat: boat.lat, lon: boat.lon };
  startManeuverRecovery(boat, target);
}

function canAcceptBotTack(boat, target) {
  const telemetry = ensureBoatTelemetry(boat);
  const timeSinceLast = telemetry.lastManeuverSimMs == null ? Infinity : state.simulatedClockMs - telemetry.lastManeuverSimMs;
  
  // Hard limit: prevent tacking more than once every 3 seconds (3000ms) to stop the million tacks bug
  if (timeSinceLast < 3000) {
    return { allowed: false, reason: "wait_3s" };
  }

  const profile = getBoatProfile(boat);
  const stageKey = String(target?.courseStageIndex ?? boat.courseIndex ?? 0);
  const forceClosureDistanceM = Number(target?.distanceToTargetM ?? Infinity);

  // Boundary proximity check: always allow tacking if the boat is within 45m of the boundary
  const currentHeading = Number(boat.heading ?? 0);
  const [previewLat, previewLon] = movePreviewPoint(boat, currentHeading, 45);
  const isNearBoundary = !isPointInsideArea({ lat: previewLat, lon: previewLon });

  if (!isNearBoundary) {
    const stageTacks = Number(telemetry.stageTacks[stageKey] ?? 0);
    if (stageTacks >= 5) {
      return { allowed: false, reason: "max_tacks_limit" };
    }
    const isCovered = Number(boat.dirtyAirFactor ?? 1) < 0.98;
    if (isCovered) {
      return { allowed: false, reason: "in_cover" };
    }
    if (forceClosureDistanceM < FINAL_BOARD_LOCK_RADIUS_M && target?.stageMode === "upwind") {
      return { allowed: false, reason: "final_board_lock" };
    }
    if (forceClosureDistanceM < MARK_APPROACH_COMMIT_RADIUS_M) {
      return { allowed: false, reason: "approach_commit" };
    }
    if (target?.stageMode === "upwind" && forceClosureDistanceM < MARK_APPROACH_NO_TACK_RADIUS_M) {
      return { allowed: false, reason: "mark_lock" };
    }
  }
  if (target?.isMarkRounding || target?.stageMode !== "upwind") {
    return { allowed: true, countAsTack: false };
  }
  const stageTacks = Number(telemetry.stageTacks[stageKey] ?? 0);
  const distanceSinceLast = telemetry.lastManeuverPoint ? haversineMeters(boat, telemetry.lastManeuverPoint) : Infinity;
  const replayManeuverTarget = Number(boat?.replayCalibration?.engine_targets?.leg_maneuver_targets?.[Number(stageKey)]);
  const maxTacks = Number.isFinite(replayManeuverTarget)
    ? clamp(Math.round(replayManeuverTarget + 1), 3, 5)
    : clamp(Number(profile.maxUpwindTacticalTacks ?? MAX_UPWIND_TACTICAL_TACKS), 3, 5);
  const stageElapsedMs = Number(target?.stageElapsedMs ?? 0);
  const stalledRecovery =
    stageElapsedMs > MARK_APPROACH_LATE_LEG_MS &&
    forceClosureDistanceM < MARK_APPROACH_STALLED_RADIUS_M &&
    Number(boat.currentVmgKn ?? 0) < 1.15;
  const closureAllowance =
    (target?.forceClosure && forceClosureDistanceM < MARK_APPROACH_DIRECT_RADIUS_M ? GARDA_MARK_CLOSURE_EXTRA_TACKS : 0) +
    (stalledRecovery ? 1 : 0);
  const minDistance = target?.forceClosure
    ? Math.max(170, Number(profile.minTackDistanceM ?? MIN_TACK_DISTANCE_METERS) * 0.72)
    : Number(profile.minTackDistanceM ?? MIN_TACK_DISTANCE_METERS);
  const minInterval = target?.forceClosure
    ? Math.max(42000, TACTIC_CANDIDATE_MIN_INTERVAL_MS, Number(profile.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS) * 0.55)
    : Math.max(TACTIC_CANDIDATE_MIN_INTERVAL_MS, Number(profile.minTackIntervalSimMs ?? MIN_TACK_INTERVAL_SIM_MS));
  if (stageTacks >= maxTacks + closureAllowance) {
    return { allowed: false, reason: "max_tacks" };
  }
  if (distanceSinceLast < minDistance || timeSinceLast < minInterval) {
    return { allowed: false, reason: "micro_tack" };
  }
  return { allowed: true, countAsTack: true, closureTack: target?.forceClosure && stageTacks >= maxTacks };
}

function applyRouteManeuver(boat, target, profile) {
  if (!target?.flipMure) {
    return;
  }
  const telemetry = ensureBoatTelemetry(boat);
  const decision = boat.isUserBoat ? { allowed: true, countAsTack: true } : canAcceptBotTack(boat, target);
  if (!decision.allowed) {
    telemetry.rejectedTacks += 1;
    boat.rejectedTacks = telemetry.rejectedTacks;
    boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.94, 0.72, 1);
    telemetry.note = buildTelemetryNote(boat);
    return;
  }

  boat.mure = toggleBoatMure(boat.mure);
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * profile.maneuverPenalty, 0.74, 1);
  boat.currentSpeedKn = Math.max((boat.currentSpeedKn ?? 0) * boat.speedPenalty, target.isMarkRounding ? 1.2 : 0.9);
  registerManeuverTelemetry(boat, target, decision.countAsTack);
}

function inferLegFromStage(stageMode) {
  if (stageMode === "run") {
    return "poppa";
  }
  if (stageMode === "reach") {
    return "lasco";
  }
  return "bolina";
}

function markRoundingExitPoint(mark, nextTarget, stage) {
  if (!mark || !nextTarget) {
    return null;
  }
  const radius = clamp(Number(stage?.roundRadius ?? MARK_ROUNDING_RADIUS_METERS) * 0.86, 6, 20);
  const exitBearing = bearingDegrees(mark, nextTarget);
  const [lat, lon] = movePreviewPoint(mark, exitBearing, radius);
  return { lat, lon };
}

function applyMarkRounding(boat, stage, mark = null, nextTarget = null) {
  const profile = boat.tacticalProfile ?? refreshBoatEngineProfile(boat);
  const exitPoint = markRoundingExitPoint(mark, nextTarget, stage);
  boat.roundingExitHint = exitPoint && isPointInsideArea(exitPoint) ? exitPoint : null;
  if (stage?.flipAtTarget) {
    boat.mure = toggleBoatMure(boat.mure);
    boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * profile.maneuverPenalty, 0.74, 1);
    boat.currentSpeedKn = Math.max((boat.currentSpeedKn ?? 0) * boat.speedPenalty, 1.2);
    startManeuverRecovery(boat, { courseStageIndex: boat.courseIndex, stageMode: stage?.mode, isMarkRounding: true });
  }
}

function referenceWindDirectionAt(point) {
  // For Garda Ora from the south, the upwind axis points southward (185°).
  // ALFA 1 is used as the windward reference mark.
  const windwardMark = getBuoy("ALFA 1");
  if (!windwardMark || !Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon))) {
    return ORA_BASE_DIRECTION_DEG;  // 185° default Ora
  }
  // Wind direction is opposite the course-to-mark direction: sailors go upwind toward the mark,
  // so true wind comes from that direction.
  const bearingToMark = bearingDegrees(point, windwardMark);
  // Ora is stable, so geometry only nudges the reference slightly.
  // We use 180 - bearingToMark to correctly subtract/invert the transversal component
  return normalizeAngle(ORA_BASE_DIRECTION_DEG * 0.88 + (360 - bearingToMark) * 0.12);
}

function localWindTexture(point, normalized, elapsedMs, raceProfile) {
  // 2D topographic wind model for Garda Area B.
  // Delegated to topoWindField2D() in topo_wind.js, which models six real Garda effects:
  //   1. Monte Baldo / Bresciana wall: pressure +8-14%, clockwise lift 4-8°.
  //   2. Limone shadow cone: dead zone -12-18%, high turbulence.
  //   3. Central Ora thermal channel: +2-5%, stable, 185°.
  //   4. Malcesine slope: counter-clockwise lift +3-5%.
  //   5. Campione peninsula shadow: header -5-8%.
  //   6. Ora latitude gradient: +1.5%/100m northward.
  const topo = topoWindField2D(point.lat, point.lon, elapsedMs);

  // Keep a seed-based temporal micro-oscillation for variety across race runs.
  const seed = Number(raceProfile?.seed ?? 0.5);
  const timeA = elapsedMs / 9300 + seed * 8;
  const crossLakeWave = Math.sin(point.lat * 860 + point.lon * 420 + timeA) * 0.008;

  return {
    multiplierDelta: topo.multiplierDelta + crossLakeWave,
    directionDelta:  topo.directionDelta,
    turbulence:      topo.turbulence,
    shoreRisk:       topo.turbulence > 0.45 ? topo.turbulence - 0.30 : 0,
    topoZone:        topo.zone,
    topoDebug:       topo.debugFactors,
  };
}

function temporalWindZone(point, normalized, elapsedMs, raceProfile) {
  // Temporal Garda Ora wind model.
  // Garda Ora is a regular thermal wind with typical 3-8 minute oscillations.
  // Puffs travel from south to north at ~3-5 m/s, roughly 6-10 knots.
  // Pressure propagation has a realistic geographic delay.
  const simMs = state.raceStatus === "running" ? state.simulatedClockMs : elapsedMs;
  const seed = Number(raceProfile?.seed ?? 0.5);
  const latitudeBand = clamp((point.lat - 45.842) / 0.032, 0, 1); // 0=south, 1=north.

  // Ora puff propagation: ~4 m/s = 240 m/min from the south over a ~4 km course.
  // South-to-north delay is roughly 1000s = 1000000 simulated ms at 1x.
  // At 12x speedup, that is about 83 real seconds.
  const puffTravelDelayMs = latitudeBand * 900000; // North-south propagation delay.
  const puffPhaseMs = simMs - puffTravelDelayMs; // Position-corrected phase.

  // Main oscillation: about 8 minutes.
  const mainCycle = Math.sin(puffPhaseMs / 480000 * Math.PI * 2 + seed * 3.14);
  // Secondary oscillation: about 3 minutes, seeded for variety.
  const shortCycle = Math.sin(puffPhaseMs / 185000 * Math.PI * 2 + seed * 7.28);
  // Combined pulse: 0-1.
  const pulse = clamp(0.5 + mainCycle * 0.38 + shortCycle * 0.16, 0, 1);

  // Geographic course zones.
  const rightPressure = clamp((normalized - 0.62) / 0.28, 0, 1); // Bresciana zone.
  const leftLift = clamp((0.36 - normalized) / 0.28, 0, 1);       // Malcesine zone.
  const centerChannel = Math.max(0, 1 - Math.abs(normalized - 0.48) * 5.2); // Center channel.
  const upperPatch = Math.max(0, 1 - Math.abs(latitudeBand - 0.6) * 3.0);

  // Current puff strength: 0=lull, 1=gust.
  const puffStrength = clamp(pulse, 0, 1);
  // Coordinated wind shift: when a right shift enters on the right, the left receives a header.
  // Positive shift = wind turns right, creating a lift for boats on the right.
  const shiftScale = clamp(Number(raceProfile?.shiftOscillationScale ?? 1), 0.75, 1.2);
  const globalShift = (mainCycle * 2.2 + shortCycle * 1.1) * shiftScale; // bounded in-race tactical shift.
  // Right side: lift when globalShift > 0.
  // Left side: header when globalShift > 0.
  const rightShiftEffect = -globalShift * rightPressure;
  const leftShiftEffect = globalShift * leftLift;
  const directionDelta = rightShiftEffect + leftShiftEffect + (-globalShift) * (1 - rightPressure - leftLift) * 0.4;

  // Pressure: puffs reinforce the right during right-shift phases and left during left-shift phases.
  const pressureFromPuff = puffStrength * 0.028;
  const pressureGradient = rightPressure * (puffStrength - 0.5) * 0.016
    + leftLift * (0.5 - puffStrength) * 0.012
    - centerChannel * 0.010;
  const multiplierDelta = pressureFromPuff + pressureGradient
    + upperPatch * (puffStrength > 0.65 ? 0.016 : -0.008);

  const label = rightPressure > 0.3 && globalShift < -1 ? "Bresciana-righty"
    : leftLift > 0.3 && globalShift > 1 ? "Malcesine-lefty"
    : puffStrength > 0.72 ? "Ora-puff"
    : puffStrength < 0.25 ? "center-lull"
    : upperPatch > 0.4 ? "north-puff"
    : "steady-Ora";

  return { multiplierDelta, directionDelta, label, phaseIndex: Math.floor(pulse * 4) };
}

function windEngineAt(point, elapsedMs = performance.now()) {
  const { normalized, laneBand } = classifyWindLane(point);
  const raceProfile = state.raceProfile ?? {
    windDirectionOffsetDeg: 0,
    windOscillationDeg: 2,
    rightLiftBias: 1,
    leftPocket: false,
  };
  const texture = localWindTexture(point, normalized, elapsedMs, raceProfile);
  const temporal = temporalWindZone(point, normalized, elapsedMs, raceProfile);
  const shoreFactor = normalized > 0.88 ? 0.94 : normalized < 0.12 ? 0.96 : 1.0;
  const rightLift = (normalized - 0.5) * 1.15 * (raceProfile.rightLiftBias ?? 1);
  const leftPocketLift = raceProfile.leftPocket && normalized < 0.36 ? -1.2 : 0;
  const oscillation = (raceProfile.windOscillationDeg ?? 2) * Math.sin(elapsedMs / 8400 + point.lat * 48 + (raceProfile.seed ?? 0) * 10);
  const windAi = sampleWindAi(state.windAiModel, point, {
    elapsedMs,
    simulatedClockMs: state.raceStatus === "running" ? state.simulatedClockMs : elapsedMs,
    laneIndex: normalized,
    raceProfile,
  });
  const courseWindDirection = referenceWindDirectionAt(point);
  const oraDirection = normalizeAngle(
    courseWindDirection +
      (raceProfile.windDirectionOffsetDeg ?? 0) +
      rightLift +
      leftPocketLift +
      oscillation +
      (texture.directionDelta ?? 0) * 0.45 +
      (temporal.directionDelta ?? 0) * 0.40 +
      Number(windAi?.directionDeltaDeg ?? 0) * 0.30
  );

  if (state.windField) {
    const sample = sampleWindFieldModel(state.windField, point, elapsedMs);
    if (sample) {
      const laneOverlay = 1 + (laneBand.factor - 1) * 0.52 + texture.multiplierDelta + temporal.multiplierDelta;
      const finalSpeedKn = sample.speedKn * laneOverlay * shoreFactor * Number(windAi?.speedFactor ?? 1);
      const referenceKn = Number(sample.referenceKn || state.windField?.grid?.reference_wind_kn || 12);
      const multiplier = referenceKn > 0 ? finalSpeedKn / referenceKn : 1;
      const gribNudge = clamp(shortestAngleDelta(oraDirection, sample.direction), -GRIB_DIRECTION_NUDGE_LIMIT_DEG, GRIB_DIRECTION_NUDGE_LIMIT_DEG) * GRIB_DIRECTION_NUDGE_FACTOR;
      const direction = normalizeAngle(oraDirection + gribNudge);
      const pressure = multiplier >= 1.055 ? "forte" : multiplier <= 0.955 ? "debole" : "media";
      // Calcolo bias pressione topografica 2D
      const rightPressureBias = texture.topoZone === "Bresciana" ? 0.24 
        : texture.topoZone === "Malcesine" ? -0.12 
        : (windAi?.rightPressureBias ?? null);

      return {
        multiplier: clamp(multiplier, 0.84, 1.16),
        speedKn: finalSpeedKn,
        pressure,
        gust: {
          name: "GRIB",
          boost: finalSpeedKn - referenceKn,
        },
        direction,
        lane: laneBand.name,
        laneIndex: normalized,
        turbulence: clamp(texture.turbulence + Number(windAi?.turbulenceBoost ?? 0), 0, 1),
        shoreRisk: texture.shoreRisk,
        source: windAi ? "grib+wind-ai+topo2D" : "grib+topo2D",
        temporalZone: windAi ? `${temporal.label}+${windAi.label}` : temporal.label,
        temporalPhase: temporal.phaseIndex,
        windAi,
        rightPressureBias,
        topoZone: texture.topoZone,
        frameLabel: sample.frameLabel,
        frameHours: sample.frameHours,
      };
    }
  }

  const gusts = [
    { lat: 45.8545, lon: 10.8412, radius: 620, boost: 0.045, name: "Zona 1" },
    { lat: 45.8485, lon: 10.8375, radius: 820, boost: raceProfile.leftPocket ? 0.035 : 0.012, name: "Zona 2" },
    { lat: 45.8560, lon: 10.8465, radius: 680, boost: -0.025, name: "Zona 3" },
  ];
  const phase = 0.014 * Math.sin(elapsedMs / 6200 + (raceProfile.seed ?? 0) * 5);
  let multiplier = laneBand.factor + phase + texture.multiplierDelta + temporal.multiplierDelta + Number(windAi?.pressureDelta ?? 0);
  let activeGust = null;
  for (const gust of gusts) {
    const distance = haversineMeters(point, gust);
    if (distance <= gust.radius) {
      const ratio = 1 - distance / gust.radius;
      multiplier += gust.boost * ratio;
      activeGust = gust;
    }
  }
  if (normalized > 0.84) {
    multiplier -= 0.012;
  } else if (normalized < 0.16) {
    multiplier -= 0.006;
  }
  const direction = normalizeAngle(oraDirection + (texture.directionDelta ?? 0));
  const pressure =
    multiplier >= 1.04 ? "forte" : multiplier <= 0.96 ? "debole" : "media";

  // Calcolo bias pressione topografica 2D
  const rightPressureBias = texture.topoZone === "Bresciana" ? 0.24 
    : texture.topoZone === "Malcesine" ? -0.12 
    : (windAi?.rightPressureBias ?? null);

  return {
    multiplier: clamp(multiplier, 0.86, 1.14),
    pressure,
    gust: activeGust,
    direction,
    lane: laneBand.name,
    laneIndex: normalized,
    turbulence: clamp(texture.turbulence + Number(windAi?.turbulenceBoost ?? 0), 0, 1),
    shoreRisk: texture.shoreRisk,
    source: windAi ? "synthetic+wind-ai+topo2D" : "synthetic+topo2D",
    temporalZone: windAi ? `${temporal.label}+${windAi.label}` : temporal.label,
    temporalPhase: temporal.phaseIndex,
    windAi,
    rightPressureBias,
    topoZone: texture.topoZone,
  };
}

function displayWindArrowAngle(boat, wind) {
  const target = getNextManualTarget(boat);
  const targetBearing = target ? bearingDegrees(boat, target) : Number(wind?.direction ?? 185);
  const wobble = 1.6 * Math.sin(performance.now() / 2600 + (boat?.lat ?? 0) * 90);
  return normalizeAngle(Number(wind?.direction ?? targetBearing) + wobble);
}

function ensureBoatRoute(boat) {
  if (boat.isUserBoat) {
    return;
  }
  if (!boat.route || boat.route.length === 0) {
    boat.route = buildRouteForBoat(boat);
    boat.targetIndex = 0;
  }
}

function updateTrackForBoat(boat) {
  if (!state.layers.tracks) {
    state.layers.tracks = L.layerGroup().addTo(state.map);
  }
  if (!boat.track) {
    boat.track = [[boat.lat, boat.lon]];
  }
  const lastPoint = boat.track[boat.track.length - 1];
  const movedM = lastPoint ? haversineMeters({ lat: lastPoint[0], lon: lastPoint[1] }, boat) : Infinity;
  if (!lastPoint || movedM > 18 || boat.track.length < 2) {
    boat.track.push([boat.lat, boat.lon]);
    if (boat.track.length > 900) {
      boat.track.splice(0, boat.track.length - 900);
    }
    if (boat.trackPolyline) {
      boat.trackPolyline.setLatLngs(boat.track);
    }
  }
}

function redrawTracks() {
  if (!state.layers.tracks) {
    state.layers.tracks = L.layerGroup().addTo(state.map);
  }
  if (!state.showTrack) {
    state.layers.tracks.clearLayers();
    state.boats.forEach(b => { if (b.trackPolyline) { b.trackPolyline = null; } });
    state.ghostTracksByBoat.forEach(g => { if (g.trackPolyline) { g.trackPolyline = null; } });
    return;
  }
  
  state.ghostTracksByBoat.forEach((ghost) => {
    if (!ghost.focusReplay && !GHOST_FOCUS_BOTS.has(ghost.botCode)) {
      if (ghost.trackPolyline) {
        state.layers.tracks.removeLayer(ghost.trackPolyline);
        ghost.trackPolyline = null;
      }
      return;
    }
    if (!ghost.trackPolyline) {
      const color = BOT_COLORS[Math.max(0, (Number(ghost.rank ?? 1) - 1) % BOT_COLORS.length)] ?? "#d9f4ff";
      ghost.trackPolyline = L.polyline(ghost.points, {
        color,
        weight: 2,
        opacity: 0.28,
        dashArray: "7 9",
        interactive: false,
      }).addTo(state.layers.tracks);
    } else {
      ghost.trackPolyline.setLatLngs(ghost.points);
    }
  });

  state.boats.forEach((boat) => {
    if (!boat.track || boat.track.length < 2) {
      if (boat.trackPolyline) {
        state.layers.tracks.removeLayer(boat.trackPolyline);
        boat.trackPolyline = null;
      }
      return;
    }
    compareBoatToGhost(boat);
    if (!boat.trackPolyline) {
      boat.trackPolyline = L.polyline(boat.track, {
        color: boat.isUserBoat ? "#ffffff" : boat.color,
        weight: boat.isUserBoat ? 3 : 2,
        opacity: boat.isUserBoat ? 0.95 : 0.72,
        interactive: false,
      }).addTo(state.layers.tracks);
    }
  });
}

function redrawWindOverlay() {
  if (state.layers.wind) {
    state.layers.wind.clearLayers();
  } else if (state.map) {
    state.layers.wind = L.layerGroup().addTo(state.map);
  }
  if (!state.windVisible || !state.layers.wind) {
    return;
  }
  const areaPoints = state.areaPolygon?.length ? state.areaPolygon : [];
  const fallbackBounds = L.latLngBounds([
    [45.8385, 10.8355],
    [45.8576, 10.8505],
  ]);
  const bounds = areaPoints.length ? L.latLngBounds(areaPoints) : fallbackBounds;
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();
  const rows = 6;
  const cols = 5;
  const latStep = (north - south) / rows;
  const lonStep = (east - west) / cols;
  const sampleTime = state.raceStatus === "running" ? performance.now() : 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lat = south + latStep * (row + 0.5);
      const lon = west + lonStep * (col + 0.5);
      const sample = windEngineAt({ lat, lon }, sampleTime);
      const multiplier = Number(sample.multiplier ?? 1);
      const flowBearing = normalizeAngle(sample.direction + 180);
      const length = 95 + Math.abs(multiplier - 1) * 260;
      const start = movePreviewPoint({ lat, lon }, normalizeAngle(flowBearing + 180), length * 0.5);
      const end = movePreviewPoint({ lat, lon }, flowBearing, length * 0.5);
      const color = multiplier >= 1.04 ? "#7df7d4" : multiplier <= 0.96 ? "#9cc7ff" : "#d9f4ff";

      L.polyline([start, end], {
        color,
        weight: multiplier >= 1.04 ? 2 : 1.4,
        opacity: clamp(0.24 + Math.abs(multiplier - 1) * 2.1, 0.24, 0.56),
        dashArray: "10 10",
        interactive: false,
      }).addTo(state.layers.wind);
    }
  }
}

function drawAreaPolygon(polygon) {
  if (state.layers.areaPolygon) {
    state.map.removeLayer(state.layers.areaPolygon);
  }
  state.layers.areaPolygon = L.polygon(polygon, {
    color: "#74d6ff",
    weight: 2,
    opacity: 0.7,
    fillColor: "#3b97d4",
    fillOpacity: 0.08,
    dashArray: "6 8",
    interactive: false,
  });
}

function drawCommitteePoint(point) {
  if (state.layers.committee) {
    state.map.removeLayer(state.layers.committee);
    state.layers.committee = null;
  }
}

function resetCourseLines() {
  state.courseLines = {
    startVisible: true,
    finishVisible: true,
    startPassedBoatIds: new Set(),
    finishPassedBoatIds: new Set(),
  };
}

function getCourseLineEndpoints(kind) {
  if (kind === "start") {
    const startA = getBuoy("ALFA RC");
    const pin = getBuoy("ALFA PIN");
    if (startA && pin) {
      return [pointToLatLng(startA), pointToLatLng(pin)];
    }
    return null;
  }

  const finishA = getBuoy("ALFA FINISH");
  const finishB = getBuoy("ALFA FINISH END") ?? getBuoy("ALFA FIN");
  if (finishA && finishB) {
    return [pointToLatLng(finishA), pointToLatLng(finishB)];
  }
  return null;
}

function pointsEqual(a, b, epsilon = 1e-9) {
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lon - b.lon) <= epsilon;
}

function orientation(a, b, c) {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function onSegment(a, b, c) {
  return (
    Math.min(a.lon, c.lon) <= b.lon &&
    b.lon <= Math.max(a.lon, c.lon) &&
    Math.min(a.lat, c.lat) <= b.lat &&
    b.lat <= Math.max(a.lat, c.lat)
  );
}

function segmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (nearZero(o1) && onSegment(p1, q1, p2)) return true;
  if (nearZero(o2) && onSegment(p1, q2, p2)) return true;
  if (nearZero(o3) && onSegment(q1, p1, q2)) return true;
  if (nearZero(o4) && onSegment(q1, p2, q2)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function nearZero(value, epsilon = 1e-12) {
  return Math.abs(value) <= epsilon;
}

function boatCrossedLine(boat, lineEndpoints) {
  if (!lineEndpoints || !boat.track || boat.track.length < 2) {
    return false;
  }
  const [a, b] = lineEndpoints;
  const previous = boat.track[boat.track.length - 2];
  const current = boat.track[boat.track.length - 1];
  if (!previous || !current) {
    return false;
  }
  if (pointsEqual({ lat: previous[0], lon: previous[1] }, { lat: current[0], lon: current[1] })) {
    return false;
  }
  return segmentsIntersect(
    { lat: previous[0], lon: previous[1] },
    { lat: current[0], lon: current[1] },
    { lat: a[0], lon: a[1] },
    { lat: b[0], lon: b[1] }
  );
}

function segmentIntersectionRatio(p1, p2, q1, q2) {
  const x1 = p1.lon;
  const y1 = p1.lat;
  const x2 = p2.lon;
  const y2 = p2.lat;
  const x3 = q1.lon;
  const y3 = q1.lat;
  const x4 = q2.lon;
  const y4 = q2.lat;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (nearZero(denominator)) {
    return 0.5;
  }
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  return clamp(t, 0, 1);
}

function lineCrossingInfo(boat, lineEndpoints) {
  if (!lineEndpoints || !boat.track || boat.track.length < 2) {
    return null;
  }
  const [a, b] = lineEndpoints;
  const previous = boat.track[boat.track.length - 2];
  const current = boat.track[boat.track.length - 1];
  if (!previous || !current) {
    return null;
  }
  const previousPoint = { lat: previous[0], lon: previous[1] };
  const currentPoint = { lat: current[0], lon: current[1] };
  if (!pointsEqual(previousPoint, currentPoint) && segmentsIntersect(previousPoint, currentPoint, { lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] })) {
    return {
      crossed: true,
      ratio: segmentIntersectionRatio(previousPoint, currentPoint, { lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }),
    };
  }
  return null;
}

function projectPointMeters(point, ref) {
  const latToMeters = 111132;
  const lonToMeters = 111132 * Math.cos((ref.lat * Math.PI) / 180);
  return {
    x: (point.lon - ref.lon) * lonToMeters,
    y: (point.lat - ref.lat) * latToMeters,
  };
}

function distancePointToSegmentMeters(point, start, end) {
  if (!point || !start || !end) {
    return Infinity;
  }
  const projectedPoint = projectPointMeters(point, point);
  const projectedStart = projectPointMeters(start, point);
  const projectedEnd = projectPointMeters(end, point);
  const dx = projectedEnd.x - projectedStart.x;
  const dy = projectedEnd.y - projectedStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(projectedPoint.x - projectedStart.x, projectedPoint.y - projectedStart.y);
  }
  const ratio = clamp(
    ((projectedPoint.x - projectedStart.x) * dx + (projectedPoint.y - projectedStart.y) * dy) / lengthSquared,
    0,
    1
  );
  const closestX = projectedStart.x + ratio * dx;
  const closestY = projectedStart.y + ratio * dy;
  return Math.hypot(projectedPoint.x - closestX, projectedPoint.y - closestY);
}

function movementReachedTarget(previousPoint, currentPoint, target, radiusMeters) {
  if (!previousPoint || !currentPoint || !target) {
    return false;
  }
  if (haversineMeters(currentPoint, target) <= radiusMeters) {
    return true;
  }
  return distancePointToSegmentMeters(target, previousPoint, currentPoint) <= radiusMeters;
}

function movementCrossedCourseLine(previousPoint, currentPoint, kind, radiusMeters = MARK_ROUNDING_RADIUS_METERS) {
  const endpoints = getCourseLineEndpoints(kind);
  if (!previousPoint || !currentPoint || !endpoints) {
    return false;
  }
  const [a, b] = endpoints;
  const lineA = { lat: a[0], lon: a[1] };
  const lineB = { lat: b[0], lon: b[1] };
  if (!pointsEqual(previousPoint, currentPoint) && segmentsIntersect(previousPoint, currentPoint, lineA, lineB)) {
    return true;
  }
  return distancePointToSegmentMeters(currentPoint, lineA, lineB) <= radiusMeters;
}

function movementCrossedUpwindMarkGate(previousPoint, currentPoint, target) {
  if (!previousPoint || !currentPoint || !target) {
    return false;
  }
  const gateLat = Number(target.lat) + 0.00045;
  const crossedGate =
    (Number(previousPoint.lat) >= gateLat && Number(currentPoint.lat) <= gateLat) ||
    Number(currentPoint.lat) <= gateLat;
  if (!crossedGate) {
    return false;
  }
  const latSpan = Number(currentPoint.lat) - Number(previousPoint.lat);
  const ratio = Math.abs(latSpan) > Number.EPSILON
    ? clamp((gateLat - Number(previousPoint.lat)) / latSpan, 0, 1)
    : 1;
  const lonAtGate = Number(previousPoint.lon) + (Number(currentPoint.lon) - Number(previousPoint.lon)) * ratio;
  const lateralMeters = Math.abs((lonAtGate - Number(target.lon)) * metersPerLonAtLat(Number(target.lat)));
  return lateralMeters <= 390;
}

function movementReachedCourseStage(previousPoint, currentPoint, stage, target) {
  if (stage?.finishLine) {
    return movementCrossedCourseLine(previousPoint, currentPoint, "finish", 0);
  }
  const baseRadius = Number(stage?.roundRadius ?? MARK_ROUNDING_RADIUS_METERS);
  const radius = stage?.mode === "upwind" ? Math.max(baseRadius, 25) : (stage?.gate ? Math.max(baseRadius, 20) : Math.max(baseRadius, 25));
  if (movementReachedTarget(previousPoint, currentPoint, target, radius)) {
    if (stage?.mode === "run" && (target.id === "ALFA 3P" || target.id === "ALFA 3ST")) {
      if (currentPoint.lat < target.lat - 0.00005) {
        return false;
      }
    }
    return true;
  }
  if (!previousPoint || !currentPoint || !target) {
    return false;
  }
  const previousDistance = haversineMeters(previousPoint, target);
  const currentDistance = haversineMeters(currentPoint, target);
  const passRadius = stage?.mode === "upwind"
    ? Math.max(radius, MARK_PASS_EXTENSION_RADIUS_M)
    : Math.max(radius, 64);
  const reachedPass = previousDistance <= passRadius && currentDistance > previousDistance + 3;
  if (reachedPass) {
    if (stage?.mode === "run" && (target.id === "ALFA 3P" || target.id === "ALFA 3ST")) {
      if (currentPoint.lat < target.lat - 0.00005) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function redrawCourseLines() {
  if (!state.map) {
    return;
  }
  if (state.layers.courseLines) {
    state.layers.courseLines.clearLayers();
  } else {
    state.layers.courseLines = L.layerGroup().addTo(state.map);
  }

  const lineConfigs = [
    {
      key: "start",
      color: "#ffd166",
      visible: state.courseLines.startVisible,
    },
    {
      key: "finish",
      color: "#ff7a59",
      visible: state.courseLines.finishVisible,
    },
  ];

  lineConfigs.forEach((line) => {
    if (!line.visible) {
      return;
    }
    const endpoints = getCourseLineEndpoints(line.key);
    if (!endpoints) {
      return;
    }
    L.polyline(endpoints, {
      color: line.color,
      weight: 3,
      opacity: 0.95,
      dashArray: "10 8",
      interactive: false,
    }).addTo(state.layers.courseLines);
  });
}

function refreshBoatList() {
  const boats = [...state.boats].sort((a, b) => {
    if (state.raceStatus === "running" || state.raceStatus === "finished") {
      const aFinished = a.race?.finishedAtSimMs != null;
      const bFinished = b.race?.finishedAtSimMs != null;
      if (aFinished && bFinished) {
        return (a.race?.elapsedSimMs ?? Infinity) - (b.race?.elapsedSimMs ?? Infinity);
      }
      if (aFinished !== bFinished) {
        return aFinished ? -1 : 1;
      }
      const aStarted = a.race?.startCrossed ?? false;
      const bStarted = b.race?.startCrossed ?? false;
      if (aStarted !== bStarted) {
        return aStarted ? -1 : 1;
      }
      const aProgress = boatProgressScore(a);
      const bProgress = boatProgressScore(b);
      return bProgress - aProgress;
    }
    if (a.isUserBoat && !b.isUserBoat) return -1;
    if (!a.isUserBoat && b.isUserBoat) return 1;
    return (b.currentSpeedKn ?? b.speed ?? 0) - (a.currentSpeedKn ?? a.speed ?? 0);
  });

  el.boatList.innerHTML = boats
    .map((boat) => {
      const active = boat.id === state.selectedBoatId ? "active" : "";
      const label = boat.isUserBoat ? "Your boat" : boat.id.replace("BOT_", "Bot ");
      const liveSpeed = boat.currentSpeedKn ?? boat.speed ?? 0;
      const raceSummary =
        boat.race?.finishedAtSimMs != null
          ? `finished in ${formatRaceTime(boat.race.elapsedSimMs)}`
          : boat.race?.startCrossed
            ? `racing ${formatRaceTime(
                boat.race.startedAtSimMs != null
                  ? Math.max(0, state.simulatedClockMs - boat.race.startedAtSimMs)
                  : state.simulatedClockMs
              )}`
            : "waiting for start";
      const metaLabel = boat.isUserBoat
        ? boat.dataPreset && boat.dataPreset !== "custom"
          ? `preset ${boat.dataPreset} · start ${boat.startPreset ?? "center"}`
          : `fleet average · start ${boat.startPreset ?? "center"}`
        : `${boat.tacticalProfile?.styleName ?? boat.preferred_side ?? "unknown"} · ${boat.preferred_side ?? "unknown"} · ${boat.tacticalDecision?.label ?? "Garda VMG"} · AI ${boat.aiEngine ?? "local"}${boat.qwenRequestPending ? "..." : ""}`;
      const polarLabel = state.raceStatus === "running" && boat.trueWindAngleDeg != null
        ? ` · polar ${displayPolarLabel(boat.polarState)} ${Math.round(boat.trueWindAngleDeg)}°`
        : "";
      const telemetry = boat.telemetry;
      const tackLabel = state.raceStatus === "running" && telemetry
        ? ` · tacks ${telemetry.tackCount ?? 0}${telemetry.rejectedTacks ? ` · rejected ${telemetry.rejectedTacks}` : ""}`
        : "";
      const rowPenaltyLabel = boat.rightOfWayPenaltyRemainingS > 0
        ? ` · <span style="color:#ff4d4d;font-weight:bold;">ROW PENALTY -0.5kn</span>`
        : "";
      const ghostMetrics = compareBoatToGhost(boat);
      const ghostLabel = ghostMetrics && boat.ghostFocus
        ? ` · ghost ${Math.round(ghostMetrics.similarity)}%/${Math.round(ghostMetrics.meanErrorM)}m`
        : "";
      const fieldLabel = boat.tacticalDecision?.fieldLabel ? ` · field ${boat.tacticalDecision.fieldLabel}` : "";
      const dirtyLabel = Number(boat.dirtyAirFactor ?? 1) < 0.98
        ? ` · dirty air ${Math.round((1 - Number(boat.dirtyAirFactor ?? 1)) * 100)}%`
        : "";
      return `
        <div class="boat-card ${active}" data-boat-id="${boat.id}">
          <span class="boat-swatch" style="background:${boat.color};"></span>
          <div>
            <div class="boat-name">${boat.name ?? label}</div>
            <div class="boat-meta">${metaLabel}${fieldLabel}${ghostLabel}${dirtyLabel} · ${displayMureLabel(boat.mure)}${polarLabel}${tackLabel}${rowPenaltyLabel} · ${raceSummary}${state.raceStatus === "running" ? ` · leg ${Math.min((boat.courseIndex ?? 0) + 1, COURSE_SEQUENCE.length)}/${COURSE_SEQUENCE.length}` : ""}</div>
          </div>
          <div class="boat-speed">${formatKn(liveSpeed)}</div>
        </div>
      `;
    })
    .join("");

  el.boatList.querySelectorAll("[data-boat-id]").forEach((node) => {
    node.addEventListener("click", () => {
      state.selectedBoatId = node.dataset.boatId;
      updateSelectedBoatMarker();
      updateStatus();
      refreshBoatList();
      redrawLaylines();
      saveLocalState();
    });
  });
}

function updateSelectedBoatMarker() {
  state.markers.forEach((marker, id) => {
    const boat = state.boats.find((item) => item.id === id);
    if (boat) {
      marker.setIcon(boatIcon(boat, id === state.selectedBoatId));
    }
  });
}

function syncBoatMarkers() {
  state.boats.forEach((boat) => {
    const marker = state.markers.get(boat.id);
    if (!marker) {
      return;
    }
    marker.setLatLng(pointToLatLng(boat));
    marker.setIcon(boatIcon(boat, boat.id === state.selectedBoatId));
  });
}

function redrawMarkers() {
  if (state.layers.buoys) {
    state.layers.buoys.clearLayers();
  } else {
    state.layers.buoys = L.layerGroup().addTo(state.map);
  }
  if (state.layers.boats) {
    state.layers.boats.clearLayers();
  } else {
    state.layers.boats = L.layerGroup().addTo(state.map);
  }

  state.markers.clear();

  state.buoys.forEach((buoy) => {
    const marker = L.marker(pointToLatLng(buoy), {
      draggable: false,
      icon: buoyIcon(buoy),
    }).addTo(state.layers.buoys);
    state.markers.set(buoy.id, marker);
  });

  state.boats.forEach((boat) => {
    const marker = L.marker(pointToLatLng(boat), {
      draggable: false,
      icon: boatIcon(boat, boat.id === state.selectedBoatId),
    }).addTo(state.layers.boats);
    marker.on("click", () => {
      state.selectedBoatId = boat.id;
      updateSelectedBoatMarker();
      updateStatus();
      refreshBoatList();
      redrawLaylines();
      saveLocalState();
    });
    state.markers.set(boat.id, marker);
  });
}

function redrawLaylines() {
  // Layline visualization is disabled.
}

function movePreviewPoint(origin, bearing, meters) {
  const radius = 6371000;
  const angularDistance = meters / radius;
  const bearingRad = (bearing * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lon1 = (origin.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function isTypingElement(target) {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function getStartLinePoint(slot = "center") {
  const startA = getBuoy("ALFA RC");
  const pin = getBuoy("ALFA PIN");
  if (!startA || !pin) {
    return null;
  }
  const ratio = Number.isFinite(Number(slot))
    ? clamp(Number(slot), 0.03, 0.97)
    : START_LINE_PRESETS[slot] ?? START_LINE_PRESETS.center;
  return {
    lat: startA.lat + (pin.lat - startA.lat) * ratio,
    lon: startA.lon + (pin.lon - startA.lon) * ratio,
  };
}

function allowedUpwindHeadingForSide(boat, wind, sideSign, targetAngleDeltaDeg = 0) {
  const profile = getBoatProfile(boat);
  const safeSide = sideSign === 0 ? resolveRouteSideSign(boat) : sideSign;
  const targetAngle = clamp(
    Number(profile.upwindTargetAngleDeg ?? 48) + Number(targetAngleDeltaDeg || 0),
    Number(profile.upwindMinAngleDeg ?? UPWIND_TARGET_MIN_DEG),
    Number(profile.upwindMaxAngleDeg ?? UPWIND_TARGET_MAX_DEG)
  );
  return normalizeAngle(Number(wind?.direction ?? 185) + Math.sign(safeSide || -1) * targetAngle);
}

function closestAllowedUpwindHeading(boat, wind, desiredHeading) {
  const leftHeading = allowedUpwindHeadingForSide(boat, wind, 1);
  const rightHeading = allowedUpwindHeadingForSide(boat, wind, -1);
  return Math.abs(shortestAngleDelta(leftHeading, desiredHeading)) <= Math.abs(shortestAngleDelta(rightHeading, desiredHeading))
    ? leftHeading
    : rightHeading;
}

function constrainedHeadingForStage(boat, desiredHeading, wind, stageMode) {
  if (stageMode !== "upwind") {
    return normalizeAngle(desiredHeading);
  }
  const profile = getBoatProfile(boat);
  const angleToWind = Math.abs(shortestAngleDelta(desiredHeading, Number(wind?.direction ?? 185)));
  const insidePolar = angleToWind >= Number(profile.upwindMinAngleDeg ?? UPWIND_NO_GO_MIN_DEG) &&
    angleToWind <= Number(profile.upwindMaxAngleDeg ?? 54);
  if (insidePolar) {
    return normalizeAngle(desiredHeading);
  }
  return closestAllowedUpwindHeading(boat, wind, desiredHeading);
}

function routeHeadingWithProgressGuard(boat, target, desiredHeading, fallbackHeading, lookaheadM = 170, minProgressRatio = 0.38, minProgressM = 12) {
  if (!boat || !target) {
    return normalizeAngle(desiredHeading);
  }
  const currentDistance = haversineMeters(boat, target);
  const candidate = makeWaypointFromBearing(boat, desiredHeading, lookaheadM);
  const guardedCandidate = makeWaypointFromBearing(boat, fallbackHeading, lookaheadM);
  const candidateDistance = haversineMeters(candidate, target);
  const fallbackDistance = haversineMeters(guardedCandidate, target);
  const candidateProgress = currentDistance - candidateDistance;
  const fallbackProgress = currentDistance - fallbackDistance;
  if (candidateProgress >= Math.max(minProgressM, fallbackProgress * minProgressRatio)) {
    return normalizeAngle(desiredHeading);
  }
  return normalizeAngle(fallbackHeading);
}

function headingProgressTowardTarget(boat, target, heading, lookaheadM = 360) {
  if (!boat || !target) {
    return -Infinity;
  }
  const currentDistance = haversineMeters(boat, target);
  const preview = makeWaypointFromBearing(boat, heading, lookaheadM);
  return currentDistance - haversineMeters(preview, target);
}

function upwindStallRecoveryHeading(boat, target, wind) {
  const stageIndex = Number(boat.courseIndex ?? 0);
  const targetId = target?.id ?? "target";
  const locked = boat.upwindRecoveryLock;
  if (
    locked &&
    Number(locked.stageIndex) === stageIndex &&
    locked.targetId === targetId &&
    Number(locked.untilSimMs ?? 0) > state.simulatedClockMs &&
    Number.isFinite(Number(locked.heading))
  ) {
    if (Number(locked.sideSign ?? 0) !== 0) {
      boat.liveSideSign = Number(locked.sideSign);
      boat.mure = boat.liveSideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    }
    return {
      heading: normalizeAngle(Number(locked.heading)),
      sideSign: Number(locked.sideSign ?? 0),
      label: locked.label ?? "locked recovery board",
      progress: Number(locked.progress ?? 0),
      locked: true,
    };
  }

  const targetBearing = target ? bearingDegrees(boat, target) : Number(boat.heading ?? 0);
  const directHeading = constrainedHeadingForStage(boat, targetBearing, wind, "upwind");
  const leftHeading = allowedUpwindHeadingForSide(boat, wind, 1, 2);
  const rightHeading = allowedUpwindHeadingForSide(boat, wind, -1, 2);
  const candidates = [
    { heading: directHeading, sideSign: 0, label: "direct" },
    { heading: leftHeading, sideSign: 1, label: "left recovery board" },
    { heading: rightHeading, sideSign: -1, label: "right recovery board" },
  ].map((candidate) => ({
    ...candidate,
    progress: headingProgressTowardTarget(boat, target, candidate.heading, 420),
  }));
  candidates.sort((a, b) => b.progress - a.progress);
  const best = candidates[0] ?? candidates[1] ?? { heading: directHeading, sideSign: 0, label: "direct", progress: 0 };
  if (best.sideSign !== 0) {
    boat.liveSideSign = best.sideSign;
    boat.mure = best.sideSign > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  }
  boat.upwindRecoveryLock = {
    stageIndex,
    targetId,
    heading: normalizeAngle(best.heading),
    sideSign: best.sideSign,
    label: best.label,
    progress: best.progress,
    untilSimMs: state.simulatedClockMs + UPWIND_STALL_RECOVERY_LOCK_MS,
  };
  return {
    heading: normalizeAngle(best.heading),
    sideSign: best.sideSign,
    label: best.label,
    progress: best.progress,
  };
}

function shouldUseUpwindStallRecovery(boat, stage, target, distanceToTargetM, stageElapsedMs) {
  if (!boat || stage?.mode !== "upwind" || !target) {
    return false;
  }
  const stageIndex = Number(stage?.courseStageIndex ?? boat.courseIndex ?? 0);
  const minElapsed = stageIndex === 0 ? UPWIND_STALL_RECOVERY_FIRST_LEG_MS : UPWIND_STALL_RECOVERY_LEG_MS;
  return (
    stageElapsedMs > minElapsed &&
    distanceToTargetM > MARK_ROUNDING_RADIUS_METERS * 4 &&
    distanceToTargetM < UPWIND_STALL_RECOVERY_DISTANCE_M &&
    Number(boat.currentVmgKn ?? 0) < UPWIND_STALL_RECOVERY_LOW_VMG_KN
  );
}

function upwindClosingHeading(boat, target, wind, sideSign, polarReliefDeg = 0) {
  const plannedHeading = allowedUpwindHeadingForSide(boat, wind, sideSign, polarReliefDeg);
  const targetBearing = target ? bearingDegrees(boat, target) : plannedHeading;
  const fallbackHeading = constrainedHeadingForStage(boat, targetBearing, wind, "upwind");
  const guardedHeading = routeHeadingWithProgressGuard(
    boat,
    target,
    plannedHeading,
    fallbackHeading,
    220,
    0.72,
    18
  );
  return guardedHeading;
}

function upwindProgressForSide(boat, target, wind, sideSign, lookaheadM = 260) {
  if (!boat || !target) {
    return -Infinity;
  }
  const currentDistance = haversineMeters(boat, target);
  const heading = allowedUpwindHeadingForSide(boat, wind, sideSign);
  const preview = makeWaypointFromBearing(boat, heading, lookaheadM);
  return currentDistance - haversineMeters(preview, target);
}

function chooseStableClosingSide(boat, target, wind, currentSide) {
  const leftProgress = upwindProgressForSide(boat, target, wind, 1, 320);
  const rightProgress = upwindProgressForSide(boat, target, wind, -1, 320);
  if (Math.abs(leftProgress - rightProgress) < 8) {
    return currentSide || resolveRouteSideSign(boat) || -1;
  }
  return leftProgress > rightProgress ? 1 : -1;
}

function stableBoardHeadingLock(boat, memory, stage, target, wind, sideSign, fallbackHeading = null) {
  const stageIndex = Number(stage?.courseStageIndex ?? boat?.courseIndex ?? 0);
  const targetId = target?.id ?? "target";
  const side = Number(sideSign || resolveRouteSideSign(boat) || -1);
  const baseHeading = Number.isFinite(Number(fallbackHeading))
    ? Number(fallbackHeading)
    : allowedUpwindHeadingForSide(boat, wind, side, 0);
  const currentLock = memory?.stableBoardHeadingLock;
  const lockValid =
    currentLock &&
    Number(currentLock.stageIndex) === stageIndex &&
    currentLock.targetId === targetId &&
    Number(currentLock.sideSign) === side &&
    Number(currentLock.untilSimMs ?? 0) > state.simulatedClockMs &&
    Number.isFinite(Number(currentLock.heading));
  if (lockValid) {
    const windShiftDelta = Math.abs(shortestAngleDelta(Number(currentLock.windDirection ?? wind?.direction ?? 0), Number(wind?.direction ?? 0)));
    const preview = makeWaypointFromBearing(boat, Number(currentLock.heading), 280);
    const stillSafe = isPointInsideArea(preview) && isPointInsideCourseSafetyCorridor(preview);
    const stillProgressing = headingProgressTowardTarget(boat, target, Number(currentLock.heading), 320) > 6;
    if (windShiftDelta < UPWIND_BOARD_HEADING_RELOCK_MIN_DELTA_DEG && stillSafe && stillProgressing) {
      return normalizeAngle(Number(currentLock.heading));
    }
  }
  const fallbackToTarget = constrainedHeadingForStage(boat, target ? bearingDegrees(boat, target) : baseHeading, wind, "upwind");
  let lockedSide = side;
  let guardedHeading = routeHeadingWithProgressGuard(boat, target, baseHeading, fallbackToTarget, 300, 0.62, 10);
  const guardedPreview = makeWaypointFromBearing(boat, guardedHeading, 260);
  if (!isPointInsideArea(guardedPreview) || !isPointInsideCourseSafetyCorridor(guardedPreview)) {
    const oppositeSide = -side;
    const oppositeHeading = allowedUpwindHeadingForSide(boat, wind, oppositeSide, 0);
    const oppositePreview = makeWaypointFromBearing(boat, oppositeHeading, 260);
    if (isPointInsideArea(oppositePreview) && isPointInsideCourseSafetyCorridor(oppositePreview)) {
      guardedHeading = oppositeHeading;
      lockedSide = oppositeSide;
      boat.liveSideSign = oppositeSide;
      boat.mure = oppositeSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    }
  }
  const lockedHeading = normalizeAngle(guardedHeading);
  memory.stableBoardHeadingLock = {
    stageIndex,
    targetId,
    sideSign: lockedSide,
    heading: lockedHeading,
    windDirection: Number(wind?.direction ?? 0),
    untilSimMs: state.simulatedClockMs + UPWIND_BOARD_HEADING_LOCK_MS,
  };
  return lockedHeading;
}

function stableUpwindPilotDecision(boat, stage, target, wind, distanceToTargetM, stageElapsedMs) {
  const profile = getBoatProfile(boat);
  const memory = stageMemoryForBoat(boat);
  const currentSide = Number(boat.liveSideSign || resolveRouteSideSign(boat) || -1);
  const stageIndex = Number(stage?.courseStageIndex ?? boat.courseIndex ?? 0);
  const closureRadiusM = stageIndex === 0 ? 1550 : 1380;
  const directRadiusM = 115;
  const sideElapsedMs = Math.max(0, state.simulatedClockMs - Number(memory.sideStartedSimMs ?? state.simulatedClockMs));
  const replayTarget = replayManeuverTargetForStage(boat, stageIndex);
  const targetTacks = clamp(Math.round(Number.isFinite(replayTarget) ? replayTarget : 2), 1, 2);
  const minBoardMs = clamp(Number(profile.boardCommitmentMs ?? 170000) * 0.82, 115000, 245000);

  if (!Number.isFinite(Number(memory.stableUpwindSideSign))) {
    const legPlan = legPlanForBoat(boat, stage, memory);
    const startSide = Number(boat.gardaAttackSideSign ?? legPlan?.targetSideSign ?? currentSide) || currentSide || -1;
    memory.stableUpwindSideSign = startSide;
    memory.stableUpwindTacks = 0;
    memory.sideStartedSimMs = state.simulatedClockMs;
    boat.liveSideSign = startSide;
    boat.mure = startSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  }

  let selectedSide = Number(memory.stableUpwindSideSign || currentSide || -1);
  const closingZone = distanceToTargetM < closureRadiusM;
  if (closingZone) {
    if (!Number.isFinite(Number(memory.stableClosingSideSign)) || Number(memory.stableClosingSideSign) !== 1) {
      memory.stableClosingSideSign = 1;
      memory.stableClosingStartedSimMs = state.simulatedClockMs;
    }
    selectedSide = 1;
    boat.liveSideSign = selectedSide;
    boat.mure = selectedSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
    const closingHeading = upwindClosingHeading(boat, target, wind, selectedSide, 0);
    const heading = stableBoardHeadingLock(boat, memory, stage, target, wind, selectedSide, closingHeading);
    return {
      sideSign: selectedSide,
      heading,
      shouldSwitch: false,
      distanceToTargetM,
      stageElapsedMs,
      label: "Stable mark approach",
      reason: `Stable mark approach: holding ${sideNameFromSign(selectedSide)} board, ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}; no zig-zag tacks allowed.`,
    };
  }

  const stableTacks = Number(memory.stableUpwindTacks ?? 0);
  const scheduledTack =
    stableTacks < targetTacks &&
    sideElapsedMs > minBoardMs &&
    stageElapsedMs > minBoardMs * (stableTacks + 0.85) &&
    distanceToTargetM > closureRadiusM + 420;
  if (scheduledTack) {
    const nextSide = -selectedSide;
    const gate = canAcceptBotTack(boat, {
      courseStageIndex: boat.courseIndex,
      stageMode: stage?.mode,
      isMarkRounding: false,
      forceClosure: false,
      distanceToTargetM,
      stageElapsedMs,
    });
    if (gate.allowed) {
      selectedSide = nextSide;
      memory.stableUpwindSideSign = selectedSide;
      memory.stableUpwindTacks = stableTacks + 1;
      memory.sideStartedSimMs = state.simulatedClockMs;
      boat.liveSideSign = selectedSide;
      boat.mure = selectedSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
      boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * (boat.tacticalProfile?.maneuverPenalty ?? 0.94), 0.74, 1);
      registerManeuverTelemetry(boat, {
        courseStageIndex: boat.courseIndex,
        stageMode: stage?.mode,
        distanceToTargetM,
        stageElapsedMs,
      }, gate.countAsTack);
    }
  }

  selectedSide = Number(boat.liveSideSign || selectedSide || -1);
  const stableHeading = stableBoardHeadingLock(boat, memory, stage, target, wind, selectedSide);
  return {
    sideSign: selectedSide,
    heading: stableHeading,
    shouldSwitch: false,
    distanceToTargetM,
    stageElapsedMs,
    label: "Stable upwind board",
    reason: `Stable upwind board: ${sideNameFromSign(selectedSide)} board, ${Math.round(distanceToTargetM)} m to ${target.id ?? "mark"}, planned tacks ${Number(memory.stableUpwindTacks ?? 0)}/${targetTacks}.`,
  };
}

function initialHeadingForBoat(boat) {
  const target = getCourseTarget(0, boat);
  if (!target) {
    const startA = getBuoy("ALFA RC");
    const pin = getBuoy("ALFA PIN");
    return startA && pin ? normalizeAngle(bearingDegrees(startA, pin) + 90) : Number(boat.heading ?? 185);
  }
  const wind = windEngineAt(boat, state.raceStatus === "running" ? performance.now() : 0);
  const targetBearing = bearingDegrees(boat, target);
  return constrainedHeadingForStage(boat, targetBearing, wind, "upwind");
}

function positionBoatOnStartLine(boat, slot = "center") {
  const point = getStartLinePoint(slot);
  if (!boat || !point) {
    return false;
  }
  boat.lat = point.lat;
  boat.lon = point.lon;
  boat.startPreset = typeof slot === "string" ? slot : boat.startPreset ?? "custom";
  boat.courseIndex = 0;
  boat.targetIndex = 0;
  boat.courseTargetChoices = {};
  boat.route = null;
  boat.track = [[boat.lat, boat.lon]];
  boat.heading = initialHeadingForBoat(boat);
  boat.manualTackSide = resolveRouteSideSign(boat);
  boat.mure = boat.manualTackSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  boat.isMoving = true;
  refreshBoatEngineProfile(boat);
  return true;
}

function positionFleetOnStartLine() {
  const userBoat = state.boats.find((boat) => boat.isUserBoat);
  const userSlot = userBoat?.startPreset ?? state.startPreset ?? "center";
  const userRatio = START_LINE_PRESETS[userSlot] ?? START_LINE_PRESETS.center;
  const bots = state.boats.filter((boat) => !boat.isUserBoat).sort((a, b) => a.id.localeCompare(b.id));
  bots.forEach((boat, index) => {
    let ratio = FLEET_START_SLOTS[index] ?? (0.12 + index * 0.1);
    if (Math.abs(ratio - userRatio) < 0.055) {
      ratio = clamp(ratio + (ratio < userRatio ? -0.075 : 0.075), 0.06, 0.94);
    }
    positionBoatOnStartLine(boat, ratio);
  });
  if (userBoat) {
    positionBoatOnStartLine(userBoat, userSlot);
  }
}

function placeSelectedBoatOnStartLine(slot = "center") {
  if (state.raceStatus === "running") {
    return false;
  }
  const boat = getPilotBoat();
  if (!boat) {
    return false;
  }
  const point = getStartLinePoint(slot);
  const startA = getBuoy("ALFA RC");
  const pin = getBuoy("ALFA PIN");
  if (!point || !startA || !pin) {
    return false;
  }

  boat.lat = point.lat;
  boat.lon = point.lon;
  boat.heading = initialHeadingForBoat(boat);
  boat.startPreset = slot;
  state.startPreset = slot;
  state.selectedBoatId = boat.id;
  boat.track = [[boat.lat, boat.lon]];
  boat.courseIndex = 0;
  boat.targetIndex = 0;
  boat.courseTargetChoices = {};
  boat.route = null;
  boat.isMoving = true;
  refreshBoatEngineProfile(boat);
  redrawMarkers();
  refreshBoatList();
  redrawLaylines();
  updateStatus();
  saveLocalState();
  return true;
}

function setSelectedBoatSidePreference(side) {
  const boat = getSelectedBoat();
  if (!boat) {
    return false;
  }

  boat.preferred_side = side;
  refreshBoatEngineProfile(boat);
  boat.route = null;
  redrawMarkers();
  refreshBoatList();
  redrawLaylines();
  updateStatus();
  saveLocalState();
  return true;
}

function steerPilotBoat(deltaDegrees) {
  const boat = getPilotBoat();
  if (!boat) {
    return false;
  }
  boat.heading = normalizeAngle((Number(boat.heading) || initialHeadingForBoat(boat)) + deltaDegrees);
  boat.controlMode = "manual";
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.985, 0.78, 1);
  state.selectedBoatId = boat.id;
  updateSelectedBoatMarker();
  syncBoatMarkers();
  refreshBoatList();
  redrawLaylines();
  updateStatus();
  saveLocalState();
  return true;
}

function handleKeyboardShortcuts(event) {
  if (isTypingElement(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  let handled = false;

  if (key === "s") {
    maneuverSelectedBoat();
    handled = true;
  } else if (key === "z") {
    handled = steerPilotBoat(-MANUAL_TURN_DEGREES) || handled;
  } else if (key === "x") {
    handled = steerPilotBoat(MANUAL_TURN_DEGREES) || handled;
  } else if (key === "arrowleft") {
    handled = steerPilotBoat(-MANUAL_TURN_DEGREES) || handled;
  } else if (key === "arrowright") {
    handled = steerPilotBoat(MANUAL_TURN_DEGREES) || handled;
  }

  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function applyBoatInputs() {
  const boat = getSelectedBoat();
  if (!boat) {
    return;
  }
  if (boat.isUserBoat) {
    boat.dataPreset = "custom";
    boat.manualPerformanceLocked = true;
    boat.performanceAssistEnabled = true;
  }
  boat.name = el.boatNameInput.value.trim() || boat.name;
  const sanitizedPerformance = sanitizeBoatPerformance(el.speedInput.value, el.vmgInput.value, boat.speed || 6, boat.vmg || 4);
  boat.speed = sanitizedPerformance.speed;
  boat.vmg = sanitizedPerformance.vmg;
  el.speedInput.value = boat.speed.toFixed(1);
  el.vmgInput.value = boat.vmg.toFixed(1);
  refreshBoatEngineProfile(boat);
  boat.currentSpeedKn = stageSpeedForMode(boat.tacticalProfile, state.leg === "lasco" ? "reach" : state.leg === "poppa" ? "run" : "upwind") * (boat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE);
  boat.currentVmgKn = boat.vmg * (boat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE);
  state.manualSpeed = boat.isUserBoat ? boat.speed : state.manualSpeed;
  state.manualVmg = boat.isUserBoat ? boat.vmg : state.manualVmg;
  redrawMarkers();
  refreshBoatList();
  updateStatus();
  redrawLaylines();
  saveLocalState();
}

function runJudgeDemo() {
  const liveQwenRequested = new URLSearchParams(window.location.search).get("qwen") === "1";
  state.qwenLiveEnabled = liveQwenRequested;
  state.qwenEngineStatus = liveQwenRequested ? "standby" : "brain-local";
  state.showTrack = true;
  state.showLabels = true;
  state.showVmg = true;
  state.windVisible = true;
  const userBoat = state.boats.find((boat) => boat.isUserBoat);
  if (userBoat) {
    userBoat.demoAutopilot = true;
    userBoat.dataPreset = userBoat.dataPreset && userBoat.dataPreset !== "custom" ? userBoat.dataPreset : DEFAULT_USER_BOT_CODE;
    const preset = state.botProfiles.find((profile) => profile.bot_code === userBoat.dataPreset) ?? state.botProfiles[0];
    if (preset) {
      userBoat.preferred_side = preset.preferred_side ?? userBoat.preferred_side;
      userBoat.metrics = { ...(preset.metrics ?? userBoat.metrics ?? {}) };
      userBoat.source_examples = preset.source_examples ?? userBoat.source_examples ?? [];
      userBoat.source_tracks = preset.source_tracks ?? userBoat.source_tracks ?? [];
      userBoat.leg_metrics = preset.leg_metrics ?? userBoat.leg_metrics ?? [];
      userBoat.track_style = preset.track_style ?? userBoat.track_style ?? null;
      userBoat.simulator_profile = preset.simulator_profile ?? userBoat.simulator_profile ?? null;
      userBoat.bot_ai_brain = preset.bot_ai_brain ?? userBoat.bot_ai_brain ?? null;
      userBoat.aggregate_stats = preset.aggregate_stats ?? userBoat.aggregate_stats ?? null;
      refreshBoatEngineProfile(userBoat);
    }
  }
  const preferredBot = state.boats.find((boat) => boat.id === "BOT_06") ?? state.boats.find((boat) => !boat.isUserBoat) ?? getSelectedBoat();
  if (preferredBot) {
    state.selectedBoatId = preferredBot.id;
  }
  if (state.map) {
    const mapConf = state.areaB?.map ?? { centerLat: 45.6500, centerLon: 10.6500, zoom: 9.4 };
    state.map.setView([mapConf.centerLat, mapConf.centerLon], mapConf.zoom);
  }
  redrawMarkers();
  redrawTracks();
  redrawWindOverlay();
  redrawCourseLines();
  redrawLaylines();
  refreshBoatList();
  updateSelectedBoatMarker();
  updateStatus();
  if (state.raceStatus === "ready") {
    startRaceCountdown();
  }
}

function refreshPresetOptions() {
  const currentValue = el.dataPresetSelect.value || "custom";
  el.dataPresetSelect.innerHTML = [
    `<option value="custom">Fleet average</option>`,
    ...state.botProfiles.map((bot) => `<option value="${bot.bot_code}">Like ${bot.bot_name}</option>`),
  ].join("");
  el.dataPresetSelect.value = currentValue;
}

function applyPresetToUserBoat(presetCode) {
  const userBoat = state.boats.find((boat) => boat.id === USER_BOAT_ID);
  if (!userBoat) {
    return;
  }
  userBoat.dataPreset = presetCode;
  if (presetCode === "custom") {
    const fleetAverage = fleetAveragePerformance(state.botProfiles);
    userBoat.speed = fleetAverage.speed;
    userBoat.vmg = fleetAverage.vmg;
    userBoat.name = "Your boat";
    userBoat.performanceAssistEnabled = true;
    userBoat.manualPerformanceLocked = false;
  } else {
    const profile = state.botProfiles.find((bot) => bot.bot_code === presetCode);
    if (profile) {
      const sanitized = sanitizeBoatPerformance(
        profile.metrics?.avg_speed ?? userBoat.speed ?? 6,
        profile.metrics?.avg_vmg ?? userBoat.vmg ?? 4,
        6,
        4
      );
      userBoat.speed = sanitized.speed;
      userBoat.vmg = sanitized.vmg;
      userBoat.preferred_side = profile.preferred_side ?? userBoat.preferred_side;
      userBoat.metrics = { ...(profile.metrics ?? {}) };
      userBoat.source_examples = profile.source_examples ?? [];
      userBoat.source_tracks = profile.source_tracks ?? [];
      userBoat.leg_metrics = profile.leg_metrics ?? [];
      userBoat.track_style = profile.track_style ?? null;
      userBoat.simulator_profile = profile.simulator_profile ?? null;
      userBoat.bot_ai_brain = profile.bot_ai_brain ?? null;
      userBoat.aggregate_stats = profile.aggregate_stats ?? null;
      userBoat.name = `Your boat (${profile.bot_name})`;
      userBoat.performanceAssistEnabled = true;
      userBoat.manualPerformanceLocked = false;
    }
  }
  refreshBoatEngineProfile(userBoat);
  state.manualSpeed = presetCode === "custom" ? userBoat.speed : null;
  state.manualVmg = presetCode === "custom" ? userBoat.vmg : null;
  userBoat.currentSpeedKn = stageSpeedForMode(userBoat.tacticalProfile, state.leg === "lasco" ? "reach" : state.leg === "poppa" ? "run" : "upwind") * (userBoat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE);
  userBoat.currentVmgKn = userBoat.vmg * (userBoat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE);
  state.selectedBoatId = USER_BOAT_ID;
  updateSelectedBoatInputs();
  refreshBoatList();
  redrawMarkers();
  redrawLaylines();
  updateStatus();
  saveLocalState();
}

function startRaceCountdown() {
  if (state.raceStatus !== "ready") {
    return;
  }
  resetCourseLines();
  beginRaceSimulation();
}

function initializeBoatRaceState(boat, fleetIndex = 0) {
  boat.isMoving = true;
  refreshBoatEngineProfile(boat);
  resetBoatTelemetry(boat);
  boat.courseIndex = 0;
  boat.targetIndex = 0;
  boat.courseTargetChoices = {};
  boat.track = [[boat.lat, boat.lon]];
  boat.speedPenalty = 1;
  boat.dirtyAirFactor = 1;
  boat.dirtyAirSource = null;
  boat.maneuverRecoveryFactor = 1;
  boat.maneuverRecoveryTotalMs = 0;
  boat.maneuverRecoveryUntilSimMs = 0;
  boat.approachCommitSideSign = null;
  boat.markApproachSideSign = null;
  boat.markApproachMode = false;
  boat.markDirectRoundingMode = false;
  boat.upwindRecoveryMode = false;
  boat.upwindRecoveryLock = null;
  clearFinalBoardLock(boat);
  boat.ghostSimilarity = null;
  boat.ghostMeanErrorM = null;
  boat.race = {
    startedAtSimMs: null,
    stageStartedAtSimMs: state.simulatedClockMs,
    finishedAtSimMs: null,
    elapsedSimMs: null,
    startCrossed: false,
    finishCrossed: false,
  };
  const paceScale = Number(boat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE);
  boat.currentSpeedKn = stageSpeedForMode(boat.tacticalProfile, "upwind") * paceScale;
  boat.currentVmgKn = Number(boat.vmg ?? boat.currentVmgKn ?? boat.tacticalProfile?.baseVmgKn ?? 4) * paceScale;
  if (boat.isUserBoat && !boat.demoAutopilot) {
    boat.controlMode = "manual";
    boat.route = [];
    boat.manualTackSide = boat.mure === "mure_a_sinistra" ? -1 : 1;
    boat.heading = Number.isFinite(Number(boat.heading)) ? boat.heading : initialHeadingForBoat(boat);
  } else {
    const stage = getCourseStage(0);
    const target = getCourseTarget(0, boat);
    const wind = windEngineAt(boat, 0);
    boat.controlMode = boat.isUserBoat ? "demo-autopilot" : "qwen-live";
    boat.route = [];
    boat.gardaAttackSideSign = chooseInitialGardaAttackSide(boat, fleetIndex);
    boat.liveSideSign = boat.gardaAttackSideSign || (target ? chooseTacticalSideSign(boat, stage, boat, target) : resolveRouteSideSign(boat));
    boat.qwenDecision = null;
    boat.tacticalDecision = null;
    boat.sideMemoryByStage = {};
    boat.qwenRequestPending = false;
    boat.lastQwenDecisionSimMs = -Infinity;
    boat.lastQwenDecisionRealMs = -Infinity;
    boat.qwenReadyRealMs = performance.now() + ((deterministicJitter(boat, 91) + 1) * QWEN_FIRST_DECISION_STAGGER_REAL_MS) / 2;
    boat.aiEngine = "local";
    boat.aiReason = "Live engine waiting for the first Qwen response.";
    resetStageSideMemory(boat, 0);
    boat.heading = target ? liveBotHeading(boat, stage, target, wind) : initialHeadingForBoat(boat);
  }
}

function beginRaceSimulation() {
  state.raceStatus = "running";
  state.countdownRemaining = 0;
  state.simulatedClockMs = 0;
  state.lastUiRedrawRealMs = 0;
  state.lastTrackRedrawRealMs = 0;
  state.raceProfile = createRaceProfile();
  applyRaceVariationToBuoys();
  resetCourseLines();
  redrawMarkers();
  redrawCourseLines();
  positionFleetOnStartLine();
  state.boats.forEach(initializeBoatRaceState);
  state.lastTickMs = performance.now();
  clearInterval(state.simulationTimer);
  state.simulationTimer = setInterval(tickSimulation, 33);
  redrawMarkers();
  redrawCourseLines();
  refreshBoatList();
  updateStatus();
}

function calculateTargetSpeedKn(boat, stageMode, heading, wind, dt) {
  const profile = getBoatProfile(boat);
  const angleToWind = Math.abs(shortestAngleDelta(heading, wind.direction));
  const polar = stagePolarResult(stageMode ?? "route", angleToWind, profile);
  const stageBaseSpeed = stageSpeedForMode(profile, stageMode);
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) + dt * profile.response * 0.22, 0.78, 1);
  boat.trueWindAngleDeg = angleToWind;
  boat.polarState = polar.state;
  boat.allowedUpwindAngleRange = [profile.upwindMinAngleDeg, profile.upwindMaxAngleDeg];
  const recoveryTotalMs = Number(boat.maneuverRecoveryTotalMs ?? 0);
  const recoveryRemainingMs = Math.max(0, Number(boat.maneuverRecoveryUntilSimMs ?? 0) - state.simulatedClockMs);
  const recoveryProgress = recoveryTotalMs > 0 ? 1 - recoveryRemainingMs / recoveryTotalMs : 1;
  const recoveryFactor = recoveryRemainingMs > 0 ? clamp(0.72 + recoveryProgress * 0.28, 0.72, 1) : 1;
  const dirtyAir = dirtyAirPenaltyForBoat(boat, wind);
  boat.maneuverRecoveryFactor = recoveryFactor;
  boat.dirtyAirFactor = dirtyAir.factor;
  boat.dirtyAirSource = dirtyAir.source;
  const rawTargetSpeed = stageBaseSpeed * profile.speedMultiplier * profile.paceScale * wind.multiplier * polar.factor * boat.speedPenalty * recoveryFactor * dirtyAir.factor;
  const fleetComparableSpeed = fleetAverageStageSpeed(stageMode) * wind.multiplier * polar.factor * boat.speedPenalty * recoveryFactor * dirtyAir.factor;
  const targetSpeed = boat.isUserBoat
    ? rawTargetSpeed
    : rawTargetSpeed * (1 - FLEET_SPEED_COMPRESSION) + fleetComparableSpeed * FLEET_SPEED_COMPRESSION;
  let penaltyAdjustedSpeed = targetSpeed;
  if (boat.rightOfWayPenaltyRemainingS > 0) {
    penaltyAdjustedSpeed = Math.max(0.5, penaltyAdjustedSpeed - 0.5);
  }
  const fleetAssistFloor = boat.isUserBoat && boat.performanceAssistEnabled !== false
    ? fleetAverageStageSpeed(stageMode) * 0.96 * wind.multiplier * polar.factor * recoveryFactor * dirtyAir.factor
    : 0;
  const stageMaxSpeed = maxStageSpeedForMode(profile, stageMode);
  const assistedSpeed = fleetAssistFloor > 0 ? Math.max(penaltyAdjustedSpeed, fleetAssistFloor) : penaltyAdjustedSpeed;
  const cappedSpeed = Number.isFinite(stageMaxSpeed) ? Math.min(assistedSpeed, Math.max(stageMaxSpeed, fleetAssistFloor)) : assistedSpeed;
  const polarLimitedSpeed = polar.maxSpeedKn == null ? cappedSpeed : Math.min(cappedSpeed, polar.maxSpeedKn);
  if (stageMode === "upwind" && boat.upwindRecoveryMode) {
    const recoveryCap = Number.isFinite(stageMaxSpeed) ? Math.min(stageMaxSpeed, 3.65) : 3.65;
    return clamp(Math.max(polarLimitedSpeed, MARK_APPROACH_MIN_SPEED_KN), 1.8, recoveryCap);
  }
  if (stageMode === "upwind" && boat.markApproachMode) {
    const approachDistanceM = Number(boat.tacticalDecision?.distanceToTargetM ?? Infinity);
    if (approachDistanceM < 420) {
      const approachCap = Number.isFinite(stageMaxSpeed) ? Math.min(stageMaxSpeed, 3.45) : 3.45;
      return Math.min(polarLimitedSpeed, approachCap);
    }
  }
  return polarLimitedSpeed;
}

function tickBotBoatMovement(boat, dt, now) {
  if (boat.race && boat.race.finishCrossed) return;
  const stage = getCourseStage(boat.courseIndex ?? 0);
  const target = getCourseTarget(boat.courseIndex ?? 0, boat);
  if (!stage || !target) {
    boat.currentSpeedKn = 0;
    boat.currentVmgKn = 0;
    return;
  }

  const profile = getBoatProfile(boat);
  const wind = windEngineAt(boat, now);
  requestQwenDecision(boat, stage, target, wind);
  const desiredHeading = liveBotHeading(boat, stage, target, wind);
  const targetSpeedKn = calculateTargetSpeedKn(boat, stage.mode, desiredHeading, wind, dt);
  boat.currentSpeedKn = Number.isFinite(Number(boat.currentSpeedKn))
    ? boat.currentSpeedKn + (targetSpeedKn - boat.currentSpeedKn) * clamp(dt * SIM_SPEEDUP * profile.response, 0, 0.75)
    : targetSpeedKn;
  const routeTurnRate = stage.mode === "upwind"
    ? profile.turnRate
    : Math.max(Number(profile.turnRate ?? 0), 42);
  boat.heading = moveHeadingToward(Number.isFinite(Number(boat.heading)) ? boat.heading : desiredHeading, desiredHeading, routeTurnRate * dt * SIM_SPEEDUP);
  const previousPoint = { lat: boat.lat, lon: boat.lon };
  const distanceBefore = haversineMeters(boat, target);
  const stepMeters = boat.currentSpeedKn * KNOT_TO_MPS * dt * SIM_SPEEDUP;
  const captureMarkDirectly = stage.mode === "upwind" && distanceBefore < UPWIND_MARK_CAPTURE_RADIUS_M;
  if (captureMarkDirectly) {
    boat.heading = bearingDegrees(boat, target);
    moveTowardPoint(boat, target, stepMeters);
  } else {
    moveBoatByHeading(boat, boat.heading, stepMeters);
  }
  enforceBoatInsideArea(boat, previousPoint);
  let currentPoint = { lat: boat.lat, lon: boat.lon };
  let distanceAfter = haversineMeters(boat, target);
  let reached = movementReachedCourseStage(previousPoint, currentPoint, stage, target);
  if (!reached && routeGuardShouldRecover(stage, distanceBefore, distanceAfter, stepMeters)) {
    recoverBoatTowardRoute(boat, previousPoint, target, stepMeters);
    currentPoint = { lat: boat.lat, lon: boat.lon };
    distanceAfter = haversineMeters(boat, target);
    reached = movementReachedCourseStage(previousPoint, currentPoint, stage, target);
  }
  boat.currentVmgKn = Math.max(0, (distanceBefore - distanceAfter) / (dt * SIM_SPEEDUP) / KNOT_TO_MPS);
  updateBoatTelemetry(boat, { dt, wind, heading: boat.heading, distanceBefore, distanceAfter });
  updateSideMemory(boat, dt);
  if (reached) {
    const nextStagePreview = getCourseStage((boat.courseIndex ?? 0) + 1);
    const nextTargetPreview = nextStagePreview ? getCourseTarget((boat.courseIndex ?? 0) + 1, boat) : null;
    applyMarkRounding(boat, stage, target, nextTargetPreview);
    boat.courseIndex = Math.min((boat.courseIndex ?? 0) + 1, COURSE_SEQUENCE.length);
    boat.targetIndex = boat.courseIndex;
    boat.race = boat.race ?? {};
    boat.race.stageStartedAtSimMs = state.simulatedClockMs;
    refreshBoatEngineProfile(boat); // Refresh metrics for the new leg.
    boat.approachCommitSideSign = null;
    boat.markApproachSideSign = null;
    boat.liveSideSign = null;
    boat.qwenDecision = null;
    boat.tacticalDecision = null;
    boat.markApproachMode = false;
    boat.markDirectRoundingMode = false;
    boat.upwindRecoveryMode = false;
    boat.upwindRecoveryLock = null;
    clearFinalBoardLock(boat);
    const nextStage = getCourseStage(boat.courseIndex);
    const nextTarget = getCourseTarget(boat.courseIndex, boat);
    if (nextStage && nextTarget) {
      boat.gardaAttackSideSign = chooseInitialGardaAttackSide(boat, state.boats.findIndex((item) => item.id === boat.id) + boat.courseIndex);
      boat.liveSideSign = boat.gardaAttackSideSign || chooseTacticalSideSign(boat, nextStage, boat, nextTarget);
      resetStageSideMemory(boat, boat.courseIndex);
      boat.heading = liveBotHeading(boat, nextStage, nextTarget, windEngineAt(boat, now));
    } else {
      boat.race = boat.race ?? {};
      boat.race.finishCrossed = true;
      boat.race.finishedAtSimMs = state.simulatedClockMs;
      boat.race.elapsedSimMs = Math.max(0, boat.race.finishedAtSimMs - (boat.race.startedAtSimMs ?? 0));
      boat.isMoving = false;
      boat.currentSpeedKn = 0;
      boat.currentVmgKn = 0;
      state.courseLines.finishPassedBoatIds.add(boat.id);
    }
  }
}

function tickUserBoatMovement(boat, dt, now) {
  const stage = getCourseStage(boat.courseIndex ?? 0);
  const target = getCourseTarget(boat.courseIndex ?? 0, boat);
  if (!stage || !target) {
    boat.currentSpeedKn = 0;
    boat.currentVmgKn = 0;
    return;
  }

  const wind = windEngineAt(boat, now);
  const profile = getBoatProfile(boat);
  let heading = Number.isFinite(Number(boat.heading)) ? boat.heading : initialHeadingForBoat(boat);
  if (stage.mode === "upwind") {
    heading = constrainedHeadingForStage(boat, heading, wind, stage.mode);
    boat.heading = heading;
  }
  const targetSpeedKn = calculateTargetSpeedKn(boat, stage.mode, heading, wind, dt);
  boat.currentSpeedKn = Number.isFinite(Number(boat.currentSpeedKn))
    ? boat.currentSpeedKn + (targetSpeedKn - boat.currentSpeedKn) * clamp(dt * SIM_SPEEDUP * profile.response, 0, 0.7)
    : targetSpeedKn;
  const previousPoint = { lat: boat.lat, lon: boat.lon };
  const distanceBefore = haversineMeters(boat, target);
  const stepMeters = boat.currentSpeedKn * KNOT_TO_MPS * dt * SIM_SPEEDUP;
  moveBoatByHeading(boat, heading, stepMeters);
  enforceBoatInsideArea(boat, previousPoint);
  const currentPoint = { lat: boat.lat, lon: boat.lon };
  const distanceAfter = haversineMeters(boat, target);
  boat.currentVmgKn = Math.max(0, (distanceBefore - distanceAfter) / (dt * SIM_SPEEDUP) / KNOT_TO_MPS);
  updateBoatTelemetry(boat, { dt, wind, heading, distanceBefore, distanceAfter });

  if (movementReachedCourseStage(previousPoint, currentPoint, stage, target)) {
    const nextStagePreview = getCourseStage((boat.courseIndex ?? 0) + 1);
    const nextTargetPreview = nextStagePreview ? getCourseTarget((boat.courseIndex ?? 0) + 1, boat) : null;
    applyMarkRounding(boat, stage, target, nextTargetPreview);
    boat.courseIndex = Math.min((boat.courseIndex ?? 0) + 1, COURSE_SEQUENCE.length);
    boat.targetIndex = boat.courseIndex;
    boat.race = boat.race ?? {};
    boat.race.stageStartedAtSimMs = state.simulatedClockMs;
    refreshBoatEngineProfile(boat); // Refresh for the new leg.
    boat.approachCommitSideSign = null;
    boat.markApproachSideSign = null;
    boat.markApproachMode = false;
    boat.markDirectRoundingMode = false;
    boat.upwindRecoveryMode = false;
    boat.upwindRecoveryLock = null;
    clearFinalBoardLock(boat);
    const nextStage = getCourseStage(boat.courseIndex);
    const nextTarget = getCourseTarget(boat.courseIndex, boat);
    if (nextStage && nextTarget) {
      state.leg = inferLegFromStage(nextStage.mode);
      boat.heading = initialHeadingForBoat(boat);
    } else {
      boat.isMoving = false;
      boat.currentSpeedKn = 0;
      boat.currentVmgKn = 0;
      boat.race = boat.race ?? {};
      boat.race.finishCrossed = true;
      boat.race.finishedAtSimMs = state.simulatedClockMs;
      boat.race.elapsedSimMs = Math.max(0, boat.race.finishedAtSimMs - (boat.race.startedAtSimMs ?? 0));
      state.courseLines.finishPassedBoatIds.add(boat.id);
    }
  }
}

function applyRightOfWayPenalty(boat, distance) {
  if (!boat.rightOfWayPenaltyRemainingS || boat.rightOfWayPenaltyRemainingS <= 0) {
    boat.rightOfWayPenaltyRemainingS = 5.0; // 5 seconds of penalty
    const name = boat.isUserBoat ? "Your Boat" : (boat.name ?? boat.id.replace("BOT_", "Bot "));
    console.log(`[Right of Way Rule 10] Penalty applied to ${name}: Port tack failed to keep clear of Starboard tack (distance: ${distance.toFixed(1)}m). -0.5 kn for 5s.`);
    const telemetry = ensureBoatTelemetry(boat);
    telemetry.note = `Row penalty: port tack failed to keep clear.`;
  }
}

function checkRightOfWayRules(dt) {
  if (state.raceStatus !== "running") return;
  const numBoats = state.boats.length;
  for (let i = 0; i < numBoats; i++) {
    const boatA = state.boats[i];
    if (!boatA || boatA.race?.finishCrossed || boatA.isMoving === false) continue;

    // Decrement penalty time
    if (boatA.rightOfWayPenaltyRemainingS > 0) {
      boatA.rightOfWayPenaltyRemainingS = Math.max(0, boatA.rightOfWayPenaltyRemainingS - dt * SIM_SPEEDUP);
    }

    for (let j = i + 1; j < numBoats; j++) {
      const boatB = state.boats[j];
      if (!boatB || boatB.race?.finishCrossed || boatB.isMoving === false) continue;

      const distance = haversineMeters(boatA, boatB);
      // If the boats are very close (less than 22 meters)
      if (distance < 22) {
        const mureA = boatA.mure; // "mure_a_dritta" or "mure_a_sinistra"
        const mureB = boatB.mure;

        // opposite tacks
        if (mureA !== mureB) {
          // Port tack (mure_a_sinistra) must keep clear of Starboard tack (mure_a_dritta)
          if (mureA === "mure_a_sinistra" && mureB === "mure_a_dritta") {
            applyRightOfWayPenalty(boatA, distance);
          } else if (mureB === "mure_a_sinistra" && mureA === "mure_a_dritta") {
            applyRightOfWayPenalty(boatB, distance);
          }
        }
      }
    }
  }
}

function tickSimulation() {
  const now = performance.now();
  const rawDt = (now - state.lastTickMs) / 1000;
  const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0.01, 0.01, 0.25);
  state.lastTickMs = now;
  const dtSimMs = dt * SIM_SPEEDUP * 1000;
  state.simulatedClockMs += Math.round(dtSimMs);

  // Pre-tick: refresh all profiles before processing
  state.boats.forEach(boat => {
    if (boat && !boat.isUserBoat) {
      refreshBoatEngineProfile(boat);
    }
  });

  checkRightOfWayRules(dt);

  state.boats.forEach((boat) => {
    if (boat.isMoving === false) {
      boat.currentSpeedKn = 0;
      boat.currentVmgKn = 0;
      return;
    }

    if (boat.isUserBoat && !boat.demoAutopilot) {
      tickUserBoatMovement(boat, dt, now);
    } else {
      tickBotBoatMovement(boat, dt, now);
    }
    updateTrackForBoat(boat);

    if (state.courseLines.startVisible && !state.courseLines.startPassedBoatIds.has(boat.id)) {
      const startEndpoints = getCourseLineEndpoints("start");
      const crossing = lineCrossingInfo(boat, startEndpoints);
      if (crossing || state.simulatedClockMs > 3000) {
        state.courseLines.startPassedBoatIds.add(boat.id);
        if (!boat.race?.startCrossed) {
          boat.race = boat.race ?? {};
          boat.race.startCrossed = true;
          boat.race.startedAtSimMs = crossing
            ? Math.max(0, state.simulatedClockMs - (1 - crossing.ratio) * dtSimMs)
            : 0;
        }
      }
    }

    if (state.courseLines.finishVisible && canBoatFinishCourse(boat) && !state.courseLines.finishPassedBoatIds.has(boat.id)) {
      const finishEndpoints = getCourseLineEndpoints("finish");
      const crossing = lineCrossingInfo(boat, finishEndpoints);
      if (crossing) {
        state.courseLines.finishPassedBoatIds.add(boat.id);
        if (!boat.race?.finishCrossed) {
          boat.race = boat.race ?? {};
          boat.race.finishCrossed = true;
          boat.race.finishedAtSimMs = Math.max(0, state.simulatedClockMs - (1 - crossing.ratio) * dtSimMs);
          boat.race.elapsedSimMs = Math.max(0, boat.race.finishedAtSimMs - (boat.race.startedAtSimMs ?? boat.race.finishedAtSimMs));
          boat.isMoving = false;
          boat.currentSpeedKn = 0;
          boat.currentVmgKn = 0;
        }
      }
    }
  });

  const raceParticipants = autonomousRaceBoats();
  if (state.courseLines.startVisible && raceParticipants.every((boat) => hasBoatStartedCourse(boat))) {
    state.courseLines.startVisible = false;
  }
  if (state.courseLines.finishVisible && raceParticipants.every((boat) => hasBoatFinishedCourse(boat))) {
    state.courseLines.finishVisible = false;
    state.raceStatus = "finished";
    clearInterval(state.simulationTimer);
  }
  if (state.raceStatus === "running" && raceParticipants.length && raceParticipants.every(hasBoatFinishedCourse)) {
    state.raceStatus = "finished";
    state.courseLines.finishVisible = false;
    clearInterval(state.simulationTimer);
  }

  const shouldRedrawUi = !state.lastUiRedrawRealMs || now - state.lastUiRedrawRealMs >= RACE_UI_REDRAW_INTERVAL_REAL_MS;
  const shouldRedrawTracks = !state.lastTrackRedrawRealMs || now - state.lastTrackRedrawRealMs >= RACE_TRACK_REDRAW_INTERVAL_REAL_MS;
  if (shouldRedrawUi) {
    syncBoatMarkers();
    redrawCourseLines();
    redrawLaylines();
    redrawWindOverlay();
    refreshBoatList();
    updateStatus();
    state.lastUiRedrawRealMs = now;
  } else {
    updateRaceAuditState();
  }
  if (shouldRedrawTracks) {
    redrawTracks();
    state.lastTrackRedrawRealMs = now;
  }

  // Update the 2D topographic wind-field heatmap, throttled to about 1s.
  if (state.windHeatmapLayer && Math.round(state.simulatedClockMs / 250) % 4 === 0) {
    state.windHeatmapLayer.update(state.simulatedClockMs);
  }
}

function maneuverHeadingForBoat(boat, wind, stage) {
  const target = getNextManualTarget(boat);
  const targetBearing = target ? bearingDegrees(boat, target) : Number(boat.heading ?? 0);
  const currentDelta = stage?.mode === "upwind"
    ? shortestAngleDelta(Number(wind.direction ?? 185), Number(boat.heading ?? targetBearing))
    : shortestAngleDelta(targetBearing, Number(boat.heading ?? targetBearing));
  const currentSide = Math.abs(currentDelta) > 5
    ? Math.sign(currentDelta)
    : Number(boat.manualTackSide ?? resolveRouteSideSign(boat) ?? -1);
  const nextSide = currentSide === 0 ? 1 : -currentSide;
  const windInfluence = shortestAngleDelta(targetBearing, Number(wind.direction ?? targetBearing));
  boat.manualTackSide = nextSide;
  if (stage?.mode === "upwind") {
    return allowedUpwindHeadingForSide(boat, wind, nextSide);
  }
  if (stage?.mode === "run") {
    return normalizeAngle(targetBearing + nextSide * 26 + clamp(windInfluence * 0.12, -8, 8));
  }
  if (stage?.mode === "reach") {
    return normalizeAngle(targetBearing + nextSide * 15 + clamp(windInfluence * 0.1, -6, 6));
  }
  return normalizeAngle(targetBearing + nextSide * 40 + clamp(windInfluence * 0.16, -10, 10));
}

function maneuverSelectedBoat() {
  const boat = getPilotBoat();
  if (!boat) {
    return;
  }
  const stage = getCourseStage(boat.courseIndex ?? 0);
  const wind = windEngineAt(boat, performance.now());
  const newHeading = maneuverHeadingForBoat(boat, wind, stage);
  boat.mure = boat.manualTackSide > 0 ? "mure_a_dritta" : "mure_a_sinistra";
  boat.heading = newHeading;
  boat.controlMode = "manual";
  boat.speedPenalty = clamp((boat.speedPenalty ?? 1) * 0.9, 0.72, 1);
  boat.currentSpeedKn = Math.max((boat.currentSpeedKn ?? boat.speed ?? 0) * 0.92, 0);
  registerManeuverTelemetry(boat, { courseStageIndex: boat.courseIndex, stageMode: stage?.mode }, true);
  state.selectedBoatId = boat.id;
  el.statusChip.textContent = `${boat.name ?? boat.id} completed a ${boatModeLabel(state.leg).toLowerCase()}`;
  redrawMarkers();
  refreshBoatList();
  redrawLaylines();
  saveLocalState();
}

function toggleSelectionMode() {
  state.editMode = false;
  redrawMarkers();
  updateStatus();
  saveLocalState();
}

function toggleTrackVisibility() {
  state.showTrack = !state.showTrack;
  redrawTracks();
  updateStatus();
  saveLocalState();
}

function toggleSelectedBoatMovement() {
  const boat = getPilotBoat();
  if (!boat) {
    return;
  }
  state.selectedBoatId = boat.id;
  boat.isMoving = boat.isMoving === false;
  if (boat.isMoving) {
    refreshBoatEngineProfile(boat);
    boat.currentSpeedKn = Math.max(
      Number(boat.currentSpeedKn ?? boat.speed ?? 0),
      stageSpeedForMode(boat.tacticalProfile, state.leg === "lasco" ? "reach" : state.leg === "poppa" ? "run" : "upwind") *
        (boat.tacticalProfile?.paceScale ?? COURSE_PACE_SCALE)
    );
  } else {
    boat.currentSpeedKn = 0;
    boat.currentVmgKn = 0;
  }
  updateSelectedBoatMarker();
  refreshBoatList();
  updateStatus();
  saveLocalState();
}

function toggleWindOverlay() {
  state.windVisible = !state.windVisible;
  redrawWindOverlay();
  updateStatus();
  saveLocalState();
}


function toggleLabels() {
  state.showLabels = !state.showLabels;
  redrawMarkers();
  drawCommitteePoint(state.committeePoint);
  updateStatus();
  saveLocalState();
}

function toggleVmgCard() {
  state.showVmg = !state.showVmg;
  el.vmgCard.style.display = state.showVmg ? "block" : "none";
  updateStatus();
  saveLocalState();
}

function downloadScene() {
  const payload = {
    areaB: state.areaB,
    buoys: state.buoys,
    boats: state.boats.map(serializeBoatState),
    selectedBoatId: state.selectedBoatId,
    leg: state.leg,
    map: {
      center: state.map.getCenter(),
      zoom: state.map.getZoom(),
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tacticalsail-scene.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function setupMap(areaPolygon, savedMap) {
  state.map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: true,
    preferCanvas: true,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
  });

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  }).addTo(state.map);

  // drawAreaPolygon(areaPolygon); // Hiding the boundary rectangle
  drawCommitteePoint(state.committeePoint);
  redrawMarkers();
  redrawWindOverlay();
  redrawCourseLines();
  redrawLaylines();

  if (savedMap?.center && savedMap?.zoom) {
    state.map.setView([savedMap.center.lat, savedMap.center.lng], savedMap.zoom);
  } else if (savedMap?.centerLat && savedMap?.centerLon && savedMap?.zoom) {
    state.map.setView([savedMap.centerLat, savedMap.centerLon], savedMap.zoom);
  } else if (state.areaB?.map) {
    const center = state.areaB.map;
    state.map.setView([center.centerLat, center.centerLon], center.zoom);
  } else {
    // Default view showing the entire Lake Garda and surrounding mountains
    state.map.setView([45.6500, 10.6500], 9.4);
  }

  state.map.on("moveend zoomend", () => {
    saveLocalState();
  });

  // Initialize the 2D topographic wind-field heatmap layer.
  // It is only visible after the toggle button is clicked.
  state.windHeatmapLayer = new WindHeatmapLayer(state.map, {
    gridStep: 0.0022,  // About 200m between arrows.
    opacity:  0.70,
  });
}

function createDefaultScene(areaB, botProfiles, sceneOverrides = null) {
  const scene = cloneDefaultScene();
  const botDataByCode = new Map(botProfiles.map((item) => [item.bot_code, item]));
  const bots = buildBotRoster(areaB, botDataByCode);
  const mergedBuoys = normalizeBuoyCollection(sceneOverrides?.buoys?.length ? sceneOverrides.buoys : scene.buoys);
  const findUserBoat = (boats = []) => boats.find((boat) => isUserBoatId(boat?.id) || boat?.isUserBoat);
  const mergedUserBoat =
    findUserBoat(sceneOverrides?.boats ?? []) ??
    findUserBoat(scene.boats);
  const mergedBoats = bots.map((boat) => {
    const sceneBoat = sceneOverrides?.boats?.find((item) => item.id === boat.id);
    return sceneBoat ? { ...boat, ...sceneBoat } : boat;
  });
  if (mergedUserBoat) {
    const fallback = resolveFallbackBot(botProfiles);
    const userBoatWithDefaults = applyUserBoatDefaults(
      {
        ...findUserBoat(scene.boats),
        ...mergedUserBoat,
        source_examples: fallback?.source_examples ?? [],
      },
      botProfiles
    );
    mergedBoats.push({
      ...userBoatWithDefaults,
      id: USER_BOAT_ID,
      color: "#ffffff",
      isUserBoat: true,
    });
  }
  const mergedSelection = {
    ...scene.selection,
    ...(sceneOverrides?.selection ?? {}),
  };
  const mergedMap = {
    ...scene.map,
    ...(sceneOverrides?.map ?? {}),
  };
  return {
    buoys: mergedBuoys,
    boats: mergedBoats,
    selection: mergedSelection,
    map: mergedMap,
  };
}

async function init() {
  const windFieldPromise = fetchJson("../data/generated/wind_field.json").catch(async () => {
    try {
      return await fetchJson("../data/wind_field.json");
    } catch {
      return null;
    }
  });
  const replayCalibrationPromise = fetchJson(REPLAY_CALIBRATION_PATH).catch(() => null);
  const athleteStylesPromise = fetchJson(ATHLETE_STYLES_PATH).catch(() => null);
  const generatedTacticalProfilesPromise = fetchJson(GENERATED_TACTICAL_PROFILES_PATH).catch(() => null);
  const windAiModelPromise = fetchJson(WIND_AI_MODEL_PATH).catch(() => null);
  const botAiBrainsPromise = fetchJson(BOT_AI_BRAINS_PATH).catch(() => null);
  const hackathonReportPromise = fetchJson(HACKATHON_READINESS_PATH).catch(() => null);
  const replayValidationPromise = fetchJson(REPLAY_VALIDATION_PATH).catch(() => null);

  const [
    areaB,
    rawBotProfiles,
    tactics,
    areaKml,
    proofKml,
    windField,
    replayCalibration,
    athleteStyles,
    generatedTacticalProfiles,
    windAiModel,
    botAiBrains,
    hackathonReport,
    replayValidation,
  ] = await Promise.all([
    fetchJson("../data/area_b.example.json"),
    Promise.all(BOAT_FILES.map((file) => fetchJson(file))),
    fetchJson("../data/tactics/ora_area_b.example.json"),
    fetchText("../data/maps/area.kml"),
    fetchText("../data/maps/prova.kml"),
    windFieldPromise,
    replayCalibrationPromise,
    athleteStylesPromise,
    generatedTacticalProfilesPromise,
    windAiModelPromise,
    botAiBrainsPromise,
    hackathonReportPromise,
    replayValidationPromise,
  ]);
  const botProfiles = mergeGeneratedBotBrains(
    mergeGeneratedTacticalProfiles(rawBotProfiles, generatedTacticalProfiles),
    botAiBrains
  );
  let sceneOverride = null;
  try {
    sceneOverride = await fetchJson("../data/race_scene.example.json");
  } catch {
    sceneOverride = null;
  }

  state.areaB = areaB;
  state.tactics = tactics;
  state.generatedTacticalProfiles = generatedTacticalProfiles;
  state.windAiModel = windAiModel;
  state.botAiBrains = botAiBrains;
  state.hackathonReport = hackathonReport;
  state.replayValidation = replayValidation;
  state.botProfiles = botProfiles;
  state.qwenAgents = buildQwenAgentContexts(botProfiles);
  state.qwenLiveEnabled = new URLSearchParams(window.location.search).get("qwen") === "1";
  state.qwenEngineStatus = state.qwenLiveEnabled ? "standby" : "brain-local";
  state.windField = windField;
  setReplayCalibration(replayCalibration);
  setAthleteStyleOverrides(athleteStyles);
  const scene = createDefaultScene(areaB, botProfiles, sceneOverride);
  const saved = loadLocalState();

  const merged = saved ?? scene;
  state.buoys = normalizeBuoyCollection(merged.buoys ?? scene.buoys);
  state.boats = (merged.boats ?? scene.boats).map((boat) =>
    attachReplayCalibrationToBoat(refreshBoatEngineProfile(applyUserBoatDefaults(hydrateBoatDataFromProfile(boat, botProfiles), botProfiles)))
  );
  state.selectedBoatId = state.boats.some((boat) => boat.id === USER_BOAT_ID)
    ? USER_BOAT_ID
    : isUserBoatId(merged.selectedBoatId)
      ? USER_BOAT_ID
      : merged.selectedBoatId ?? scene.selection.selectedBoatId;
  state.leg = merged.leg ?? scene.selection.leg;
  state.showVmg = merged.showVmg ?? scene.selection.showVmg;
  state.showLaylines = false;
  state.editMode = false;
  state.showTrack = merged.showTrack ?? true;
  state.showLabels = merged.showLabels ?? false;
  state.manualSpeed = merged.manualSpeed ?? null;
  state.manualVmg = merged.manualVmg ?? null;
  state.raceStatus = "ready";
  state.countdownRemaining = 0;
  resetCourseLines();

  const polygon = parseKmlPolygon(areaKml);
  const committee = parseKmlPoints(proofKml)[0] ?? null;
  state.areaPolygon = polygon;
  state.committeePoint = committee;

  setupMap(polygon, merged.map);
  installDebugApi();
  if (el.speedupSelect) {
    SIM_SPEEDUP = Number(el.speedupSelect.value);
  }
  el.vmgCard.style.display = state.showVmg ? "block" : "none";
  refreshPresetOptions();
  refreshBoatList();
  updateStatus();
  updateSelectedBoatInputs();
  redrawMarkers();
  redrawWindOverlay();
  redrawCourseLines();
  redrawLaylines();

  el.statusChip.textContent = `${areaB.name} ready · locked marks`;
  saveLocalState();
}

function bindUi() {
  el.startRaceBtn.addEventListener("click", startRaceCountdown);
  el.dataPresetSelect.addEventListener("change", () => applyPresetToUserBoat(el.dataPresetSelect.value));
  el.boatNameInput.addEventListener("input", applyBoatInputs);
  el.speedInput.addEventListener("input", applyBoatInputs);
  el.vmgInput.addEventListener("input", applyBoatInputs);
  el.legSelect.addEventListener("change", () => {
    state.leg = el.legSelect.value;
    updateStatus();
    redrawLaylines();
    saveLocalState();
  });
  if (el.speedupSelect) {
    el.speedupSelect.addEventListener("change", () => {
      SIM_SPEEDUP = Number(el.speedupSelect.value);
      saveLocalState();
    });
  }

  el.vmgBtn.addEventListener("click", toggleVmgCard);
  el.moveToggleBtn.addEventListener("click", toggleSelectedBoatMovement);
  el.windBtn.addEventListener("click", toggleWindOverlay);
  el.maneuverBtn.addEventListener("click", maneuverSelectedBoat);
  el.saveBtn.addEventListener("click", saveLocalState);
  el.exportBtn.addEventListener("click", downloadScene);
  el.judgeDemoBtn.addEventListener("click", runJudgeDemo);
  el.editModeBtn.addEventListener("click", toggleSelectionMode);
  el.toggleTrackBtn.addEventListener("click", toggleTrackVisibility);
  el.toggleLabelsBtn.addEventListener("click", toggleLabels);

  // Toggle the 2D topographic wind-field heatmap.
  const windHeatmapBtn = document.getElementById("windHeatmapBtn");
  if (windHeatmapBtn) {
    windHeatmapBtn.addEventListener("click", () => {
      if (!state.windHeatmapLayer) return;
      const visible = state.windHeatmapLayer.toggle();
      windHeatmapBtn.textContent = visible ? "Wind OFF" : "Wind 2D";
      windHeatmapBtn.classList.toggle("active", visible);
      // Show/hide the pressure color legend.
      const legendWindRow = document.getElementById("legendWindRow");
      if (legendWindRow) legendWindRow.style.display = visible ? "flex" : "none";
    });
  }
  el.zoomInBtn.addEventListener("click", () => state.map.zoomIn());
  el.zoomOutBtn.addEventListener("click", () => state.map.zoomOut());
  el.resetBtn.addEventListener("click", () => {
    clearInterval(state.countdownTimer);
    clearInterval(state.simulationTimer);
    resetCourseLines();
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });
  el.importKmlBtn.addEventListener("click", () => el.kmlInput.click());
  el.kmlInput.addEventListener("change", async () => {
    const file = el.kmlInput.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) {
      const payload = JSON.parse(text);
    if (payload.buoys) {
        state.buoys = normalizeBuoyCollection(payload.buoys);
      }
      if (payload.boats) {
        state.boats = payload.boats;
      }
      if (payload.selectedBoatId) {
        state.selectedBoatId = payload.selectedBoatId;
      }
    } else {
      const importedPoints = parseKmlPoints(text);
      if (importedPoints.length > 0) {
        state.buoys = normalizeBuoyCollection(
          importedPoints.map((point, index) => ({
            id: point.id || `BOA_${index + 1}`,
            lat: point.lat,
            lon: point.lon,
            kind: "imported",
          }))
        );
      }
    }
    redrawMarkers();
    refreshBoatList();
    redrawLaylines();
    updateStatus();
    saveLocalState();
  });

  window.addEventListener("keydown", handleKeyboardShortcuts);
}

bindUi();
init().catch((error) => {
  console.error(error);
  el.statusChip.textContent = "Error: " + error.message;
  // Also display it prominently in red on the map container
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.innerHTML = `<div style="color:#ff6b6b; padding:20px; font-family:sans-serif;"><h3>Scene loading error</h3><pre>${error.stack || error}</pre></div>`;
  }
});

const tacticalSailDebugApi = {
  state,
  getState: () => state,
  beginRaceSimulation,
  tickSimulation,
  buildRouteForBoat,
  getPilotBoat,
  steerPilotBoat,
  maneuverSelectedBoat,
  windEngineAt,
  boatProgressScore,
  refreshBoatEngineProfile,
  sampleWindFieldModel,
  classifyWindLane,
  auditRouteQuality,
  buildTelemetryNote,
  ensureBoatTelemetry,
  describeBoat(boatId) {
    return state.boats.find((boat) => boat.id === boatId) ?? null;
  },
  describeWind(point, elapsedMs = performance.now()) {
    return windEngineAt(point, elapsedMs);
  },
  describeAgents() {
    return state.qwenAgents;
  },
};

globalThis.tacticalSailDebug = tacticalSailDebugApi;
if (typeof window !== "undefined") {
  window.tacticalSailDebug = tacticalSailDebugApi;
}

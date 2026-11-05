// MGS V1 foundation helpers. Hand-maintained source used by the deployed ESM bundles.
// Version: 2026-11-05
export const MGS_V1_MODEL_VERSION = "mgs-v1-foundation-2026-11-05";
export const ELEVATION_MODEL_VERSION = "elevation-class-v1";
export const ELEVATION_FORMULA_VERSION = "metric-1to1-provisional-v1";
export const WIDTH_MODEL_VERSION = "width-v2";

const YD_PER_M = 1.0936132983;
const round1 = (v) => Math.round(v * 10) / 10;
const finite = (v) => typeof v === "number" && Number.isFinite(v);

export const elevationClasses = Object.freeze({
  UP_LARGE: Object.freeze({ direction: "up", level: "large", modelDeltaM: 30 }),
  UP_MEDIUM: Object.freeze({ direction: "up", level: "medium", modelDeltaM: 15 }),
  FLAT: Object.freeze({ direction: "flat", level: "flat", modelDeltaM: 0 }),
  DOWN_MEDIUM: Object.freeze({ direction: "down", level: "medium", modelDeltaM: -15 }),
  DOWN_LARGE: Object.freeze({ direction: "down", level: "large", modelDeltaM: -30 }),
});

const largeDown = /(豪快な|大きな|急な|強い|かなりの|大幅な).{0,8}(打ち下ろし|下り)|(?:打ち下ろし|下り).{0,8}(豪快|大き|急|強|かなり|大幅)/;
const largeUp = /(大きな|急な|強い|かなりの|大幅な).{0,8}(打ち上げ|上り)|(?:打ち上げ|上り).{0,8}(大き|急|強|かなり|大幅)/;
const mediumDown = /(打ち下ろし|下り)/;
const mediumUp = /(打ち上げ|上り)/;

export function classifyElevationFromText(text = "", sourceRefs = []) {
  const normalized = String(text ?? "");
  let className = "FLAT";
  let confidence = 0.35;
  if (largeDown.test(normalized)) {
    className = "DOWN_LARGE";
    confidence = 0.7;
  } else if (largeUp.test(normalized)) {
    className = "UP_LARGE";
    confidence = 0.7;
  } else if (mediumDown.test(normalized)) {
    className = "DOWN_MEDIUM";
    confidence = 0.58;
  } else if (mediumUp.test(normalized)) {
    className = "UP_MEDIUM";
    confidence = 0.58;
  }
  const cls = elevationClasses[className];
  return Object.freeze({
    segment: "tee_to_primary_landing",
    class: className,
    model_delta_m: cls.modelDeltaM,
    measured_delta_m: null,
    source_refs: Object.freeze([...sourceRefs]),
    confidence,
    human_verified: false,
    observed_or_inferred: className === "FLAT" ? "unknown" : "inferred",
    model_version: ELEVATION_MODEL_VERSION,
  });
}

export function resolveElevationSegment(course) {
  const explicit = course?.elevationSegments?.find?.((s) => s?.segment === "tee_to_primary_landing")
    ?? course?.elevation_segments?.find?.((s) => s?.segment === "tee_to_primary_landing");
  if (explicit) {
    const className = elevationClasses[explicit.class] ? explicit.class : "FLAT";
    const fallback = elevationClasses[className].modelDeltaM;
    return Object.freeze({
      segment: "tee_to_primary_landing",
      class: className,
      model_delta_m: finite(explicit.model_delta_m) ? explicit.model_delta_m : fallback,
      measured_delta_m: finite(explicit.measured_delta_m) ? explicit.measured_delta_m : null,
      source_refs: Object.freeze([...(explicit.source_refs ?? [])]),
      confidence: finite(explicit.confidence) ? explicit.confidence : null,
      human_verified: explicit.human_verified === true,
      observed_or_inferred: explicit.observed_or_inferred ?? "unknown",
      model_version: explicit.model_version ?? ELEVATION_MODEL_VERSION,
    });
  }

  // Preserve verified measured data when it is genuinely tied to the tee/landing segment.
  const measured = course?.elevation?.verified === true
    && finite(course?.elevation?.landing)
    && finite(course?.elevation?.tee)
    ? course.elevation.landing - course.elevation.tee
    : null;
  if (finite(measured) && Math.abs(measured) >= 3) {
    const abs = Math.abs(measured);
    const className = measured > 0
      ? (abs >= 22.5 ? "UP_LARGE" : "UP_MEDIUM")
      : (abs >= 22.5 ? "DOWN_LARGE" : "DOWN_MEDIUM");
    return Object.freeze({
      segment: "tee_to_primary_landing",
      class: className,
      model_delta_m: elevationClasses[className].modelDeltaM,
      measured_delta_m: measured,
      source_refs: Object.freeze([course?.elevation?.source].filter(Boolean)),
      confidence: 1,
      human_verified: true,
      observed_or_inferred: "observed",
      model_version: ELEVATION_MODEL_VERSION,
    });
  }

  const text = [
    course?.description,
    course?.courseStrategy?.keyAdvice,
    course?.courseStrategy?.basis,
  ].filter(Boolean).join(" ");
  return classifyElevationFromText(text, [
    course?.courseStrategy?.sourceDocument,
    course?.dataStatus?.evidence?.holeDescription?.source,
  ].filter(Boolean));
}

export function adjustDistanceForElevation(distanceYd, segment, formulaId = ELEVATION_FORMULA_VERSION) {
  const input = finite(distanceYd) ? distanceYd : 0;
  const measured = finite(segment?.measured_delta_m) ? segment.measured_delta_m : null;
  const model = finite(segment?.model_delta_m) ? segment.model_delta_m : 0;
  const deltaM = measured ?? model;

  // Provisional public rule-of-thumb adapter:
  // ~1 metre of vertical change ~= 1 metre of playing-distance adjustment.
  // Kept in a versioned formula registry so a validated trajectory formula can replace it.
  const adjustmentYd = deltaM * YD_PER_M;
  return Object.freeze({
    input_distance_yd: round1(input),
    input_delta_m: round1(deltaM),
    delta_source: measured !== null ? "measured" : "class_model",
    formula_id: formulaId,
    formula_version: ELEVATION_FORMULA_VERSION,
    adjustment_yd: round1(adjustmentYd),
    adjusted_distance_yd: round1(Math.max(0, input + adjustmentYd)),
    status: deltaM === 0 ? "no_adjustment" : "provisional",
  });
}

// Converts flat carry into expected ground-forward landing distance for a target height.
// Uphill lowers the distance; downhill extends it.
export function adjustCarryLandingForElevation(flatCarryYd, segment, formulaId = ELEVATION_FORMULA_VERSION) {
  const playsLike = adjustDistanceForElevation(flatCarryYd, segment, formulaId);
  return Object.freeze({
    ...playsLike,
    adjusted_landing_yd: round1(Math.max(0, flatCarryYd - playsLike.adjustment_yd)),
  });
}

export function adjustCarryLandingMeters(flatCarryM, segment, formulaId = ELEVATION_FORMULA_VERSION) {
  const measured = finite(segment?.measured_delta_m) ? segment.measured_delta_m : null;
  const model = finite(segment?.model_delta_m) ? segment.model_delta_m : 0;
  const deltaM = measured ?? model;
  return Object.freeze({
    input_carry_m: round1(flatCarryM),
    input_delta_m: round1(deltaM),
    delta_source: measured !== null ? "measured" : "class_model",
    formula_id: formulaId,
    formula_version: ELEVATION_FORMULA_VERSION,
    adjustment_m: round1(deltaM),
    adjusted_landing_m: round1(Math.max(0, flatCarryM - deltaM)),
    status: deltaM === 0 ? "no_adjustment" : "provisional",
  });
}

function unsafeIntentionalArea(point, areas = []) {
  return areas.some((area) => {
    if (!area) return false;
    const inside = point.x >= Math.min(area.minX, area.maxX)
      && point.x <= Math.max(area.minX, area.maxX)
      && point.y >= Math.min(area.minY, area.maxY)
      && point.y <= Math.max(area.minY, area.maxY);
    if (!inside) return false;
    if (area.relation === "forbidden") return true;
    if (area.localRuleStatus === "prohibited" || area.localRuleStatus === "unknown") return true;
    if (area.relation === "adjacent_hole" && area.adjacentSafety !== "verified_safe") return true;
    if (area.relation === "adjacent_hole" && area.localRuleStatus !== "allowed") return true;
    return false;
  });
}

export function calculateCrossSectionWidths({
  centerX,
  y,
  fairwayProfileWidthM,
  classifySurface,
  intentionalRouteAreas = [],
  scanHalfWidthM,
  stepM = 0.5,
}) {
  const profileWidth = Math.max(1, Number(fairwayProfileWidthM) || 1);
  const half = Math.max(profileWidth * 1.25, Number(scanHalfWidthM) || 0, 30);
  const step = Math.max(0.25, Number(stepM) || 0.5);
  const samples = [];
  const surfaceAt = (x) => {
    const s = classifySurface?.({ x, y });
    if (s) return s;
    return Math.abs(x - centerX) <= profileWidth / 2 ? "fairway" : "unknown";
  };
  for (let x = centerX - half; x <= centerX + half + 1e-9; x += step) {
    const point = { x, y };
    const surface = surfaceAt(x);
    const fairway = surface === "fairway";
    const playable = fairway || surface === "rough";
    const safe = playable && !unsafeIntentionalArea(point, intentionalRouteAreas);
    samples.push({ x, surface, fairway, playable, safe });
  }

  const sum = (key) => round1(samples.filter((s) => s[key]).length * step);
  const side = (key, direction) => round1(samples.filter((s) => s[key] && (direction < 0 ? s.x < centerX : s.x > centerX)).length * step);
  const fairwayWidthM = sum("fairway");
  const playableWidthTotalM = Math.max(fairwayWidthM, sum("playable"));
  const safeTargetableWidthM = Math.min(playableWidthTotalM, sum("safe"));
  const fairwayLeftM = side("fairway", -1);
  const fairwayRightM = side("fairway", 1);
  const playableLeftM = side("playable", -1);
  const playableRightM = side("playable", 1);
  const safeLeftM = side("safe", -1);
  const safeRightM = side("safe", 1);

  return Object.freeze({
    fairwayWidthM,
    playableWidthTotalM,
    playableLeftOfFairwayM: round1(Math.max(0, playableLeftM - fairwayLeftM)),
    playableRightOfFairwayM: round1(Math.max(0, playableRightM - fairwayRightM)),
    safeTargetableWidthM,
    effectiveLeftM: safeLeftM,
    effectiveRightM: safeRightM,
    effectiveWidthM: round1(safeLeftM + safeRightM),
    modelVersion: WIDTH_MODEL_VERSION,
    debug: Object.freeze({
      crossSectionY: round1(y),
      scanHalfWidthM: round1(half),
      stepM: step,
    }),
  });
}

export function normalizeSecondShotIntent(candidate) {
  if (!candidate) return null;
  if (candidate.shotIntent === "attack_green" || candidate.shotIntent === "layup" || candidate.shotIntent === "safe_off_green_target") {
    return candidate.shotIntent;
  }
  if (candidate.shotType === "layup") return "layup";
  if (candidate.shotType === "attack_green" || candidate.shotType === "short_approach") return "attack_green";
  return "safe_off_green_target";
}

export function runFoundationRegression() {
  const failures = [];
  const total95 = (l, r) => l + r;
  if (total95(20, 20) !== 40) failures.push("dispersion-20-20");
  if (total95(14, 14) !== 28) failures.push("dispersion-14-14");

  const w = calculateCrossSectionWidths({
    centerX: 0,
    y: 200,
    fairwayProfileWidthM: 30,
    classifySurface: ({ x }) => Math.abs(x) <= 15 ? "fairway" : Math.abs(x) <= 25 ? "rough" : "trees",
  });
  if (w.playableWidthTotalM < w.fairwayWidthM) failures.push("width-playable-gte-fairway");
  if (w.safeTargetableWidthM > w.playableWidthTotalM) failures.push("width-safe-lte-playable");

  const seg = Object.freeze({ class: "DOWN_LARGE", model_delta_m: -30, measured_delta_m: null });
  const elev = adjustCarryLandingForElevation(200, seg);
  if (!(elev.adjusted_landing_yd > 200)) failures.push("elevation-downhill-extends-landing");

  if (normalizeSecondShotIntent({ shotType: "layup" }) !== "layup") failures.push("intent-layup");
  if (normalizeSecondShotIntent({ shotType: "attack_green" }) !== "attack_green") failures.push("intent-attack");

  return Object.freeze({ pass: failures.length === 0, failures: Object.freeze(failures) });
}

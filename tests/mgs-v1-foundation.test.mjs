import fs from "node:fs/promises";
import assert from "node:assert/strict";

const coreText = await fs.readFile(new URL("../assets/mgs-v1-core.js", import.meta.url), "utf8");
const core = await import("data:text/javascript;base64," + Buffer.from(coreText).toString("base64"));

const regression = core.runFoundationRegression();
assert.equal(regression.pass, true, regression.failures.join(", "));

const width = core.calculateCrossSectionWidths({
  centerX: 0,
  y: 200,
  fairwayProfileWidthM: 30,
  classifySurface: ({x}) => Math.abs(x) <= 15 ? "fairway" : Math.abs(x) <= 25 ? "rough" : "trees",
});
assert.ok(width.playableWidthTotalM >= width.fairwayWidthM);
assert.ok(width.safeTargetableWidthM <= width.playableWidthTotalM);
assert.ok(width.playableLeftOfFairwayM > 0);
assert.ok(width.playableRightOfFairwayM > 0);

const down = core.adjustCarryLandingForElevation(200, {
  class: "DOWN_LARGE",
  model_delta_m: -30,
  measured_delta_m: null,
});
assert.equal(down.input_delta_m, -30);
assert.ok(down.adjusted_landing_yd > 200);
assert.equal(down.formula_version, "slope-0.55m-per-m-v1");

const measured = core.adjustDistanceForElevation(150, {
  class: "UP_LARGE",
  model_delta_m: 30,
  measured_delta_m: 12,
});
assert.equal(measured.input_delta_m, 12);
assert.equal(measured.delta_source, "measured");

assert.equal(core.normalizeSecondShotIntent({shotType:"attack_green"}), "attack_green");
assert.equal(core.normalizeSecondShotIntent({shotType:"layup"}), "layup");
assert.equal(core.normalizeSecondShotIntent({shotType:"other"}), "safe_off_green_target");

console.log("MGS V1 foundation regressions PASS");

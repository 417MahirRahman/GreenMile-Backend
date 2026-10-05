import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadModule, memoryDatabase, response, dispatch, plain } from "./helpers/runtime.js";
import { routeScenarios, routeBody, batteryTimeline } from "./helpers/scenarios.js";

// Captured from the original implementation before refactoring.
const file = new URL("./fixtures/baseline.json", import.meta.url);
const expected = JSON.parse(await readFile(file, "utf8"));
const actual = { routes: [], battery: null };
test("extracted route calculation text matches the original, normalizing line endings", async () => {
  const hashes = JSON.parse(await readFile(new URL("./fixtures/formula-hashes.json", import.meta.url), "utf8"));
  const source = (await readFile("src/services/routeOptimizationService.js", "utf8")).replaceAll("\r\n", "\n");
  const start = source.indexOf("    const routeCalculations =");
  const end = source.indexOf("    return {\n      success: true", start);
  assert.equal(createHash("sha256").update(source.slice(start, end)).digest("hex"), hashes.route_calculations);
});
test("frozen route response contracts, energy bands, scores, tiers and tie behavior", async () => {
  for (const scenario of routeScenarios) {
    const prisma = { user: { findUnique: async () => ({ id: "owner", role: "USER" }) }, vehicle: { findUnique: async () => ({ userId: "owner", batteryId: routeBody.batteryId, batteryCapacityKWh: 15 }) }, batteryState: { findUnique: async () => ({ estimatedSoc: scenario.soc }) }, aIPrediction: { findFirst: async () => scenario.soh === null ? null : ({ soh: scenario.soh }) } };
    const { default: router } = await loadModule("src/routes/routeRoutes.js", { prisma, firebaseAuth: { verifyIdToken: async () => ({ uid: "firebase-owner" }) }, env: { GOOGLE_ROUTES_API_KEY: "fixture-key" }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ routes: scenario.routes }) }) });
    const result = await dispatch(router, "post", "/", { headers: { authorization: "Bearer fixture-token" }, body: { ...routeBody } });
    assert.equal(result.statusCode, 200);
    actual.routes.push({ name: scenario.name, response: result.body });
  }
  assert.deepEqual(actual.routes.slice(0, 3).map((entry) => entry.response.data.recommendationLevel), ["BATTERY_SAFE", "LOW_RESERVE", "NO_FEASIBLE_ROUTE"]);
  assert.deepEqual(actual.routes, expected.routes);
});
test("battery initialization, discharge, charge, idle, long gaps and completed cycle features", async () => {
  const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
  const start = clock.now;
  const { prisma, store } = memoryDatabase(clock);
  store.vehicles.push({ batteryId: "fixture-battery" });
  const { createBatteryReading } = await loadModule("src/controllers/batteryController.js", { prisma, clock, ai: { predictSoH: async () => { throw new Error("Not enough fixture cycles for prediction"); } } });
  const results = [];
  for (const reading of batteryTimeline) {
    clock.now = start + reading.seconds * 1000;
    const res = response();
    await createBatteryReading({ body: { batteryId: "fixture-battery", ...reading } }, res);
    assert.equal(res.statusCode, 201);
    results.push(res.body);
  }
  actual.battery = plain({ results, state: store.states, features: store.features });
  assert.equal(store.features.length, 2);
  assert.equal(store.features[0].dischargeDurationS, 60);
  assert.equal(results[6].data.energyWh, 0);
  assert.deepEqual(actual.battery, expected.battery);
});

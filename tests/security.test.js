import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, memoryDatabase, dispatch } from "./helpers/runtime.js";
import { googleRoutes, routeBody } from "./helpers/scenarios.js";

function fixture({ role = "USER", env = {} } = {}) {
  const clock = { now: Date.parse("2026-01-01T00:00:00Z") };
  const { prisma, store } = memoryDatabase(clock);
  store.users.push({ id: "owner", firebaseUid: "uid-A", role }, { id: "other", firebaseUid: "uid-B", role: "USER" });
  store.vehicles.push({ id: "vehicle-A", userId: "owner", batteryId: "battery-A", batteryCapacityKWh: 15 }, { id: "vehicle-A2", userId: "owner", batteryId: "battery-A2", batteryCapacityKWh: 0.5 }, { id: "vehicle-B", userId: "other", batteryId: "battery-B", batteryCapacityKWh: 20 });
  for (const batteryId of ["battery-A", "battery-A2", "battery-B"]) {
    store.states.push({ batteryId, estimatedSoc: 21, ratedCapacityMah: 2000, totalDischargedCapacityMah: 30 });
    store.readings.push({ batteryId, voltage: 4, current: -2, temperature: 30, energyWh: 1, soc: 21, cycleCount: 0.015, timestamp: new Date(clock.now) });
    store.predictions.push({ batteryId, soh: 0.95, predictionTime: new Date(clock.now) });
  }
  let calls = 0;
  const options = { prisma, clock, env: { GOOGLE_ROUTES_API_KEY: "fixture-key", ...env }, firebaseAuth: { verifyIdToken: async (token) => { if (!['A', 'B'].includes(token)) throw new Error("Invalid token"); return { uid: `uid-${token}` }; } }, fetch: async () => { calls++; return { ok: true, status: 200, json: async () => ({ routes: googleRoutes }) }; } };
  const request = (source, batteryId = "battery-A", token = "A", extra = {}) => ({ headers: token ? { authorization: `Bearer ${token}` } : {}, [source]: { ...(source === "body" ? routeBody : {}), batteryId, ...extra } });
  return { store, options, request, calls: () => calls };
}

const protectedEndpoints = [
  ["batteryRoutes.js", "get", "/latest", "query"],
  ["batteryRoutes.js", "get", "/energy-total", "query"],
  ["batteryRoutes.js", "get", "/cycle-features", "query"],
  ["batteryRoutes.js", "post", "/cycle-features/aggregate", "body"],
  ["aiRoutes.js", "get", "/soh/latest", "query"],
  ["aiRoutes.js", "post", "/soh/auto", "body"],
  ["aiRoutes.js", "post", "/soh", "body"],
  ["routeRoutes.js", "post", "/", "body"],
];
for (const [file, method, path, source] of protectedEndpoints) {
  test(`${file} ${path}: rejects unauthenticated, invalid tokens and another owner's battery`, async () => {
    const f = fixture();
    const { default: router } = await loadModule(`src/routes/${file}`, f.options);
    assert.equal((await dispatch(router, method, path, f.request(source, "battery-A", null))).statusCode, 401);
    assert.equal((await dispatch(router, method, path, f.request(source, "battery-A", "invalid"))).statusCode, 401);
    assert.equal((await dispatch(router, method, path, f.request(source, "battery-B"))).statusCode, 404);
    assert.equal((await dispatch(router, method, path, f.request(source, "missing"))).statusCode, 404);
    assert.equal(f.calls(), 0);
  });
}
test("owned battery latest, energy, cycle features, AI latest and auto readiness remain usable", async () => {
  const f = fixture();
  for (const [file, method, path, source] of protectedEndpoints.filter((entry) => entry[1] === "get" || entry[2] === "/soh/auto")) {
    const { default: router } = await loadModule(`src/routes/${file}`, f.options);
    const res = await dispatch(router, method, path, f.request(source));
    assert.equal(res.statusCode, 200);
    if (path === "/energy-total") assert.equal(res.body.data.totalEnergyWh, 1);
    if (path === "/soh/auto") assert.equal(res.body.readyForPrediction, false);
  }
});
test("routing uses the owned vehicle capacity, ignoring body capacity and userId", async () => {
  const f = fixture();
  const { default: router } = await loadModule("src/routes/routeRoutes.js", f.options);
  const large = await dispatch(router, "post", "/", f.request("body", "battery-A", "A", { batteryCapacityKWh: 999, userId: "other" }));
  const small = await dispatch(router, "post", "/", f.request("body", "battery-A2"));
  assert.equal(large.body.data.battery.routingBatteryCapacityKWh, 15);
  assert.equal(small.body.data.battery.routingBatteryCapacityKWh, 0.5);
  assert.equal(large.body.data.recommendationLevel, "LOW_RESERVE");
  assert.equal(small.body.data.recommendationLevel, "NO_FEASIBLE_ROUTE");
  assert.deepEqual(large.body.data.routes.map((r) => r.estimatedEnergyWh), small.body.data.routes.map((r) => r.estimatedEnergyWh));
  assert.ok(small.body.data.routes[0].projectedSocDrop > large.body.data.routes[0].projectedSocDrop);
});
test("research overrides require both ADMIN and explicit validation enablement", async () => {
  for (const [role, flag, expected] of [["USER", "true", 403], ["ADMIN", "false", 403], ["ADMIN", "true", 200]]) {
    const f = fixture({ role, env: { GREENMILE_VALIDATION_ENABLED: flag } });
    const { default: router } = await loadModule("src/routes/routeRoutes.js", f.options);
    const res = await dispatch(router, "post", "/", f.request("body", "battery-A", "A", { testBattery: { soc: 90, soh: 0.8 }, testWeights: { time: 0.2, energy: 0.2, battery: 0.6 } }));
    assert.equal(res.statusCode, expected);
    if (expected === 200) { assert.equal(res.body.data.validationMode, true); assert.equal(res.body.data.battery.soc, 90); assert.equal(res.body.data.scoring.batteryWeight, 0.6); }
  }
});
test("raw device ingestion remains available and ignores caller timestamp", async () => {
  const f = fixture();
  f.store.vehicles.push({ batteryId: "fresh-device" });
  const { default: router } = await loadModule("src/routes/batteryRoutes.js", f.options);
  const res = await dispatch(router, "post", "/readings", { body: { batteryId: "fresh-device", voltage: 4, current: -2, temperature: 30, ratedCapacityMah: 2000, timestamp: "2099-01-01" } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.timestamp, new Date(f.options.clock.now).toISOString());
});
test("numeric, coordinate, identifier, query-limit and capacity validation", async () => {
  const f = fixture();
  const { default: battery } = await loadModule("src/routes/batteryRoutes.js", f.options);
  for (const current of ["Infinity", null, true, ""]) assert.equal((await dispatch(battery, "post", "/readings", { body: { batteryId: "battery-A", voltage: 4, current, temperature: 30 } })).statusCode, 400);
  for (const limit of ["Infinity", 1.5, 101, 0]) assert.equal((await dispatch(battery, "get", "/cycle-features", f.request("query", "battery-A", "A", { limit }))).statusCode, 400);
  assert.equal((await dispatch(battery, "get", "/latest", f.request("query", ["battery-A"])) ).statusCode, 400);
  const { default: routes } = await loadModule("src/routes/routeRoutes.js", f.options);
  for (const origin of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: "Infinity" }, { latitude: null, longitude: 0 }]) assert.equal((await dispatch(routes, "post", "/", f.request("body", "battery-A", "A", { origin }))).statusCode, 400);
  f.store.vehicles[0].batteryCapacityKWh = "Infinity";
  assert.equal((await dispatch(routes, "post", "/", f.request("body"))).statusCode, 422);
});
test("owned vehicle listing supports multiple vehicles; foreign vehicle lookup rejected", async () => {
  const f = fixture();
  const { default: router } = await loadModule("src/routes/vehicleRoutes.js", f.options);
  const list = await dispatch(router, "get", "/me", { headers: { authorization: "Bearer A" } });
  assert.equal(list.body.data.vehicles.length, 2);
  for (const [id, status] of [["vehicle-A", 200], ["vehicle-B", 404], ["", 400]]) assert.equal((await dispatch(router, "get", "/:vehicleId", { headers: { authorization: "Bearer A" }, params: { vehicleId: id } })).statusCode, status);
  assert.equal((await dispatch(router, "post", "/", { headers: { authorization: "Bearer A" }, body: { vehicleName: "new", batteryId: "new-battery", batteryCapacityKWh: "Infinity" } })).statusCode, 400);
});
test("legacy password registration is a clear 410 deprecation", async () => {
  const { default: router } = await loadModule("src/routes/userRoutes.js");
  assert.equal((await dispatch(router, "post", "/", { body: {} })).statusCode, 410);
});
test("demo rejects normal accounts and caller-selected targets", async () => {
  const f = fixture();
  const { default: router } = await loadModule("src/routes/demoRoutes.js", f.options);
  assert.equal((await dispatch(router, "post", "/simulate-cycle", f.request("body"))).statusCode, 400);
  assert.equal((await dispatch(router, "post", "/simulate-cycle", { headers: { authorization: "Bearer A" }, body: {} })).statusCode, 403);
  assert.equal((await dispatch(router, "post", "/simulate-cycle", { body: {} })).statusCode, 401);
});

test("authorized auto and manual AI endpoints preserve their different storage contracts", async () => {
  const f = fixture({ role: "ADMIN", env: { GREENMILE_VALIDATION_ENABLED: "true" } });
  for (let n = 0; n < 10; n++) f.store.features.push({ batteryId: "battery-A", cycleNumber: n, cycleInputRaw: n, voltageMeanV: 4, voltageMinV: 3.8, currentAbsMeanA: 2, temperatureMeanC: 29, temperatureMaxC: 30, dischargeDurationS: 210 });
  let records;
  const ai = { checkAIHealth: async () => ({}), predictSoH: async (payload) => { records = payload.records; return { predictedSoH: 0.91 }; } };
  const { default: router } = await loadModule("src/routes/aiRoutes.js", { ...f.options, ai });
  const before = f.store.predictions.length;
  const auto = await dispatch(router, "post", "/soh/auto", f.request("body"));
  assert.equal(auto.statusCode, 200);
  assert.equal(auto.body.readyForPrediction, true);
  assert.equal(auto.body.data.recordsSentToAI.length, 10);
  assert.equal(auto.body.data.savedPrediction.soh, 0.91);
  const manual = await dispatch(router, "post", "/soh", f.request("body", "battery-A", "A", { records }));
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.body.data.predictedSoH, 0.91);
  assert.equal(f.store.predictions.length, before + 1);
});

test("restricted legacy aggregation preserves feature values and helpful error details", async () => {
  const f = fixture({ role: "ADMIN", env: { GREENMILE_VALIDATION_ENABLED: "true" } });
  f.store.readings.push({ batteryId: "battery-A", cycleCount: 0, current: -2, voltage: 4, temperature: 28, timestamp: new Date(f.options.clock.now - 60000) }, { batteryId: "battery-A", cycleCount: 0, current: -2, voltage: 3.8, temperature: 30, timestamp: new Date(f.options.clock.now) });
  const { default: router } = await loadModule("src/routes/batteryRoutes.js", f.options);
  const result = await dispatch(router, "post", "/cycle-features/aggregate", f.request("body", "battery-A", "A", { cycleNumber: 0 }));
  assert.equal(result.statusCode, 201);
  assert.equal(result.body.data.cycleFeature.voltageMeanV, 3.9);
  assert.equal(result.body.data.cycleFeature.dischargeDurationS, 60);
  const missing = await dispatch(router, "post", "/cycle-features/aggregate", f.request("body", "battery-A", "A", { cycleNumber: 1 }));
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.body.details.dischargeReadingsFound, 0);
});

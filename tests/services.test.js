import test from "node:test";
import assert from "node:assert/strict";
import { loadModule, memoryDatabase, plain } from "./helpers/runtime.js";

test("SoH uses newest ten chronological cycles and exact seven-field contract, then saves real result", async () => {
  const clock = { now: Date.parse("2026-01-01") };
  const { prisma, store } = memoryDatabase(clock);
  for (let n = 0; n < 12; n++) store.features.push({ batteryId: "A", cycleNumber: n, cycleInputRaw: n, voltageMeanV: 4, voltageMinV: 3.8, currentAbsMeanA: 2, temperatureMeanC: 29, temperatureMaxC: 30, dischargeDurationS: 210 });
  let payload;
  const { predictFromCycleFeatures } = await loadModule("src/services/sohPredictionService.js", { prisma, clock, ai: { predictSoH: async (input) => { payload = plain(input); return { predictedSoH: 0.91, predictedSoHPercent: 91 }; } } });
  const result = await predictFromCycleFeatures("A");
  assert.deepEqual(payload.records.map((record) => record.cycle_input_raw), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(Object.keys(payload.records[0]), ["cycle_input_raw", "voltage_mean_v", "voltage_min_v", "current_abs_mean_a", "temperature_mean_c", "temperature_max_c", "discharge_duration_s"]);
  assert.equal(payload.batteryId, "A");
  assert.equal(result.savedPrediction.soh, 0.91);
  assert.equal(store.predictions.length, 1);
});
test("invalid AI features and SoH are rejected before persistence", async () => {
  const { validateAIRecords, validateSoH } = await loadModule("src/utils/validation.js");
  assert.throws(() => validateAIRecords(Array.from({ length: 10 }, () => ({}))));
  for (const predictedSoH of [null, "Infinity", -0.1, 1.1, true]) assert.throws(() => validateSoH({ predictedSoH }, "A"));
  assert.throws(() => validateSoH({ predictedSoH: 0.9, batteryId: "B" }, "A"));
});
test("profile upsert is idempotent, cannot grant roles, upgrades GUEST, handles uniqueness races/conflicts", async () => {
  const identity = { uid: "uid", email: "user@example.test", name: "user", isAnonymous: false, role: "ADMIN" };
  let role = "USER", creates = [], collision = false, existing = true;
  const prisma = { user: { upsert: async (args) => { creates.push(args.create); if (collision) throw { code: "P2002" }; return { id: "owner", role, vehicles: [] }; }, findUnique: async () => existing ? { id: "owner", role, vehicles: [] } : null, update: async ({ data }) => ({ id: "owner", role: data.role, vehicles: [] }) } };
  const { loadOrCreateUser } = await loadModule("src/services/userService.js", { prisma });
  await loadOrCreateUser(identity); await loadOrCreateUser(identity);
  assert.equal(creates[0].role, "USER");
  await loadOrCreateUser({ ...identity, isAnonymous: true }); assert.equal(creates[2].role, "GUEST");
  role = "GUEST"; assert.equal((await loadOrCreateUser(identity)).role, "USER");
  role = "ADMIN"; assert.equal((await loadOrCreateUser(identity)).role, "ADMIN");
  collision = true; assert.equal((await loadOrCreateUser(identity)).id, "owner");
  existing = false; await assert.rejects(loadOrCreateUser(identity), (error) => error.status === 409);
});
test("demo runs chronological normal ingestion; ten real feature cycles trigger the existing AI pipeline", async () => {
  const clock = { now: Date.parse("2026-01-01") };
  const { prisma, store } = memoryDatabase(clock);
  store.vehicles.push({ batteryId: "real-battery", userId: "other", batteryCapacityKWh: 20 });
  let payload;
  const { simulateCycles, ensureDemoVehicle } = await loadModule("src/services/demoService.js", { prisma, clock, ai: { predictSoH: async (input) => { payload = plain(input); return { predictedSoH: 0.9 }; } } });
  const guest = { id: "guest", role: "GUEST" };
  const first = await ensureDemoVehicle(guest);
  assert.equal((await ensureDemoVehicle(guest)).id, first.id);
  const result = await simulateCycles(guest, 10);
  assert.equal(result.cyclesCompleted, 10);
  assert.equal(result.readingsGenerated, 90);
  assert.equal(store.features.length, 10);
  assert.equal(store.predictions.length, 1);
  assert.equal(payload.records.length, 10);
  assert.deepEqual(payload.records.map((record) => record.cycle_input_raw), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(store.readings.every((row, index) => row.batteryId === first.batteryId && row.timestamp <= new Date(clock.now) && (!index || row.timestamp > store.readings[index - 1].timestamp)));
  assert.equal(store.readings.at(-1).current, 0);
  assert.ok(store.features.every((row) => row.dischargeDurationS === 210 && row.voltageMinV < row.voltageMeanV));
  assert.ok(store.states[0].totalDischargedCapacityMah > 0);
  await assert.rejects(simulateCycles(guest, 1), (error) => error.status === 409);
  await assert.rejects(simulateCycles({ id: "real", role: "USER" }), (error) => error.status === 403);
  await assert.rejects(simulateCycles(guest, 11), (error) => error.status === 400);
  assert.equal(store.vehicles[0].batteryId, "real-battery");
});
test("upstream timeout covers stalled requests and clears timers", async () => {
  const { requestJSON } = await loadModule("src/utils/upstream.js", { fetch: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Aborted")))) });
  await assert.rejects(requestJSON("http://fixture", {}, 5), (error) => error.status === 504);
});
test("Google preserves payload/field mask and secondary-key fallback only for 429", async () => {
  for (const initialStatus of [429, 403]) {
    const calls = [];
    const { getGoogleRoutes } = await loadModule("src/services/googleRoutesService.js", { fetch: async (url, options) => { calls.push({ url, options }); const status = calls.length === 1 ? initialStatus : 200; return { ok: status === 200, status, json: async () => ({ routes: [] }) }; } });
    await getGoogleRoutes({ apiKeys: ["first", "second"], originLatitude: 1, originLongitude: 2, destinationLatitude: 3, destinationLongitude: 4 });
    assert.equal(calls.length, initialStatus === 429 ? 2 : 1);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.routingPreference, "TRAFFIC_AWARE");
    assert.deepEqual(body.extraComputations, ["TRAFFIC_ON_POLYLINE"]);
    assert.equal(calls[0].options.headers["X-Goog-Api-Key"], "first");
    assert.ok(calls[0].options.headers["X-Goog-FieldMask"].includes("routes.travelAdvisory.speedReadingIntervals"));
  }
});

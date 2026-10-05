import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import { loadModule, memoryDatabase } from "./helpers/runtime.js";
import { googleRoutes, routeBody } from "./helpers/scenarios.js";

test("real Express HTTP mounting, JSON parsing, authentication and owned route requests", async () => {
  const clock = { now: Date.parse("2026-01-01") };
  const { prisma, store } = memoryDatabase(clock);
  store.users.push({ id: "owner", firebaseUid: "uid", role: "USER" });
  store.vehicles.push({ id: "vehicle", userId: "owner", batteryId: routeBody.batteryId, batteryCapacityKWh: 15 });
  store.states.push({ batteryId: routeBody.batteryId, estimatedSoc: 90 });
  const { default: app } = await loadModule("src/app.js", { prisma, clock, env: { GOOGLE_ROUTES_API_KEY: "fixture" }, firebaseAuth: { verifyIdToken: async () => ({ uid: "uid" }) }, modules: { express: { default: express }, cors: { default: cors }, "dotenv/config": {} }, fetch: async () => ({ ok: true, status: 200, json: async () => ({ routes: googleRoutes }) }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/api/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(routeBody) })).status, 401);
    const routed = await fetch(`${base}/api/routes`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer fixture" }, body: JSON.stringify(routeBody) });
    assert.equal(routed.status, 200);
    assert.equal((await routed.json()).data.recommendationLevel, "BATTERY_SAFE");
    assert.equal((await fetch(`${base}/api/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 410);
  } finally { server.closeAllConnections(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

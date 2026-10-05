import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import vm from "node:vm";

export const plain = (value) => JSON.parse(JSON.stringify(value));
export function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = plain(body); return this; } };
}

// Never load real Prisma, credentials, Firebase Admin, or contact upstreams.
export async function loadModule(path, { prisma = {}, firebaseAuth = {}, fetch, env = {}, clock = { now: Date.parse("2026-01-01T00:00:00Z") }, ai, modules = {} } = {}) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const express = { Router() { const router = { stack: [] }; for (const method of ["get", "post", "use"]) router[method] = (path, ...handlers) => router.stack.push({ method, path, handlers }); return router; } };
  const mocks = { express: { default: express }, "lib/prisma.js": { prisma }, "firebase/firebaseAdmin.js": { firebaseAuth }, ...(ai ? { "services/aiService.js": ai } : {}), ...modules };
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date: ClockDate, process: { env }, fetch: fetch || (() => { throw new Error("Unexpected external request"); }), AbortController, setTimeout, clearTimeout, Buffer });
  const cache = new Map();
  async function moduleFor(file) {
    const mockKey = Object.keys(mocks).find((key) => file === key || file.replaceAll("\\", "/").endsWith(key));
    if (mockKey) {
      if (!cache.has(mockKey)) {
        const values = mocks[mockKey];
        cache.set(mockKey, new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }));
      }
      return cache.get(mockKey);
    }
    if (!cache.has(file)) cache.set(file, readFile(file, "utf8").then((source) => new vm.SourceTextModule(source, { context, identifier: file })));
    return await cache.get(file);
  }
  const mod = await moduleFor(resolve(path));
  await mod.link((specifier, referencingModule) => moduleFor(specifier.startsWith(".") ? resolve(dirname(referencingModule.identifier), specifier) : specifier));
  await mod.evaluate();
  return mod.namespace;
}

export function memoryDatabase(clock) {
  const store = { states: [], readings: [], features: [], predictions: [], users: [], vehicles: [] };
  let id = 0;
  const copy = (value) => value ? structuredClone(value) : value;
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "batteryId_cycleNumber") return matches(row, value);
    if (value && typeof value === "object") {
      if ("gte" in value && !(row[key] >= value.gte)) return false;
      if ("lt" in value && !(row[key] < value.lt)) return false;
      return true;
    }
    return row[key] === value;
  });
  const model = (rows) => ({
    async findUnique({ where }) { return copy(rows.find((row) => matches(row, where)) || null); },
    async findFirst(args) { return (await this.findMany(args))[0] || null; },
    async findMany({ where, orderBy, take } = {}) {
      let found = rows.filter((row) => matches(row, where));
      if (orderBy) { const [key, direction] = Object.entries(orderBy)[0]; found = [...found].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === "desc" ? -1 : 1)); }
      return copy(take === undefined ? found : found.slice(0, take));
    },
    async create({ data }) { const row = { id: `row-${++id}`, timestamp: new Date(clock.now), ...copy(data) }; rows.push(row); return copy(row); },
    async update({ where, data }) { const row = rows.find((entry) => matches(entry, where)); if (!row) throw new Error("Missing fixture row"); Object.assign(row, copy(data)); return copy(row); },
    async upsert({ where, create, update }) { return rows.some((row) => matches(row, where)) ? this.update({ where, data: update }) : this.create({ data: create }); },
    async aggregate({ where }) { return { _sum: { energyWh: rows.filter((row) => matches(row, where)).reduce((sum, row) => sum + row.energyWh, 0) } }; },
  });
  const prisma = { batteryState: model(store.states), batteryReading: model(store.readings), batteryCycleFeature: model(store.features), aIPrediction: model(store.predictions), user: model(store.users), vehicle: model(store.vehicles) };
  prisma.$transaction = async (callback) => callback(prisma);
  return { prisma, store };
}

export async function dispatch(router, method, path, req) {
  const route = router.stack.find((entry) => entry.method === method && entry.path === path);
  if (!route) throw new Error(`Missing route ${method} ${path}`);
  const res = response();
  req.headers ||= {}; req.query ||= {}; req.body ||= {}; req.params ||= {};
  for (const handler of route.handlers) {
    let next = false;
    await handler(req, res, () => { next = true; });
    if (!next) break;
  }
  return res;
}

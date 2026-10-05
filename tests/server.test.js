import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function startWith(error) {
  const messages = [];
  const processState = { env: {}, exitCode: undefined };
  const context = vm.createContext({ process: processState, console: {
    log: (...parts) => messages.push({ level: "log", parts }),
    error: (...parts) => messages.push({ level: "error", parts }),
  } });
  let requestedPort;
  const app = { listen(port, callback) { requestedPort = port; callback(error); } };
  const source = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const entry = new vm.SourceTextModule(source, { context });
  await entry.link((specifier) => {
    if (specifier === "dotenv/config") return new vm.SyntheticModule([], () => {}, { context });
    if (specifier === "./app.js") return new vm.SyntheticModule(["default"], function () { this.setExport("default", app); }, { context });
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await entry.evaluate();
  return { messages, processState, requestedPort };
}

test("startup reports readiness only after a successful listen", async () => {
  const result = await startWith();
  assert.equal(result.requestedPort, 5000);
  assert.equal(result.processState.exitCode, undefined);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].level, "log");
});

test("occupied port exits unsuccessfully without falsely reporting readiness", async () => {
  const result = await startWith({ code: "EADDRINUSE", name: "Error" });
  assert.equal(result.processState.exitCode, 1);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].level, "error");
  assert.equal(result.messages[0].parts[1], "EADDRINUSE");
});

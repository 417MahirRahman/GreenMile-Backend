# GreenMile Backend

Express/Prisma backend for Firebase-authenticated, battery-aware EV routing.

## Local development

Run commands in `F:\Capstone-Project\EV-Routes-Map-Backend` with a Node version supported by the installed Vite/Prisma dependencies (Node 22.12+ is one supported option).

```powershell
npm run dev
npm start
npm test
```

`dev` watches the backend, `start` runs `src/server.js`, and `test` runs dependency-free Node tests. Existing installed Express/CORS are used by the HTTP smoke test. Tests mock Prisma, Firebase Admin and upstream calls: they do not load `.env`, contact production services, run migrations or alter database data. The HTTP test binds an ephemeral loopback port and closes it afterward.

The VM-based test harness requires `--experimental-vm-modules`, already included in `npm test`. Node emits an experimental-feature warning. The real Express smoke test may also emit a Promise-like-handler warning because handlers are evaluated in a separate VM realm; normal production imports do not use that harness.

## Architecture and preserved behavior

`server.js` starts the listener; `app.js` mounts existing routes plus the demo router. Controllers handle HTTP boundaries. Services handle optimization, Google requests, battery transactions, legacy cycle aggregation, shared SoH prediction, user profiles and isolated demo simulation. Prisma remains the data layer without per-model repository wrappers.

Frozen response fixtures were captured before production refactoring. They cover energy speed bands, traffic stress, relative normalization, battery stress, scoring, feasibility, recommendation tiers, ties and missing-SoH fallback. Battery fixtures cover initialization, positive/negative/idle currents, integration, EFC, energy, long gaps and completed cycle features. Do not regenerate these expectations to conceal a regression.

Route calculation order, constants, rounding, clamps, penalties, reserve/recommendation rules, SoC/EFC math, discharge sessions, ten-cycle chronological sequence and seven LSTM fields remain unchanged. Normal route capacity comes from the authenticated user's resolved vehicle. The global capacity remains a default for direct service/research calls, never a fallback for invalid normal vehicle capacity.

## User-facing authorization

Send `Authorization: Bearer <Firebase ID token>` to auth, vehicle, battery reads, cycle-feature reads, AI latest/auto and route endpoints. Call `GET /api/auth/me` to create/load the Prisma profile first. Battery operations resolve the vehicle and require its `userId` to match the authenticated profile. Missing and foreign batteries both return 404.

`POST /api/battery/readings` intentionally retains the existing unauthenticated ESP32 device path. It remains a separate, incomplete production trust boundary. Do not expose it publicly until device authentication/provisioning and appropriate access controls are defined. A caller-supplied timestamp is ignored; normal ingestion uses server time.

Public `/` and `/api/ai/health` remain available. `POST /api/users` now returns 410 directing callers to Firebase; database password registration is not restored. The legacy route file was retained.

Profile creation is idempotent by Firebase UID. A uniqueness race reloads the winning profile. An email owned by another UID/legacy profile returns 409 and requires explicit account-linking review; the backend never links accounts merely because their emails match. A verified permanent Firebase identity upgrades a GUEST profile to USER. ADMIN/DEMO roles cannot be assigned through request bodies.

## Research validation

`testBattery`, `testWeights`, manual `/api/ai/soh` and legacy `/api/battery/cycle-features/aggregate` require **both**:

- Server environment `GREENMILE_VALIDATION_ENABLED=true`.
- A Firebase token whose existing Prisma profile has role `ADMIN`, owning the targeted battery.

Validation is off by default. No administrator was created or database role changed during implementation. Do not send secret tokens in URLs or commit them.

The six existing `scripts/validate*.js` retain their scenarios and calculations. They accept:

- `GREENMILE_RESEARCH_TOKEN`: Firebase ID token supplied through the process environment.
- `GREENMILE_RESEARCH_BATTERY_ID`: optional owned research battery; defaults to `battery-001`.
- `GREENMILE_ROUTE_API_URL`: optional API URL; defaults to the existing localhost endpoint.

Use a 15 kWh research vehicle when reproducing the original global-capacity baseline. Scripts call live routing APIs and consume quota; they were not executed during implementation. `seedCycleFeatures.js` remains untouched and writes synthetic features directly: use only against an explicitly isolated research database, never as the simulator.

Manual aggregation retains its legacy integer-EFC selection semantics for compatibility. It is restricted research functionality, not the normal session-based feature pipeline.

## Guest/demo foundation and simulator

The current schema supports isolation without migrations. These authenticated endpoints accept only existing GUEST, DEMO or ADMIN profiles:

| Endpoint | Body | Behavior |
|---|---|---|
| `POST /api/demo/vehicle` | `{}` | Idempotently creates/returns the caller's dedicated demo vehicle. |
| `POST /api/demo/simulate-cycle` | `{ "cycles": 1 }` | Creates the demo vehicle if needed and processes one discharge session. |
| `POST /api/demo/simulate-cycle` | `{ "cycles": 10 }` | Optional bounded ten-session batch for AI demonstration. |

The target is derived from the authenticated profile: `greenmile-demo:<Prisma user ID>`. Ordinary vehicle creation cannot claim this reserved prefix. Caller-supplied `batteryId`, `vehicleId` or `userId` is rejected. Even ADMIN simulation is confined to that administrator's own dedicated demo vehicle.

Each session produces eight negative-current readings and a final idle reading, at 30-second intervals, with gradually falling voltage and slightly changing temperature. These are clearly labeled **illustrative cell telemetry**, not a calibrated 15 kWh pack model or trained-model validation dataset. A demo vehicle uses the existing 15 kWh prototype capacity; illustrative cell integration initializes at 2,000 mAh and 90% SoC. Completed discharge sessions are not asserted to be full EFCs.

The simulator calls `processBatteryReading` for every reading and the same automatic SoH service after completed sessions. It never inserts cycle features or predictions directly. AI persistence occurs only after the existing upstream model returns a valid result. AI unavailability leaves successfully processed readings/features saved and reports prediction unavailability.

Simulation dates are historical, strictly chronological and never in the future. An existing recent state returns 409 until enough wall time has elapsed for the next batch (approximately four minutes for another single session). Requests cannot move battery time backwards. A process-local guard prevents overlapping simulations for one demo battery. It is not a distributed lock.

No demo vehicle/data was created in the actual configured database. The new endpoints write demo data only when explicitly invoked in a running backend. Frontend demo onboarding/refresh/selection remains future work.

## Validation and upstream safety

Identifiers must be non-empty strings; numbers must be finite, with valid coordinates and positive capacities. Cycle-feature query limits are integers from 1 to 100. AI inputs retain exactly ten records with seven finite numeric features; model output must be fractional SoH in [0, 1]. An upstream battery identity, if returned, must match the request.

Google and FastAPI requests have a 15-second per-request timeout covering headers and JSON reading. The existing Google secondary-key fallback on HTTP 429 is preserved; no ingestion retry was introduced. Errors sent to clients do not include raw database invocations or upstream credential-bearing details. Logs report error names/codes instead of full exception objects.

## Configuration and remaining production concerns

Existing `DATABASE_URL`, Firebase Admin fields, Google Routes keys, `AI_SERVICE_URL`, `PORT` and research model settings remain in use. No `.env`, credential, Firebase project, Google key, Prisma connection or model configuration was edited. Never print or commit their values.

Before production deployment, review raw-device authentication, proof of battery possession, per-battery concurrent ingestion/locking, distributed simulation exclusion, request rate limits, CORS origins, readiness/graceful shutdown, telemetry/prediction freshness, guest cleanup, and cross-service integration. The real Supabase/PostgreSQL and FastAPI/model deployment were not exercised. Missing SoH still uses the original fallback of 1.0. CORS remains permissive to preserve current configuration.

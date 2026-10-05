import { prisma } from "../lib/prisma.js";
import { processBatteryReading } from "./batteryProcessingService.js";
import { runAutomaticSoHPrediction } from "./sohPredictionService.js";
import { ApiError } from "../utils/validation.js";

export const DEMO_BATTERY_PREFIX = "greenmile-demo:";
const simulations = new Set();

export function assertDemoAccess(user) {
  if (!user || !["GUEST", "DEMO", "ADMIN"].includes(user.role)) throw new ApiError(403, "Simulation is restricted to guest, demo, or administrator accounts.");
}

export async function ensureDemoVehicle(user) {
  assertDemoAccess(user);
  const batteryId = `${DEMO_BATTERY_PREFIX}${user.id}`;
  let vehicle = await prisma.vehicle.findUnique({ where: { batteryId } });
  if (!vehicle) {
    try { vehicle = await prisma.vehicle.create({ data: { userId: user.id, vehicleName: "GreenMile Demo Vehicle", batteryId, batteryCapacityKWh: 15 } }); }
    catch (error) {
      if (error.code !== "P2002") throw error;
      vehicle = await prisma.vehicle.findUnique({ where: { batteryId } });
    }
  }
  if (!vehicle || vehicle.userId !== user.id) throw new ApiError(409, "Demo vehicle identity conflict.");
  return vehicle;
}

export async function simulateCycles(user, cycles = 1) {
  assertDemoAccess(user);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) throw new ApiError(400, "cycles must be an integer from 1 to 10.");
  const batteryId = `${DEMO_BATTERY_PREFIX}${user.id}`;
  if (simulations.has(batteryId)) throw new ApiError(409, "A simulation is already running for this demo battery.");
  simulations.add(batteryId);
  try {
    const vehicle = await ensureDemoVehicle(user);
    const state = await prisma.batteryState.findUnique({ where: { batteryId } });
    const end = Date.now();
    const start = end - cycles * 270000;
    // Backfill isolated demo readings, never write future timestamps or move
    // existing battery time backwards. Subsequent batches require elapsed time.
    if (state?.lastTimestamp && new Date(state.lastTimestamp).getTime() >= start) throw new ApiError(409, "Not enough elapsed time for another chronological demo batch. Wait before simulating again.");
    const results = [];
    for (let cycle = 0; cycle < cycles; cycle++) {
      let result;
      for (let sample = 0; sample <= 8; sample++) {
        const now = new Date(start + cycle * 270000 + sample * 30000);
        result = await processBatteryReading({ batteryId, voltageValue: 4.05 - sample * 0.025, currentValue: sample === 8 ? 0 : -2, temperatureValue: 28 + sample * 0.12, ratedCapacityMah: 2000, initialSoc: 90 }, { now, simulated: true });
      }
      const automaticSoH = result.aiCycle.completedCycle ? await runAutomaticSoHPrediction(batteryId) : { triggered: false, readyForPrediction: false };
      results.push({ cycleFeature: result.aiCycle.completedCycle, automaticSoH });
    }
    return { simulation: true, telemetryModel: "illustrative-cell", vehicle, readingsGenerated: cycles * 9, cyclesCompleted: results.filter((result) => result.cycleFeature).length, results };
  } finally { simulations.delete(batteryId); }
}

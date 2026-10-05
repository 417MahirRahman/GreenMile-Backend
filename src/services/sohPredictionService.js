import { prisma } from "../lib/prisma.js";
import { predictSoH } from "./aiService.js";
import { validateAIRecords, validateSoH } from "../utils/validation.js";

export async function predictFromCycleFeatures(batteryId) {
  const cycleFeatures = await prisma.batteryCycleFeature.findMany({ where: { batteryId }, orderBy: { cycleNumber: "desc" }, take: 10 });
  if (cycleFeatures.length < 10) return { readyForPrediction: false, availableCycles: cycleFeatures.length, requiredCycles: 10, remainingCycles: 10 - cycleFeatures.length };
  cycleFeatures.reverse();
  const records = cycleFeatures.map((cycle) => ({
    cycle_input_raw: Number(cycle.cycleInputRaw),
    voltage_mean_v: Number(cycle.voltageMeanV),
    voltage_min_v: Number(cycle.voltageMinV),
    current_abs_mean_a: Number(cycle.currentAbsMeanA),
    temperature_mean_c: Number(cycle.temperatureMeanC),
    temperature_max_c: Number(cycle.temperatureMaxC),
    discharge_duration_s: Number(cycle.dischargeDurationS),
  }));
  validateAIRecords(records);
  const prediction = await predictSoH({ batteryId, records });
  const sohValue = validateSoH(prediction, batteryId);
  const savedPrediction = await prisma.aIPrediction.create({ data: { batteryId, soh: sohValue, futureDegradation: null, predictionTime: new Date() } });
  return { readyForPrediction: true, cyclesUsed: cycleFeatures.map((cycle) => cycle.cycleNumber), records, prediction, savedPrediction };
}

export async function runAutomaticSoHPrediction(batteryId) {
  try {
    const result = await predictFromCycleFeatures(batteryId);
    if (!result.readyForPrediction) return { triggered: false, ...result, message: `Need ${result.remainingCycles} more completed cycle(s) for SoH prediction` };
    return { triggered: true, readyForPrediction: true, cyclesUsed: result.cyclesUsed, prediction: result.prediction, savedPrediction: result.savedPrediction };
  } catch {
    // Reading/state transaction already committed. Do not suggest retrying ingestion.
    return { triggered: false, readyForPrediction: false, error: "SoH prediction unavailable; battery reading remains saved." };
  }
}

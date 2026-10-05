export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export const isIdentifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\x00-\x1f]/.test(value);
export const isFiniteValue = (value) => (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value));
export const isPositiveValue = (value) => isFiniteValue(value) && Number(value) > 0;

export const AI_FEATURES = ["cycle_input_raw", "voltage_mean_v", "voltage_min_v", "current_abs_mean_a", "temperature_mean_c", "temperature_max_c", "discharge_duration_s"];
export function validateAIRecords(records) {
  if (!Array.isArray(records) || records.length !== 10) throw new ApiError(400, "Exactly 10 cycle-level records are required for SoH prediction");
  if (records.some((record) => !record || AI_FEATURES.some((field) => !isFiniteValue(record[field])))) throw new ApiError(400, "Each AI record must contain the seven finite numeric features");
}
export function validateSoH(prediction, batteryId) {
  if (!prediction || !isFiniteValue(prediction.predictedSoH) || Number(prediction.predictedSoH) < 0 || Number(prediction.predictedSoH) > 1) throw new ApiError(502, "FastAPI returned an invalid fractional SoH value");
  if (prediction.batteryId !== undefined && prediction.batteryId !== batteryId) throw new ApiError(502, "FastAPI returned a different battery identity");
  return Number(prediction.predictedSoH);
}
export function sendError(res, error, fallback, fallbackStatus = 500) {
  return res.status(error.status || fallbackStatus).json({ success: false, message: error.status ? error.message : fallback, ...(error.status && error.details ? { details: error.details } : {}) });
}

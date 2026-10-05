import { prisma } from "../lib/prisma.js";

import { predictFromCycleFeatures } from "../services/sohPredictionService.js";
import { validateAIRecords, validateSoH, sendError } from "../utils/validation.js";
import { checkAIHealth, predictSoH } from "../services/aiService.js";

// ======================================================
// CHECK AI SERVICE
// ======================================================

const getAIHealth = async (req, res) => {
  try {
    const data = await checkAIHealth();

    res.json({
      success: true,
      message: "FastAPI AI service is connected",
      data,
    });
  } catch (error) {
    console.error("FastAPI health check error:", error.code || error.name || "Error");

    return sendError(res, error, "Unable to connect to FastAPI AI service", 503);
  }
};

// ======================================================
// TEST SOH PREDICTION THROUGH NODE
// ======================================================

const predictBatterySoH = async (req, res) => {
  try {
    const { batteryId, records } = req.body;

    if (!batteryId) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({
        success: false,
        message: "records must be an array",
      });
    }

    if (records.length !== 10) {
      return res.status(400).json({
        success: false,
        message:
          "Exactly 10 cycle-level records are required for SoH prediction",
      });
    }

    validateAIRecords(records);
    const prediction = await predictSoH({
      batteryId,
      records,
    });

    validateSoH(prediction, batteryId);
    res.json({
      success: true,

      message: "SoH prediction received successfully",

      data: prediction,
    });
  } catch (error) {
    console.error("SoH prediction error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to predict battery SoH");
  }
};

// ======================================================
// AUTOMATIC SOH PREDICTION FROM DATABASE
// ======================================================

const predictSoHFromDatabase = async (req, res) => {
  try {
    const { batteryId } = req.body;

    // --------------------------------------------------
    // Validate batteryId
    // --------------------------------------------------

    if (!batteryId) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    // ==================================================
    // CHECK VEHICLE EXISTS
    // ==================================================

    const vehicle = await prisma.vehicle.findUnique({
      where: {
        batteryId,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: `No vehicle found for batteryId ${batteryId}`,
      });
    }

    // ==================================================
    // GET LATEST 10 CYCLE FEATURES
    // ==================================================

    const result = await predictFromCycleFeatures(batteryId);
    if (!result.readyForPrediction) return res.status(200).json({ success: false, readyForPrediction: false, message: `Not enough completed cycles for SoH prediction. Need ${result.remainingCycles} more cycle(s).`, data: { batteryId, availableCycles: result.availableCycles, requiredCycles: 10, remainingCycles: result.remainingCycles } });
    const { cyclesUsed, records, prediction, savedPrediction } = result;

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.json({
      success: true,

      readyForPrediction: true,

      message: "SoH predicted and saved successfully",

      data: {
        batteryId,

        cyclesUsed,

        recordsSentToAI: records,

        prediction,

        savedPrediction,
      },
    });
  } catch (error) {
    console.error("Automatic SoH prediction error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to automatically predict SoH");
  }
};

// ======================================================
// GET LATEST SAVED SOH PREDICTION
// ======================================================

const getLatestSoHPrediction = async (req, res) => {
  try {
    const { batteryId } = req.query;

    if (!batteryId) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    const prediction = await prisma.aIPrediction.findFirst({
      where: {
        batteryId,
      },

      orderBy: {
        predictionTime: "desc",
      },
    });

    if (!prediction) {
      return res.status(404).json({
        success: false,

        message: "No SoH prediction found for this battery",
      });
    }

    return res.json({
      success: true,

      data: {
        ...prediction,

        sohPercent: Number(prediction.soh) * 100,
      },
    });
  } catch (error) {
    console.error("Error getting latest SoH:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to get latest SoH prediction");
  }
};

// ======================================================
// EXPORTS
// ======================================================

export {
  getAIHealth,
  predictBatterySoH,
  predictSoHFromDatabase,
  getLatestSoHPrediction,
};

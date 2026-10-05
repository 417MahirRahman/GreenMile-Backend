import { aggregateLegacyCycleFeatures } from "../services/cycleFeatureService.js";
import { isIdentifier, isFiniteValue, sendError } from "../utils/validation.js";
import { prisma } from "../lib/prisma.js";

// ======================================================
// CREATE / UPDATE FEATURES FOR ONE COMPLETED DISCHARGE CYCLE
// ======================================================

const aggregateCycleFeatures = async (req, res) => {
  try {
    const { batteryId, cycleNumber } = req.body;

    // --------------------------------------------------
    // Validate input
    // --------------------------------------------------

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    if (cycleNumber === undefined) {
      return res.status(400).json({
        success: false,
        message: "cycleNumber is required",
      });
    }

    const cycleNumberValue = Number(cycleNumber);

    if (
      !isFiniteValue(cycleNumber) ||
      !Number.isInteger(cycleNumberValue) ||
      cycleNumberValue < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "cycleNumber must be a valid non-negative integer",
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
    // GET ALL DISCHARGE READINGS FOR THIS CYCLE
    // ==================================================

    const data = await aggregateLegacyCycleFeatures(batteryId, cycleNumberValue);
    return res.status(201).json({ success: true, message: "Cycle features aggregated successfully", data });
  } catch (error) {
    console.error("Error aggregating cycle features:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to aggregate cycle features");
  }
};

// ======================================================
// GET LATEST CYCLE FEATURES
// ======================================================

const getLatestCycleFeatures = async (req, res) => {
  try {
    const { batteryId } = req.query;

    const limit = Number(req.query.limit ?? 10);

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    if (!isFiniteValue(req.query.limit ?? 10) || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "limit must be an integer between 1 and 100",
      });
    }

    const cycleFeatures = await prisma.batteryCycleFeature.findMany({
      where: {
        batteryId,
      },

      orderBy: {
        cycleNumber: "desc",
      },

      take: Math.floor(limit),
    });

    // FastAPI needs chronological order:
    // oldest → newest
    cycleFeatures.reverse();

    return res.json({
      success: true,

      data: {
        batteryId,

        count: cycleFeatures.length,

        cycleFeatures,
      },
    });
  } catch (error) {
    console.error("Error getting cycle features:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to get cycle features");
  }
};

export { aggregateCycleFeatures, getLatestCycleFeatures };

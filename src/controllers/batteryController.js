import { isIdentifier, isFiniteValue, isPositiveValue, sendError } from "../utils/validation.js";
import { prisma } from "../lib/prisma.js";
import { processBatteryReading, getChargingStatus } from "../services/batteryProcessingService.js";
import { runAutomaticSoHPrediction } from "../services/sohPredictionService.js";

// ======================================================
// CREATE BATTERY READING
// ======================================================

const createBatteryReading = async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, message: "A JSON object body is required." });
  try {
    const {
      batteryId,
      voltage,
      current,
      temperature,

      // Used only when BatteryState is created
      ratedCapacityMah,
      initialSoc,
    } = req.body;

    // ==================================================
    // VALIDATION
    // ==================================================

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    if (
      voltage === undefined ||
      current === undefined ||
      temperature === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "voltage, current and temperature are required",
      });
    }

    const voltageValue = Number(voltage);

    const currentValue = Number(current);

    const temperatureValue = Number(temperature);

    if (
      !isFiniteValue(voltage) ||
      !isFiniteValue(current) ||
      !isFiniteValue(temperature)
    ) {
      return res.status(400).json({
        success: false,
        message: "voltage, current and temperature must be valid numbers",
      });
    }

    if (ratedCapacityMah !== undefined && !isPositiveValue(ratedCapacityMah)) return res.status(400).json({ success: false, message: "ratedCapacityMah must be a positive finite number" });
    if (initialSoc !== undefined && !isFiniteValue(initialSoc)) return res.status(400).json({ success: false, message: "initialSoc must be a finite number" });

    // ==================================================
    // CHECK VEHICLE
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

    const result = await processBatteryReading({ batteryId, voltageValue, currentValue, temperatureValue, ratedCapacityMah, initialSoc });

    // ==================================================
    // AUTOMATIC SOH AFTER COMPLETED AI CYCLE
    // ==================================================

    let automaticSoH = {
      triggered: false,
      readyForPrediction: false,
      message: "No completed discharge cycle in this reading",
    };

    if (result.aiCycle?.completedCycle) {
      automaticSoH = await runAutomaticSoHPrediction(batteryId);
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return res.status(201).json({
      success: true,

      message: "Battery reading saved successfully",

      data: {
        ...result.reading,

        power: result.power,

        chargingStatus: result.chargingStatus,

        energyStatus: result.energyStatus,

        socCalculation: result.socCalculation,

        cycleInformation: result.cycleInformation,

        aiCycle: result.aiCycle,

        automaticSoH,
      },
    });
  } catch (error) {
    console.error("Create battery reading error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to save battery reading");
  }
};

// ======================================================
// GET LATEST BATTERY READING
// ======================================================

const getLatestBatteryReading = async (req, res) => {
  try {
    const { batteryId } = req.query;

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    const latestReading = await prisma.batteryReading.findFirst({
      where: {
        batteryId,
      },

      orderBy: {
        timestamp: "desc",
      },
    });

    if (!latestReading) {
      return res.status(404).json({
        success: false,
        message: "No battery reading found",
      });
    }

    const batteryState = await prisma.batteryState.findUnique({
      where: {
        batteryId,
      },
    });

    const power =
      Number(latestReading.voltage) * Math.abs(Number(latestReading.current));

    const chargingStatus = getChargingStatus(Number(latestReading.current));

    const equivalentFullCycles =
      batteryState && Number(batteryState.ratedCapacityMah) > 0
        ? Number(batteryState.totalDischargedCapacityMah) /
          Number(batteryState.ratedCapacityMah)
        : Number(latestReading.cycleCount) || 0;

    return res.json({
      success: true,

      data: {
        ...latestReading,

        power,

        chargingStatus,

        cycleCount: equivalentFullCycles,

        cycleInformation: batteryState
          ? {
              equivalentFullCycles,

              totalDischargedCapacityMah: Number(
                batteryState.totalDischargedCapacityMah,
              ),

              ratedCapacityMah: Number(batteryState.ratedCapacityMah),

              completedDischargeCycles:
                Number(batteryState.completedDischargeCycles) || 0,

              activeDischargeStartedAt: batteryState.activeDischargeStartedAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get latest battery reading error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to get latest battery reading");
  }
};

// ======================================================
// GET TOTAL ENERGY CONSUMPTION
// ======================================================

const getTotalEnergyConsumption = async (req, res) => {
  try {
    const { batteryId } = req.query;

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "batteryId is required",
      });
    }

    const result = await prisma.batteryReading.aggregate({
      where: {
        batteryId,
      },

      _sum: {
        energyWh: true,
      },
    });

    const totalEnergyWh = Number(result._sum.energyWh) || 0;

    return res.json({
      success: true,

      data: {
        batteryId,
        totalEnergyWh,
      },
    });
  } catch (error) {
    console.error("Get total energy error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to get total energy consumption");
  }
};

// ======================================================
// EXPORT
// ======================================================

export {
  createBatteryReading,
  getLatestBatteryReading,
  getTotalEnergyConsumption,
};

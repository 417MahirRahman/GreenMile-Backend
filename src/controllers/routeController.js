import { isIdentifier, isFiniteValue, isPositiveValue, sendError } from "../utils/validation.js";
import { prisma } from "../lib/prisma.js";
import { optimizeRoutes, clamp, TIME_WEIGHT, ENERGY_WEIGHT, BATTERY_WEIGHT } from "../services/routeOptimizationService.js";
import { getGoogleRoutes } from "../services/googleRoutesService.js";

export const calculateRoutes = async (req, res) => {
  try {
    const { origin, destination, batteryId, testBattery, testWeights } =
      req.body;

    // ==================================================
    // VALIDATE REQUEST
    // ==================================================

    if (!origin || !destination) {
      return res.status(400).json({
        success: false,

        message: "origin and destination are required",
      });
    }

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,

        message: "batteryId is required",
      });
    }

    const originLatitude = Number(origin.latitude);

    const originLongitude = Number(origin.longitude);

    const destinationLatitude = Number(destination.latitude);

    const destinationLongitude = Number(destination.longitude);

    if (
      !isFiniteValue(origin.latitude) || Math.abs(originLatitude) > 90 ||
      !isFiniteValue(origin.longitude) || Math.abs(originLongitude) > 180 ||
      !isFiniteValue(destination.latitude) || Math.abs(destinationLatitude) > 90 ||
      !isFiniteValue(destination.longitude) || Math.abs(destinationLongitude) > 180
    ) {
      return res.status(400).json({
        success: false,

        message: "origin and destination coordinates must be valid numbers",
      });
    }

    // ==================================================
    // GOOGLE ROUTES API KEY
    // ==================================================

    const apiKeys = [
      process.env.GOOGLE_ROUTES_API_KEY,
      process.env.GOOGLE_ROUTES_API_KEY_2,
    ].filter(Boolean);

    if (apiKeys.length === 0) {
      return res.status(500).json({
        success: false,
        message: "No Google Routes API key is configured",
      });
    }

    // ==================================================
    // GET BATTERY STATE
    // ==================================================

    const batteryState = await prisma.batteryState.findUnique({
      where: {
        batteryId,
      },
    });

    if (!batteryState) {
      return res.status(404).json({
        success: false,

        message: `No BatteryState found for ${batteryId}`,
      });
    }

    // ==================================================
    // GET LATEST AI SOH
    // ==================================================

    const latestPrediction = await prisma.aIPrediction.findFirst({
      where: {
        batteryId,
      },

      orderBy: {
        predictionTime: "desc",
      },
    });

    // ==================================================
    // REAL BATTERY VALUES
    // ==================================================

    if (!isFiniteValue(batteryState.estimatedSoc) || (latestPrediction && !isFiniteValue(latestPrediction.soh))) return res.status(502).json({ success: false, message: "Stored battery values must be finite." });
    if (testBattery !== undefined && (!testBattery || typeof testBattery !== "object" || Array.isArray(testBattery))) return res.status(400).json({ success: false, message: "testBattery must be an object." });
    if (testWeights !== undefined && (!testWeights || typeof testWeights !== "object" || Array.isArray(testWeights))) return res.status(400).json({ success: false, message: "testWeights must be an object." });

    const realSoc = clamp(Number(batteryState.estimatedSoc), 0, 100);

    const realSoh = latestPrediction
      ? clamp(Number(latestPrediction.soh), 0.1, 1)
      : 1;

    // ==================================================
    // OPTIONAL TEST BATTERY
    // ==================================================

    let soc = realSoc;

    let soh = realSoh;

    let batteryDataSource = "database";

    if (testBattery) {
      if (testBattery.soc !== undefined) {
        const testSoc = Number(testBattery.soc);

        if (!isFiniteValue(testBattery.soc) || testSoc < 0 || testSoc > 100) {
          return res.status(400).json({
            success: false,

            message: "testBattery.soc must be between 0 and 100",
          });
        }

        soc = testSoc;
      }

      if (testBattery.soh !== undefined) {
        const testSoh = Number(testBattery.soh);

        if (!isFiniteValue(testBattery.soh) || testSoh < 0.1 || testSoh > 1) {
          return res.status(400).json({
            success: false,

            message: "testBattery.soh must be between 0.1 and 1.0",
          });
        }

        soh = testSoh;
      }

      batteryDataSource = "validation-test";
    }

    // ==================================================
    // ACTIVE ROUTE WEIGHTS
    // ==================================================

    let activeTimeWeight = TIME_WEIGHT;

    let activeEnergyWeight = ENERGY_WEIGHT;

    let activeBatteryWeight = BATTERY_WEIGHT;

    let weightSource = "environment";

    if (testWeights) {
      const testTime = Number(testWeights.time);

      const testEnergy = Number(testWeights.energy);

      const testBatteryWeight = Number(testWeights.battery);

      if (
        !isFiniteValue(testWeights.time) ||
        !isFiniteValue(testWeights.energy) ||
        !isFiniteValue(testWeights.battery)
      ) {
        return res.status(400).json({
          success: false,

          message:
            "testWeights.time, testWeights.energy, and testWeights.battery must be valid numbers",
        });
      }

      if (testTime < 0 || testEnergy < 0 || testBatteryWeight < 0) {
        return res.status(400).json({
          success: false,

          message: "testWeights cannot contain negative values",
        });
      }

      const testTotal = testTime + testEnergy + testBatteryWeight;

      if (Math.abs(testTotal - 1) > 0.001) {
        return res.status(400).json({
          success: false,

          message: `testWeights must add up to 1.0. Current total: ${testTotal}`,
        });
      }

      activeTimeWeight = testTime;

      activeEnergyWeight = testEnergy;

      activeBatteryWeight = testBatteryWeight;

      weightSource = "validation-test";
    }


    if (!isPositiveValue(req.ownedVehicle?.batteryCapacityKWh)) return res.status(422).json({ success: false, message: "Vehicle battery capacity must be a positive finite number." });
    const batteryCapacityKWh = Number(req.ownedVehicle.batteryCapacityKWh);
    const { googleResponse, googleData } = await getGoogleRoutes({ apiKeys, originLatitude, originLongitude, destinationLatitude, destinationLongitude });
    if (!googleResponse || !googleResponse.ok) {
      console.error("Google Routes API error status:", googleResponse?.status);

      return res.status(googleResponse?.status || 500).json({
        success: false,
        message: "Failed to fetch routes from Google",
        error: { status: googleResponse?.status || 500 },
      });
    }

    if (!googleData.routes || googleData.routes.length === 0) {
      return res.status(404).json({
        success: false,

        message: "No routes were returned by Google",
      });
    }


    return res.json(optimizeRoutes({ googleData, batteryId, soc, soh, realSoc, realSoh, batteryDataSource, weightSource, activeTimeWeight, activeEnergyWeight, activeBatteryWeight, batteryCapacityKWh }));
  } catch (error) {
    console.error("Route calculation error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to calculate speed-aware battery routes");
  }
};

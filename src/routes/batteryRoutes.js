import { requireAuth } from "../middleware/authMiddleware.js";
import { requireBatteryOwnership } from "../middleware/batteryOwnershipMiddleware.js";
import { requireResearchPermission } from "../middleware/validationMiddleware.js";
import express from "express";

import {
  createBatteryReading,
  getLatestBatteryReading,
  getTotalEnergyConsumption,
} from "../controllers/batteryController.js";

import {
  aggregateCycleFeatures,
  getLatestCycleFeatures,
} from "../controllers/cycleFeatureController.js";

const router = express.Router();

// Device trust boundary: unchanged until device provisioning/authentication is defined.
// Save battery reading
router.post("/readings", createBatteryReading);

// Get latest battery reading
router.get("/latest", requireAuth, requireBatteryOwnership(), getLatestBatteryReading);

// Get total accumulated energy
router.get("/energy-total", requireAuth, requireBatteryOwnership(), getTotalEnergyConsumption);

router.post("/cycle-features/aggregate", requireAuth, requireBatteryOwnership("body"), requireResearchPermission, aggregateCycleFeatures);

router.get("/cycle-features", requireAuth, requireBatteryOwnership(), getLatestCycleFeatures);

export default router;

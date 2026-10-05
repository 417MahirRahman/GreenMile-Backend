import { requireAuth } from "../middleware/authMiddleware.js";
import { requireBatteryOwnership } from "../middleware/batteryOwnershipMiddleware.js";
import { requireResearchPermission } from "../middleware/validationMiddleware.js";
import express from "express";

import {
  getAIHealth,
  predictBatterySoH,
  predictSoHFromDatabase,
  getLatestSoHPrediction,
} from "../controllers/aiController.js";

const router = express.Router();

// FastAPI connection test
router.get("/health", getAIHealth);

// Manual 10-record test
router.post("/soh", requireAuth, requireBatteryOwnership("body"), requireResearchPermission, predictBatterySoH);

// Automatic prediction using DB cycle features
router.post("/soh/auto", requireAuth, requireBatteryOwnership("body"), predictSoHFromDatabase);

// Latest saved SoH
router.get("/soh/latest", requireAuth, requireBatteryOwnership(), getLatestSoHPrediction);

export default router;

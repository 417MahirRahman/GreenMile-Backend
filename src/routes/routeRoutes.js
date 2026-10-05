import express from "express";
import { calculateRoutes } from "../controllers/routeController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireBatteryOwnership } from "../middleware/batteryOwnershipMiddleware.js";
import { requireValidationMode } from "../middleware/validationMiddleware.js";
const router = express.Router();
router.post("/", requireAuth, requireBatteryOwnership("body"), requireValidationMode, calculateRoutes);
export default router;

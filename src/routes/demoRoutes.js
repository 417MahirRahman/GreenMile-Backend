import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { createDemoVehicle, simulateDemoCycle } from "../controllers/demoController.js";
const router = express.Router();
router.post("/vehicle", requireAuth, createDemoVehicle);
router.post("/simulate-cycle", requireAuth, simulateDemoCycle);
export default router;

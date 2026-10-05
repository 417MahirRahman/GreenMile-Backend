import express from "express";

import {
  createVehicle,
  getMyVehicles,
  getMyVehicleById,
} from "../controllers/vehicleController.js";

import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// =====================================================
// CURRENT USER VEHICLES
// =====================================================

router.get("/me", requireAuth, getMyVehicles);

// =====================================================
// CREATE VEHICLE
// =====================================================

router.post("/", requireAuth, createVehicle);

// =====================================================
// GET SINGLE VEHICLE
// =====================================================

router.get("/:vehicleId", requireAuth, getMyVehicleById);

export default router;

import express from "express";

import { getCurrentUser } from "../controllers/authController.js";

import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// Authenticated user profile
router.get("/me", requireAuth, getCurrentUser);

export default router;

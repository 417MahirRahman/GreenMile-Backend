import express from "express";
const router = express.Router();
// Legacy database-password registration has no active application consumer.
router.post("/", (req, res) => res.status(410).json({ success: false, message: "Legacy registration is retired. Sign in with Firebase and use /api/auth/me." }));
export default router;

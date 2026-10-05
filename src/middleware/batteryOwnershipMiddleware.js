import { prisma } from "../lib/prisma.js";
import { isIdentifier, sendError } from "../utils/validation.js";

// A battery's existence is not permission. Retain the resolved user and vehicle.
export const requireBatteryOwnership = (source = "query") => async (req, res, next) => {
  try {
    if (!req.firebaseUser?.uid) return res.status(401).json({ success: false, message: "Authentication is required." });
    const batteryId = req[source]?.batteryId;
    if (!isIdentifier(batteryId)) return res.status(400).json({ success: false, message: "batteryId must be a non-empty identifier." });
    const user = await prisma.user.findUnique({ where: { firebaseUid: req.firebaseUser.uid } });
    if (!user) return res.status(404).json({ success: false, message: "GreenMile user profile not found." });
    const vehicle = await prisma.vehicle.findUnique({ where: { batteryId } });
    // Same response for missing and unowned batteries prevents ownership enumeration.
    if (!vehicle || vehicle.userId !== user.id) return res.status(404).json({ success: false, message: "Vehicle not found." });
    req.prismaUser = user;
    req.ownedVehicle = vehicle;
    next();
  } catch (error) { return sendError(res, error, "Unable to verify battery ownership."); }
};

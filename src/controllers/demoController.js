import { prisma } from "../lib/prisma.js";
import { ensureDemoVehicle, simulateCycles } from "../services/demoService.js";
import { ApiError, sendError } from "../utils/validation.js";

async function demoUser(req) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: req.firebaseUser.uid } });
  if (!user) throw new ApiError(404, "Load /api/auth/me before using demo endpoints.");
  return user;
}
function rejectTargetOverride(req) {
  if (req.body?.batteryId !== undefined || req.body?.vehicleId !== undefined || req.body?.userId !== undefined) throw new ApiError(400, "Demo targets are derived from the authenticated account, not request identifiers.");
}
export async function createDemoVehicle(req, res) {
  try {
    rejectTargetOverride(req);
    const vehicle = await ensureDemoVehicle(await demoUser(req));
    return res.json({ success: true, data: { simulation: true, vehicle } });
  } catch (error) { return sendError(res, error, "Unable to prepare demo vehicle."); }
}
export async function simulateDemoCycle(req, res) {
  try {
    rejectTargetOverride(req);
    const data = await simulateCycles(await demoUser(req), req.body?.cycles ?? 1);
    return res.status(201).json({ success: true, message: "Demo readings processed through the normal battery pipeline.", data });
  } catch (error) { return sendError(res, error, "Simulation failed; some demo readings may already be saved. Do not automatically retry."); }
}

// Explicit opt-in plus an authenticated ADMIN; an environment flag alone must
// not grant ordinary users permission to override battery values or weights.
export function requireResearchPermission(req, res, next) {
  if (process.env.GREENMILE_VALIDATION_ENABLED !== "true" || req.prismaUser?.role !== "ADMIN") return res.status(403).json({ success: false, message: "Research validation requires enabled validation mode and an administrator." });
  next();
}
export function requireValidationMode(req, res, next) {
  if (req.body?.testBattery !== undefined || req.body?.testWeights !== undefined) return requireResearchPermission(req, res, next);
  next();
}

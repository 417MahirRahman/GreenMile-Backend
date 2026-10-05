import { isIdentifier, isPositiveValue } from "../utils/validation.js";
import { prisma } from "../lib/prisma.js";

// =====================================================
// GET CURRENT USER FROM FIREBASE UID
// =====================================================

const getCurrentPrismaUser = async (firebaseUid) => {
  if (!firebaseUid) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      firebaseUid,
    },
  });
};

// =====================================================
// GET MY VEHICLES
// GET /api/vehicles/me
// =====================================================

export const getMyVehicles = async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser?.uid;

    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found.",
      });
    }

    const user = await getCurrentPrismaUser(firebaseUid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "GreenMile user profile not found.",
      });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: {
        userId: user.id,
      },

      orderBy: {
        createdAt: "asc",
      },
    });

    return res.status(200).json({
      success: true,

      data: {
        vehicles,
      },
    });
  } catch (error) {
    console.error("Get vehicles error:", error.code || error.name || "Error");

    return res.status(500).json({
      success: false,
      message: "Failed to load vehicles.",
    });
  }
};

// =====================================================
// CREATE VEHICLE
// POST /api/vehicles
// =====================================================

export const createVehicle = async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ success: false, message: "A JSON object body is required." });
  try {
    const firebaseUid = req.firebaseUser?.uid;

    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found.",
      });
    }

    const user = await getCurrentPrismaUser(firebaseUid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "GreenMile user profile not found.",
      });
    }

    const { vehicleName, batteryId, batteryCapacityKWh } = req.body;

    // -------------------------------------------------
    // VALIDATION
    // -------------------------------------------------

    if (typeof vehicleName !== "string" || !vehicleName.trim() || vehicleName.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Vehicle name is required.",
      });
    }

    if (!isIdentifier(batteryId)) {
      return res.status(400).json({
        success: false,
        message: "Battery ID is required.",
      });
    }

    if (batteryId.startsWith("greenmile-demo:")) return res.status(400).json({ success: false, message: "Demo battery identifiers are reserved." });

    const capacity = Number(batteryCapacityKWh);

    if (!isPositiveValue(batteryCapacityKWh)) {
      return res.status(400).json({
        success: false,
        message: "Battery capacity must be greater than 0.",
      });
    }

    // -------------------------------------------------
    // CHECK BATTERY ID
    // -------------------------------------------------

    const existingVehicle = await prisma.vehicle.findUnique({
      where: {
        batteryId: batteryId.trim(),
      },
    });

    if (existingVehicle) {
      return res.status(409).json({
        success: false,
        message: "This battery ID is already registered.",
      });
    }

    // -------------------------------------------------
    // CREATE VEHICLE
    // -------------------------------------------------

    const vehicle = await prisma.vehicle.create({
      data: {
        userId: user.id,

        vehicleName: vehicleName.trim(),

        batteryId: batteryId.trim(),

        batteryCapacityKWh: capacity,
      },
    });

    return res.status(201).json({
      success: true,

      message: "Vehicle created successfully.",

      data: {
        vehicle,
      },
    });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ success: false, message: "This battery ID is already registered." });
    console.error("Create vehicle error:", error.code || error.name || "Error");

    return res.status(500).json({
      success: false,
      message: "Failed to create vehicle.",
    });
  }
};

// =====================================================
// GET ONE OF MY VEHICLES
// GET /api/vehicles/:vehicleId
// =====================================================

export const getMyVehicleById = async (req, res) => {
  try {
    const firebaseUid = req.firebaseUser?.uid;

    const { vehicleId } = req.params;
    if (!isIdentifier(vehicleId)) return res.status(400).json({ success: false, message: "vehicleId must be a non-empty identifier." });

    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found.",
      });
    }

    const user = await getCurrentPrismaUser(firebaseUid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "GreenMile user profile not found.",
      });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId: user.id,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found.",
      });
    }

    return res.status(200).json({
      success: true,

      data: {
        vehicle,
      },
    });
  } catch (error) {
    console.error("Get vehicle error:", error.code || error.name || "Error");

    return res.status(500).json({
      success: false,
      message: "Failed to load vehicle.",
    });
  }
};

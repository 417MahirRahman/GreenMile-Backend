import { loadOrCreateUser } from "../services/userService.js";
import { sendError } from "../utils/validation.js";

// =====================================================
// GET / CREATE CURRENT USER
// =====================================================

export const getCurrentUser = async (req, res) => {
  try {
    const firebaseUser = req.firebaseUser;

    if (!firebaseUser?.uid) {
      return res.status(401).json({
        success: false,
        message: "Authenticated Firebase user not found.",
      });
    }

    const user = await loadOrCreateUser(firebaseUser);

    return res.status(200).json({
      success: true,

      message: "User profile loaded successfully.",

      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error.code || error.name || "Error");

    return sendError(res, error, "Failed to load user profile.");
  }
};

import { firebaseAuth } from "../firebase/firebaseAdmin.js";

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const token = authHeader.slice(7);

    const decodedToken = await firebaseAuth.verifyIdToken(token);

    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: decodedToken.name || null,
      isAnonymous: decodedToken.firebase?.sign_in_provider === "anonymous",
    };

    next();
  } catch (error) {
    console.error("Firebase auth error:", error.code || error.name || "Error");

    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
};

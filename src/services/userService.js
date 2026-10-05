import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/validation.js";

export async function loadOrCreateUser(firebaseUser) {
  const where = { firebaseUid: firebaseUser.uid };
  const include = { vehicles: true };
  let user;
  try {
    user = await prisma.user.upsert({ where, update: {}, create: { firebaseUid: firebaseUser.uid, email: firebaseUser.email || null, name: firebaseUser.name || null, role: firebaseUser.isAnonymous ? "GUEST" : "USER" }, include });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    // A concurrent creator may have won. Never claim another identity by email.
    user = await prisma.user.findUnique({ where, include });
    if (!user) throw new ApiError(409, "This email is already linked to another GreenMile profile. Account linking requires review.");
  }
  if (user.role === "GUEST" && !firebaseUser.isAnonymous) user = await prisma.user.update({ where, data: { role: "USER" }, include });
  return user;
}

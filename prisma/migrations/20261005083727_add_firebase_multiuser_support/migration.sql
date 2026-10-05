/*
  Warnings:

  - You are about to drop the column `password` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[firebaseUid]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'GUEST', 'DEMO', 'ADMIN');

-- DropForeignKey
ALTER TABLE "AIPrediction" DROP CONSTRAINT "AIPrediction_batteryId_fkey";

-- DropForeignKey
ALTER TABLE "BatteryCycleFeature" DROP CONSTRAINT "BatteryCycleFeature_batteryId_fkey";

-- DropForeignKey
ALTER TABLE "BatteryReading" DROP CONSTRAINT "BatteryReading_batteryId_fkey";

-- DropForeignKey
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "firebaseUid" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "batteryCapacityKWh" DOUBLE PRECISION NOT NULL DEFAULT 15,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "AIPrediction_batteryId_predictionTime_idx" ON "AIPrediction"("batteryId", "predictionTime");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "Vehicle_userId_idx" ON "Vehicle"("userId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryReading" ADD CONSTRAINT "BatteryReading_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPrediction" ADD CONSTRAINT "AIPrediction_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryState" ADD CONSTRAINT "BatteryState_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryCycleFeature" ADD CONSTRAINT "BatteryCycleFeature_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE CASCADE ON UPDATE CASCADE;

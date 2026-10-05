-- AlterTable
ALTER TABLE "BatteryReading" ADD COLUMN     "socSource" TEXT NOT NULL DEFAULT 'backend';

-- CreateTable
CREATE TABLE "BatteryState" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "estimatedSoc" DOUBLE PRECISION NOT NULL,
    "usedCapacityMah" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratedCapacityMah" DOUBLE PRECISION NOT NULL,
    "lastCurrent" DOUBLE PRECISION,
    "lastTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BatteryState_batteryId_key" ON "BatteryState"("batteryId");

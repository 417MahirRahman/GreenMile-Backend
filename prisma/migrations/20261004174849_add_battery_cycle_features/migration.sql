-- AlterTable
ALTER TABLE "AIPrediction" ALTER COLUMN "futureDegradation" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BatteryCycleFeature" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "cycleInputRaw" DOUBLE PRECISION NOT NULL,
    "voltageMeanV" DOUBLE PRECISION NOT NULL,
    "voltageMinV" DOUBLE PRECISION NOT NULL,
    "currentAbsMeanA" DOUBLE PRECISION NOT NULL,
    "temperatureMeanC" DOUBLE PRECISION NOT NULL,
    "temperatureMaxC" DOUBLE PRECISION NOT NULL,
    "dischargeDurationS" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryCycleFeature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BatteryCycleFeature_batteryId_cycleNumber_idx" ON "BatteryCycleFeature"("batteryId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BatteryCycleFeature_batteryId_cycleNumber_key" ON "BatteryCycleFeature"("batteryId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "BatteryCycleFeature" ADD CONSTRAINT "BatteryCycleFeature_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE RESTRICT ON UPDATE CASCADE;

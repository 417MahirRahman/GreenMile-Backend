-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleName" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteryReading" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "voltage" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "soc" DOUBLE PRECISION NOT NULL,
    "cycleCount" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPrediction" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "soh" DOUBLE PRECISION NOT NULL,
    "futureDegradation" DOUBLE PRECISION NOT NULL,
    "predictionTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_batteryId_key" ON "Vehicle"("batteryId");

-- CreateIndex
CREATE INDEX "BatteryReading_batteryId_timestamp_idx" ON "BatteryReading"("batteryId", "timestamp");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteryReading" ADD CONSTRAINT "BatteryReading_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPrediction" ADD CONSTRAINT "AIPrediction_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Vehicle"("batteryId") ON DELETE RESTRICT ON UPDATE CASCADE;

import { prisma } from "../src/lib/prisma.js";

const batteryId = "battery-001";

const seedCycleFeatures = async () => {
  try {
    console.log("====================================");
    console.log("GreenMile cycle feature test seeder");
    console.log("====================================");

    // --------------------------------------------------
    // Get cycle 0 that we already generated from
    // actual BatteryReading test rows
    // --------------------------------------------------

    const baseCycle = await prisma.batteryCycleFeature.findUnique({
      where: {
        batteryId_cycleNumber: {
          batteryId,
          cycleNumber: 0,
        },
      },
    });

    if (!baseCycle) {
      throw new Error("Cycle 0 does not exist. Aggregate cycle 0 first.");
    }

    console.log("Base cycle found:", baseCycle.cycleNumber);

    // --------------------------------------------------
    // Create cycles 1-9
    //
    // IMPORTANT:
    // These are synthetic records ONLY for testing
    // Node -> FastAPI -> LSTM -> database integration.
    // --------------------------------------------------

    for (let cycleNumber = 1; cycleNumber <= 9; cycleNumber++) {
      const voltageDecrease = cycleNumber * 0.002;

      const temperatureIncrease = cycleNumber * 0.05;

      const durationIncrease = cycleNumber * 2;

      const startedAt = new Date(
        baseCycle.startedAt.getTime() + cycleNumber * 24 * 60 * 60 * 1000,
      );

      const endedAt = new Date(
        startedAt.getTime() +
          (Number(baseCycle.dischargeDurationS) + durationIncrease) * 1000,
      );

      const cycleFeature = await prisma.batteryCycleFeature.upsert({
        where: {
          batteryId_cycleNumber: {
            batteryId,
            cycleNumber,
          },
        },

        update: {
          cycleInputRaw: cycleNumber,

          voltageMeanV: Number(baseCycle.voltageMeanV) - voltageDecrease,

          voltageMinV: Number(baseCycle.voltageMinV) - voltageDecrease,

          currentAbsMeanA: Number(baseCycle.currentAbsMeanA),

          temperatureMeanC:
            Number(baseCycle.temperatureMeanC) + temperatureIncrease,

          temperatureMaxC:
            Number(baseCycle.temperatureMaxC) + temperatureIncrease,

          dischargeDurationS:
            Number(baseCycle.dischargeDurationS) + durationIncrease,

          startedAt,
          endedAt,
        },

        create: {
          batteryId,

          cycleNumber,

          cycleInputRaw: cycleNumber,

          voltageMeanV: Number(baseCycle.voltageMeanV) - voltageDecrease,

          voltageMinV: Number(baseCycle.voltageMinV) - voltageDecrease,

          currentAbsMeanA: Number(baseCycle.currentAbsMeanA),

          temperatureMeanC:
            Number(baseCycle.temperatureMeanC) + temperatureIncrease,

          temperatureMaxC:
            Number(baseCycle.temperatureMaxC) + temperatureIncrease,

          dischargeDurationS:
            Number(baseCycle.dischargeDurationS) + durationIncrease,

          startedAt,
          endedAt,
        },
      });

      console.log(`Cycle ${cycleNumber} created/updated`);

      console.log({
        cycleNumber: cycleFeature.cycleNumber,

        voltageMeanV: cycleFeature.voltageMeanV,

        temperatureMeanC: cycleFeature.temperatureMeanC,

        dischargeDurationS: cycleFeature.dischargeDurationS,
      });
    }

    // --------------------------------------------------
    // Verify total
    // --------------------------------------------------

    const count = await prisma.batteryCycleFeature.count({
      where: {
        batteryId,
      },
    });

    console.log("------------------------------------");

    console.log(`Total cycle features for ${batteryId}:`, count);

    console.log("------------------------------------");

    console.log("Test cycle seeding completed.");
  } catch (error) {
    console.error("Cycle feature seeding failed:", error);
  } finally {
    await prisma.$disconnect();
  }
};

seedCycleFeatures();

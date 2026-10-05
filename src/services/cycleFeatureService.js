import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/validation.js";

const DISCHARGE_THRESHOLD = -0.1;
const MAX_READING_GAP_SECONDS = 300;

// ======================================================
// HELPER
// ======================================================

const mean = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0);

  return total / values.length;
};

// ======================================================
// GET LATEST CONTINUOUS DISCHARGE SEGMENT
// ======================================================

const getLatestContinuousSegment = (readings) => {
  if (readings.length === 0) {
    return [];
  }

  let segmentStartIndex = 0;

  for (let i = 1; i < readings.length; i++) {
    const previousTime = new Date(readings[i - 1].timestamp);

    const currentTime = new Date(readings[i].timestamp);

    const gapSeconds = (currentTime.getTime() - previousTime.getTime()) / 1000;

    // If a long gap is found,
    // everything before it belongs to an older session.
    if (gapSeconds > MAX_READING_GAP_SECONDS) {
      segmentStartIndex = i;
    }
  }

  return readings.slice(segmentStartIndex);
};


export async function aggregateLegacyCycleFeatures(batteryId, cycleNumberValue) {
    const allReadings = await prisma.batteryReading.findMany({
      where: {
        batteryId,

        cycleCount: cycleNumberValue,

        current: {
          lt: DISCHARGE_THRESHOLD,
        },
      },

      orderBy: {
        timestamp: "asc",
      },
    });

    if (allReadings.length < 2) {
      throw new ApiError(400, "At least 2 discharge readings are required to aggregate a cycle", {
          batteryId,
          cycleNumber: cycleNumberValue,
          dischargeReadingsFound: allReadings.length,
        });
    }

    // ==================================================
    // KEEP ONLY LATEST CONTINUOUS DISCHARGE SEGMENT
    // ==================================================

    const readings = getLatestContinuousSegment(allReadings);

    if (readings.length < 2) {
      throw new ApiError(400, "Latest continuous discharge segment does not contain enough readings", {
          totalDischargeReadings: allReadings.length,

          latestContinuousReadings: readings.length,

          maxAllowedGapSeconds: MAX_READING_GAP_SECONDS,
        });
    }

    // ==================================================
    // PREPARE ARRAYS
    // ==================================================

    const voltages = readings.map((reading) => Number(reading.voltage));

    const absoluteCurrents = readings.map((reading) =>
      Math.abs(Number(reading.current)),
    );

    const temperatures = readings.map((reading) => Number(reading.temperature));

    // ==================================================
    // 7 LSTM FEATURES
    // ==================================================

    // 1. Chronological cycle proxy
    const cycleInputRaw = cycleNumberValue;

    // 2. Mean voltage
    const voltageMeanV = mean(voltages);

    // 3. Minimum voltage
    const voltageMinV = Math.min(...voltages);

    // 4. Mean absolute current
    const currentAbsMeanA = mean(absoluteCurrents);

    // 5. Mean temperature
    const temperatureMeanC = mean(temperatures);

    // 6. Maximum temperature
    const temperatureMaxC = Math.max(...temperatures);

    // 7. Continuous discharge duration
    const startedAt = new Date(readings[0].timestamp);

    const endedAt = new Date(readings[readings.length - 1].timestamp);

    const dischargeDurationS = (endedAt.getTime() - startedAt.getTime()) / 1000;

    if (dischargeDurationS <= 0) {
      throw new ApiError(400, "Discharge duration must be greater than zero");
    }

    // ==================================================
    // SAVE / UPDATE CYCLE FEATURE
    // ==================================================

    const cycleFeature = await prisma.batteryCycleFeature.upsert({
      where: {
        batteryId_cycleNumber: {
          batteryId,
          cycleNumber: cycleNumberValue,
        },
      },

      update: {
        cycleInputRaw,

        voltageMeanV,
        voltageMinV,
        currentAbsMeanA,

        temperatureMeanC,
        temperatureMaxC,

        dischargeDurationS,

        startedAt,
        endedAt,
      },

      create: {
        batteryId,

        cycleNumber: cycleNumberValue,

        cycleInputRaw,

        voltageMeanV,
        voltageMinV,
        currentAbsMeanA,

        temperatureMeanC,
        temperatureMaxC,

        dischargeDurationS,

        startedAt,
        endedAt,
      },
    });


  return { totalDischargeReadings: allReadings.length, continuousReadingsUsed: readings.length, ignoredOlderReadings: allReadings.length - readings.length, maxAllowedGapSeconds: MAX_READING_GAP_SECONDS, cycleFeature };
}

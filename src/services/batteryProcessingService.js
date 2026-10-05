import { ApiError } from "../utils/validation.js";
import { prisma } from "../lib/prisma.js";
// ======================================================
// CONSTANTS
// ======================================================

const MAX_READING_GAP_SECONDS = 300;

const DISCHARGE_THRESHOLD = -0.1;
const CHARGE_THRESHOLD = 0.1;

const DEFAULT_INITIAL_SOC = 100;

const COULOMBIC_EFFICIENCY = 1.0;

const SOC_SOURCE = "published_coulomb_counting";

// ======================================================
// HELPERS
// ======================================================

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const mean = (values) => {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return total / values.length;
};

const getChargingStatus = (current) => {
  if (current > CHARGE_THRESHOLD) {
    return "Charging";
  }

  if (current < DISCHARGE_THRESHOLD) {
    return "Discharging";
  }

  return "Idle";
};


// Only trusted internal simulation may supply a clock. Raw device requests use server time.
export async function processBatteryReading({ batteryId, voltageValue, currentValue, temperatureValue, ratedCapacityMah, initialSoc }, { now = new Date(), simulated = false } = {}) {
    return await prisma.$transaction(async (tx) => {
      // ============================================
      // GET BATTERY STATE
      // ============================================

      let batteryState = await tx.batteryState.findUnique({
        where: {
          batteryId,
        },
      });

      // ============================================
      // INITIALIZE BATTERY
      // ============================================

      if (!batteryState) {
        const capacity = Number(ratedCapacityMah);

        if (!capacity || capacity <= 0) {
          throw new ApiError(400,
            "ratedCapacityMah is required when initializing a battery",
          );
        }

        const startingSoc =
          initialSoc !== undefined
            ? clamp(Number(initialSoc), 0, 100)
            : DEFAULT_INITIAL_SOC;

        const initialUsedCapacityMah = capacity * (1 - startingSoc / 100);

        const isDischarging = currentValue < DISCHARGE_THRESHOLD;

        batteryState = await tx.batteryState.create({
          data: {
            batteryId,

            estimatedSoc: startingSoc,

            usedCapacityMah: initialUsedCapacityMah,

            totalDischargedCapacityMah: 0,

            ratedCapacityMah: capacity,

            lastCurrent: currentValue,

            lastTimestamp: now,

            activeDischargeStartedAt: isDischarging ? now : null,

            completedDischargeCycles: 0,
          },
        });

        const firstReading = await tx.batteryReading.create({
          data: {
            batteryId,

            voltage: voltageValue,

            current: currentValue,

            temperature: temperatureValue,

            soc: startingSoc,

            socSource: SOC_SOURCE,

            cycleCount: 0,

            energyWh: 0,
            ...(simulated ? { timestamp: now } : {}),
          },
        });

        return {
          reading: firstReading,

          batteryState,

          chargingStatus: getChargingStatus(currentValue),

          power: voltageValue * Math.abs(currentValue),

          energyStatus: "Battery initialized",

          socCalculation: {
            status: "Battery initialized - waiting for next reading",

            ratedCapacityMah: capacity,

            coulombicEfficiency: COULOMBIC_EFFICIENCY,

            averageCurrentA: null,

            transferredCapacityMah: 0,

            socChangePercent: 0,

            usedCapacityMah: initialUsedCapacityMah,

            elapsedSeconds: 0,
          },

          cycleInformation: {
            equivalentFullCycles: 0,

            totalDischargedCapacityMah: 0,

            ratedCapacityMah: capacity,
          },

          aiCycle: {
            status: isDischarging
              ? "Discharge session started"
              : "No active discharge session",

            activeDischargeStartedAt: isDischarging ? now : null,

            completedDischargeCycles: 0,

            completedCycle: null,
          },
        };
      }

      // ============================================
      // PREVIOUS BATTERY STATE
      // ============================================

      const previousSoc = Number(batteryState.estimatedSoc);

      const previousUsedCapacityMah = Number(batteryState.usedCapacityMah);

      const previousTotalDischargedCapacityMah = Number(
        batteryState.totalDischargedCapacityMah,
      );

      const capacity = Number(batteryState.ratedCapacityMah);

      const previousCurrent =
        batteryState.lastCurrent !== null
          ? Number(batteryState.lastCurrent)
          : 0;

      const previousTimestamp = batteryState.lastTimestamp
        ? new Date(batteryState.lastTimestamp)
        : null;

      let activeDischargeStartedAt = batteryState.activeDischargeStartedAt
        ? new Date(batteryState.activeDischargeStartedAt)
        : null;

      let completedDischargeCycles =
        Number(batteryState.completedDischargeCycles) || 0;

      // ============================================
      // CURRENT STATUS
      // ============================================

      const wasDischarging = previousCurrent < DISCHARGE_THRESHOLD;

      const isDischarging = currentValue < DISCHARGE_THRESHOLD;

      // ============================================
      // DEFAULT VALUES
      // ============================================

      let elapsedSeconds = 0;

      let averageCurrentA = currentValue;

      let transferredCapacityMah = 0;

      let socChangePercent = 0;

      let newSoc = previousSoc;

      let newUsedCapacityMah = previousUsedCapacityMah;

      let newTotalDischargedCapacityMah = previousTotalDischargedCapacityMah;

      let intervalEnergyWh = 0;

      let socStatus = "Waiting for valid time interval";

      let energyStatus = "No discharged energy counted";

      let aiCycleStatus = "No discharge cycle event";

      let completedCycleFeature = null;

      // ============================================
      // ELAPSED TIME
      // ============================================

      if (previousTimestamp) {
        elapsedSeconds = (now.getTime() - previousTimestamp.getTime()) / 1000;
      }

      const validInterval =
        elapsedSeconds > 0 && elapsedSeconds <= MAX_READING_GAP_SECONDS;

      const longGap = elapsedSeconds > MAX_READING_GAP_SECONDS;

      // ============================================
      // NORMAL INTERVAL
      // ============================================

      if (validInterval) {
        averageCurrentA = (previousCurrent + currentValue) / 2;

        transferredCapacityMah =
          averageCurrentA * (elapsedSeconds / 3600) * 1000;

        // ==========================================
        // SOC
        // ==========================================

        socChangePercent =
          ((COULOMBIC_EFFICIENCY * transferredCapacityMah) / capacity) * 100;

        newSoc = clamp(previousSoc + socChangePercent, 0, 100);

        newUsedCapacityMah = clamp(
          previousUsedCapacityMah -
            COULOMBIC_EFFICIENCY * transferredCapacityMah,
          0,
          capacity,
        );

        socStatus = "SoC updated using published coulomb-counting method";

        // ==========================================
        // DISCHARGED CAPACITY + ENERGY
        // ==========================================

        if (averageCurrentA < DISCHARGE_THRESHOLD) {
          const dischargedCapacityMah = Math.abs(transferredCapacityMah);

          newTotalDischargedCapacityMah =
            previousTotalDischargedCapacityMah + dischargedCapacityMah;

          intervalEnergyWh =
            voltageValue * Math.abs(averageCurrentA) * (elapsedSeconds / 3600);

          energyStatus = "Discharging energy counted";
        } else if (averageCurrentA > CHARGE_THRESHOLD) {
          energyStatus = "Charging - discharged energy not counted";
        } else {
          energyStatus = "Idle - discharged energy not counted";
        }
      }

      // ============================================
      // LONG GAP
      // ============================================

      if (longGap) {
        transferredCapacityMah = 0;

        socChangePercent = 0;

        intervalEnergyWh = 0;

        socStatus = "Long reading gap detected - SoC integration skipped";

        energyStatus = "New session - long reading gap ignored";

        if (isDischarging) {
          activeDischargeStartedAt = now;

          aiCycleStatus = "Long gap detected - new discharge session started";
        } else {
          activeDischargeStartedAt = null;

          aiCycleStatus =
            "Long gap detected - previous discharge session discarded";
        }
      }

      // ============================================
      // AI DISCHARGE SESSION START
      // ============================================

      if (!longGap && isDischarging && !wasDischarging) {
        activeDischargeStartedAt = now;

        aiCycleStatus = "Discharge session started";
      }

      // Migration/state safety
      if (!longGap && isDischarging && !activeDischargeStartedAt) {
        activeDischargeStartedAt = previousTimestamp || now;

        aiCycleStatus = "Discharge session restored";
      }

      // ============================================
      // EQUIVALENT FULL CYCLES
      // ============================================

      const equivalentFullCycles =
        capacity > 0 ? newTotalDischargedCapacityMah / capacity : 0;

      // ============================================
      // SAVE CURRENT RAW READING
      // ============================================

      const newReading = await tx.batteryReading.create({
        data: {
          batteryId,

          voltage: voltageValue,

          current: currentValue,

          temperature: temperatureValue,

          soc: newSoc,

          socSource: SOC_SOURCE,

          // Fractional EFC
          cycleCount: equivalentFullCycles,

          energyWh: intervalEnergyWh,
          ...(simulated ? { timestamp: now } : {}),
        },
      });

      // ============================================
      // AI DISCHARGE SESSION END
      // ============================================

      if (
        !longGap &&
        wasDischarging &&
        !isDischarging &&
        activeDischargeStartedAt
      ) {
        // Get only readings from this discharge session
        const dischargeReadings = await tx.batteryReading.findMany({
          where: {
            batteryId,

            timestamp: {
              gte: activeDischargeStartedAt,

              // Excludes the current idle/charging reading
              lt: now,
            },

            current: {
              lt: DISCHARGE_THRESHOLD,
            },
          },

          orderBy: {
            timestamp: "asc",
          },
        });

        // Need at least two discharge readings
        if (dischargeReadings.length >= 2) {
          const voltages = dischargeReadings.map((reading) =>
            Number(reading.voltage),
          );

          const currents = dischargeReadings.map((reading) =>
            Math.abs(Number(reading.current)),
          );

          const temperatures = dischargeReadings.map((reading) =>
            Number(reading.temperature),
          );

          const startedAt = new Date(dischargeReadings[0].timestamp);

          const endedAt = new Date(
            dischargeReadings[dischargeReadings.length - 1].timestamp,
          );

          const dischargeDurationS =
            (endedAt.getTime() - startedAt.getTime()) / 1000;

          if (dischargeDurationS > 0) {
            // ======================================
            // FIND NEXT SAFE AI CYCLE NUMBER
            // ======================================

            const latestExistingCycle = await tx.batteryCycleFeature.findFirst({
              where: {
                batteryId,
              },

              orderBy: {
                cycleNumber: "desc",
              },

              select: {
                cycleNumber: true,
              },
            });

            const cycleNumber = latestExistingCycle
              ? latestExistingCycle.cycleNumber + 1
              : 0;

            // ======================================
            // SAVE AI CYCLE FEATURES
            // ======================================

            completedCycleFeature = await tx.batteryCycleFeature.create({
              data: {
                batteryId,

                cycleNumber,

                cycleInputRaw: cycleNumber,

                voltageMeanV: mean(voltages),

                voltageMinV: Math.min(...voltages),

                currentAbsMeanA: mean(currents),

                temperatureMeanC: mean(temperatures),

                temperatureMaxC: Math.max(...temperatures),

                dischargeDurationS,

                startedAt,

                endedAt,
              },
            });

            // Keep state synchronized
            completedDischargeCycles = Math.max(
              completedDischargeCycles,
              cycleNumber + 1,
            );

            aiCycleStatus =
              "Completed discharge session saved as BatteryCycleFeature";
          }
        }

        if (!completedCycleFeature) {
          aiCycleStatus =
            "Discharge session ended but not enough valid readings to create AI cycle";
        }

        // Session is finished
        activeDischargeStartedAt = null;
      }

      // ============================================
      // UPDATE BATTERY STATE
      // ============================================

      const updatedState = await tx.batteryState.update({
        where: {
          batteryId,
        },

        data: {
          estimatedSoc: newSoc,

          usedCapacityMah: newUsedCapacityMah,

          totalDischargedCapacityMah: newTotalDischargedCapacityMah,

          lastCurrent: currentValue,

          lastTimestamp: now,

          activeDischargeStartedAt,

          completedDischargeCycles,
        },
      });

      // ============================================
      // RETURN FROM TRANSACTION
      // ============================================

      return {
        reading: newReading,

        batteryState: updatedState,

        chargingStatus: getChargingStatus(currentValue),

        power: voltageValue * Math.abs(currentValue),

        energyStatus,

        socCalculation: {
          status: socStatus,

          ratedCapacityMah: capacity,

          coulombicEfficiency: COULOMBIC_EFFICIENCY,

          averageCurrentA,

          transferredCapacityMah,

          socChangePercent,

          usedCapacityMah: newUsedCapacityMah,

          elapsedSeconds,
        },

        cycleInformation: {
          equivalentFullCycles,

          totalDischargedCapacityMah: newTotalDischargedCapacityMah,

          ratedCapacityMah: capacity,
        },

        aiCycle: {
          status: aiCycleStatus,

          activeDischargeStartedAt,

          completedDischargeCycles,

          completedCycle: completedCycleFeature,
        },
      };
    });

}

export { getChargingStatus };

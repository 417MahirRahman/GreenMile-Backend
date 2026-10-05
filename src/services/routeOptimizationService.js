// ======================================================
// EV / ROUTE CONFIGURATION
// ======================================================

const AUXILIARY_POWER_W = Number(process.env.EV_AUXILIARY_POWER_W) || 200;

const EV_BATTERY_CAPACITY_KWH =
  Number(process.env.EV_BATTERY_CAPACITY_KWH) || 15;

const EV_MIN_RESERVE_SOC = Number(process.env.EV_MIN_RESERVE_SOC) || 20;

// ======================================================
// GREENMILE ROUTE WEIGHTS
// ======================================================

const TIME_WEIGHT = Number(process.env.ROUTE_TIME_WEIGHT) || 0.3;

const ENERGY_WEIGHT = Number(process.env.ROUTE_ENERGY_WEIGHT) || 0.3;

const BATTERY_WEIGHT = Number(process.env.ROUTE_BATTERY_WEIGHT) || 0.4;

// ======================================================
// BATTERY STRESS COMPONENT WEIGHTS
// ======================================================
//
// Prototype GreenMile design values:
//
// 40% depletion
// 25% reserve risk
// 20% SoH-adjusted load
// 15% traffic stress
//
// These are NOT universal battery degradation constants.
// ======================================================

const STRESS_DEPLETION_WEIGHT = 0.4;
const STRESS_RESERVE_WEIGHT = 0.25;
const STRESS_HEALTH_WEIGHT = 0.2;
const STRESS_TRAFFIC_WEIGHT = 0.15;

// ======================================================
// SPEED-DEPENDENT ENERGY MODEL
// ======================================================
//
// Prototype calibration values.
//
// Average Speed:
// 0–15 km/h   -> 140 Wh/km
// 15–30 km/h  -> 115 Wh/km
// 30–50 km/h  -> 100 Wh/km
// 50–70 km/h  -> 110 Wh/km
// >70 km/h    -> 125 Wh/km
//
// IMPORTANT:
// These are prototype design values.
// Do NOT call them experimentally validated EV constants.
// ======================================================

const getEnergyRateWhPerKm = (averageSpeedKmh) => {
  const speed = Number(averageSpeedKmh) || 0;

  if (speed <= 15) {
    return 140;
  }

  if (speed <= 30) {
    return 115;
  }

  if (speed <= 50) {
    return 100;
  }

  if (speed <= 70) {
    return 110;
  }

  return 125;
};

// ======================================================
// VALIDATE ROUTE WEIGHTS
// ======================================================

const totalRouteWeight = TIME_WEIGHT + ENERGY_WEIGHT + BATTERY_WEIGHT;

if (Math.abs(totalRouteWeight - 1) > 0.001) {
  console.warn(`Route weights add up to ${totalRouteWeight}, not 1.0`);
}

// ======================================================
// VALIDATE BATTERY-STRESS WEIGHTS
// ======================================================

const totalStressWeight =
  STRESS_DEPLETION_WEIGHT +
  STRESS_RESERVE_WEIGHT +
  STRESS_HEALTH_WEIGHT +
  STRESS_TRAFFIC_WEIGHT;

if (Math.abs(totalStressWeight - 1) > 0.001) {
  console.warn(
    `Battery stress weights add up to ${totalStressWeight}, not 1.0`,
  );
}

// ======================================================
// HELPERS
// ======================================================

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const parseDurationSeconds = (duration) => {
  if (!duration) {
    return 0;
  }

  return Number(String(duration).replace("s", ""));
};

// ======================================================
// RELATIVE-TO-BEST SCORE
// ======================================================

const calculateRelativeScores = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const numericValues = values.map((value) => Number(value));

  const bestValue = Math.min(...numericValues);

  if (!Number.isFinite(bestValue) || bestValue <= 0) {
    return numericValues.map(() => 0);
  }

  return numericValues.map((value) => {
    const relativeDifference = (value - bestValue) / bestValue;

    return clamp(relativeDifference, 0, 1);
  });
};

// ======================================================
// TRAFFIC INTERVAL ANALYSIS
// ======================================================

const calculateTrafficIntervalStats = (intervals) => {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return {
      available: false,

      normalRatio: 0,

      slowRatio: 0,

      trafficJamRatio: 0,

      intervalTrafficStress: 0,
    };
  }

  let normalPoints = 0;
  let slowPoints = 0;
  let jamPoints = 0;
  let totalPoints = 0;

  for (const interval of intervals) {
    const startIndex = Number(interval.startPolylinePointIndex ?? 0);

    const endIndex = Number(interval.endPolylinePointIndex ?? startIndex);

    const span = Math.max(endIndex - startIndex, 0);

    totalPoints += span;

    if (interval.speed === "NORMAL") {
      normalPoints += span;
    } else if (interval.speed === "SLOW") {
      slowPoints += span;
    } else if (interval.speed === "TRAFFIC_JAM") {
      jamPoints += span;
    }
  }

  if (totalPoints <= 0) {
    return {
      available: false,

      normalRatio: 0,

      slowRatio: 0,

      trafficJamRatio: 0,

      intervalTrafficStress: 0,
    };
  }

  const normalRatio = normalPoints / totalPoints;

  const slowRatio = slowPoints / totalPoints;

  const trafficJamRatio = jamPoints / totalPoints;

  const intervalTrafficStress = clamp(
    slowRatio * 0.5 + trafficJamRatio,

    0,
    1,
  );

  return {
    available: true,

    normalRatio,

    slowRatio,

    trafficJamRatio,

    intervalTrafficStress,
  };
};


export function optimizeRoutes({ googleData, batteryId, soc, soh, realSoc, realSoh, batteryDataSource = "database", weightSource = "environment", activeTimeWeight = TIME_WEIGHT, activeEnergyWeight = ENERGY_WEIGHT, activeBatteryWeight = BATTERY_WEIGHT, batteryCapacityKWh = EV_BATTERY_CAPACITY_KWH }) {
  const sohPercent = soh * 100;
  const nominalBatteryWh = batteryCapacityKWh * 1000;
  const effectiveBatteryWh = nominalBatteryWh * soh;
  const availableBatteryWh = effectiveBatteryWh * (soc / 100);
    const routeCalculations = googleData.routes.map((route, index) => {
      // ==========================================
      // DISTANCE
      // ==========================================

      const distanceMeters = Number(route.distanceMeters);

      const distanceKm = distanceMeters / 1000;

      // ==========================================
      // DURATION
      // ==========================================

      const durationSeconds = parseDurationSeconds(route.duration);

      const staticDurationSeconds = parseDurationSeconds(route.staticDuration);

      const durationHours = durationSeconds / 3600;

      // ==========================================
      // AVERAGE SPEED
      // ==========================================

      const averageSpeedKmh =
        durationHours > 0 ? distanceKm / durationHours : 0;

      // ==========================================
      // SPEED-DEPENDENT ENERGY RATE
      // ==========================================

      const energyRateWhPerKm = getEnergyRateWhPerKm(averageSpeedKmh);

      // ==========================================
      // TRACTION ENERGY
      // ==========================================

      const tractionEnergyWh = distanceKm * energyRateWhPerKm;

      // ==========================================
      // AUXILIARY ENERGY
      // ==========================================

      const auxiliaryEnergyWh = AUXILIARY_POWER_W * durationHours;

      // ==========================================
      // TOTAL ENERGY
      // ==========================================

      const estimatedEnergyWh = tractionEnergyWh + auxiliaryEnergyWh;

      // ==========================================
      // TRAFFIC DELAY
      // ==========================================

      const trafficDelaySeconds = Math.max(
        durationSeconds - staticDurationSeconds,
        0,
      );

      const trafficDelayRatio =
        staticDurationSeconds > 0
          ? clamp(
              trafficDelaySeconds / staticDurationSeconds,

              0,
              1,
            )
          : 0;

      // ==========================================
      // TRAFFIC INTERVALS
      // ==========================================

      const trafficIntervals =
        route.travelAdvisory?.speedReadingIntervals || [];

      const trafficStats = calculateTrafficIntervalStats(trafficIntervals);

      // ==========================================
      // TRAFFIC STRESS
      // ==========================================

      let trafficStressScore;

      if (trafficStats.available) {
        trafficStressScore = clamp(
          0.5 * trafficDelayRatio + 0.5 * trafficStats.intervalTrafficStress,

          0,
          1,
        );
      } else {
        trafficStressScore = clamp(trafficDelayRatio, 0, 1);
      }

      // ==========================================
      // PROJECTED SOC DROP
      // ==========================================

      const projectedSocDrop =
        effectiveBatteryWh > 0
          ? (estimatedEnergyWh / effectiveBatteryWh) * 100
          : 100;

      // ==========================================
      // ARRIVAL SOC
      // ==========================================

      const projectedArrivalSoc = soc - projectedSocDrop;

      // ==========================================
      // PHYSICAL FEASIBILITY
      // ==========================================

      const feasible =
        estimatedEnergyWh <= availableBatteryWh && projectedArrivalSoc >= 0;

      // ==========================================
      // RESERVE SAFETY
      // ==========================================

      const reserveSafe = projectedArrivalSoc >= EV_MIN_RESERVE_SOC;

      const safeForBattery = feasible && reserveSafe;

      // ==========================================
      // RESERVE PENALTY
      // ==========================================

      let reservePenalty = 0;

      if (projectedArrivalSoc < EV_MIN_RESERVE_SOC) {
        reservePenalty =
          (EV_MIN_RESERVE_SOC - projectedArrivalSoc) / EV_MIN_RESERVE_SOC;

        reservePenalty = clamp(reservePenalty, 0, 1);
      }

      // ==========================================
      // DEPLETION RATIO
      // ==========================================

      const depletionRatio =
        effectiveBatteryWh > 0 ? estimatedEnergyWh / effectiveBatteryWh : 1;

      // ==========================================
      // HEALTH-ADJUSTED LOAD
      // ==========================================

      const healthAdjustedLoad = clamp(
        depletionRatio * (1 / soh),

        0,
        1,
      );

      // ==========================================
      // BATTERY STRESS
      // ==========================================

      const batteryStressScore = clamp(
        STRESS_DEPLETION_WEIGHT * clamp(depletionRatio, 0, 1) +
          STRESS_RESERVE_WEIGHT * reservePenalty +
          STRESS_HEALTH_WEIGHT * healthAdjustedLoad +
          STRESS_TRAFFIC_WEIGHT * trafficStressScore,

        0,
        1,
      );

      return {
        routeIndex: index,

        distanceMeters,

        distanceKm,

        duration: route.duration,

        durationSeconds,

        staticDuration: route.staticDuration,

        staticDurationSeconds,

        averageSpeedKmh,

        energyRateWhPerKm,

        tractionEnergyWh,

        auxiliaryEnergyWh,

        estimatedEnergyWh,

        trafficDelaySeconds,

        trafficDelayRatio,

        normalTrafficRatio: trafficStats.normalRatio,

        slowTrafficRatio: trafficStats.slowRatio,

        trafficJamRatio: trafficStats.trafficJamRatio,

        trafficStressScore,

        projectedSocDrop,

        projectedArrivalSoc,

        reservePenalty,

        depletionRatio,

        healthAdjustedLoad,

        batteryStressScore,

        feasible,

        reserveSafe,

        safeForBattery,

        encodedPolyline: route.polyline?.encodedPolyline,

        routeLabels: route.routeLabels || [],
      };
    });

    // ==================================================
    // RELATIVE TIME SCORES
    // ==================================================

    const relativeTimeScores = calculateRelativeScores(
      routeCalculations.map((route) => route.durationSeconds),
    );

    // ==================================================
    // RELATIVE ENERGY SCORES
    // ==================================================

    const relativeEnergyScores = calculateRelativeScores(
      routeCalculations.map((route) => route.estimatedEnergyWh),
    );

    // ==================================================
    // FINAL SCORES
    // ==================================================

    const scoredRoutes = routeCalculations.map((route, index) => {
      const timeScore = relativeTimeScores[index];

      const energyScore = relativeEnergyScores[index];

      const batteryStressScore = route.batteryStressScore;

      let finalScore =
        activeTimeWeight * timeScore +
        activeEnergyWeight * energyScore +
        activeBatteryWeight * batteryStressScore;

      if (!route.feasible) {
        finalScore += 1;
      }

      return {
        ...route,

        distanceKm: Number(route.distanceKm.toFixed(3)),

        averageSpeedKmh: Number(route.averageSpeedKmh.toFixed(2)),

        energyRateWhPerKm: Number(route.energyRateWhPerKm.toFixed(2)),

        tractionEnergyWh: Number(route.tractionEnergyWh.toFixed(2)),

        auxiliaryEnergyWh: Number(route.auxiliaryEnergyWh.toFixed(2)),

        estimatedEnergyWh: Number(route.estimatedEnergyWh.toFixed(2)),

        trafficDelayRatio: Number(route.trafficDelayRatio.toFixed(4)),

        normalTrafficRatio: Number(route.normalTrafficRatio.toFixed(4)),

        slowTrafficRatio: Number(route.slowTrafficRatio.toFixed(4)),

        trafficJamRatio: Number(route.trafficJamRatio.toFixed(4)),

        trafficStressScore: Number(route.trafficStressScore.toFixed(4)),

        projectedSocDrop: Number(route.projectedSocDrop.toFixed(3)),

        projectedArrivalSoc: Number(route.projectedArrivalSoc.toFixed(2)),

        reservePenalty: Number(route.reservePenalty.toFixed(4)),

        depletionRatio: Number(route.depletionRatio.toFixed(6)),

        healthAdjustedLoad: Number(route.healthAdjustedLoad.toFixed(6)),

        batteryStressScore: Number(batteryStressScore.toFixed(4)),

        timeScore: Number(timeScore.toFixed(4)),

        energyScore: Number(energyScore.toFixed(4)),

        finalScore: Number(finalScore.toFixed(4)),

        recommended: false,
      };
    });

    // ==================================================
    // RECOMMENDATION PRIORITY
    // ==================================================

    const batterySafeRoutes = scoredRoutes.filter(
      (route) => route.safeForBattery,
    );

    const feasibleRoutes = scoredRoutes.filter((route) => route.feasible);

    let candidates;
    let recommendationLevel;

    if (batterySafeRoutes.length > 0) {
      candidates = batterySafeRoutes;

      recommendationLevel = "BATTERY_SAFE";
    } else if (feasibleRoutes.length > 0) {
      candidates = feasibleRoutes;

      recommendationLevel = "LOW_RESERVE";
    } else {
      candidates = scoredRoutes;

      recommendationLevel = "NO_FEASIBLE_ROUTE";
    }

    // ==================================================
    // FIND LOWEST SCORE
    // ==================================================

    let bestRoute = candidates[0];

    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].finalScore < bestRoute.finalScore) {
        bestRoute = candidates[i];
      }
    }

    const bestRouteArrayIndex = scoredRoutes.findIndex(
      (route) => route.routeIndex === bestRoute.routeIndex,
    );

    if (bestRouteArrayIndex >= 0) {
      scoredRoutes[bestRouteArrayIndex].recommended = true;
    }

    // ==================================================
    // RECOMMENDATION MESSAGE
    // ==================================================

    let recommendationMessage;

    if (recommendationLevel === "BATTERY_SAFE") {
      recommendationMessage =
        "Recommended route is physically feasible and maintains the configured battery reserve.";
    } else if (recommendationLevel === "LOW_RESERVE") {
      recommendationMessage =
        "No route maintains the configured battery reserve. The recommended route is physically feasible but arrives below the preferred reserve level.";
    } else {
      recommendationMessage =
        "Current battery energy is insufficient for all returned routes.";
    }

    return {
      success: true,

      message:
        "Speed- and traffic-aware battery routes calculated successfully",

      data: {
        validationMode:
          batteryDataSource === "validation-test" ||
          weightSource === "validation-test",

        batterySource: batteryDataSource,

        weightSource,

        battery: {
          batteryId,

          soc: Number(soc.toFixed(2)),

          soh: Number(soh.toFixed(6)),

          sohPercent: Number(sohPercent.toFixed(2)),

          routingBatteryCapacityKWh: batteryCapacityKWh,

          nominalBatteryWh: Number(nominalBatteryWh.toFixed(2)),

          effectiveBatteryWh: Number(effectiveBatteryWh.toFixed(2)),

          availableBatteryWh: Number(availableBatteryWh.toFixed(2)),

          minimumReserveSoc: EV_MIN_RESERVE_SOC,
        },

        realBatteryValues: {
          soc: Number(realSoc.toFixed(2)),

          soh: Number(realSoh.toFixed(6)),

          sohPercent: Number((realSoh * 100).toFixed(2)),
        },

        scoring: {
          timeWeight: activeTimeWeight,

          energyWeight: activeEnergyWeight,

          batteryWeight: activeBatteryWeight,

          weightSource,

          energyModel: "speed-dependent-piecewise",

          auxiliaryPowerW: AUXILIARY_POWER_W,

          normalizationMethod: "relative-to-best",

          batteryStressComponents: {
            depletionWeight: STRESS_DEPLETION_WEIGHT,

            reserveWeight: STRESS_RESERVE_WEIGHT,

            healthWeight: STRESS_HEALTH_WEIGHT,

            trafficWeight: STRESS_TRAFFIC_WEIGHT,
          },

          note: "Energy-rate values and battery-stress component weights are GreenMile prototype calibration values. Battery stress is not directly measured degradation.",
        },

        recommendationLevel,

        recommendationMessage,

        recommendedRouteIndex: bestRoute.routeIndex,

        routes: scoredRoutes,
      },
    };
}

export { clamp, TIME_WEIGHT, ENERGY_WEIGHT, BATTERY_WEIGHT };

// ======================================================
// GREENMILE FROZEN BATTERY-AWARE ROUTE VALIDATION
// ======================================================
//
// PURPOSE
//
// 1. Fetch each origin-destination route pair ONLY ONCE.
// 2. Freeze distance, duration, traffic, energy, etc.
// 3. Recalculate GreenMile route scores locally for
//    multiple battery SoC / SoH conditions.
//
// TOTAL GOOGLE ROUTE REQUESTS:
// 5 route pairs = only 5 requests
//
// LOCAL BATTERY TESTS:
// 5 route pairs × 4 battery conditions = 20 tests
//
// This avoids:
// - excessive Google requests
// - HTTP 429 problems
// - traffic changing between battery-condition tests
//
// ======================================================

const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// GREENMILE ROUTE WEIGHTS
// ======================================================

const ROUTE_WEIGHTS = {
  time: 0.3,
  energy: 0.3,
  battery: 0.4,
};

// ======================================================
// BATTERY-STRESS COMPONENT WEIGHTS
// ======================================================
//
// Must match routeRoutes.js
//
// 40% depletion
// 25% reserve penalty
// 20% health-adjusted load
// 15% traffic stress
//
// ======================================================

const STRESS_WEIGHTS = {
  depletion: 0.4,
  reserve: 0.25,
  health: 0.2,
  traffic: 0.15,
};

// ======================================================
// FALLBACK ROUTING CONFIGURATION
// ======================================================
//
// Normally values are read from the first API response.
//
// These are only fallback values.
//
// ======================================================

const FALLBACK_BATTERY_CAPACITY_KWH = 15;

const FALLBACK_MIN_RESERVE_SOC = 20;

// ======================================================
// BATTERY CONDITIONS
// ======================================================

const batteryScenarios = [
  {
    name: "Healthy",

    soc: 90,

    soh: 0.95,
  },

  {
    name: "Degraded",

    soc: 90,

    soh: 0.5,
  },

  {
    name: "Low SoC",

    soc: 25,

    soh: 0.95,
  },

  {
    name: "Low SoC + Degraded",

    soc: 15,

    soh: 0.5,
  },
];

// ======================================================
// ROUTE PAIRS
// ======================================================

const routePairs = [
  {
    name: "Rampura → Gulshan 1",

    origin: {
      latitude: 23.7615,
      longitude: 90.4203,
    },

    destination: {
      latitude: 23.7808,
      longitude: 90.4169,
    },
  },

  {
    name: "Rampura → Dhanmondi",

    origin: {
      latitude: 23.7615,
      longitude: 90.4203,
    },

    destination: {
      latitude: 23.7461,
      longitude: 90.3742,
    },
  },

  {
    name: "Badda → Uttara",

    origin: {
      latitude: 23.7806,
      longitude: 90.4255,
    },

    destination: {
      latitude: 23.8759,
      longitude: 90.3795,
    },
  },

  {
    name: "Mirpur 10 → Motijheel",

    origin: {
      latitude: 23.8069,
      longitude: 90.3687,
    },

    destination: {
      latitude: 23.7334,
      longitude: 90.4176,
    },
  },

  {
    name: "Mohakhali → Bashundhara",

    origin: {
      latitude: 23.7787,
      longitude: 90.3987,
    },

    destination: {
      latitude: 23.8151,
      longitude: 90.4255,
    },
  },
];

// ======================================================
// REQUEST CONTROL
// ======================================================
//
// Only five requests are made, but we still add delays
// and retries to reduce HTTP 429 risk.
//
// ======================================================

const REQUEST_DELAY_MS = 3000;

const MAX_RETRIES = 4;

// ======================================================
// GENERAL HELPERS
// ======================================================

const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

// ======================================================
// FETCH ONE FROZEN ROUTE PAIR
// ======================================================
//
// IMPORTANT:
//
// This API call is used only to obtain the physical
// candidate routes:
//
// - distance
// - duration
// - static duration
// - traffic
// - energy
// - time score
// - energy score
//
// We use a healthy battery during this initial request.
// Battery-dependent values are recalculated locally.
//
// ======================================================

const callRouteApi = async (routePair) => {
  const response = await fetch(API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      ...(process.env.GREENMILE_RESEARCH_TOKEN ? { Authorization: `Bearer ${process.env.GREENMILE_RESEARCH_TOKEN}` } : {}),
    },

    body: JSON.stringify({
      batteryId,

      origin: routePair.origin,

      destination: routePair.destination,

      // ---------------------------------------
      // Used only for initial route retrieval.
      // ---------------------------------------

      testBattery: {
        soc: 90,
        soh: 0.95,
      },

      testWeights: {
        time: ROUTE_WEIGHTS.time,

        energy: ROUTE_WEIGHTS.energy,

        battery: ROUTE_WEIGHTS.battery,
      },
    }),
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}: Could not parse API response`);
  }

  if (!response.ok) {
    const message =
      result?.message || result?.error?.message || JSON.stringify(result);

    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  if (
    !result.data ||
    !Array.isArray(result.data.routes) ||
    result.data.routes.length === 0
  ) {
    throw new Error("No routes returned by API");
  }

  return result.data;
};

// ======================================================
// RETRY FROZEN ROUTE REQUEST
// ======================================================

const getFrozenRoutePair = async (routePair) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callRouteApi(routePair);
    } catch (error) {
      lastError = error;

      console.log(
        `  Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`,
      );

      if (attempt < MAX_RETRIES) {
        // -------------------------------------------
        // Increasing delay:
        //
        // attempt 1 -> 5 sec
        // attempt 2 -> 10 sec
        // attempt 3 -> 15 sec
        // -------------------------------------------

        const retryDelay = 5000 * attempt;

        console.log(`  Waiting ${retryDelay / 1000} seconds before retry...`);

        await sleep(retryDelay);
      }
    }
  }

  throw lastError;
};

// ======================================================
// BATTERY-AWARE ROUTE RECALCULATION
// ======================================================
//
// This reproduces the battery calculations from
// routeRoutes.js.
//
// Physical route information stays frozen.
//
// ======================================================

const recalculateRouteForBattery = ({
  route,
  batteryScenario,
  nominalBatteryWh,
  minimumReserveSoc,
}) => {
  const soc = batteryScenario.soc;

  const soh = batteryScenario.soh;

  // ====================================================
  // EFFECTIVE BATTERY CAPACITY
  // ====================================================

  const effectiveBatteryWh = nominalBatteryWh * soh;

  // ====================================================
  // AVAILABLE ENERGY AT CURRENT SOC
  // ====================================================

  const availableBatteryWh = effectiveBatteryWh * (soc / 100);

  // ====================================================
  // ROUTE ENERGY
  // ====================================================
  //
  // This came from the frozen Google route.
  //
  // Therefore distance, speed, traffic, and energy
  // remain identical for all battery-condition tests.
  //
  // ====================================================

  const estimatedEnergyWh = Number(route.estimatedEnergyWh);

  // ====================================================
  // SOC DROP
  // ====================================================

  const projectedSocDrop =
    effectiveBatteryWh > 0
      ? (estimatedEnergyWh / effectiveBatteryWh) * 100
      : 100;

  // ====================================================
  // ARRIVAL SOC
  // ====================================================

  const projectedArrivalSoc = soc - projectedSocDrop;

  // ====================================================
  // PHYSICAL FEASIBILITY
  // ====================================================

  const feasible =
    estimatedEnergyWh <= availableBatteryWh && projectedArrivalSoc >= 0;

  // ====================================================
  // RESERVE SAFETY
  // ====================================================

  const reserveSafe = projectedArrivalSoc >= minimumReserveSoc;

  const safeForBattery = feasible && reserveSafe;

  // ====================================================
  // RESERVE PENALTY
  // ====================================================

  let reservePenalty = 0;

  if (projectedArrivalSoc < minimumReserveSoc) {
    reservePenalty =
      (minimumReserveSoc - projectedArrivalSoc) / minimumReserveSoc;

    reservePenalty = clamp(reservePenalty, 0, 1);
  }

  // ====================================================
  // DEPLETION RATIO
  // ====================================================

  const depletionRatio =
    effectiveBatteryWh > 0 ? estimatedEnergyWh / effectiveBatteryWh : 1;

  // ====================================================
  // HEALTH-ADJUSTED LOAD
  // ====================================================

  const healthAdjustedLoad = clamp(
    depletionRatio * (1 / soh),

    0,
    1,
  );

  // ====================================================
  // TRAFFIC STRESS
  // ====================================================
  //
  // Traffic stress is frozen from the initial API call.
  //
  // ====================================================

  const trafficStressScore = Number(route.trafficStressScore || 0);

  // ====================================================
  // BATTERY STRESS PROXY
  // ====================================================

  const batteryStressScore = clamp(
    STRESS_WEIGHTS.depletion * clamp(depletionRatio, 0, 1) +
      STRESS_WEIGHTS.reserve * reservePenalty +
      STRESS_WEIGHTS.health * healthAdjustedLoad +
      STRESS_WEIGHTS.traffic * trafficStressScore,

    0,
    1,
  );

  // ====================================================
  // TIME / ENERGY SCORES
  // ====================================================
  //
  // These are frozen because route physical conditions
  // remain unchanged.
  //
  // ====================================================

  const timeScore = Number(route.timeScore);

  const energyScore = Number(route.energyScore);

  // ====================================================
  // FINAL GREENMILE SCORE
  // ====================================================

  let finalScore =
    ROUTE_WEIGHTS.time * timeScore +
    ROUTE_WEIGHTS.energy * energyScore +
    ROUTE_WEIGHTS.battery * batteryStressScore;

  // ====================================================
  // INFEASIBLE ROUTE PENALTY
  // ====================================================

  if (!feasible) {
    finalScore += 1;
  }

  return {
    ...route,

    // -----------------------------------------------
    // Battery condition used
    // -----------------------------------------------

    testSoc: soc,

    testSoh: soh,

    // -----------------------------------------------
    // Battery capacity
    // -----------------------------------------------

    effectiveBatteryWh: Number(effectiveBatteryWh.toFixed(2)),

    availableBatteryWh: Number(availableBatteryWh.toFixed(2)),

    // -----------------------------------------------
    // Battery outcome
    // -----------------------------------------------

    projectedSocDrop: Number(projectedSocDrop.toFixed(3)),

    projectedArrivalSoc: Number(projectedArrivalSoc.toFixed(2)),

    reservePenalty: Number(reservePenalty.toFixed(4)),

    depletionRatio: Number(depletionRatio.toFixed(6)),

    healthAdjustedLoad: Number(healthAdjustedLoad.toFixed(6)),

    batteryStressScore: Number(batteryStressScore.toFixed(4)),

    finalScore: Number(finalScore.toFixed(4)),

    feasible,

    reserveSafe,

    safeForBattery,

    recommended: false,
  };
};

// ======================================================
// CHOOSE GREENMILE ROUTE
// ======================================================
//
// Same priority as backend:
//
// 1. BATTERY_SAFE
// 2. LOW_RESERVE
// 3. NO_FEASIBLE_ROUTE
//
// Within each group:
//
// lowest GreenMile score wins.
//
// ======================================================

const chooseGreenMileRoute = (routes) => {
  const batterySafeRoutes = routes.filter((route) => route.safeForBattery);

  const feasibleRoutes = routes.filter((route) => route.feasible);

  let candidates;

  let recommendationLevel;

  if (batterySafeRoutes.length > 0) {
    candidates = batterySafeRoutes;

    recommendationLevel = "BATTERY_SAFE";
  } else if (feasibleRoutes.length > 0) {
    candidates = feasibleRoutes;

    recommendationLevel = "LOW_RESERVE";
  } else {
    candidates = routes;

    recommendationLevel = "NO_FEASIBLE_ROUTE";
  }

  let bestRoute = candidates[0];

  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].finalScore < bestRoute.finalScore) {
      bestRoute = candidates[i];
    }
  }

  return {
    bestRoute,
    recommendationLevel,
  };
};

// ======================================================
// FIND FASTEST ROUTE
// ======================================================

const findFastestRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.durationSeconds < best.durationSeconds ? route : best,
    routes[0],
  );
};

// ======================================================
// FIND LOWEST ENERGY ROUTE
// ======================================================

const findLowestEnergyRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.estimatedEnergyWh < best.estimatedEnergyWh ? route : best,
    routes[0],
  );
};

// ======================================================
// FIND LOWEST BATTERY-STRESS ROUTE
// ======================================================

const findLowestStressRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.batteryStressScore < best.batteryStressScore ? route : best,
    routes[0],
  );
};

// ======================================================
// MAIN
// ======================================================

const runValidation = async () => {
  console.log(
    "\n==============================================================",
  );

  console.log("GREENMILE FROZEN BATTERY-AWARE VALIDATION");

  console.log(
    "==============================================================\n",
  );

  console.log("Google API calls planned: 5");

  console.log("Local battery-condition evaluations planned: 20");

  console.log("\nRoute weights:");

  console.log(
    `Time=${ROUTE_WEIGHTS.time} | Energy=${ROUTE_WEIGHTS.energy} | Battery=${ROUTE_WEIGHTS.battery}\n`,
  );

  // ==================================================
  // RESULTS
  // ==================================================

  const summaryRows = [];

  const failedRoutePairs = [];

  const frozenRouteSummary = [];

  // ==================================================
  // PROCESS EACH ROUTE PAIR
  // ==================================================

  for (let pairIndex = 0; pairIndex < routePairs.length; pairIndex++) {
    const routePair = routePairs[pairIndex];

    console.log(
      `\n[${pairIndex + 1}/${routePairs.length}] Fetching frozen routes: ${routePair.name}`,
    );

    try {
      // ==============================================
      // GOOGLE/BACKEND CALL ONCE
      // ==============================================

      const data = await getFrozenRoutePair(routePair);

      const frozenRoutes = data.routes;

      console.log(`  ✓ ${frozenRoutes.length} routes frozen`);

      // ==============================================
      // READ BATTERY CONFIG FROM RESPONSE
      // ==============================================

      const routingBatteryCapacityKWh =
        Number(data.battery?.routingBatteryCapacityKWh) ||
        FALLBACK_BATTERY_CAPACITY_KWH;

      const nominalBatteryWh = routingBatteryCapacityKWh * 1000;

      const minimumReserveSoc =
        Number(data.battery?.minimumReserveSoc) || FALLBACK_MIN_RESERVE_SOC;

      // ==============================================
      // SHOW FROZEN ROUTE CHARACTERISTICS
      // ==============================================

      for (const route of frozenRoutes) {
        frozenRouteSummary.push({
          RoutePair: routePair.name,

          Route: `Route ${route.routeIndex + 1}`,

          DistanceKm: route.distanceKm,

          TimeSec: route.durationSeconds,

          AvgSpeedKmh: route.averageSpeedKmh,

          EnergyRate: route.energyRateWhPerKm,

          EnergyWh: route.estimatedEnergyWh,

          TrafficStress: route.trafficStressScore,

          TimeScore: route.timeScore,

          EnergyScore: route.energyScore,
        });
      }

      // ==============================================
      // RUN FOUR BATTERY CONDITIONS LOCALLY
      // ==============================================

      for (const batteryScenario of batteryScenarios) {
        const recalculatedRoutes = frozenRoutes.map((route) =>
          recalculateRouteForBattery({
            route,

            batteryScenario,

            nominalBatteryWh,

            minimumReserveSoc,
          }),
        );

        // ============================================
        // BASELINES
        // ============================================

        const fastest = findFastestRoute(recalculatedRoutes);

        const lowestEnergy = findLowestEnergyRoute(recalculatedRoutes);

        const lowestStress = findLowestStressRoute(recalculatedRoutes);

        // ============================================
        // GREENMILE
        // ============================================

        const { bestRoute, recommendationLevel } =
          chooseGreenMileRoute(recalculatedRoutes);

        // ============================================
        // RESULT
        // ============================================

        summaryRows.push({
          RoutePair: routePair.name,

          BatteryCondition: batteryScenario.name,

          SoC: `${batteryScenario.soc}%`,

          SoH: `${(batteryScenario.soh * 100).toFixed(0)}%`,

          FastestRoute: `Route ${fastest.routeIndex + 1}`,

          GreenMileRoute: `Route ${bestRoute.routeIndex + 1}`,

          LowestEnergy: `Route ${lowestEnergy.routeIndex + 1}`,

          LowestStress: `Route ${lowestStress.routeIndex + 1}`,

          SameAsFastest: bestRoute.routeIndex === fastest.routeIndex,

          SameAsLowestEnergy: bestRoute.routeIndex === lowestEnergy.routeIndex,

          SameAsLowestStress: bestRoute.routeIndex === lowestStress.routeIndex,

          DistanceKm: bestRoute.distanceKm,

          TravelTimeSec: bestRoute.durationSeconds,

          EnergyWh: bestRoute.estimatedEnergyWh,

          ArrivalSoC: bestRoute.projectedArrivalSoc,

          TrafficStress: bestRoute.trafficStressScore,

          BatteryStress: bestRoute.batteryStressScore,

          FinalScore: bestRoute.finalScore,

          Feasible: bestRoute.feasible,

          ReserveSafe: bestRoute.reserveSafe,

          Recommendation: recommendationLevel,
        });
      }
    } catch (error) {
      console.error(`  ✗ FAILED: ${error.message}`);

      failedRoutePairs.push({
        RoutePair: routePair.name,

        Error: error.message,
      });
    }

    // =================================================
    // WAIT BEFORE NEXT GOOGLE REQUEST
    // =================================================

    if (pairIndex < routePairs.length - 1) {
      console.log(
        `  Waiting ${REQUEST_DELAY_MS / 1000} seconds before next Google request...`,
      );

      await sleep(REQUEST_DELAY_MS);
    }
  }

  // ==================================================
  // GOOGLE REQUEST EXECUTION SUMMARY
  // ==================================================

  console.log(
    "\n==============================================================",
  );

  console.log("FROZEN ROUTE FETCH SUMMARY");

  console.log(
    "==============================================================\n",
  );

  const successfulRoutePairs = routePairs.length - failedRoutePairs.length;

  console.table([
    {
      PlannedGoogleCalls: routePairs.length,

      SuccessfulRoutePairs: successfulRoutePairs,

      FailedRoutePairs: failedRoutePairs.length,

      LocalBatteryTests: summaryRows.length,
    },
  ]);

  // ==================================================
  // FAILED ROUTE PAIRS
  // ==================================================

  if (failedRoutePairs.length > 0) {
    console.log(
      "\n==============================================================",
    );

    console.log("FAILED ROUTE PAIRS");

    console.log(
      "==============================================================\n",
    );

    console.table(failedRoutePairs);
  }

  // ==================================================
  // FROZEN PHYSICAL ROUTES
  // ==================================================

  console.log(
    "\n==============================================================",
  );

  console.log("FROZEN ROUTE CHARACTERISTICS");

  console.log(
    "==============================================================\n",
  );

  console.table(frozenRouteSummary);

  // ==================================================
  // FULL 20-TEST TABLE
  // ==================================================

  console.log(
    "\n==============================================================",
  );

  console.log("FROZEN BATTERY-AWARE VALIDATION SUMMARY");

  console.log(
    "==============================================================\n",
  );

  console.table(summaryRows);

  // ==================================================
  // BATTERY CONDITION SUMMARY
  // ==================================================

  const batterySummary = batteryScenarios.map((scenario) => {
    const rows = summaryRows.filter(
      (row) => row.BatteryCondition === scenario.name,
    );

    const differentFromFastest = rows.filter(
      (row) => row.SameAsFastest === false,
    ).length;

    const lowestEnergyMatches = rows.filter(
      (row) => row.SameAsLowestEnergy === true,
    ).length;

    const lowestStressMatches = rows.filter(
      (row) => row.SameAsLowestStress === true,
    ).length;

    const lowReserveCases = rows.filter(
      (row) => row.Recommendation === "LOW_RESERVE",
    ).length;

    const noFeasibleCases = rows.filter(
      (row) => row.Recommendation === "NO_FEASIBLE_ROUTE",
    ).length;

    const averageStress =
      rows.length > 0
        ? rows.reduce((total, row) => total + Number(row.BatteryStress), 0) /
          rows.length
        : 0;

    const averageArrivalSoc =
      rows.length > 0
        ? rows.reduce((total, row) => total + Number(row.ArrivalSoC), 0) /
          rows.length
        : 0;

    return {
      BatteryCondition: scenario.name,

      Tests: rows.length,

      DifferentFromFastest: differentFromFastest,

      LowestEnergyMatches: lowestEnergyMatches,

      LowestStressMatches: lowestStressMatches,

      LowReserveCases: lowReserveCases,

      NoFeasibleCases: noFeasibleCases,

      AverageArrivalSoC: Number(averageArrivalSoc.toFixed(2)),

      AverageBatteryStress: Number(averageStress.toFixed(4)),
    };
  });

  console.log(
    "\n==============================================================",
  );

  console.log("BATTERY CONDITION SUMMARY");

  console.log(
    "==============================================================\n",
  );

  console.table(batterySummary);

  // ==================================================
  // OVERALL BASELINE COMPARISON
  // ==================================================

  const fastestMatches = summaryRows.filter(
    (row) => row.SameAsFastest === true,
  ).length;

  const energyMatches = summaryRows.filter(
    (row) => row.SameAsLowestEnergy === true,
  ).length;

  const stressMatches = summaryRows.filter(
    (row) => row.SameAsLowestStress === true,
  ).length;

  console.log(
    "\n==============================================================",
  );

  console.log("OVERALL BASELINE COMPARISON");

  console.log(
    "==============================================================\n",
  );

  console.table([
    {
      Comparison: "GreenMile = Fastest",

      Matches: fastestMatches,

      Total: summaryRows.length,

      Percentage:
        summaryRows.length > 0
          ? `${((fastestMatches / summaryRows.length) * 100).toFixed(1)}%`
          : "N/A",
    },

    {
      Comparison: "GreenMile = Lowest Energy",

      Matches: energyMatches,

      Total: summaryRows.length,

      Percentage:
        summaryRows.length > 0
          ? `${((energyMatches / summaryRows.length) * 100).toFixed(1)}%`
          : "N/A",
    },

    {
      Comparison: "GreenMile = Lowest Battery Stress",

      Matches: stressMatches,

      Total: summaryRows.length,

      Percentage:
        summaryRows.length > 0
          ? `${((stressMatches / summaryRows.length) * 100).toFixed(1)}%`
          : "N/A",
    },
  ]);

  // ==================================================
  // CASES WHERE GREENMILE != FASTEST
  // ==================================================

  const differentFromFastest = summaryRows.filter(
    (row) => row.SameAsFastest === false,
  );

  console.log(
    "\n==============================================================",
  );

  console.log("CASES WHERE GREENMILE DID NOT CHOOSE FASTEST");

  console.log(
    "==============================================================\n",
  );

  if (differentFromFastest.length === 0) {
    console.log(
      "GreenMile selected the fastest route in every frozen test case.",
    );
  } else {
    console.table(
      differentFromFastest.map((row) => ({
        RoutePair: row.RoutePair,

        BatteryCondition: row.BatteryCondition,

        Fastest: row.FastestRoute,

        GreenMile: row.GreenMileRoute,

        LowestEnergy: row.LowestEnergy,

        LowestStress: row.LowestStress,

        ArrivalSoC: row.ArrivalSoC,

        BatteryStress: row.BatteryStress,

        FinalScore: row.FinalScore,

        Recommendation: row.Recommendation,
      })),
    );
  }

  // ==================================================
  // SAFETY-CRITICAL CASES
  // ==================================================

  const safetyCases = summaryRows.filter(
    (row) =>
      row.Recommendation === "LOW_RESERVE" ||
      row.Recommendation === "NO_FEASIBLE_ROUTE",
  );

  console.log(
    "\n==============================================================",
  );

  console.log("BATTERY SAFETY CASES");

  console.log(
    "==============================================================\n",
  );

  if (safetyCases.length === 0) {
    console.log("No low-reserve or infeasible cases detected.");
  } else {
    console.table(
      safetyCases.map((row) => ({
        RoutePair: row.RoutePair,

        BatteryCondition: row.BatteryCondition,

        GreenMileRoute: row.GreenMileRoute,

        ArrivalSoC: row.ArrivalSoC,

        BatteryStress: row.BatteryStress,

        Feasible: row.Feasible,

        ReserveSafe: row.ReserveSafe,

        Recommendation: row.Recommendation,
      })),
    );
  }

  console.log(
    "\n==============================================================",
  );

  console.log("VALIDATION COMPLETE");

  console.log(
    "==============================================================\n",
  );
};

// ======================================================
// RUN
// ======================================================

runValidation();

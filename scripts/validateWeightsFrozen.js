// ======================================================
// GREENMILE FROZEN-ROUTE WEIGHT SENSITIVITY TEST
// ======================================================
//
// PURPOSE:
//
// 1. Call Google/GreenMile route API only ONCE.
// 2. Freeze the returned route data.
// 3. Recalculate all weight combinations locally.
//
// This makes the weight comparison scientifically cleaner
// because distance, duration, energy, and battery stress
// stay exactly the same for every scenario.
//
// ======================================================

const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// TEST ROUTE
// ======================================================

const origin = {
  latitude: 23.7615,
  longitude: 90.4203,
};

const destination = {
  latitude: 23.7808,
  longitude: 90.4169,
};

// ======================================================
// FIXED BATTERY CONDITION
// ======================================================

const testBattery = {
  soc: 50,
  soh: 0.8,
};

// ======================================================
// WEIGHT SCENARIOS
// ======================================================

const scenarios = [
  {
    name: "Current GreenMile",
    time: 0.3,
    energy: 0.3,
    battery: 0.4,
  },

  {
    name: "Balanced",
    time: 0.33,
    energy: 0.33,
    battery: 0.34,
  },

  {
    name: "Time Focused",
    time: 0.5,
    energy: 0.25,
    battery: 0.25,
  },

  {
    name: "Energy Focused",
    time: 0.25,
    energy: 0.5,
    battery: 0.25,
  },

  {
    name: "Battery Focused",
    time: 0.2,
    energy: 0.2,
    battery: 0.6,
  },

  {
    name: "Strong Battery Focus",
    time: 0.15,
    energy: 0.15,
    battery: 0.7,
  },
];

// ======================================================
// GET FROZEN ROUTES
// ======================================================

const getFrozenRoutes = async () => {
  const response = await fetch(API_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      ...(process.env.GREENMILE_RESEARCH_TOKEN ? { Authorization: `Bearer ${process.env.GREENMILE_RESEARCH_TOKEN}` } : {}),
    },

    body: JSON.stringify({
      batteryId,

      origin,

      destination,

      testBattery,

      // Only used to make the API accept the request.
      // We recalculate all scores locally afterward.
      testWeights: {
        time: 0.3,
        energy: 0.3,
        battery: 0.4,
      },
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Failed to load routes");
  }

  return result.data;
};

// ======================================================
// CALCULATE SCORE
// ======================================================

const calculateScore = (route, weights) => {
  let score =
    weights.time * route.timeScore +
    weights.energy * route.energyScore +
    weights.battery * route.batteryStressScore;

  // Same infeasible-route penalty used by backend
  if (!route.feasible) {
    score += 1;
  }

  return Number(score.toFixed(4));
};

// ======================================================
// CHOOSE ROUTE USING SAME GREENMILE PRIORITY
// ======================================================

const selectRecommendedRoute = (routes, weights) => {
  const scored = routes.map((route) => ({
    ...route,

    sensitivityScore: calculateScore(route, weights),
  }));

  // Priority 1:
  // feasible + reserve safe
  const batterySafe = scored.filter((route) => route.safeForBattery);

  // Priority 2:
  // physically feasible
  const feasible = scored.filter((route) => route.feasible);

  let candidates;
  let recommendationLevel;

  if (batterySafe.length > 0) {
    candidates = batterySafe;

    recommendationLevel = "BATTERY_SAFE";
  } else if (feasible.length > 0) {
    candidates = feasible;

    recommendationLevel = "LOW_RESERVE";
  } else {
    candidates = scored;

    recommendationLevel = "NO_FEASIBLE_ROUTE";
  }

  let best = candidates[0];

  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].sensitivityScore < best.sensitivityScore) {
      best = candidates[i];
    }
  }

  return {
    best,
    recommendationLevel,
    allRoutes: scored,
  };
};

// ======================================================
// MAIN
// ======================================================

const run = async () => {
  try {
    console.log("\n==============================================");

    console.log("GREENMILE FROZEN-ROUTE SENSITIVITY TEST");

    console.log("==============================================\n");

    console.log(
      `Battery: SoC=${testBattery.soc}% | SoH=${testBattery.soh * 100}%`,
    );

    console.log("\nFetching route data ONCE...\n");

    const data = await getFrozenRoutes();

    const routes = data.routes;

    console.log("Frozen route measurements:\n");

    console.table(
      routes.map((route) => ({
        Route: `Route ${route.routeIndex + 1}`,

        DistanceKm: route.distanceKm,

        DurationSeconds: route.durationSeconds,

        EnergyWh: route.estimatedEnergyWh,

        TimeScore: route.timeScore,

        EnergyScore: route.energyScore,

        BatteryStress: route.batteryStressScore,

        ArrivalSoC: route.projectedArrivalSoc,

        BatterySafe: route.safeForBattery,
      })),
    );

    const summary = [];

    for (const scenario of scenarios) {
      const result = selectRecommendedRoute(routes, scenario);

      const best = result.best;

      summary.push({
        Scenario: scenario.name,

        TimeWeight: scenario.time,

        EnergyWeight: scenario.energy,

        BatteryWeight: scenario.battery,

        RecommendedRoute: `Route ${best.routeIndex + 1}`,

        TimeScore: best.timeScore,

        EnergyScore: best.energyScore,

        BatteryStress: best.batteryStressScore,

        FinalScore: best.sensitivityScore,

        Recommendation: result.recommendationLevel,
      });
    }

    console.log("\n==============================================");

    console.log("FROZEN WEIGHT SENSITIVITY SUMMARY");

    console.log("==============================================\n");

    console.table(summary);

    // ==================================================
    // STABILITY SUMMARY
    // ==================================================

    const routeCounts = {};

    for (const row of summary) {
      routeCounts[row.RecommendedRoute] =
        (routeCounts[row.RecommendedRoute] || 0) + 1;
    }

    console.log("\n==============================================");

    console.log("ROUTE SELECTION STABILITY");

    console.log("==============================================\n");

    console.table(
      Object.entries(routeCounts).map(([route, count]) => ({
        Route: route,

        Selected: count,

        TotalTests: scenarios.length,

        Percentage: `${((count / scenarios.length) * 100).toFixed(1)}%`,
      })),
    );

    console.log("\nSensitivity validation complete.\n");
  } catch (error) {
    console.error("Sensitivity test failed:", error.message);
  }
};

run();

// ======================================================
// GREENMILE BATTERY-AWARE ROUTE VALIDATION
// WITH DELAY + RETRY
// ======================================================

const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// GREENMILE WEIGHTS
// ======================================================

const testWeights = {
  time: 0.3,
  energy: 0.3,
  battery: 0.4,
};

// ======================================================
// DELAY SETTINGS
// ======================================================
//
// Wait between API calls so we do not send 20 expensive
// traffic-aware requests immediately.
//
// ======================================================

const REQUEST_DELAY_MS = 2000;

const MAX_RETRIES = 3;

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
// DELAY
// ======================================================

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

// ======================================================
// API CALL
// ======================================================

const callRouteApi = async (routePair, batteryScenario) => {
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

      testBattery: {
        soc: batteryScenario.soc,

        soh: batteryScenario.soh,
      },

      testWeights,
    }),
  });

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}: Invalid JSON response`);
  }

  if (!response.ok) {
    const apiMessage =
      result?.message || result?.error?.message || JSON.stringify(result);

    throw new Error(`HTTP ${response.status}: ${apiMessage}`);
  }

  return result.data;
};

// ======================================================
// RETRY WRAPPER
// ======================================================

const getRoutes = async (routePair, batteryScenario) => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callRouteApi(routePair, batteryScenario);
    } catch (error) {
      lastError = error;

      console.log(
        `  Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`,
      );

      if (attempt < MAX_RETRIES) {
        const retryDelay = REQUEST_DELAY_MS * attempt;

        console.log(`  Waiting ${retryDelay} ms before retry...`);

        await sleep(retryDelay);
      }
    }
  }

  throw lastError;
};

// ======================================================
// ROUTE HELPERS
// ======================================================

const findFastestRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.durationSeconds < best.durationSeconds ? route : best,
    routes[0],
  );
};

const findLowestEnergyRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.estimatedEnergyWh < best.estimatedEnergyWh ? route : best,
    routes[0],
  );
};

const findLowestStressRoute = (routes) => {
  return routes.reduce(
    (best, route) =>
      route.batteryStressScore < best.batteryStressScore ? route : best,
    routes[0],
  );
};

const findRecommendedRoute = (routes) => {
  return routes.find((route) => route.recommended);
};

// ======================================================
// MAIN VALIDATION
// ======================================================

const runValidation = async () => {
  console.log(
    "\n==============================================================",
  );

  console.log("GREENMILE BATTERY-AWARE ROUTE VALIDATION");

  console.log(
    "==============================================================\n",
  );

  console.log(
    `Total planned tests: ${routePairs.length * batteryScenarios.length}`,
  );

  console.log(`Delay between tests: ${REQUEST_DELAY_MS} ms`);

  console.log(`Maximum retries: ${MAX_RETRIES}\n`);

  const summaryRows = [];

  const failedRows = [];

  let testNumber = 0;

  const totalTests = routePairs.length * batteryScenarios.length;

  for (const routePair of routePairs) {
    for (const batteryScenario of batteryScenarios) {
      testNumber++;

      console.log(
        `\n[${testNumber}/${totalTests}] ${routePair.name} | ${batteryScenario.name}`,
      );

      try {
        const data = await getRoutes(routePair, batteryScenario);

        const routes = data.routes;

        if (!routes || routes.length === 0) {
          throw new Error("No routes returned");
        }

        const fastest = findFastestRoute(routes);

        const lowestEnergy = findLowestEnergyRoute(routes);

        const lowestStress = findLowestStressRoute(routes);

        const recommended = findRecommendedRoute(routes);

        if (!recommended) {
          throw new Error("No recommended route returned");
        }

        summaryRows.push({
          RoutePair: routePair.name,

          BatteryCondition: batteryScenario.name,

          SoC: `${batteryScenario.soc}%`,

          SoH: `${(batteryScenario.soh * 100).toFixed(0)}%`,

          FastestRoute: `Route ${fastest.routeIndex + 1}`,

          GreenMileRoute: `Route ${recommended.routeIndex + 1}`,

          SameAsFastest: recommended.routeIndex === fastest.routeIndex,

          SameAsLowestEnergy:
            recommended.routeIndex === lowestEnergy.routeIndex,

          SameAsLowestStress:
            recommended.routeIndex === lowestStress.routeIndex,

          ArrivalSoC: `${recommended.projectedArrivalSoc}%`,

          EnergyWh: recommended.estimatedEnergyWh,

          EnergyRate: recommended.energyRateWhPerKm,

          TrafficStress: recommended.trafficStressScore,

          BatteryStress: recommended.batteryStressScore,

          FinalScore: recommended.finalScore,

          SafeForBattery: recommended.safeForBattery,

          Recommendation: data.recommendationLevel,
        });

        console.log(
          `  ✓ GreenMile Route ${
            recommended.routeIndex + 1
          } | ${data.recommendationLevel}`,
        );
      } catch (error) {
        console.error(`  ✗ FAILED: ${error.message}`);

        failedRows.push({
          RoutePair: routePair.name,

          BatteryCondition: batteryScenario.name,

          Error: error.message,
        });
      }

      // -----------------------------------------------
      // WAIT BEFORE NEXT TEST
      // -----------------------------------------------

      if (testNumber < totalTests) {
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }

  // ==================================================
  // SUCCESS / FAILURE SUMMARY
  // ==================================================

  console.log(
    "\n==============================================================",
  );

  console.log("EXECUTION SUMMARY");

  console.log(
    "==============================================================\n",
  );

  console.table([
    {
      Planned: totalTests,

      Successful: summaryRows.length,

      Failed: failedRows.length,

      SuccessRate: `${((summaryRows.length / totalTests) * 100).toFixed(1)}%`,
    },
  ]);

  // ==================================================
  // FAILED TESTS
  // ==================================================

  if (failedRows.length > 0) {
    console.log(
      "\n==============================================================",
    );

    console.log("FAILED TESTS");

    console.log(
      "==============================================================\n",
    );

    console.table(failedRows);
  }

  // ==================================================
  // FULL SUCCESSFUL RESULTS
  // ==================================================

  console.log(
    "\n==============================================================",
  );

  console.log("BATTERY-AWARE VALIDATION SUMMARY");

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

    const different = rows.filter((row) => row.SameAsFastest === false).length;

    const lowReserve = rows.filter(
      (row) => row.Recommendation === "LOW_RESERVE",
    ).length;

    const noFeasible = rows.filter(
      (row) => row.Recommendation === "NO_FEASIBLE_ROUTE",
    ).length;

    const averageStress =
      rows.length > 0
        ? rows.reduce((total, row) => total + Number(row.BatteryStress), 0) /
          rows.length
        : 0;

    return {
      BatteryCondition: scenario.name,

      Tests: rows.length,

      DifferentFromFastest: different,

      LowReserveCases: lowReserve,

      NoFeasibleCases: noFeasible,

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
  // OVERALL BASELINE
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

      Percentage: summaryRows.length
        ? `${((fastestMatches / summaryRows.length) * 100).toFixed(1)}%`
        : "N/A",
    },

    {
      Comparison: "GreenMile = Lowest Energy",

      Matches: energyMatches,

      Total: summaryRows.length,

      Percentage: summaryRows.length
        ? `${((energyMatches / summaryRows.length) * 100).toFixed(1)}%`
        : "N/A",
    },

    {
      Comparison: "GreenMile = Lowest Battery Stress",

      Matches: stressMatches,

      Total: summaryRows.length,

      Percentage: summaryRows.length
        ? `${((stressMatches / summaryRows.length) * 100).toFixed(1)}%`
        : "N/A",
    },
  ]);

  console.log("\nValidation finished.\n");
};

// ======================================================
// RUN
// ======================================================

runValidation();

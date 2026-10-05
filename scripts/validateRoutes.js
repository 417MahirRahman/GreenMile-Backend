// ======================================================
// GreenMile Route Validation Script
// ======================================================
//
// Purpose:
// Automatically test the route optimizer under
// different SoC and SoH conditions.
//
// IMPORTANT:
// This script does NOT modify the battery database.
// It uses the testBattery validation mode.
//
// ======================================================

const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

// ======================================================
// FIXED TEST ROUTE
// ======================================================

const origin = {
  latitude: 23.7615,
  longitude: 90.4203,
};

const destination = {
  latitude: 23.7808,
  longitude: 90.4169,
};

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// VALIDATION SCENARIOS
// ======================================================

const scenarios = [
  {
    name: "Healthy Battery",
    soc: 90,
    soh: 0.95,
  },

  {
    name: "Degraded Battery",
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

  {
    name: "Very Low SoC",
    soc: 8,
    soh: 0.5,
  },
];

// ======================================================
// CALL ROUTE API
// ======================================================

const testScenario = async (scenario) => {
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

      testBattery: {
        soc: scenario.soc,

        soh: scenario.soh,
      },
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Route API failed");
  }

  return result;
};

// ======================================================
// MAIN VALIDATION
// ======================================================

const runValidation = async () => {
  console.log("\n==============================================");

  console.log("GREENMILE ROUTE VALIDATION");

  console.log("==============================================\n");

  const summaryRows = [];

  for (const scenario of scenarios) {
    try {
      console.log(`Testing: ${scenario.name}`);

      const result = await testScenario(scenario);

      const data = result.data;

      const recommendedRoute = data.routes.find((route) => route.recommended);

      console.log(`Recommendation Level: ${data.recommendationLevel}`);

      console.log(
        `Recommended Route: ${
          recommendedRoute ? recommendedRoute.routeIndex + 1 : "N/A"
        }`,
      );

      if (recommendedRoute) {
        console.log(`Arrival SoC: ${recommendedRoute.projectedArrivalSoc}%`);

        console.log(`Battery Stress: ${recommendedRoute.batteryStressScore}`);

        console.log(`GreenMile Score: ${recommendedRoute.finalScore}`);

        console.log(`Feasible: ${recommendedRoute.feasible}`);

        console.log(`Reserve Safe: ${recommendedRoute.reserveSafe}`);

        console.log(`Battery Safe: ${recommendedRoute.safeForBattery}`);
      }

      console.log("----------------------------------------------");

      summaryRows.push({
        Scenario: scenario.name,

        SoC: `${scenario.soc}%`,

        SoH: `${(scenario.soh * 100).toFixed(0)}%`,

        RecommendedRoute: recommendedRoute
          ? `Route ${recommendedRoute.routeIndex + 1}`
          : "N/A",

        ArrivalSoC: recommendedRoute
          ? `${recommendedRoute.projectedArrivalSoc}%`
          : "N/A",

        BatteryStress: recommendedRoute
          ? recommendedRoute.batteryStressScore
          : "N/A",

        FinalScore: recommendedRoute ? recommendedRoute.finalScore : "N/A",

        Feasible: recommendedRoute ? recommendedRoute.feasible : false,

        ReserveSafe: recommendedRoute ? recommendedRoute.reserveSafe : false,

        Recommendation: data.recommendationLevel,
      });
    } catch (error) {
      console.error(`Failed: ${scenario.name}`);

      console.error(error.message);

      console.log("----------------------------------------------");
    }
  }

  // ==================================================
  // SUMMARY TABLE
  // ==================================================

  console.log("\n\n==============================================");

  console.log("VALIDATION SUMMARY");

  console.log("==============================================\n");

  console.table(summaryRows);

  console.log("\nValidation finished.\n");
};

// ======================================================
// RUN
// ======================================================

runValidation();

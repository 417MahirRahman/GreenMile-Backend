const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// FIXED ROUTE
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
//
// Only weights should change during this test.
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
// CALL ROUTE API
// ======================================================

const runScenario = async (scenario) => {
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

      testWeights: {
        time: scenario.time,

        energy: scenario.energy,

        battery: scenario.battery,
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
// MAIN TEST
// ======================================================

const runSensitivityTest = async () => {
  console.log("\n==============================================");

  console.log("GREENMILE WEIGHT SENSITIVITY TEST");

  console.log("==============================================\n");

  console.log(
    `Fixed battery: SoC=${testBattery.soc}% | SoH=${testBattery.soh * 100}%`,
  );

  console.log("");

  const summaryRows = [];

  for (const scenario of scenarios) {
    try {
      console.log(`Testing: ${scenario.name}`);

      const result = await runScenario(scenario);

      const data = result.data;

      const recommendedRoute = data.routes.find((route) => route.recommended);

      if (!recommendedRoute) {
        throw new Error("No recommended route returned");
      }

      console.log(
        `Weights: ${scenario.time} / ${scenario.energy} / ${scenario.battery}`,
      );

      console.log(
        `Recommended Route: Route ${recommendedRoute.routeIndex + 1}`,
      );

      console.log(`Time Score: ${recommendedRoute.timeScore}`);

      console.log(`Energy Score: ${recommendedRoute.energyScore}`);

      console.log(`Battery Stress: ${recommendedRoute.batteryStressScore}`);

      console.log(`Final Score: ${recommendedRoute.finalScore}`);

      console.log(`Recommendation: ${data.recommendationLevel}`);

      console.log("----------------------------------------------");

      summaryRows.push({
        Scenario: scenario.name,

        TimeWeight: scenario.time,

        EnergyWeight: scenario.energy,

        BatteryWeight: scenario.battery,

        RecommendedRoute: `Route ${recommendedRoute.routeIndex + 1}`,

        TimeScore: recommendedRoute.timeScore,

        EnergyScore: recommendedRoute.energyScore,

        BatteryStress: recommendedRoute.batteryStressScore,

        FinalScore: recommendedRoute.finalScore,

        Recommendation: data.recommendationLevel,
      });
    } catch (error) {
      console.error(`Failed: ${scenario.name}`);

      console.error(error.message);

      console.log("----------------------------------------------");
    }
  }

  // ==================================================
  // TABLE
  // ==================================================

  console.log("\n==============================================");

  console.log("WEIGHT SENSITIVITY SUMMARY");

  console.log("==============================================\n");

  console.table(summaryRows);

  console.log("\nSensitivity test finished.\n");
};

// ======================================================
// RUN
// ======================================================

runSensitivityTest();

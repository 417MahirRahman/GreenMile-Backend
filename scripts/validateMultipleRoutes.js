// ======================================================
// GREENMILE MULTIPLE ROUTE-PAIR VALIDATION
// ======================================================
//
// PURPOSE:
//
// Test GreenMile on several origin-destination pairs
// using the same battery condition and the same scoring
// weights.
//
// This helps show whether GreenMile consistently chooses
// routes based on time + energy + battery stress.
//
// ======================================================

const API_URL = process.env.GREENMILE_ROUTE_API_URL || "http://localhost:5000/api/routes";

const batteryId = process.env.GREENMILE_RESEARCH_BATTERY_ID || "battery-001";

// ======================================================
// FIXED TEST BATTERY
// ======================================================
//
// Keep the battery condition fixed so route differences
// come from the routes, not from battery changes.
//
// ======================================================

const testBattery = {
  soc: 50,
  soh: 0.8,
};

// ======================================================
// GREENMILE WEIGHTS
// ======================================================

const testWeights = {
  time: 0.3,
  energy: 0.3,
  battery: 0.4,
};

// ======================================================
// ROUTE PAIRS
// ======================================================
//
// Coordinates are approximate Dhaka test points.
// You can replace them later with your preferred points.
//
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
// API CALL
// ======================================================

const getRoutes = async (routePair) => {
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

      testBattery,

      testWeights,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Route API failed");
  }

  return result.data;
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
// FIND RECOMMENDED ROUTE
// ======================================================

const findRecommendedRoute = (routes) => {
  return routes.find((route) => route.recommended);
};

// ======================================================
// MAIN TEST
// ======================================================

const runValidation = async () => {
  console.log("\n============================================================");

  console.log("GREENMILE MULTIPLE ROUTE-PAIR VALIDATION");

  console.log("============================================================\n");

  console.log(
    `Battery condition: SoC=${testBattery.soc}% | SoH=${testBattery.soh * 100}%`,
  );

  console.log(
    `Weights: Time=${testWeights.time} | Energy=${testWeights.energy} | Battery=${testWeights.battery}\n`,
  );

  const summaryRows = [];

  for (const routePair of routePairs) {
    try {
      console.log(`Testing: ${routePair.name}`);

      const data = await getRoutes(routePair);

      const routes = data.routes;

      if (!routes || routes.length === 0) {
        console.log("No routes returned.");

        continue;
      }

      const recommended = findRecommendedRoute(routes);

      const fastest = findFastestRoute(routes);

      const lowestEnergy = findLowestEnergyRoute(routes);

      const lowestStress = findLowestStressRoute(routes);

      if (!recommended) {
        throw new Error("No recommended route returned");
      }

      // ==================================================
      // CHECK WHETHER GREENMILE DIFFERS FROM BASELINES
      // ==================================================

      const sameAsFastest = recommended.routeIndex === fastest.routeIndex;

      const sameAsLowestEnergy =
        recommended.routeIndex === lowestEnergy.routeIndex;

      const sameAsLowestStress =
        recommended.routeIndex === lowestStress.routeIndex;

      console.log(`Recommended: Route ${recommended.routeIndex + 1}`);

      console.log(`Fastest: Route ${fastest.routeIndex + 1}`);

      console.log(`Lowest Energy: Route ${lowestEnergy.routeIndex + 1}`);

      console.log(`Lowest Stress: Route ${lowestStress.routeIndex + 1}`);

      console.log(`Recommendation Level: ${data.recommendationLevel}`);

      console.log(
        "------------------------------------------------------------",
      );

      summaryRows.push({
        RoutePair: routePair.name,

        AvailableRoutes: routes.length,

        RecommendedRoute: `Route ${recommended.routeIndex + 1}`,

        DistanceKm: recommended.distanceKm,

        TravelTimeSec: recommended.durationSeconds,

        EnergyWh: recommended.estimatedEnergyWh,

        ArrivalSoC: `${recommended.projectedArrivalSoc}%`,

        BatteryStress: recommended.batteryStressScore,

        GreenMileScore: recommended.finalScore,

        Recommendation: data.recommendationLevel,

        SameAsFastest: sameAsFastest,

        SameAsLowestEnergy: sameAsLowestEnergy,

        SameAsLowestStress: sameAsLowestStress,
      });
    } catch (error) {
      console.error(`Failed: ${routePair.name}`);

      console.error(error.message);

      console.log(
        "------------------------------------------------------------",
      );

      summaryRows.push({
        RoutePair: routePair.name,

        AvailableRoutes: "ERROR",

        RecommendedRoute: "ERROR",

        DistanceKm: "N/A",

        TravelTimeSec: "N/A",

        EnergyWh: "N/A",

        ArrivalSoC: "N/A",

        BatteryStress: "N/A",

        GreenMileScore: "N/A",

        Recommendation: "ERROR",

        SameAsFastest: "N/A",

        SameAsLowestEnergy: "N/A",

        SameAsLowestStress: "N/A",
      });
    }
  }

  // ==================================================
  // MAIN SUMMARY TABLE
  // ==================================================

  console.log("\n============================================================");

  console.log("MULTIPLE ROUTE-PAIR SUMMARY");

  console.log("============================================================\n");

  console.table(summaryRows);

  // ==================================================
  // COUNT BASELINE AGREEMENT
  // ==================================================

  const validRows = summaryRows.filter(
    (row) => row.RecommendedRoute !== "ERROR",
  );

  const sameFastestCount = validRows.filter(
    (row) => row.SameAsFastest === true,
  ).length;

  const sameEnergyCount = validRows.filter(
    (row) => row.SameAsLowestEnergy === true,
  ).length;

  const sameStressCount = validRows.filter(
    (row) => row.SameAsLowestStress === true,
  ).length;

  // ==================================================
  // COMPARISON SUMMARY
  // ==================================================

  console.log("\n============================================================");

  console.log("BASELINE COMPARISON");

  console.log("============================================================\n");

  console.table([
    {
      Comparison: "GreenMile = Fastest",

      Matches: sameFastestCount,

      Total: validRows.length,

      Percentage:
        validRows.length > 0
          ? `${((sameFastestCount / validRows.length) * 100).toFixed(1)}%`
          : "0%",
    },

    {
      Comparison: "GreenMile = Lowest Energy",

      Matches: sameEnergyCount,

      Total: validRows.length,

      Percentage:
        validRows.length > 0
          ? `${((sameEnergyCount / validRows.length) * 100).toFixed(1)}%`
          : "0%",
    },

    {
      Comparison: "GreenMile = Lowest Battery Stress",

      Matches: sameStressCount,

      Total: validRows.length,

      Percentage:
        validRows.length > 0
          ? `${((sameStressCount / validRows.length) * 100).toFixed(1)}%`
          : "0%",
    },
  ]);

  // ==================================================
  // ROUTES WHERE GREENMILE DIFFERS FROM FASTEST
  // ==================================================

  const differentFromFastest = validRows.filter(
    (row) => row.SameAsFastest === false,
  );

  console.log("\n============================================================");

  console.log("CASES WHERE GREENMILE DID NOT CHOOSE THE FASTEST ROUTE");

  console.log("============================================================\n");

  if (differentFromFastest.length === 0) {
    console.log(
      "GreenMile selected the fastest route for every tested route pair.",
    );
  } else {
    console.table(
      differentFromFastest.map((row) => ({
        RoutePair: row.RoutePair,

        Recommended: row.RecommendedRoute,

        EnergyWh: row.EnergyWh,

        BatteryStress: row.BatteryStress,

        GreenMileScore: row.GreenMileScore,
      })),
    );
  }

  console.log("\nMultiple-route validation complete.\n");
};

// ======================================================
// RUN
// ======================================================

runValidation();

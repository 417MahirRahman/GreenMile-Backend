export const googleRoutes = [
  { distanceMeters: 1000, duration: "600s", staticDuration: "480s", polyline: { encodedPolyline: "frozen-a" }, routeLabels: ["DEFAULT_ROUTE"], travelAdvisory: { speedReadingIntervals: [{ endPolylinePointIndex: 4, speed: "NORMAL" }, { startPolylinePointIndex: 4, endPolylinePointIndex: 8, speed: "SLOW" }, { startPolylinePointIndex: 8, endPolylinePointIndex: 10, speed: "TRAFFIC_JAM" }] } },
  { distanceMeters: 2000, duration: "360s", staticDuration: "300s", polyline: { encodedPolyline: "frozen-b" } },
  { distanceMeters: 8000, duration: "720s", staticDuration: "720s" },
  { distanceMeters: 12000, duration: "720s", staticDuration: "600s" },
  { distanceMeters: 16000, duration: "600s", staticDuration: "500s" },
];
export const routeScenarios = [
  { name: "safe", soc: 90, soh: 0.95, routes: googleRoutes },
  { name: "low-reserve", soc: 21, soh: 0.95, routes: googleRoutes },
  { name: "infeasible", soc: 0.5, soh: 0.5, routes: googleRoutes },
  { name: "tie", soc: 90, soh: 1, routes: [googleRoutes[0], googleRoutes[0]] },
  { name: "zero-best", soc: 90, soh: 1, routes: [{ distanceMeters: 0, duration: "0s" }, googleRoutes[1]] },
  { name: "missing-soh", soc: 90, soh: null, routes: [googleRoutes[1]] },
];
export const routeBody = { batteryId: "fixture-battery", origin: { latitude: 23.76, longitude: 90.42 }, destination: { latitude: 23.78, longitude: 90.41 } };
export const batteryTimeline = [
  { seconds: 0, current: -2, voltage: 4, temperature: 30, ratedCapacityMah: 2000, initialSoc: 90 },
  { seconds: 60, current: -2, voltage: 3.98, temperature: 31 },
  { seconds: 120, current: 0, voltage: 3.97, temperature: 30.5 },
  { seconds: 180, current: 2, voltage: 4.01, temperature: 30 },
  { seconds: 240, current: 0, voltage: 4.02, temperature: 30 },
  { seconds: 300, current: 0, voltage: 4.02, temperature: 30 },
  { seconds: 601, current: -2, voltage: 4, temperature: 30 },
  { seconds: 661, current: -2, voltage: 3.98, temperature: 31 },
  { seconds: 721, current: 0, voltage: 3.97, temperature: 30.5 },
];

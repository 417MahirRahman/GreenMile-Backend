import { requestJSON } from "../utils/upstream.js";
export async function getGoogleRoutes({ apiKeys, originLatitude, originLongitude, destinationLatitude, destinationLongitude }) {
    let googleResponse = null;
    let googleData = null;

    for (const apiKey of apiKeys) {
      const upstream = await requestJSON(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,

            "X-Goog-FieldMask": [
              "routes.distanceMeters",
              "routes.duration",
              "routes.staticDuration",
              "routes.polyline.encodedPolyline",
              "routes.routeLabels",
              "routes.travelAdvisory.speedReadingIntervals",
            ].join(","),
          },

          body: JSON.stringify({
            origin: {
              location: {
                latLng: {
                  latitude: originLatitude,
                  longitude: originLongitude,
                },
              },
            },

            destination: {
              location: {
                latLng: {
                  latitude: destinationLatitude,
                  longitude: destinationLongitude,
                },
              },
            },

            travelMode: "DRIVE",
            computeAlternativeRoutes: true,
            routingPreference: "TRAFFIC_AWARE",

            extraComputations: ["TRAFFIC_ON_POLYLINE"],
          }),
        },
      );

      googleResponse = upstream.response;
      googleData = upstream.data;

      if (googleResponse.ok) {
        break;
      }

      if (googleResponse.status === 429) {
        console.log("Current Google Routes key hit quota. Trying next key...");

        continue;
      }

      break;
    }

  return { googleResponse, googleData };
}

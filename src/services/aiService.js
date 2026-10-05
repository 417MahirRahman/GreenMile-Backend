import { requestJSON } from "../utils/upstream.js";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

// ======================================================
// CHECK FASTAPI HEALTH
// ======================================================

const checkAIHealth = async () => {
  const { response, data } = await requestJSON(`${AI_SERVICE_URL}/health`);

  if (!response.ok) {
    throw new Error(
      `FastAPI health check failed with status ${response.status}`,
    );
  }

  return data;
};

// ======================================================
// PREDICT SOH
// ======================================================

const predictSoH = async ({ batteryId, records }) => {
  const { response, data } = await requestJSON(`${AI_SERVICE_URL}/predict/soh`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      batteryId,
      records,
    }),
  });



  if (!response.ok) {
    throw new Error(
      data?.detail
        ? JSON.stringify(data.detail)
        : `FastAPI prediction failed with status ${response.status}`,
    );
  }

  return data;
};

export { checkAIHealth, predictSoH };

import { ApiError } from "./validation.js";

// Keep the timer active through JSON parsing, not merely until response headers.
export async function requestJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } catch {
    if (controller.signal.aborted) throw new ApiError(504, "Upstream request timed out.");
    throw new ApiError(502, "Upstream request failed or returned invalid JSON.");
  } finally { clearTimeout(timer); }
}

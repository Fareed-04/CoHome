/** Backend origin for API calls. CRA injects REACT_APP_* at build time; local dev defaults if unset. */
const backendUrl =
  process.env.REACT_APP_BACKEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export const API = `${backendUrl}/api`;

/** ESP32 HTTP origin (no trailing slash), e.g. http://192.168.1.42 — serves GET /data as JSON */
function normalizeEsp32Origin(raw) {
  let s = (raw || "").trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, "");
}

export const ESP32_BASE_URL = normalizeEsp32Origin(process.env.REACT_APP_ESP32_URL);

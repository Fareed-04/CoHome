import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sun, Shield, Thermometer, Bell, Home, Zap, ArrowRight, ToggleLeft, ToggleRight, AlertTriangle, Cpu, Play } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API, ESP32_BASE_URL } from "@/apiBase";

const ESP32_POLL_MS = 1000;

function formatSensorLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatSensorValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Analog (~2–4095): threshold applies only when value is not 0 or 1 — those are treated as digital (0 = dry, 1 = wet) */
const ESP32_WATER_ANALOG_WET_IF_BELOW = 1500;

/** true = wet when ADC low; false = wet when ADC high (invert if Yes/No is backwards) */
const ESP32_WATER_ANALOG_WET_IS_LOW = true;

const RAIN_KEYS = new Set(["rain", "waterLevel"]);
const WIPER_KEYS = new Set(["wipers", "wiper"]);

/** Shown in Live hardware cards — still sent to esp32 so waterDetectedYesNo can read them */
const ESP32_WATER_META_KEYS = new Set([
  "searching",
  "searchingForWater",
  "waterSearching",
  "waterStatus",
  "waterState",
]);

const ESP32_WATER_MSG_YES = "Yes";
const ESP32_WATER_MSG_NO = "No, looking for rain";

function payloadIndicatesWaterSearching(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.searching === true || payload.searchingForWater === true || payload.waterSearching === true)
    return true;
  for (const k of ["waterStatus", "waterState"]) {
    const v = payload[k];
    if (v != null && String(v).toLowerCase().includes("search")) return true;
  }
  return false;
}

function waterDetectedPhraseIndicatesSearching(s) {
  const t = s.trim().toLowerCase();
  return (
    t.includes("searching") ||
    t.includes("looking for water") ||
    t.includes("looking for rain") ||
    t.startsWith("search ")
  );
}

function waterDetectedYesNo(value, payload) {
  if (payloadIndicatesWaterSearching(payload)) return ESP32_WATER_MSG_NO;

  if (value === null || value === undefined) return ESP32_WATER_MSG_NO;
  if (typeof value === "boolean") return value ? ESP32_WATER_MSG_YES : ESP32_WATER_MSG_NO;

  if (typeof value === "number" && Number.isFinite(value)) {
    // 0 / 1 = digital-style flag from firmware (0 = no water, 1 = detected). Do not treat 0 as "wet ADC".
    if (value === 0 || value === 1) {
      return value === 1 ? ESP32_WATER_MSG_YES : ESP32_WATER_MSG_NO;
    }
    const wet = ESP32_WATER_ANALOG_WET_IS_LOW
      ? value < ESP32_WATER_ANALOG_WET_IF_BELOW
      : value > ESP32_WATER_ANALOG_WET_IF_BELOW;
    return wet ? ESP32_WATER_MSG_YES : ESP32_WATER_MSG_NO;
  }

  const s = String(value).trim();
  const lower = s.toLowerCase();
  if (waterDetectedPhraseIndicatesSearching(lower)) return ESP32_WATER_MSG_NO;

  if (["yes", "true", "1", "on", "wet", "raining", "detected"].includes(lower)) return ESP32_WATER_MSG_YES;
  if (["no", "false", "0", "off", "dry", "idle", "waiting"].includes(lower)) return ESP32_WATER_MSG_NO;
  return String(value);
}

function wiperWorkingStatus(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Working" : "Not working";
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0 ? "Working" : "Not working";
  }
  const s = String(value).trim().toLowerCase();
  if (["on", "yes", "true", "1", "working", "ok", "active"].includes(s)) return "Working";
  if (["off", "no", "false", "0", "not working", "broken", "error", "fail", "failed", "stopped", "inactive", "fault"].includes(s))
    return "Not working";
  return String(value);
}

function esp32SensorLabel(key) {
  if (RAIN_KEYS.has(key)) return "Water detected";
  if (WIPER_KEYS.has(key)) return "Wipers";
  return formatSensorLabel(key);
}

function esp32SensorValue(key, value, payload) {
  if (RAIN_KEYS.has(key)) return waterDetectedYesNo(value, payload);
  if (WIPER_KEYS.has(key)) return wiperWorkingStatus(value);
  return formatSensorValue(value);
}

function orderedEsp32Keys(obj) {
  const keys = Object.keys(obj).filter((k) => !ESP32_WATER_META_KEYS.has(k));
  const rainKey = keys.includes("rain") ? "rain" : keys.includes("waterLevel") ? "waterLevel" : null;
  const wiperKey = keys.includes("wipers") ? "wipers" : keys.includes("wiper") ? "wiper" : null;
  const out = [];
  if (keys.includes("lightStatus")) out.push("lightStatus");
  if (rainKey) out.push(rainKey);
  if (wiperKey) out.push(wiperKey);
  const known = new Set(["lightStatus", "rain", "waterLevel", "wipers", "wiper", ...ESP32_WATER_META_KEYS]);
  const tail = keys.filter((k) => !known.has(k)).sort();
  return [...out, ...tail];
}

const deviceTypeConfig = {
  solar: { icon: Sun, color: "bg-amber-50 text-amber-600 border-amber-100", label: "Solar Panel" },
  camera: { icon: Shield, color: "bg-rose-50 text-rose-600 border-rose-100", label: "Camera" },
  door: { icon: Home, color: "bg-indigo-50 text-indigo-600 border-indigo-100", label: "Door" },
  gate: { icon: Home, color: "bg-violet-50 text-violet-600 border-violet-100", label: "Gate" },
  doorbell: { icon: Bell, color: "bg-sky-50 text-sky-600 border-sky-100", label: "Doorbell" },
  geyser: { icon: Thermometer, color: "bg-orange-50 text-orange-600 border-orange-100", label: "Geyser" },
};

const devicePageMap = { solar: "/solar", camera: "/security", door: "/security", gate: "/security", doorbell: "/doorbell", geyser: "/climate" };

function StatCard({ label, value, unit, icon: Icon, colorClass, delay = 0 }) {
  return (
    <div className={`bg-white rounded-3xl border border-slate-100 p-6 shadow-soft hover:shadow-card transition-all duration-300 hover:-translate-y-1 animate-fade-in-up`}
      style={{ animationDelay: `${delay}s` }}>
      <div className={`w-10 h-10 ${colorClass} rounded-2xl flex items-center justify-center mb-4`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{value}<span className="text-sm font-normal text-slate-500 ml-1">{unit}</span></p>
      <p className="text-slate-500 text-sm mt-1">{label}</p>
    </div>
  );
}

function DeviceCard({ device, onToggle }) {
  const cfg = deviceTypeConfig[device.type] || deviceTypeConfig.solar;
  const Icon = cfg.icon;
  const navigate = useNavigate();

  const getSubtext = () => {
    if (device.type === "solar") return `${device.settings?.battery_percentage || 0}% battery`;
    if (device.type === "geyser") return `${device.settings?.current_temp || 0}°C`;
    if (device.type === "door" || device.type === "gate") return device.settings?.locked ? "Locked" : "Unlocked";
    return device.status;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 group">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 ${cfg.color} border rounded-xl flex items-center justify-center`}>
          <Icon size={17} />
        </div>
        <button
          data-testid={`toggle-${device.device_id}`}
          onClick={() => onToggle(device.device_id, device.is_on)}
          className={`text-2xl transition-colors ${device.is_on ? 'text-indigo-600' : 'text-slate-300'} hover:scale-110 active:scale-95`}
        >
          {device.is_on ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
        </button>
      </div>
      <button onClick={() => navigate(devicePageMap[device.type] || "/dashboard")} className="text-left w-full">
        <h3 className="font-semibold text-slate-800 text-sm truncate">{device.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className={`w-1.5 h-1.5 rounded-full ${device.status === "online" ? "bg-green-500" : "bg-red-400"}`} />
          <span className="text-xs text-slate-500 capitalize">{getSubtext()}</span>
        </div>
      </button>
    </div>
  );
}

export default function Dashboard() {
  const { selectedHomeId, homes, refreshHomes } = useAuth();
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [esp32Sensors, setEsp32Sensors] = useState(null);
  const [esp32RawBody, setEsp32RawBody] = useState(null);
  const [esp32Error, setEsp32Error] = useState(null);
  const [esp32UpdatedAt, setEsp32UpdatedAt] = useState(null);
  const [servoBusy, setServoBusy] = useState(false);
  const [servoFeedback, setServoFeedback] = useState(null);
  const [predictiveBusy, setPredictiveBusy] = useState(false);
  const [predictiveFeedback, setPredictiveFeedback] = useState(null);
  const navigate = useNavigate();

  const triggerEsp32ServoOn = useCallback(async () => {
    setServoBusy(true);
    setServoFeedback(null);
    try {
      await axios.get(`${API}/esp32/servo-on`, { withCredentials: true });
      setServoFeedback({ ok: true });
      window.setTimeout(() => setServoFeedback(null), 4000);
    } catch (e) {
      const raw = e?.response?.data?.detail;
      const msg = Array.isArray(raw)
        ? raw.map((x) => x?.msg || JSON.stringify(x)).join("; ")
        : typeof raw === "string"
          ? raw
          : raw != null
            ? JSON.stringify(raw)
            : e?.message || "Request failed";
      setServoFeedback({ ok: false, msg });
    } finally {
      setServoBusy(false);
    }
  }, []);

  const runPredictiveTrigger = useCallback(async () => {
    setPredictiveBusy(true);
    setPredictiveFeedback(null);
    try {
      const res = await axios.get(`${API}/predictive-trigger`, { withCredentials: true });
      setPredictiveFeedback({ ok: true, data: res.data });
    } catch (e) {
      const raw = e?.response?.data?.detail;
      const msg = Array.isArray(raw)
        ? raw.map((x) => x?.msg || JSON.stringify(x)).join("; ")
        : typeof raw === "string"
          ? raw
          : raw != null
            ? JSON.stringify(raw)
            : e?.message || "Request failed";
      setPredictiveFeedback({ ok: false, msg });
    } finally {
      setPredictiveBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!selectedHomeId) { setLoading(false); return; }
    try {
      const [statsRes, devicesRes, alertsRes] = await Promise.all([
        axios.get(`${API}/homes/${selectedHomeId}/stats`, { withCredentials: true }),
        axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true }),
        axios.get(`${API}/homes/${selectedHomeId}/alerts`, { withCredentials: true }),
      ]);
      setStats(statsRes.data);
      setDevices(devicesRes.data);
      setAlerts(alertsRes.data.slice(0, 5));

      // Get solar analytics for the chart
      const solarDevice = devicesRes.data.find(d => d.type === "solar");
      if (solarDevice) {
        const chartRes = await axios.get(`${API}/devices/${solarDevice.device_id}/analytics?period=24h`, { withCredentials: true });
        setChartData(chartRes.data.data);
      }
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ESP32_BASE_URL) return undefined;
    let cancelled = false;
    const url = `${ESP32_BASE_URL}/data`;

    const tick = () => {
      fetch(url, { method: "GET", cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => {
          if (cancelled) return;
          const trimmed = text.trimEnd();
          setEsp32RawBody(trimmed);
          try {
            const parsed = JSON.parse(text);
            const data =
              parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : {};
            setEsp32Sensors(data);
          } catch {
            setEsp32Sensors({});
          }
          setEsp32Error(null);
          setEsp32UpdatedAt(new Date());
        })
        .catch(() => {
          if (cancelled) return;
          setEsp32Error("Cannot reach ESP32");
          setEsp32Sensors(null);
          setEsp32RawBody(null);
        });
    };

    tick();
    const id = setInterval(tick, ESP32_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const handleToggle = async (deviceId, currentState) => {
    try {
      await axios.patch(`${API}/devices/${deviceId}/toggle`, {}, { withCredentials: true });
      setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, is_on: !currentState } : d));
    } catch {}
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 bg-white rounded-3xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      </AppLayout>
    );
  }

  if (!selectedHomeId || homes.length === 0) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center">
            <Home size={36} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>No Home Added Yet</h2>
            <p className="text-slate-500 mb-6">Add your first home to start managing your smart devices.</p>
            <Link to="/homes" data-testid="add-first-home-btn"
              className="inline-flex items-center gap-2 bg-indigo-600 text-white font-semibold px-8 py-3.5 rounded-full hover:bg-indigo-700 hover:shadow-lg transition-all">
              Add Your Home <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const unreadAlerts = alerts.filter(a => !a.is_read).length;

  return (
    <AppLayout>
      <div data-testid="dashboard-page">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Dashboard</h1>
          <p className="text-slate-500 mt-1">Your home at a glance</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Zap} label="Total Devices" value={stats?.total_devices || 0} colorClass="bg-indigo-50 text-indigo-600" delay={0} />
          <StatCard icon={Shield} label="Online" value={stats?.online_devices || 0} colorClass="bg-green-50 text-green-600" delay={0.05} />
          <StatCard icon={Sun} label="Solar Today" value={stats?.solar_today_kwh || 0} unit="kWh" colorClass="bg-amber-50 text-amber-600" delay={0.1} />
          <StatCard icon={AlertTriangle} label="Active Alerts" value={stats?.unread_alerts || 0} colorClass={stats?.unread_alerts > 0 ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"} delay={0.15} />
        </div>

        {/* ESP32 live sensors (GET /data on local network) */}
        <div
          data-testid="esp32-live-panel"
          className="mb-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up"
          style={{ animationDelay: "0.18s" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-teal-50 text-teal-600 border border-teal-100 rounded-2xl flex items-center justify-center shrink-0">
                <Cpu size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Live hardware
                </h2>
                <p className="text-slate-500 text-sm mt-0.5">
                  {ESP32_BASE_URL
                    ? `Polling ${ESP32_BASE_URL}/data every ${ESP32_POLL_MS / 1000}s`
                    : "Point the app at your ESP32 with REACT_APP_ESP32_URL (e.g. http://192.168.1.42)"}
                </p>
              </div>
            </div>
            {ESP32_BASE_URL ? (
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  data-testid="predictive-trigger-btn"
                  onClick={runPredictiveTrigger}
                  disabled={predictiveBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-teal-600 text-white text-sm font-semibold px-5 py-2.5 shadow-sm hover:bg-teal-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  <Thermometer size={16} />
                  {predictiveBusy ? "Evaluating…" : "Predictive trigger"}
                </button>
                <button
                  type="button"
                  data-testid="esp32-servo-on-btn"
                  onClick={triggerEsp32ServoOn}
                  disabled={servoBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  <Play size={16} fill="currentColor" className="opacity-90" />
                  {servoBusy ? "Sending…" : "Turn servo on"}
                </button>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${esp32Error ? "bg-amber-500" : "bg-green-500 animate-pulse"}`} />
                  <span className="text-slate-600">{esp32Error || "Connected"}</span>
                  {esp32UpdatedAt && !esp32Error ? (
                    <span className="text-slate-400">· {esp32UpdatedAt.toLocaleTimeString()}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {ESP32_BASE_URL && servoFeedback ? (
            <p
              className={`text-sm mb-4 rounded-xl px-3 py-2 ${servoFeedback.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-rose-50 text-rose-800 border border-rose-100"}`}
              role="status"
            >
              {servoFeedback.ok ? "Servo command sent." : servoFeedback.msg}
            </p>
          ) : null}
          {ESP32_BASE_URL && predictiveFeedback ? (
            predictiveFeedback.ok ? (
              <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-900">
                <p className="font-semibold mb-2">Predictive trigger result</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="block text-xs uppercase tracking-wide text-teal-700/80">Prediction</span>
                    <span className="font-semibold">{Number(predictiveFeedback.data?.prediction ?? 0).toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-wide text-teal-700/80">Triggered</span>
                    <span className="font-semibold">{predictiveFeedback.data?.wiper_triggered ? "Yes" : "No"}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-wide text-teal-700/80">Forecast date</span>
                    <span className="font-semibold">{predictiveFeedback.data?.forecast_date || "—"}</span>
                  </div>
                  <div>
                    <span className="block text-xs uppercase tracking-wide text-teal-700/80">ESP32 waterValue</span>
                    <span className="font-semibold">{formatSensorValue(predictiveFeedback.data?.esp32_data?.waterValue)}</span>
                  </div>
                </div>
                <div className="mt-3 text-teal-800/90">
                  Threshold: {predictiveFeedback.data?.threshold ?? 50}. {predictiveFeedback.data?.esp32_error ? `ESP32 data note: ${predictiveFeedback.data.esp32_error}` : ""}
                </div>
              </div>
            ) : (
              <p className="text-sm mb-4 rounded-xl px-3 py-2 bg-rose-50 text-rose-800 border border-rose-100" role="status">
                {predictiveFeedback.msg}
              </p>
            )
          ) : null}
          {!ESP32_BASE_URL ? (
            <p className="text-sm text-slate-500 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 font-mono">
              REACT_APP_ESP32_URL=http://YOUR_ESP32_IP
            </p>
          ) : esp32Error ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">{esp32Error}</p>
          ) : (
            <>
              {esp32Sensors && orderedEsp32Keys(esp32Sensors).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {orderedEsp32Keys(esp32Sensors).map((key) => (
                    <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{esp32SensorLabel(key)}</p>
                      <p className="text-lg font-semibold text-slate-800 mt-1 leading-snug break-words" title={esp32SensorValue(key, esp32Sensors[key], esp32Sensors)}>
                        {esp32SensorValue(key, esp32Sensors[key], esp32Sensors)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : esp32RawBody !== null ? (
                <p className="text-sm text-slate-400 text-center py-4">No parsed fields to show as cards (see raw response below).</p>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">Waiting for sensor JSON…</p>
              )}
              {esp32RawBody !== null ? (
                <div data-testid="esp32-raw-response" className="mt-6 pt-6 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Raw ESP response</p>
                  <pre className="text-xs font-mono text-slate-700 bg-slate-900/[0.04] rounded-2xl border border-slate-100 p-4 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                    {esp32RawBody.length ? esp32RawBody : "(empty body)"}
                  </pre>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Chart + Devices Grid */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Solar Chart */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-bold text-slate-800 text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>Solar Energy Today</h2>
                <p className="text-slate-500 text-sm">Generation vs consumption (kWh)</p>
              </div>
              <Link to="/solar" className="text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1">
                Details <ArrowRight size={14} />
              </Link>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="consGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                  <Area type="monotone" dataKey="generation" stroke="#F59E0B" strokeWidth={2} fill="url(#genGrad)" name="Generation" />
                  <Area type="monotone" dataKey="consumption" stroke="#6366F1" strokeWidth={2} fill="url(#consGrad)" name="Consumption" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No solar data available</div>
            )}
          </div>

          {/* Recent Alerts */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-800 text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>Alerts</h2>
              <Link to="/alerts" className="text-indigo-600 text-sm font-medium hover:text-indigo-700">View all</Link>
            </div>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No alerts yet</div>
            ) : (
              <div className="space-y-3">
                {alerts.slice(0, 4).map(alert => (
                  <div key={alert.alert_id} className={`p-3 rounded-xl ${alert.is_read ? 'bg-slate-50' : 'bg-rose-50 border border-rose-100'}`}>
                    <p className="text-sm font-medium text-slate-700">{alert.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Device Grid */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-800 text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>All Devices</h2>
            <span className="text-sm text-slate-500">{devices.filter(d => d.is_on).length} active</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            {devices.map(device => (
              <DeviceCard key={device.device_id} device={device} onToggle={handleToggle} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

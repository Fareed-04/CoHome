import { useState, useEffect, useCallback } from "react";
import { Sun, Zap, Battery, TrendingUp, RefreshCw, Wifi, WifiOff, Thermometer, Activity, Settings, Unplug } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AppLayout from "@/components/AppLayout";
import ConnectSolarModal from "@/components/ConnectSolarModal";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const BRAND_LABELS = {
  goodwe: "GoodWe SEMS", fronius: "Fronius Local",
  huawei: "Huawei FusionSolar", growatt: "Growatt ShineMonitor",
  sungrow: "Sungrow iSolarCloud", solis: "Solis Cloud",
  sma: "SMA Sunny Portal", inverex: "Inverex", manual: "Manual Entry",
};

function LiveBadge({ lastSync, error }) {
  if (error) return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full">
      <WifiOff size={12} /> Sync Error
    </span>
  );
  if (!lastSync) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
      Live · {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function PVStringCard({ pv }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4">
      <p className="text-xs font-semibold text-slate-500 mb-3">String {pv.string}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Voltage", `${pv.voltage_v?.toFixed(1)}V`, "text-amber-600"], ["Current", `${pv.current_a?.toFixed(2)}A`, "text-sky-600"], ["Power", `${(pv.power_w / 1000)?.toFixed(2)}kW`, "text-indigo-600"]].map(([l, v, c]) => (
          <div key={l}>
            <p className={`text-lg font-bold ${c}`} style={{ fontFamily: "Outfit, sans-serif" }}>{v}</p>
            <p className="text-xs text-slate-400">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SolarPage() {
  const { selectedHomeId } = useAuth();
  const [device, setDevice] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const devRes = await axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true });
      const solar = devRes.data.find(d => d.type === "solar");
      setDevice(solar || null);
      if (solar) {
        const [liveRes, analyticsRes] = await Promise.all([
          axios.get(`${API}/devices/${solar.device_id}/solar/live`, { withCredentials: true }),
          axios.get(`${API}/devices/${solar.device_id}/analytics?period=${period}`, { withCredentials: true }),
        ]);
        setLiveData(liveRes.data);
        setAnalytics(analyticsRes.data);
      }
    } catch {}
    setLoading(false);
  }, [selectedHomeId, period]);

  useEffect(() => { load(); }, [load]);

  const handleManualSync = async () => {
    if (!device) return;
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/devices/${device.device_id}/solar/sync`, {}, { withCredentials: true });
      setLiveData(prev => ({ ...prev, current_power_w: res.data.current_power_w, today_energy_kwh: res.data.today_energy_kwh, total_energy_kwh: res.data.total_energy_kwh, last_sync: res.data.synced_at }));
    } catch {}
    setSyncing(false);
  };

  const handleDisconnect = async () => {
    if (!device) return;
    try {
      await axios.delete(`${API}/devices/${device.device_id}/solar/configure`, { withCredentials: true });
      setLiveData(null);
      setDevice(prev => ({ ...prev, settings: { ...prev?.settings, connection_config: undefined, connection_brand: undefined } }));
    } catch {}
    setShowDisconnectConfirm(false);
  };

  if (loading) return (
    <AppLayout>
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white rounded-3xl animate-pulse border border-slate-100" />)}
      </div>
    </AppLayout>
  );

  const isConnected = liveData?.is_connected;
  const s = device?.settings || {};
  const rate = liveData?.electricity_rate_pkr || 35;
  const currentKw = (liveData?.current_power_w || 0) / 1000;
  const todaySavingsPkr = ((liveData?.today_energy_kwh || s.today_generation_kwh || 0) * rate).toFixed(0);

  return (
    <AppLayout>
      <div data-testid="solar-page">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Solar Monitor</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <p className="text-slate-500 text-sm">{device?.name} · {s.panel_count} panels · {s.capacity_kw} kW</p>
              {isConnected && <LiveBadge lastSync={liveData?.last_sync} error={liveData?.last_sync_error} />}
              {isConnected && (
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                  {BRAND_LABELS[liveData?.connection_brand] || liveData?.connection_brand}
                  {liveData?.station_name && liveData.station_name !== "Manual Entry" ? ` · ${liveData.station_name}` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {isConnected ? (
              <>
                <button onClick={handleManualSync} data-testid="sync-now-btn" disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-all disabled:opacity-60">
                  <RefreshCw size={15} className={syncing ? "animate-spin" : ""} /> {syncing ? "Syncing…" : "Sync Now"}
                </button>
                <button onClick={() => setShowDisconnectConfirm(true)} data-testid="disconnect-solar-btn"
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-rose-200 text-rose-600 text-sm font-medium rounded-full hover:bg-rose-50 transition-all">
                  <Unplug size={15} /> Disconnect
                </button>
              </>
            ) : (
              <button onClick={() => setShowConnect(true)} data-testid="connect-solar-btn"
                className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-full shadow-lg shadow-amber-200 hover:shadow-xl transition-all active:scale-95">
                <Wifi size={16} /> Connect Your Inverter
              </button>
            )}
          </div>
        </div>

        {/* Not connected CTA */}
        {!isConnected && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-8 mb-8 animate-fade-in-up">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center flex-shrink-0">
                <Sun size={40} className="text-amber-500" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>Connect Your Solar Inverter</h2>
                <p className="text-slate-600 mb-4">Get real-time power generation, live kWh data, PKR savings, PV string analysis and more — straight from your inverter.</p>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start mb-5">
                  {["GoodWe SEMS", "Fronius Local", "Huawei", "Growatt", "Sungrow", "+more"].map(b => (
                    <span key={b} className="text-xs font-medium bg-white border border-amber-200 text-amber-700 px-3 py-1.5 rounded-full">{b}</span>
                  ))}
                </div>
                <button onClick={() => setShowConnect(true)} data-testid="connect-solar-cta-btn"
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full shadow-lg shadow-amber-200 hover:shadow-xl transition-all active:scale-95">
                  <Wifi size={18} /> Connect Your Inverter — It's Free
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Live Stats (connected) */}
        {isConnected && (
          <>
            {/* Current Power Hero */}
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-8 mb-6 text-white shadow-xl shadow-amber-200 animate-fade-in-up">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="text-center flex-1">
                  <p className="text-white/70 text-sm font-medium">Current Generation</p>
                  <p className="text-6xl font-bold mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>{currentKw.toFixed(2)}</p>
                  <p className="text-white/80 text-xl">kW</p>
                </div>
                <div className="w-px h-20 bg-white/20 hidden md:block" />
                <div className="grid grid-cols-3 gap-6 flex-1 text-center">
                  <div>
                    <p className="text-white/70 text-xs">Today's Energy</p>
                    <p className="text-2xl font-bold mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>{(liveData?.today_energy_kwh || 0).toFixed(1)}</p>
                    <p className="text-white/70 text-xs">kWh</p>
                  </div>
                  <div>
                    <p className="text-white/70 text-xs">Today Savings</p>
                    <p className="text-2xl font-bold mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>₨{todaySavingsPkr}</p>
                    <p className="text-white/70 text-xs">PKR</p>
                  </div>
                  <div>
                    <p className="text-white/70 text-xs">Total Lifetime</p>
                    <p className="text-2xl font-bold mt-1" style={{ fontFamily: "Outfit, sans-serif" }}>{(liveData?.total_energy_kwh || 0).toFixed(0)}</p>
                    <p className="text-white/70 text-xs">kWh</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { icon: Activity, label: "Grid Voltage", value: `${(liveData?.grid_voltage_v || 0).toFixed(1)} V`, color: "bg-indigo-50 text-indigo-600" },
                { icon: Zap, label: "Frequency", value: `${(liveData?.grid_frequency_hz || 0).toFixed(2)} Hz`, color: "bg-sky-50 text-sky-600" },
                { icon: Thermometer, label: "Inverter Temp", value: `${(liveData?.temperature_c || 0).toFixed(1)} °C`, color: "bg-orange-50 text-orange-600" },
                { icon: TrendingUp, label: "Monthly Est.", value: `₨${(liveData?.monthly_savings_pkr || s.monthly_savings_pkr || 0).toLocaleString()}`, color: "bg-green-50 text-green-600" },
              ].map(({ icon: Icon, label, value, color }, i) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-soft hover:-translate-y-0.5 transition-all animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center mb-3`}>
                    <Icon size={16} />
                  </div>
                  <p className="text-lg font-bold text-slate-800" style={{ fontFamily: "Outfit, sans-serif" }}>{value}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* PV Strings */}
            {liveData?.pv_strings?.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft mb-6 animate-fade-in-up">
                <h3 className="font-bold text-slate-800 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>PV String Analysis</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {liveData.pv_strings.filter(p => p.voltage_v > 0).map(pv => (
                    <PVStringCard key={pv.string} pv={pv} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Demo Stats when not connected */}
        {!isConnected && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { icon: Sun, label: "Today's Generation", value: `${s.today_generation_kwh || 0} kWh`, color: "bg-amber-50 text-amber-600" },
              { icon: Battery, label: "Battery Level", value: `${s.battery_percentage || 0}%`, color: "bg-green-50 text-green-600" },
              { icon: Zap, label: "Capacity", value: `${s.capacity_kw || 0} kW`, color: "bg-indigo-50 text-indigo-600" },
              { icon: TrendingUp, label: "Est. Monthly Save", value: `PKR ${s.monthly_savings_pkr || 0}`, color: "bg-rose-50 text-rose-600" },
            ].map(({ icon: Icon, label, value, color }, i) => (
              <div key={label} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up opacity-70" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className={`w-10 h-10 ${color} rounded-2xl flex items-center justify-center mb-3`}><Icon size={18} /></div>
                <p className="text-xl font-bold text-slate-800" style={{ fontFamily: "Outfit, sans-serif" }}>{value}</p>
                <p className="text-slate-500 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Analytics Chart */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>Energy Analytics</h3>
              <p className="text-slate-400 text-xs mt-0.5">{isConnected ? "From your inverter" : "Demo data — connect inverter for real readings"}</p>
            </div>
            <div className="flex gap-2">
              {["24h", "7d", "30d"].map(p => (
                <button key={p} data-testid={`period-${p}`} onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${period === p ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {analytics?.data?.length > 0 ? (
            period === "24h" ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={analytics.data}>
                  <defs>
                    <linearGradient id="solar-gen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} /><stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="solar-con" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }} />
                  <Area type="monotone" dataKey="generation" stroke="#F59E0B" strokeWidth={2.5} fill="url(#solar-gen)" name="Generation (kWh)" />
                  <Area type="monotone" dataKey="consumption" stroke="#6366F1" strokeWidth={2.5} fill="url(#solar-con)" name="Consumption (kWh)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #E2E8F0" }} />
                  <Bar dataKey="generation" fill="#F59E0B" name="Generation (kWh)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="consumption" fill="#6366F1" name="Consumption (kWh)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm">No data available</div>
          )}
          <div className="flex items-center gap-6 mt-4 justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-3 h-3 bg-amber-500 rounded-full" /> Generation</div>
            <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-3 h-3 bg-indigo-500 rounded-full" /> Consumption</div>
          </div>
        </div>

        {/* Disconnect confirm */}
        {showDisconnectConfirm && (
          <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fade-in-up">
              <h3 className="font-bold text-slate-800 text-xl mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>Disconnect Solar?</h3>
              <p className="text-slate-500 text-sm mb-6">Live data sync will stop. Historical readings are kept. You can reconnect anytime.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDisconnectConfirm(false)} className="flex-1 py-3 border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 text-sm font-medium transition-all">Cancel</button>
                <button data-testid="confirm-disconnect-btn" onClick={handleDisconnect} className="flex-1 py-3 bg-rose-500 text-white rounded-full text-sm font-semibold hover:bg-rose-600 transition-all">Disconnect</button>
              </div>
            </div>
          </div>
        )}

        {/* Connect Modal */}
        {showConnect && (
          <ConnectSolarModal
            device={device}
            onClose={() => setShowConnect(false)}
            onConnected={() => { setShowConnect(false); load(); }}
          />
        )}
      </div>
    </AppLayout>
  );
}

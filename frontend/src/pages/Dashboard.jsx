import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sun, Shield, Thermometer, Bell, Home, Zap, ArrowRight, ToggleLeft, ToggleRight, AlertTriangle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!selectedHomeId) { setLoading(false); return; }
    try {
      const [statsRes, devicesRes, alertsRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/homes/${selectedHomeId}/stats`, { withCredentials: true }),
        axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true }),
        axios.get(`${API}/homes/${selectedHomeId}/alerts`, { withCredentials: true }),
        axios.get(`${API}/devices`, { withCredentials: true }).catch(() => ({ data: [] }))
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

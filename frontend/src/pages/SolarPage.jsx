import { useState, useEffect, useCallback } from "react";
import { Sun, Zap, Battery, TrendingUp, RefreshCw } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SolarPage() {
  const { selectedHomeId } = useAuth();
  const [device, setDevice] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [period, setPeriod] = useState("24h");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const devRes = await axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true });
      const solar = devRes.data.find(d => d.type === "solar");
      setDevice(solar || null);
      if (solar) {
        const analyticsRes = await axios.get(`${API}/devices/${solar.device_id}/analytics?period=${period}`, { withCredentials: true });
        setAnalytics(analyticsRes.data);
      }
    } catch {}
    setLoading(false);
  }, [selectedHomeId, period]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <AppLayout>
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white rounded-3xl animate-pulse" />)}
      </div>
    </AppLayout>
  );

  if (!device) return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
          <Sun size={32} className="text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>No Solar Device</h2>
        <p className="text-slate-500">No solar panel found for this home.</p>
      </div>
    </AppLayout>
  );

  const s = device.settings || {};
  const summary = analytics?.summary || {};

  return (
    <AppLayout>
      <div data-testid="solar-page">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Solar Monitor</h1>
            <p className="text-slate-500 mt-1">{device.name} — {s.panel_count} panels, {s.capacity_kw} kW capacity</p>
          </div>
          <button onClick={load} data-testid="solar-refresh-btn"
            className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-amber-50 hover:border-amber-200 transition-all">
            <RefreshCw size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Sun, label: "Today's Generation", value: `${s.today_generation_kwh || 0} kWh`, color: "bg-amber-50 text-amber-600" },
            { icon: Battery, label: "Battery Level", value: `${s.battery_percentage || 0}%`, color: "bg-green-50 text-green-600" },
            { icon: Zap, label: "Total (Period)", value: `${summary.total_generation || 0} kWh`, color: "bg-indigo-50 text-indigo-600" },
            { icon: TrendingUp, label: "Monthly Savings", value: `PKR ${s.monthly_savings_pkr || 0}`, color: "bg-rose-50 text-rose-600" },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <div key={label} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft hover:-translate-y-1 transition-all animate-fade-in-up" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className={`w-10 h-10 ${color} rounded-2xl flex items-center justify-center mb-3`}>
                <Icon size={18} />
              </div>
              <p className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>{value}</p>
              <p className="text-slate-500 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Battery Progress */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft mb-6 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Battery Status</h3>
            <span className="text-amber-600 font-bold text-lg">{s.battery_percentage || 0}%</span>
          </div>
          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-700"
              style={{ width: `${s.battery_percentage || 0}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>0%</span><span>50%</span><span>100%</span>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>Energy Analytics</h3>
            <div className="flex gap-2">
              {["24h", "7d", "30d"].map(p => (
                <button key={p} data-testid={`period-${p}`}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${period === p ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {analytics?.data?.length > 0 && (
            period === "24h" ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={analytics.data}>
                  <defs>
                    <linearGradient id="solar-gen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="solar-con" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                  <Area type="monotone" dataKey="generation" stroke="#F59E0B" strokeWidth={2.5} fill="url(#solar-gen)" name="Generation (kWh)" />
                  <Area type="monotone" dataKey="consumption" stroke="#6366F1" strokeWidth={2.5} fill="url(#solar-con)" name="Consumption (kWh)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                  <Bar dataKey="generation" fill="#F59E0B" name="Generation (kWh)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="consumption" fill="#6366F1" name="Consumption (kWh)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          )}
          <div className="flex items-center gap-6 mt-4 justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-3 h-3 bg-amber-500 rounded-full" /> Generation</div>
            <div className="flex items-center gap-2 text-xs text-slate-600"><div className="w-3 h-3 bg-indigo-500 rounded-full" /> Consumption</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

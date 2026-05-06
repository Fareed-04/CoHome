import { useState, useEffect, useCallback } from "react";
import { Thermometer, Flame, Clock, Power } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

export default function ClimatePage() {
  const { selectedHomeId } = useAuth();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetTemp, setTargetTemp] = useState(55);
  const [scheduleOn, setScheduleOn] = useState("06:30");
  const [scheduleOff, setScheduleOff] = useState("08:00");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true });
      const geyser = res.data.find(d => d.type === "geyser");
      if (geyser) {
        setDevice(geyser);
        setTargetTemp(geyser.settings?.target_temp || 55);
        setScheduleOn(geyser.settings?.schedule_on || "06:30");
        setScheduleOff(geyser.settings?.schedule_off || "08:00");
        setScheduleEnabled(geyser.settings?.schedule_enabled || false);
      }
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async () => {
    if (!device) return;
    try {
      const res = await axios.patch(`${API}/devices/${device.device_id}/toggle`, {}, { withCredentials: true });
      setDevice(prev => ({ ...prev, is_on: res.data.is_on }));
    } catch {}
  };

  const handleSaveSettings = async () => {
    if (!device) return;
    setSaving(true);
    try {
      await axios.put(`${API}/devices/${device.device_id}`, {
        settings: { target_temp: targetTemp, schedule_on: scheduleOn, schedule_off: scheduleOff, schedule_enabled: scheduleEnabled }
      }, { withCredentials: true });
      setDevice(prev => ({ ...prev, settings: { ...prev.settings, target_temp: targetTemp, schedule_on: scheduleOn, schedule_off: scheduleOff, schedule_enabled: scheduleEnabled } }));
    } catch {}
    setSaving(false);
  };

  if (loading) return <AppLayout><div className="h-64 bg-white rounded-3xl animate-pulse" /></AppLayout>;
  if (!device) return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center">
          <Thermometer size={32} className="text-sky-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>No Geyser Found</h2>
        <p className="text-slate-500">No climate device found for this home.</p>
      </div>
    </AppLayout>
  );

  const s = device.settings || {};
  const tempProgress = ((s.current_temp || 35) / 80) * 100;
  const isHeating = device.is_on;

  return (
    <AppLayout>
      <div data-testid="climate-page">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Climate Control</h1>
          <p className="text-slate-500 mt-1">{device.name}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Temperature Control Card */}
          <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-soft animate-fade-in-up">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-bold text-slate-800 text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>Geyser Control</h2>
              <button data-testid="geyser-power-btn" onClick={handleToggle}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isHeating ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                <Power size={20} />
              </button>
            </div>

            {/* Temperature Display */}
            <div className="flex items-center justify-center mb-8">
              <div className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center border-8 ${isHeating ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-slate-50'} transition-all duration-500`}>
                <Thermometer size={28} className={isHeating ? 'text-orange-500' : 'text-slate-400'} />
                <p className="text-4xl font-bold text-slate-800 mt-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.current_temp || 35}°</p>
                <p className="text-xs text-slate-500">Current Temp</p>
                {isHeating && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center animate-pulse">
                    <Flame size={10} className="text-white" />
                  </div>
                )}
              </div>
            </div>

            <div className={`text-center text-sm font-semibold py-2 rounded-full mb-6 ${isHeating ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
              {isHeating ? 'Heating Active' : 'Standby'}
            </div>

            {/* Target Temperature Slider */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-slate-700">Target Temperature</label>
                <span className="text-lg font-bold text-sky-600">{targetTemp}°C</span>
              </div>
              <input data-testid="temp-slider" type="range" min="30" max="75" value={targetTemp}
                onChange={e => setTargetTemp(Number(e.target.value))}
                className="w-full accent-sky-500 h-2 rounded-full cursor-pointer" />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>30°C</span><span>75°C</span>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center">
                  <Clock size={18} />
                </div>
                <h2 className="font-bold text-slate-800 text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>Schedule</h2>
              </div>
              <button data-testid="schedule-toggle"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`w-12 h-6 rounded-full transition-all relative ${scheduleEnabled ? 'bg-sky-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${scheduleEnabled ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>

            <p className="text-slate-500 text-sm mb-6">Auto-heat at scheduled times to save energy.</p>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Turn On Time</label>
                <input data-testid="schedule-on-input" type="time" value={scheduleOn}
                  onChange={e => setScheduleOn(e.target.value)} disabled={!scheduleEnabled}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:bg-slate-50 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Turn Off Time</label>
                <input data-testid="schedule-off-input" type="time" value={scheduleOff}
                  onChange={e => setScheduleOff(e.target.value)} disabled={!scheduleEnabled}
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:opacity-50 disabled:bg-slate-50 transition-all" />
              </div>
            </div>

            <div className="mt-8 p-4 bg-sky-50 rounded-2xl text-sm text-sky-700 border border-sky-100">
              <p className="font-semibold mb-1">Energy Tip</p>
              <p className="text-sky-600">Scheduling your geyser saves up to 30% on electricity bills.</p>
            </div>

            <button data-testid="save-climate-btn" onClick={handleSaveSettings} disabled={saving}
              className="w-full mt-6 py-3.5 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-full transition-all active:scale-95 flex items-center justify-center gap-2">
              {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

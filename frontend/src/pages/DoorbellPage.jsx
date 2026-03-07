import { useState, useEffect, useCallback } from "react";
import { Bell, Video, Volume2, VolumeX, Clock, BellRing } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MOCK_HISTORY = [
  { id: 1, type: "Ring", time: "2 min ago", note: "Visitor at front door" },
  { id: 2, type: "Motion", time: "18 min ago", note: "Motion detected near entrance" },
  { id: 3, type: "Ring", time: "1 hr ago", note: "Package delivery" },
  { id: 4, type: "Ring", time: "3 hrs ago", note: "Guest arrival" },
  { id: 5, type: "Motion", time: "Yesterday 8:30 PM", note: "Motion near gate" },
];

export default function DoorbellPage() {
  const { selectedHomeId } = useAuth();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true });
      setDevice(res.data.find(d => d.type === "doorbell") || null);
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  const toggleSetting = async (key) => {
    if (!device) return;
    const newVal = !device.settings?.[key];
    try {
      await axios.put(`${API}/devices/${device.device_id}`, { settings: { [key]: newVal } }, { withCredentials: true });
      setDevice(prev => ({ ...prev, settings: { ...prev.settings, [key]: newVal } }));
    } catch {}
  };

  const handleToggle = async () => {
    if (!device) return;
    try {
      const res = await axios.patch(`${API}/devices/${device.device_id}/toggle`, {}, { withCredentials: true });
      setDevice(prev => ({ ...prev, is_on: res.data.is_on }));
    } catch {}
  };

  if (loading) return <AppLayout><div className="h-64 bg-white rounded-3xl animate-pulse" /></AppLayout>;
  if (!device) return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 bg-violet-50 rounded-full flex items-center justify-center">
          <Bell size={32} className="text-violet-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800" style={{ fontFamily: 'Outfit, sans-serif' }}>No Doorbell Found</h2>
        <p className="text-slate-500">No doorbell device found for this home.</p>
      </div>
    </AppLayout>
  );

  const s = device.settings || {};

  return (
    <AppLayout>
      <div data-testid="doorbell-page">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Doorbell</h1>
          <p className="text-slate-500 mt-1">{device.name}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Live View */}
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-soft animate-fade-in-up">
            <div className="relative bg-slate-900 h-64 flex flex-col items-center justify-center gap-3">
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${device.is_on ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-white/80 text-xs">{device.is_on ? 'LIVE' : 'OFFLINE'}</span>
              </div>
              <Video size={36} className="text-slate-600" />
              <div className="text-center">
                <p className="text-slate-400 text-sm">Live Video Feed</p>
                <p className="text-slate-600 text-xs mt-1">Connect hardware to enable</p>
              </div>
              {device.is_on && s.video_enabled && (
                <div className="absolute bottom-3 text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
                  HD Quality • Night Vision Active
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{device.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${device.status === "online" ? "bg-green-500" : "bg-slate-400"}`} />
                    {device.status}
                  </p>
                </div>
                <button data-testid="doorbell-power-btn" onClick={handleToggle}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${device.is_on ? 'bg-rose-100 text-rose-600' : 'bg-indigo-600 text-white'}`}>
                  {device.is_on ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <h2 className="font-bold text-slate-800 text-xl mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Settings</h2>
            <div className="space-y-4">
              {[
                { key: "sound_enabled", icon: s.sound_enabled ? Volume2 : VolumeX, label: "Sound Notifications", desc: "Ring alerts via speaker" },
                { key: "video_enabled", icon: Video, label: "Video Recording", desc: "Record when doorbell rings" },
              ].map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
                      <Icon size={16} className="text-slate-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-700 text-sm">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </div>
                  <button data-testid={`doorbell-${key}`} onClick={() => toggleSetting(key)}
                    className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${s[key] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s[key] ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ring History */}
        <div className="mt-6 bg-white rounded-3xl border border-slate-100 p-6 shadow-soft animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-violet-50 rounded-2xl flex items-center justify-center">
              <BellRing size={18} className="text-violet-600" />
            </div>
            <h2 className="font-bold text-slate-800 text-xl" style={{ fontFamily: 'Outfit, sans-serif' }}>Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {MOCK_HISTORY.map(event => (
              <div key={event.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${event.type === "Ring" ? "bg-violet-100 text-violet-600" : "bg-amber-100 text-amber-600"}`}>
                  {event.type === "Ring" ? <Bell size={16} /> : <Clock size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700 text-sm">{event.note}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{event.time}</p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${event.type === "Ring" ? "bg-violet-100 text-violet-600" : "bg-amber-100 text-amber-600"}`}>
                  {event.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

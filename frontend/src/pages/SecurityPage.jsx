import { useState, useEffect, useCallback } from "react";
import { Shield, Lock, Unlock, Video, Eye, AlertTriangle, CheckCircle } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import axios from "axios";
import { API } from "@/apiBase";

function CameraCard({ device, onToggle }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-soft hover:shadow-card transition-all">
      {/* Camera Feed Placeholder */}
      <div className="relative bg-slate-900 h-44 flex items-center justify-center">
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${device.is_on ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-white/80 text-xs">{device.is_on ? 'LIVE' : 'OFFLINE'}</span>
        </div>
        <div className="absolute top-3 right-3 text-xs text-white/60 bg-black/40 px-2 py-1 rounded-full">
          {device.settings?.resolution || '1080p'}
        </div>
        <div className="flex flex-col items-center gap-2">
          <Video size={32} className="text-slate-600" />
          <p className="text-slate-500 text-xs">Camera Feed Placeholder</p>
          <p className="text-slate-600 text-xs">Hardware integration pending</p>
        </div>
        {device.settings?.motion_detection && (
          <div className="absolute bottom-3 left-3 bg-amber-500/90 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Eye size={10} /> Motion Detection ON
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800">{device.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{device.settings?.recording_mode || 'motion'} recording</p>
          </div>
          <button data-testid={`camera-toggle-${device.device_id}`}
            onClick={() => onToggle(device.device_id, device.is_on)}
            className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${device.is_on ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {device.is_on ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LockCard({ device, onToggle, onLockToggle }) {
  const isLocked = device.settings?.locked;
  return (
    <div className={`bg-white rounded-3xl border p-6 shadow-soft hover:shadow-card transition-all ${isLocked ? 'border-green-100' : 'border-rose-100'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isLocked ? 'bg-green-50' : 'bg-rose-50'}`}>
          {isLocked ? <Lock size={22} className="text-green-600" /> : <Unlock size={22} className="text-rose-600" />}
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${device.status === "online" ? "bg-green-500" : "bg-red-400"}`} />
          <span className="text-xs text-slate-500 capitalize">{device.status}</span>
        </div>
      </div>
      <h3 className="font-bold text-slate-800 text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{device.name}</h3>
      <p className={`text-sm mt-1 font-medium ${isLocked ? 'text-green-600' : 'text-rose-600'}`}>
        {isLocked ? 'Secured & Locked' : 'Unlocked'}
      </p>
      {device.settings?.auto_lock_timer && (
        <p className="text-xs text-slate-400 mt-1">Auto-lock: {device.settings.auto_lock_timer}s</p>
      )}
      <div className="flex gap-3 mt-5">
        <button data-testid={`lock-toggle-${device.device_id}`}
          onClick={() => onLockToggle(device.device_id, isLocked)}
          className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95 ${isLocked ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-green-500 text-white hover:bg-green-600'}`}>
          {isLocked ? 'Unlock' : 'Lock'}
        </button>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  const { selectedHomeId } = useAuth();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedHomeId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/homes/${selectedHomeId}/devices`, { withCredentials: true });
      setDevices(res.data.filter(d => ['camera', 'door', 'gate'].includes(d.type)));
    } catch {}
    setLoading(false);
  }, [selectedHomeId]);

  useEffect(() => { load(); }, [load]);

  const cameras = devices.filter(d => d.type === "camera");
  const locks = devices.filter(d => d.type === "door" || d.type === "gate");
  const allLocked = locks.every(d => d.settings?.locked);

  const handleToggle = async (deviceId, currentState) => {
    try {
      await axios.patch(`${API}/devices/${deviceId}/toggle`, {}, { withCredentials: true });
      setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, is_on: !currentState } : d));
    } catch {}
  };

  const handleLockToggle = async (deviceId, currentLocked) => {
    try {
      await axios.put(`${API}/devices/${deviceId}`, { settings: { locked: !currentLocked } }, { withCredentials: true });
      setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, settings: { ...d.settings, locked: !currentLocked } } : d));
    } catch {}
  };

  const lockAll = async () => {
    for (const l of locks) {
      if (!l.settings?.locked) await handleLockToggle(l.device_id, false);
    }
  };

  return (
    <AppLayout>
      <div data-testid="security-page">
        <div className="flex items-center justify-between mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Outfit, sans-serif' }}>Security</h1>
            <p className="text-slate-500 mt-1">Cameras, doors & gates</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${allLocked ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
              {allLocked ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
              {allLocked ? "All Secured" : "Some Unlocked"}
            </div>
            <button data-testid="lock-all-btn" onClick={lockAll}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-full hover:bg-indigo-700 transition-all active:scale-95">
              Lock All
            </button>
          </div>
        </div>

        {/* Cameras */}
        {cameras.length > 0 && (
          <div className="mb-8">
            <h2 className="font-bold text-slate-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Security Cameras ({cameras.length})</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {cameras.map(c => <CameraCard key={c.device_id} device={c} onToggle={handleToggle} />)}
            </div>
          </div>
        )}

        {/* Locks */}
        {locks.length > 0 && (
          <div>
            <h2 className="font-bold text-slate-700 mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Doors & Gates ({locks.length})</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {locks.map(l => <LockCard key={l.device_id} device={l} onToggle={handleToggle} onLockToggle={handleLockToggle} />)}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
